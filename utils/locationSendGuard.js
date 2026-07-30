// Garde-fou partagé entre usePresence (heartbeat de présence) et LocationService
// (check-in). Les deux modules déclenchent indépendamment un envoi de position
// au backend (POST /user/heartbeat et POST /users/location), qui déclenchent
// tous les deux le même pipeline coûteux côté serveur (getNearbyPoiCandidates
// + updateLocation). Sans coordination, un même déplacement/retour d'app peut
// donc générer deux requêtes réseau pour la même information. Ce module évite
// les envois redondants en mémorisant le dernier envoi réussi (tous modules
// confondus) et en filtrant les envois trop proches en temps et en distance.

const MIN_INTERVAL_MS = 15000; // 15s
// Cohérent avec le bruit GPS déjà toléré côté serveur (MIN_LEAD_M = 12m,
// user.service.js) et le rounding 4 décimales (~11m) des clés de cache.
const MIN_DISTANCE_M = 15;

let lastSentAt = 0;
let lastCoords = null;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Arrondit à ~11m de précision, aligné avec le rounding déjà fait côté
// serveur pour les clés de cache (toFixed(4) dans getNearbyPoiCandidates).
export function roundCoord(value) {
  return Number(value.toFixed(4));
}

export function shouldSend(lat, lon, { force = false } = {}) {
  if (force) return true;
  const now = Date.now();
  if (now - lastSentAt >= MIN_INTERVAL_MS) return true;
  if (!lastCoords) return true;
  const distance = haversineMeters(lat, lon, lastCoords.lat, lastCoords.lon);
  return distance >= MIN_DISTANCE_M;
}

export function markSent(lat, lon) {
  lastSentAt = Date.now();
  lastCoords = { lat, lon };
}
