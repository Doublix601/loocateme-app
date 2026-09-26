import * as Location from 'expo-location';
import { loadDevLocationOverride, getDevLocationOverride } from './devLocationOverride';

// Wrapper autour d'expo-location qui applique l'override dev (si défini) et
// retente en Accuracy.Low si Balanced échoue (utile sur devices/émulateurs
// dont le fused location provider ne satisfait pas une accuracy élevée).
// `expo-location` ignore l'option `timeout` sur Android : `getCurrentPositionAsync`
// peut attendre indéfiniment un signal qui n'arrive jamais (émulateur, premier
// lancement après installation, intérieur). On impose donc une vraie limite de
// temps côté JS, et on accepte aussi le premier signal du suivi de position, que
// les émulateurs et certains appareils délivrent alors que la demande ponctuelle
// reste sans réponse.
export function getPositionWithTimeout(accuracy, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let watcher = null;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        watcher?.remove?.();
      } catch (_) {}
      fn(value);
    };
    timer = setTimeout(() => finish(reject, new Error('LOCATION_TIMEOUT')), timeoutMs);
    Location.getCurrentPositionAsync({ accuracy })
      .then((pos) => finish(resolve, pos))
      .catch(() => {});
    Location.watchPositionAsync({ accuracy, timeInterval: 1000, distanceInterval: 0 }, (pos) => finish(resolve, pos))
      .then((sub) => {
        if (settled) {
          try {
            sub.remove();
          } catch (_) {}
        } else {
          watcher = sub;
        }
      })
      .catch(() => {});
  });
}

// Wrapper autour d'expo-location qui applique l'override dev (si défini), impose
// une vraie limite de temps (voir ci-dessus) et retombe sur la dernière position
// connue de l'OS, même ancienne, plutôt que de laisser la liste en erreur.
export async function getCurrentPositionSmart({ skipLastKnown = false } = {}) {
  if (__DEV__) {
    await loadDevLocationOverride();
    const override = getDevLocationOverride();
    if (override) {
      return { coords: { latitude: override.latitude, longitude: override.longitude } };
    }
  }

  if (!skipLastKnown) {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 600000 });
    if (last) return last;
  }

  try {
    return await getPositionWithTimeout(Location.Accuracy.Balanced, 10000);
  } catch (_balancedErr) {
    try {
      return await getPositionWithTimeout(Location.Accuracy.Low, 12000);
    } catch (lowErr) {
      const anyLast = await Location.getLastKnownPositionAsync({});
      if (anyLast) return anyLast;
      throw lowErr;
    }
  }
}
