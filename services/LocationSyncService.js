import AsyncStorage from '@react-native-async-storage/async-storage';
import { post } from '../components/ApiRequest';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const LAST_SYNC_KEY = 'loocateme_last_osm_sync';

export const LocationSyncService = {
  syncNearbyLocations: async (lat, lon) => {
    try {
      // 1. Vérifier si l'utilisateur a déjà fait une sync aujourd'hui
      const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const now = new Date();
      if (lastSyncStr) {
        const lastSyncDate = new Date(lastSyncStr);
        // Si la dernière sync date de moins de 24h, on ignore
        if (now - lastSyncDate < 24 * 60 * 60 * 1000) {
          console.log('[LocationSyncService] Sync already done today, skipping.');
          return;
        }
      }

      console.log(`[LocationSyncService] Starting sync for position: ${lat}, ${lon}`);

      // 2. Préparer la requête Overpass (rayon de 30km)
      const query = `
[out:json];
(
  node["amenity"~"bar|nightclub|library|university|college|food_court|cinema|ice_cream"](around:30000, ${lat}, ${lon});
  node["leisure"~"fitness_centre|beach_resort|theme_park|sports_centre|bowling_alley"](around:30000, ${lat}, ${lon});
  way["amenity"~"bar|nightclub|library|university|college|food_court|cinema|ice_cream"](around:30000, ${lat}, ${lon});
  way["leisure"~"fitness_centre|beach_resort|theme_park|sports_centre|bowling_alley"](around:30000, ${lat}, ${lon});
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
      console.log(`[LocationSyncService] Found ${data.elements?.length || 0} elements.`);

      if (!data.elements || data.elements.length === 0) {
        return;
      }

      // 4. Mapper et filtrer les données localement avant envoi (pour réduire la charge backend)
      const locationsToSync = data.elements
        .filter((el) => {
          const name = el.tags?.name || 'Unknown';
          const amenity = el.tags?.amenity;
          if (name === 'Unknown') return false;
          // Filtrer les types exclus comme dans le backend
          if (['theatre', 'community_centre', 'social_facility', 'restaurant', 'cafe'].includes(amenity)) return false;
          if (el.tags?.leisure === 'park') return false;
          return true;
        })
        .map((el) => {
          let type = 'Lieu 📍';
          const amenity = el.tags?.amenity;
          const leisure = el.tags?.leisure;

          if (amenity === 'bar') type = 'Bar 🍺';
          else if (amenity === 'nightclub') type = 'Boîte de nuit 💃';
          else if (leisure === 'fitness_centre') type = 'Salle de sport 🏋️';
          else if (leisure === 'beach_resort') type = 'Plage 🏖️';
          else if (leisure === 'theme_park') type = 'Parc d\'attractions 🎢';
          else if (amenity === 'library') type = 'Bibliothèque 📚';
          else if (leisure === 'sports_centre') type = 'Centre sportif 🏟️';
          else if (leisure === 'bowling_alley') type = 'Bowling 🎳';
          else if (amenity === 'university' || amenity === 'college') type = 'Éducation 🎓';
          else if (amenity === 'food_court') type = 'Espace restauration 🍱';
          else if (amenity === 'cinema') type = 'Cinéma 🎬';
          else if (amenity === 'ice_cream') type = 'Glacier 🍦';

          const elLat = el.lat || el.center?.lat;
          const elLon = el.lon || el.center?.lon;

          return {
            osmId: el.id,
            name: el.tags.name,
            city: el.tags['addr:city'] || '',
            type: type,
            coordinates: [elLon, elLat], // [lon, lat] pour MongoDB
          };
        });

      // 5. Envoyer au backend par paquets (pour éviter les payloads trop gros)
      const chunkSize = 100;
      for (let i = 0; i < locationsToSync.length; i += chunkSize) {
        const chunk = locationsToSync.slice(i, i + chunkSize);
        await post('/locations/sync-osm', { locations: chunk });
      }

      // 6. Enregistrer la date de sync réussie
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toISOString());
      console.log('[LocationSyncService] Sync completed and date saved.');

    } catch (error) {
      console.error('[LocationSyncService] Error during sync:', error);
    }
  },
};
