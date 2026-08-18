import AsyncStorage from '@react-native-async-storage/async-storage';

const CHECKIN_KEY = 'lm_progressive_checkin_count';

async function getCount(key) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function setCount(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

/**
 * À appeler juste après un check-in réussi (n'importe quel flow : manuel, auto
 * GPS, QR). Idempotent au-delà du 2e appel (le compteur ne sert qu'à
 * déclencher les paliers de déblocage progressif, pas de statistique précise).
 *
 * Module volontairement sans dépendance React/hooks : UserContext.js
 * l'importe directement pour déclencher le compteur depuis son abonnement
 * central `api:mutation`, et hooks/useProgressiveUnlock.js (qui dépend
 * transitivement de UserContext via usePremiumAccess) le ré-exporte pour ses
 * propres consommateurs — l'importer depuis useProgressiveUnlock.js dans
 * UserContext.js créerait un cycle d'import.
 */
export async function incrementCheckinCount() {
  const current = await getCount(CHECKIN_KEY);
  if (current < 2) await setCount(CHECKIN_KEY, current + 1);
}

export { CHECKIN_KEY };
