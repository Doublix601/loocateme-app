// Lightweight Overpass API client with time-based throttle, backoff on errors,
// request timeout via AbortController and simple in-memory cache.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Minimum interval between two real network calls (regardless of bbox)
const MIN_INTERVAL_MS = 30 * 1000; // 30s
// After a failure, do not retry before this backoff window
const FAILURE_BACKOFF_MS = 60 * 1000; // 60s (erreurs génériques)
// Backoff plus long pour les erreurs serveur Overpass (5xx, ex: 504 Gateway Timeout).
// L'API publique Overpass étant régulièrement surchargée, on évite de la marteler.
const SERVER_ERROR_BACKOFF_MS = 5 * 60 * 1000; // 5 min
// Per-request timeout (doit être >= au [timeout:N] envoyé à Overpass ci-dessous)
const REQUEST_TIMEOUT_MS = 20 * 1000; // 20s
// Timeout demandé au serveur Overpass (en secondes). On le garde légèrement
// inférieur au timeout client pour laisser le temps à la réponse de revenir.
const OVERPASS_SERVER_TIMEOUT_S = 18;

let lastFetchAt = 0;
let lastFailureAt = 0;
let inflight = null; // Promise of an ongoing request, to deduplicate concurrent calls
let lastResult = { bboxKey: null, pois: [] };

// Catégories d'établissement par vibe (mode jour/nuit)
// - 'moon' (nuit) : lieux de sortie nocturne
// - 'sun'  (jour) : lieux d'activité diurne (études, sport, restauration)
// On répartit selon la clé OSM utilisée (amenity vs leisure).
const CATEGORIES_BY_VIBE = {
  moon: {
    amenity: ['bar', 'pub', 'biergarten', 'nightclub', 'restaurant', 'cinema', 'fast_food', 'food_court'],
    leisure: ['bowling_alley'],
    backend: [
      'Bar 🍺',
      'Boîte de nuit 💃',
      'Restaurant 🍴',
      'Cinéma 🎬',
      'Fast food 🍔',
      'Bowling 🎳',
      'Rooftop 🌆',
      'Karaoké 🎤',
      'Club de jeux 🎮',
      'TEST 🤖',
    ],
  },
  sun: {
    amenity: ['cafe', 'coworking_space', 'library', 'gym', 'university', 'college', 'school', 'marketplace', 'museum'],
    leisure: ['sports_centre', 'fitness_centre', 'stadium', 'pitch', 'park', 'beach'],
    backend: [
      'Café ☕',
      'Coworking 🧑‍💻',
      'Salle de sport 🏋️',
      'Centre sportif 🏟️',
      'Parc 🌳',
      'Plage 🏖️',
      "Parc d'attractions 🎢",
      'Bibliothèque 📚',
      'Éducation 🎓',
      'Glacier 🍦',
      'Marché 🛒',
      'Musée 🏛️',
      'Brunch 🥞',
      'TEST 🤖',
    ],
  },
};

// Set "à plat" des types autorisés par vibe (utile pour filtrer côté UI les POIs déjà
// reçus, qu'ils proviennent d'Overpass ou du backend). On agrège amenity + leisure +
// les libellés backend car le champ `type` peut contenir l'un ou l'autre format selon
// la source (Overpass: clé OSM ; backend MongoDB: libellé français à émoji).
export const ALLOWED_TYPES_BY_VIBE = {
  moon: new Set([
    ...CATEGORIES_BY_VIBE.moon.amenity,
    ...CATEGORIES_BY_VIBE.moon.leisure,
    ...CATEGORIES_BY_VIBE.moon.backend,
  ]),
  sun: new Set([
    ...CATEGORIES_BY_VIBE.sun.amenity,
    ...CATEGORIES_BY_VIBE.sun.leisure,
    ...CATEGORIES_BY_VIBE.sun.backend,
  ]),
};

export function normalizeVibe(v) {
  return v === 'moon' ? 'moon' : 'sun';
}

// Renvoie true si le type d'un POI est compatible avec la vibe demandée.
// Séparation stricte : chaque type appartient à un seul mode.
// Les types inconnus sont exclus par défaut (type absent des deux listes → caché).
export function isTypeAllowedForVibe(type, vibe) {
  if (!type) return false;
  const v = normalizeVibe(vibe);
  return ALLOWED_TYPES_BY_VIBE[v].has(type);
}

// Round coordinates to ~110m precision to stabilize cache key against tiny GPS jitter
function roundCoord(v) {
  return Math.round(v * 1000) / 1000;
}

function buildKey(lat, lon, radius, vibe) {
  return `${roundCoord(lat)}:${roundCoord(lon)}:${radius}:${vibe}`;
}

function buildQuery({ lat, lon, radius = 1200, vibe = 'sun' }) {
  // Catégories choisies selon le vibe (jour/nuit), réparties par clé OSM.
  // On fusionne les types via une regex `~"a|b|c"` pour réduire le nombre de
  // sous-requêtes Overpass (1 par clé OSM au lieu d'une par type), ce qui
  // accélère significativement le temps de réponse.
  const cats = CATEGORIES_BY_VIBE[normalizeVibe(vibe)];
  const parts = [];
  if (cats.amenity && cats.amenity.length > 0) {
    parts.push(`node["amenity"~"^(${cats.amenity.join('|')})$"](around:${radius},${lat},${lon});`);
  }
  if (cats.leisure && cats.leisure.length > 0) {
    parts.push(`node["leisure"~"^(${cats.leisure.join('|')})$"](around:${radius},${lat},${lon});`);
  }
  const filters = parts.join('\n');
  return `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_S}];(\n${filters}\n);out body;`;
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
  return (elements || [])
    .filter((e) => e && e.type === 'node' && e.tags?.name)
    .map((e) => {
      const name = e.tags.name;
      const type = e.tags?.amenity || e.tags?.leisure || 'poi';
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
      try {
        return await inflight;
      } catch (_) {
        return lastResult.pois || [];
      }
    }

    inflight = (async () => {
      try {
        const q = buildQuery({ lat, lon, radius, vibe: v });
        const json = await fetchOverpass(q);
        const pois = normalize(json?.elements || []);
        lastFetchAt = Date.now();
        lastFailureAt = 0;
        lastResult = { bboxKey: key, pois };
        // Note: pas d'appel unitaire `/locations/osm-seed` ici. La sync globale
        // est déjà assurée par `LocationSyncService` via `/locations/sync-osm`.
        return pois;
      } catch (e) {
        // Sur erreur serveur Overpass (HTTP 5xx, ex: 504), on applique un
        // backoff plus long pour ne pas re-cogner une API déjà surchargée.
        const msg = String(e?.message || '');
        const is5xx = /Overpass HTTP 5\d\d/.test(msg);
        lastFailureAt = Date.now() + (is5xx ? SERVER_ERROR_BACKOFF_MS - FAILURE_BACKOFF_MS : 0);
        const label = e?.name === 'AbortError' ? 'timeout' : e?.name || 'Error';
        console.warn(`[OverpassService] fetchAround failed (${label}): ${msg || e}`);
        return lastResult.pois || [];
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  },
};
