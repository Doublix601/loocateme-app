// Permet à un check-in/check-out forcé (LocationScreen, y compris en
// production via "Je ne suis plus ici"/"Je ne suis dans aucun lieu") de
// suspendre temporairement les heartbeats/mises à jour de position
// automatiques, qui sinon re-matchent l'utilisateur sur sa position GPS
// réelle et annulent le forçage en quelques secondes.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lm_loc_suppress_until';

let suppressUntil = 0;
let hydrated = false;

export function suppressLocationHeartbeat(ms = 7 * 60 * 1000) {
  suppressUntil = Date.now() + ms;
  AsyncStorage.setItem(STORAGE_KEY, String(suppressUntil)).catch(() => {});
}

export function isLocationHeartbeatSuppressed() {
  return Date.now() < suppressUntil;
}

// À appeler une fois au boot (App.js), avant que les heartbeats GPS ne
// puissent démarrer : sans ça, un check-out/check-in forcé suivi d'un kill de
// l'app dans les 7 minutes qui suivent perd silencieusement sa protection
// (suppressUntil n'existait qu'en mémoire), et le premier heartbeat GPS au
// redémarrage peut aussitôt annuler l'état forcé.
export async function hydrateLocationHeartbeatSuppression() {
  if (hydrated) return;
  hydrated = true;
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = v ? parseInt(v, 10) : 0;
    if (Number.isFinite(parsed)) suppressUntil = parsed;
  } catch (_) {}
}
