// Hash non-cryptographique (FNV-1a) utilisé pour comparer localement, entre
// deux appareils à proximité, si un candidat de lieu GPS correspond au lieu
// où se trouve déjà un pair détecté en BLE — sans jamais contacter le
// serveur. Volontairement non sécurisé (pas un canal d'authentification) :
// c'est un mécanisme de repli local, dégradé, pour le cas où la connexion
// réseau ne revient jamais. La vérification "sûre" (identité du pair,
// association réelle au lieu) reste faite serveur, via /user/ble-sightings,
// dès que le réseau redevient disponible.
//
// Le hash est salé par le jeton éphémère du pair (qui change toutes les
// ~10 min) : un tiers qui capterait la trame BLE ne peut pas savoir à quel
// lieu elle correspond sans connaître déjà le lieu candidat testé, et ne
// peut pas corréler deux détections d'un même lieu dans le temps puisque le
// hash change à chaque rotation de jeton.
function fnv1a32(bytes, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function stringToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff);
  return bytes;
}

// Retourne 4 octets dérivés de (venueId, tokenBytes) — comparable seulement
// par quelqu'un qui connaît déjà à la fois le token diffusé et le venueId
// candidat à tester (jamais transmis en clair par ailleurs).
export function computeVenueHashBytes(venueId, tokenBytes) {
  const input = [...stringToBytes(String(venueId)), ...tokenBytes];
  const h1 = fnv1a32(input, 0x811c9dc5);
  const h2 = fnv1a32(input, 0x9e3779b9);
  return [
    (h1 >>> 24) & 0xff,
    (h1 >>> 16) & 0xff,
    (h2 >>> 8) & 0xff,
    h2 & 0xff,
  ];
}

export function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
