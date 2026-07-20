import * as Location from 'expo-location';
import { loadDevLocationOverride, getDevLocationOverride } from './devLocationOverride';

// Wrapper autour d'expo-location qui applique l'override dev (si défini) et
// retente en Accuracy.Low si Balanced échoue (utile sur devices/émulateurs
// dont le fused location provider ne satisfait pas une accuracy élevée).
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
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch (balancedErr) {
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  }
}
