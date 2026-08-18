import { haversineMeters } from '../utils/geo';

// Backend origin (no trailing /api)
// Strategy (safe-by-default):
// - If EXPO_PUBLIC_API_ORIGIN is provided, use it (developers can point to localhost manually)
// - Otherwise, default to production API origin over HTTPS (required by iOS ATS in release/TestFlight builds)
const DEFAULT_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN || 'https://api.loocate.me';

export function getServerAddress() {
  // Kept for backward compatibility; returns the origin
  return DEFAULT_ORIGIN;
}

export function getApiOrigin() {
  return DEFAULT_ORIGIN;
}

/**
 * Calculate distance between two points using the Haversine formula
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  // Garde historique : un 0 exact (équateur/méridien) est traité comme
  // "absent" ici, comportement préservé tel quel pour ne rien changer chez
  // les appelants existants (LocationListScreen.js, LocationScreen.js).
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  return haversineMeters(lat1, lon1, lat2, lon2);
}

/**
 * Format distance for display
 * @param {number} meters Distance in meters
 * @returns {string} Formatted distance (e.g. "150m", "1.2km")
 */
export function formatDistance(meters) {
  if (!meters && meters !== 0) return '';

  // Round to nearest 10m
  const roundedMeters = Math.round(meters / 10) * 10;

  if (roundedMeters < 1000) {
    return `${roundedMeters}m`;
  }
  return `${(roundedMeters / 1000).toFixed(1)}km`;
}

// Return a URL that goes through our API image proxy when needed to bypass iOS ATS/domain restrictions
export function proxifyImageUrl(uri) {
  try {
    if (!uri || typeof uri !== 'string') return uri;
    const trimmed = uri.trim();
    // data URI or local file should be left untouched
    if (/^(data:|file:)/i.test(trimmed)) return trimmed;

    // If already pointing to our backend uploads or proxy, keep as-is
    const origin = getApiOrigin().replace(/\/$/, '');
    if (trimmed.startsWith('/uploads')) {
      return `${origin}${trimmed}`;
    }
    if (trimmed.startsWith(`${origin}/uploads`) || trimmed.startsWith(`${origin}/api/proxy/image`)) {
      return trimmed;
    }

    // Only proxify http/https external URLs that are not our origin
    if (/^https?:\/\//i.test(trimmed)) {
      const target = new URL(trimmed);
      const api = new URL(origin);
      if (target.host !== api.host) {
        return `${origin}/api/proxy/image?u=${encodeURIComponent(trimmed)}`;
      }
      // Same host but plain HTTP (e.g. a photo URL persisted before the backend
      // forced HTTPS on generation): upgrade to HTTPS, since iOS ATS blocks
      // cleartext image loads in production builds (Expo Go is more lenient,
      // which is why this only shows as grey placeholders in release builds).
      if (target.protocol === 'http:') {
        target.protocol = 'https:';
        return target.toString();
      }
    }
    return trimmed;
  } catch (_e) {
    return uri;
  }
}
