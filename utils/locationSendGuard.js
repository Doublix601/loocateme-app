// Garde-fou partagé entre usePresence (heartbeat de présence), LocationService
// (check-in) et LocationListScreen (fetch avec mise à jour de position). Ces
// modules déclenchent indépendamment un envoi de position au backend (POST
// /user/heartbeat et POST /users/location), qui déclenchent tous le même
// pipeline coûteux côté serveur (getNearbyPoiCandidates + updateLocation).
// Sans coordination, un même déplacement/retour d'app peut donc générer
// plusieurs requêtes réseau pour la même information. Ce module évite les
// envois redondants en mémorisant le dernier envoi réussi (tous modules
// confondus) et en filtrant les envois trop proches en temps et en distance.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { haversineMeters } from './geo';

const MIN_INTERVAL_MS = 15000; // 15s
// Cohérent avec le bruit GPS déjà toléré côté serveur (MIN_LEAD_M = 12m,
// user.service.js) et le rounding 4 décimales (~11m) des clés de cache.
const MIN_DISTANCE_M = 15;

// Persistance best-effort : BackgroundLocation.js (tâche TaskManager) peut
// tourner dans un contexte JS séparé du reste de l'app (app tuée, tâche
// headless) où cet état en mémoire n'existe pas — même contrainte déjà
// rencontrée pour `user_checkInMode` (cf. LocationService.js), résolue de la
// même façon : persister dans AsyncStorage plutôt que supposer un état
// mémoire partagé entre contextes.
const STORAGE_KEY = 'location_send_guard_v1';

let lastSentAt = 0;
let lastCoords = null;

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
  try {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ lastSentAt, lastCoords })).catch(() => {});
  } catch (_) {}
}

// Variante de shouldSend utilisable hors du contexte JS "chaud" de l'app
// (BackgroundLocation.js) : relit d'abord l'état persisté, car l'état en
// mémoire de ce module peut être vide dans un contexte séparé (app tuée,
// tâche headless TaskManager) même si un autre module a bien envoyé une
// position récemment.
export async function shouldSendPersisted(lat, lon, opts) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const persisted = JSON.parse(raw);
      if (persisted && persisted.lastSentAt > lastSentAt) {
        lastSentAt = persisted.lastSentAt;
        lastCoords = persisted.lastCoords || null;
      }
    }
  } catch (_) {}
  return shouldSend(lat, lon, opts);
}
