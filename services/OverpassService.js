// Lightweight Overpass API client with time-based throttle, backoff on errors,
// request timeout via AbortController and simple in-memory cache.
import { post } from '../components/ApiRequest';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Minimum interval between two real network calls (regardless of bbox)
const MIN_INTERVAL_MS = 30 * 1000;        // 30s
// After a failure, do not retry before this backoff window
const FAILURE_BACKOFF_MS = 60 * 1000;     // 60s
// Per-request timeout
const REQUEST_TIMEOUT_MS = 8 * 1000;      // 8s

let lastFetchAt = 0;
let lastFailureAt = 0;
let inflight = null; // Promise of an ongoing request, to deduplicate concurrent calls
let lastResult = { bboxKey: null, pois: [] };

// Catégories d'établissement par vibe (mode jour/nuit)
// - 'moon' (nuit) : lieux de sortie nocturne
// - 'sun'  (jour) : lieux d'activité diurne
const AMENITIES_BY_VIBE = {
  moon: ['bar', 'pub', 'nightclub', 'restaurant', 'cafe', 'cinema', 'fast_food'],
  sun:  ['cafe', 'restaurant', 'fast_food', 'coworking_space', 'library', 'gym', 'university', 'college', 'school', 'food_court'],
};

function normalizeVibe(v) {
  return v === 'moon' ? 'moon' : 'sun';
}

// Cache of known OSM IDs we already pushed to backend
const knownIds = new Set();

// Round coordinates to ~110m precision to stabilize cache key against tiny GPS jitter
function roundCoord(v) {
  return Math.round(v * 1000) / 1000;
}

function buildKey(lat, lon, radius, vibe) {
  return `${roundCoord(lat)}:${roundCoord(lon)}:${radius}:${vibe}`;
}

function buildQuery({ lat, lon, radius = 1200, vibe = 'sun' }) {
  // Amenity types choisis selon le vibe (jour/nuit)
  const types = AMENITIES_BY_VIBE[normalizeVibe(vibe)];
  const filters = types.map(t => `node["amenity"="${t}"](around:${radius},${lat},${lon});`).join('\n');
  return `data=[out:json][timeout:25];(\n${filters}\n);out body;`;
}

async function fetchOverpass(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(elements = []) {
  return (elements || []).filter(e => e && e.type === 'node').map(e => {
    const name = e.tags?.name || 'Lieu OSM';
    const type = e.tags?.amenity || 'poi';
    return {
      _id: `osm:${e.id}`,
      osmId: e.id,
      name,
      type,
      location: { type: 'Point', coordinates: [e.lon, e.lat] },
      userCount: 0,
      activeUsers: [],
      stars: 0,
      isPromoted: false,
      source: 'osm',
    };
  });
}

export const OverpassService = {
  // Throttled fetch: returns cached result if called too soon, unless `force: true`.
  // After a failure, further calls are skipped for FAILURE_BACKOFF_MS to avoid log spam.
  async fetchAround({ lat, lon, radius = 1200, force = false, vibe = 'sun' } = {}) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return lastResult.pois || [];
    }
    const v = normalizeVibe(vibe);
    const now = Date.now();
    const key = buildKey(lat, lon, radius, v);

    // Backoff after a recent failure
    if (!force && now - lastFailureAt < FAILURE_BACKOFF_MS) {
      return lastResult.pois || [];
    }

    // Time-based throttle: same or different bbox doesn't matter, we cap the rate
    // Mais on force le refetch si le vibe (et donc les catégories) a changé
    if (!force && now - lastFetchAt < MIN_INTERVAL_MS && lastResult.bboxKey && lastResult.bboxKey.endsWith(`:${v}`)) {
      return lastResult.pois;
    }

    // Deduplicate concurrent calls
    if (inflight) {
      try { return await inflight; } catch (_) { return lastResult.pois || []; }
    }

    inflight = (async () => {
      try {
        const q = buildQuery({ lat, lon, radius, vibe: v });
        const json = await fetchOverpass(q);
        const pois = normalize(json?.elements || []);
        lastFetchAt = Date.now();
        lastFailureAt = 0;
        lastResult = { bboxKey: key, pois };

        // Fire-and-forget push unknown OSM to backend to seed DB
        (async () => {
          for (const p of pois) {
            if (knownIds.has(p.osmId)) continue;
            knownIds.add(p.osmId);
            try {
              await post('/locations/osm-seed', {
                osmId: p.osmId,
                name: p.name,
                type: p.type,
                lon: p.location.coordinates[0],
                lat: p.location.coordinates[1],
              });
            } catch (_) {
              // Ignore any backend error silently
            }
          }
        })();

        return pois;
      } catch (e) {
        lastFailureAt = Date.now();
        const label = e?.name === 'AbortError' ? 'timeout' : (e?.name || 'Error');
        console.warn(`[OverpassService] fetchAround failed (${label}): ${e?.message || e}`);
        return lastResult.pois || [];
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }
};
