import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { post } from '../components/ApiRequest';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// v2: élargissement des catégories OSM (restaurant, cafe, gym, school, fast_food, pub,
// stadium, pitch). Le bump force un re-sync chez les utilisateurs existants pour
// peupler la DB avec assez de lieux par vibe (cf. backend `TYPES_BY_VIBE`).
// v3: suppression du type fourre-tout "Lieu 📍" (skip si type inconnu) et renommage
// "Espace restauration 🍱" → "Fast food 🍔". Bump pour forcer un re-sync.
// v4: élargissement du rayon Overpass (30 km → 50 km) + invalidation de la sync
// sur déplacement significatif (>3 km), afin d'afficher plus de lieux autour de
// l'utilisateur en distance et en nombre, sans ajouter de catégories.
const LAST_SYNC_KEY = 'loocateme_last_osm_sync_v4';
const LAST_SYNC_POS_KEY = 'loocateme_last_osm_sync_pos_v4';

// Rayon de recherche Overpass (en mètres). 50 km couvre la majorité des
// déplacements quotidiens / week-end sans saturer la requête Overpass.
const OVERPASS_RADIUS_M = 50000;
// Distance (en mètres) au-delà de laquelle on considère que l'utilisateur a
// changé de zone et qu'il faut re-peupler la DB locale en amont du TTL 24h.
const SIGNIFICANT_MOVE_M = 3000;

// Distance Haversine simplifiée (mètres) entre deux points lat/lon.
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const LocationSyncService = {
  syncNearbyLocations: async (lat, lon) => {
    try {
      // 1. Vérifier si l'utilisateur a déjà fait une sync récente ET dans la
      //    même zone. Si la position actuelle est éloignée de la dernière sync
      //    de plus de SIGNIFICANT_MOVE_M, on relance la sync même si elle date
      //    de moins de 24h (l'utilisateur a changé de zone et la DB locale ne
      //    contient probablement pas assez de lieux à proximité).
      const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const lastPosStr = await AsyncStorage.getItem(LAST_SYNC_POS_KEY);
      const now = new Date();
      if (lastSyncStr) {
        const lastSyncDate = new Date(lastSyncStr);
        const withinTtl = now - lastSyncDate < 24 * 60 * 60 * 1000;
        let nearLastSync = true;
        if (lastPosStr) {
          try {
            const { lat: pLat, lon: pLon } = JSON.parse(lastPosStr);
            if (typeof pLat === 'number' && typeof pLon === 'number') {
              const movedM = haversineMeters(pLat, pLon, lat, lon);
              nearLastSync = movedM < SIGNIFICANT_MOVE_M;
            }
          } catch (_) {
            /* parse error → on force la resync */ nearLastSync = false;
          }
        } else {
          // Pas de position connue → on force une resync pour repeupler avec
          // la position courante (utile pour les utilisateurs déjà sur v3).
          nearLastSync = false;
        }
        if (withinTtl && nearLastSync) {
          logger.log('[LocationSyncService] Sync already done today in the same area, skipping.');
          return;
        }
      }

      logger.log(`[LocationSyncService] Starting sync for position: ${lat}, ${lon} (radius ${OVERPASS_RADIUS_M}m)`);

      // 2. Préparer la requête Overpass (rayon de 50 km).
      // Catégories alignées sur les enum Location.type côté backend, couvrant
      // les deux vibes (jour/nuit) pour garantir un minimum de lieux affichables.
      const AMENITY_RE =
        'bar|pub|nightclub|library|university|college|school|food_court|cinema|ice_cream|restaurant|cafe|fast_food|gym';
      const LEISURE_RE = 'fitness_centre|beach_resort|theme_park|sports_centre|bowling_alley|stadium|pitch';
      const query = `
[out:json];
(
  node["amenity"~"${AMENITY_RE}"](around:${OVERPASS_RADIUS_M}, ${lat}, ${lon});
  node["leisure"~"${LEISURE_RE}"](around:${OVERPASS_RADIUS_M}, ${lat}, ${lon});
  way["amenity"~"${AMENITY_RE}"](around:${OVERPASS_RADIUS_M}, ${lat}, ${lon});
  way["leisure"~"${LEISURE_RE}"](around:${OVERPASS_RADIUS_M}, ${lat}, ${lon});
);
out center;
`;

      // 3. Appeler Overpass API
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });

      if (!response.ok) {
        console.warn('[LocationSyncService] Overpass API error:', response.statusText);
        return;
      }

      const data = await response.json();
      logger.log(`[LocationSyncService] Found ${data.elements?.length || 0} elements.`);

      if (!data.elements || data.elements.length === 0) {
        return;
      }

      // 4. Mapper et filtrer les données localement avant envoi (pour réduire la charge backend)
      const locationsToSync = data.elements
        .filter((el) => {
          const name = el.tags?.name || 'Unknown';
          if (name === 'Unknown') return false;
          // Pas d'exclusion par catégorie : le backend filtre par vibe (TYPES_BY_VIBE).
          // On garde uniquement des éléments nommés et localisés.
          const elLat = el.lat || el.center?.lat;
          const elLon = el.lon || el.center?.lon;
          return typeof elLat === 'number' && typeof elLon === 'number';
        })
        .map((el) => {
          let type = null;
          const amenity = el.tags?.amenity;
          const leisure = el.tags?.leisure;

          if (amenity === 'bar' || amenity === 'pub') type = 'Bar 🍺';
          else if (amenity === 'nightclub') type = 'Boîte de nuit 💃';
          else if (amenity === 'restaurant') type = 'Restaurant 🍴';
          else if (amenity === 'cafe') type = 'Café ☕';
          else if (amenity === 'fast_food' || amenity === 'food_court') type = 'Fast food 🍔';
          else if (amenity === 'gym' || leisure === 'fitness_centre') type = 'Salle de sport 🏋️';
          else if (leisure === 'beach_resort') type = 'Plage 🏖️';
          else if (leisure === 'theme_park') type = "Parc d'attractions 🎢";
          else if (amenity === 'library') type = 'Bibliothèque 📚';
          else if (leisure === 'sports_centre' || leisure === 'stadium' || leisure === 'pitch')
            type = 'Centre sportif 🏟️';
          else if (leisure === 'bowling_alley') type = 'Bowling 🎳';
          else if (amenity === 'university' || amenity === 'college' || amenity === 'school') type = 'Éducation 🎓';
          else if (amenity === 'cinema') type = 'Cinéma 🎬';
          else if (amenity === 'ice_cream') type = 'Glacier 🍦';

          const elLat = el.lat || el.center?.lat;
          const elLon = el.lon || el.center?.lon;

          if (!type) return null; // type non reconnu → on ne synchronise pas (évite le legacy "Lieu 📍")

          return {
            osmId: el.id,
            name: el.tags.name,
            city: el.tags['addr:city'] || '',
            type: type,
            coordinates: [elLon, elLat], // [lon, lat] pour MongoDB
          };
        })
        .filter((loc) => loc !== null);

      // 5. Envoyer au backend par paquets (pour éviter les payloads trop gros)
      const chunkSize = 100;
      for (let i = 0; i < locationsToSync.length; i += chunkSize) {
        const chunk = locationsToSync.slice(i, i + chunkSize);
        await post('/locations/sync-osm', { locations: chunk });
      }

      // 6. Enregistrer la date ET la position de la sync réussie
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toISOString());
      await AsyncStorage.setItem(LAST_SYNC_POS_KEY, JSON.stringify({ lat, lon }));
      logger.log('[LocationSyncService] Sync completed and date/position saved.');
    } catch (error) {
      console.error('[LocationSyncService] Error during sync:', error);
    }
  },
};
