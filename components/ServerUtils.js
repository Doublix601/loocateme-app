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

// Return a URL that goes through our API image proxy when needed to bypass iOS ATS/domain restrictions
export function proxifyImageUrl(uri) {
    try {
        if (!uri || typeof uri !== 'string') return uri;
        const trimmed = uri.trim();
        // data URI or local file should be left untouched
        if (/^(data:|file:)/i.test(trimmed)) return trimmed;

        // If already pointing to our backend uploads or proxy, keep as-is
        const origin = getApiOrigin().replace(/\/$/, '');
        if (trimmed.startsWith('/uploads') || trimmed.startsWith(`${origin}/uploads`) || trimmed.startsWith(`${origin}/api/proxy/image`)) {
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
