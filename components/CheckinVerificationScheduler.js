// Suit le check-in en cours pour proposer, en interne à l'app (pas de
// notification), une confirmation "Es-tu bien ici ?" ~5 min après le
// check-in — une seule fois par lieu, tant que l'utilisateur ne se déplace
// pas de plus de RESET_DISTANCE_M.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PENDING = 'checkin:pendingVerify';
const KEY_LAST_CONFIRMED = 'checkin:lastConfirmed';
const FIVE_MIN_MS = 5 * 60 * 1000;
const DELAY_MS = __DEV__ ? 15 * 1000 : FIVE_MIN_MS;
const RESET_DISTANCE_M = 50;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function cancelCheckinVerification() {
  try {
    await AsyncStorage.removeItem(KEY_PENDING);
  } catch (_) {}
}

// Enregistre le lieu confirmé (par l'utilisateur ou automatiquement) pour ne
// plus jamais reproposer la vérification tant qu'il n'a pas bougé de plus de
// RESET_DISTANCE_M.
export async function markCheckinVerified({ locationId, lat, lon }) {
  try {
    if (!locationId || lat == null || lon == null) return;
    await AsyncStorage.setItem(KEY_LAST_CONFIRMED, JSON.stringify({ locationId: String(locationId), lat, lon }));
  } catch (_) {}
  await cancelCheckinVerification();
}

// Appelé à chaque check-in réussi. Si l'utilisateur est toujours à moins de
// RESET_DISTANCE_M du dernier lieu confirmé, on ne redemande rien. Sinon on
// planifie une nouvelle vérification (relue par checkPendingCheckinVerification).
export async function scheduleCheckinVerification({ locationId, lat, lon }) {
  if (!locationId || lat == null || lon == null) return;

  try {
    const rawLastConfirmed = await AsyncStorage.getItem(KEY_LAST_CONFIRMED);
    if (rawLastConfirmed) {
      const last = JSON.parse(rawLastConfirmed);
      const distance = haversineMeters(lat, lon, last.lat, last.lon);
      if (distance <= RESET_DISTANCE_M) {
        // Toujours dans la zone déjà confirmée : on ne redemande pas.
        await cancelCheckinVerification();
        return;
      }
    }
  } catch (_) {}

  try {
    await AsyncStorage.setItem(
      KEY_PENDING,
      JSON.stringify({ locationId: String(locationId), lat, lon, checkinAt: Date.now() }),
    );
  } catch (_) {}
}

// Relu périodiquement (App.js) : renvoie le lieu à vérifier si le délai est
// écoulé, puis consomme l'entrée (une seule proposition par check-in).
export async function checkPendingCheckinVerification() {
  try {
    const raw = await AsyncStorage.getItem(KEY_PENDING);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending?.locationId || !pending?.checkinAt) {
      await cancelCheckinVerification();
      return null;
    }
    if (Date.now() - pending.checkinAt < DELAY_MS) return null;

    // Une seule proposition : on retire l'entrée dès qu'on la sert, qu'elle
    // soit affichée ou non (l'appelant vérifie que l'utilisateur est encore
    // sur place avant d'afficher le modal).
    await cancelCheckinVerification();
    return pending;
  } catch (_) {
    return null;
  }
}
