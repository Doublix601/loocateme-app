// File d'attente locale des détections BLE capturées sans connexion réseau.
// Permet à la fonctionnalité de proximité de continuer à fonctionner "hors
// réseau" (objectif principal de cette fonctionnalité) : les détections sont
// stockées sur l'appareil puis envoyées dès que la connexion revient.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lm_ble_offline_queue_v1';
const MAX_QUEUED_BATCHES = 200; // borne haute anti-croissance illimitée si offline longtemps

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

  const { reportBleSightings } = await import('../components/ApiRequest');
  for (const batch of queue) {
    try {
      await reportBleSightings(batch.sightings);
    } catch (e) {
      // Toujours pas de réseau ou erreur serveur : on remet ce lot (et le reste
      // non encore traité) en file pour la prochaine tentative.
      const remainingIndex = queue.indexOf(batch);
      await enqueueSighting(queue.slice(remainingIndex).flatMap((b) => b.sightings));
      break;
    }
  }
}
