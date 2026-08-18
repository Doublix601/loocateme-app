// Cache local (léger) des lieux à proximité récemment vus par l'app, utilisé
// pour une estimation optimiste du lieu courant côté client, sans appel
// serveur (cf. LocationService.guessLikelyVenueLocally).
//
// Minimisation : seuls id/coordonnées/rayon sont conservés (pas le contenu
// complet du lieu), avec une fenêtre de fraîcheur courte.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lm_nearby_venues_cache_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

export async function cacheNearbyVenues(locations) {
  if (!Array.isArray(locations) || !locations.length) return;
  try {
    const lightweight = locations
      .filter((l) => l?._id && l?.location?.coordinates)
      .slice(0, MAX_ENTRIES)
      .map((l) => ({
        id: String(l._id),
        name: l.name || '',
        lon: l.location.coordinates[0],
        lat: l.location.coordinates[1],
        radius: l.radius || 50,
      }));
    if (!lightweight.length) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ cachedAt: Date.now(), venues: lightweight }));
  } catch (_) {
    // Best-effort
  }
}

export async function getCachedNearbyVenues() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > MAX_AGE_MS) return [];
    return Array.isArray(parsed.venues) ? parsed.venues : [];
  } catch (_) {
    return [];
  }
}
