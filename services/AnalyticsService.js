import { logger } from '../utils/logger';

// Wrapper autour de @react-native-firebase/analytics.
// Le module natif Firebase n'est disponible qu'après un build EAS (dev client ou prod) qui
// embarque le config plugin `@react-native-firebase/app` — tant que ce build n'a pas eu lieu
// (ex: en Expo Go, ou avec un ancien binaire dev client), le require ci-dessous peut échouer
// ou l'appel natif peut throw. On isole donc tout dans des try/catch pour ne jamais crasher l'app.

let analyticsModule = null;
try {
  analyticsModule = require('@react-native-firebase/analytics').default;
} catch (_) {
  analyticsModule = null;
}

// Firebase Analytics n'accepte que des valeurs string/number/boolean en paramètre
// (pas d'objets imbriqués, pas d'undefined/null) : on nettoie le payload avant l'envoi.
function _sanitizeParams(params) {
  if (!params || typeof params !== 'object') return undefined;
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      try {
        cleaned[key] = JSON.stringify(value);
      } catch (_) {
        // skip
      }
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

// Envoie un événement à Firebase Analytics.
// `eventName` doit respecter les conventions Firebase : snake_case, <= 40 caractères,
// et ne pas commencer par un préfixe réservé (firebase_, google_, ga_).
export function logAnalyticsEvent(eventName, params) {
  try {
    if (!analyticsModule) return;
    const instance = analyticsModule();
    instance.logEvent(eventName, _sanitizeParams(params)).catch((e) => {
      logger.log('[AnalyticsService] logEvent failed:', e?.message);
    });
  } catch (e) {
    // Ne jamais faire planter l'app pour un souci d'analytics (module natif pas encore
    // compilé, SDK non initialisé, etc.)
    logger.log('[AnalyticsService] logAnalyticsEvent error:', e?.message);
  }
}

export default { logAnalyticsEvent };
