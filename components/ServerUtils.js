// Backend origin (no trailing /api)
// Strategy (safe-by-default):
// - If EXPO_PUBLIC_API_ORIGIN is provided, use it (developers can point to localhost manually)
// - Otherwise, default to production API origin over HTTP (per project requirement)
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
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
}

/**
 * Format distance for display
 * @param {number} meters Distance in meters
 * @returns {string} Formatted distance (e.g. "150m", "1.2km")
 */
export function formatDistance(meters) {
    if (!meters && meters !== 0) return '';

    // Round to nearest 50m
    const roundedMeters = Math.round(meters / 50) * 50;

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
        }
        return trimmed;
    } catch (_e) {
        return uri;
    }
}
