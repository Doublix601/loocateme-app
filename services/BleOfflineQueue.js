// File d'attente locale des détections BLE capturées sans connexion réseau.
// Permet à la fonctionnalité de proximité de continuer à fonctionner "hors
// réseau" (objectif principal de cette fonctionnalité) : les détections sont
// stockées sur l'appareil puis envoyées dès que la connexion revient.
//
// Fenêtre utile réelle : ~10 min. Chaque sighting référence le jeton BLE
// annoncé au moment de la capture, or ce jeton n'est valide que 10 min côté
// serveur (TOKEN_TTL_S, cf. loocateme_backend/src/services/ble.service.js) et
// tourne toutes les 9 min côté client (TOKEN_ROTATION_MS, cf.
// BluetoothProximityService.js). Passé ce délai le serveur accepte la requête
// mais ne peut plus résoudre `peerUserId` et ignore silencieusement le
// sighting. MAX_QUEUED_BATCHES protège seulement contre une croissance
// illimitée du stockage local ; la purge par âge ci-dessous évite d'envoyer
// pour rien des lots de toute façon inexploitables par le serveur.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lm_ble_offline_queue_v1';
const MAX_QUEUED_BATCHES = 200; // borne haute anti-croissance illimitée si offline longtemps
const MAX_BATCH_AGE_MS = 9 * 60 * 1000; // aligné sur TOKEN_ROTATION_MS (marge sous les 10 min serveur)

function isBatchStillUseful(batch) {
  const queuedAt = batch?.queuedAt ? new Date(batch.queuedAt).getTime() : 0;
  return queuedAt > 0 && Date.now() - queuedAt < MAX_BATCH_AGE_MS;
}

export async function enqueueSighting(sightings) {
  if (!sightings?.length) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ sightings, queuedAt: new Date().toISOString() });
    const trimmed = queue.slice(-MAX_QUEUED_BATCHES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // Best-effort : une erreur de stockage local ne doit pas planter le scan BLE
  }
}

export async function flushQueuedSightings() {
  let queue = [];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    queue = raw ? JSON.parse(raw) : [];
  } catch (_) {
    return;
  }
  if (!queue.length) return;

  await AsyncStorage.removeItem(STORAGE_KEY);

  const usableQueue = queue.filter(isBatchStillUseful);

  const { reportBleSightings } = await import('../components/ApiRequest');
  for (const batch of usableQueue) {
    try {
      await reportBleSightings(batch.sightings);
    } catch (e) {
      // Toujours pas de réseau ou erreur serveur : on remet ce lot (et le reste
      // non encore traité) en file pour la prochaine tentative.
      const remainingIndex = usableQueue.indexOf(batch);
      await enqueueSighting(usableQueue.slice(remainingIndex).flatMap((b) => b.sightings));
      break;
    }
  }
}
