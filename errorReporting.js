// Doit rester le tout premier import de index.js (avant `expo` et `./App`) :
// installe le handler AVANT que les ~40 modules importés par App.js ne
// s'évaluent, pour capter aussi une exception fatale survenant pendant leur
// chargement, pas seulement pendant le rendu React. Sans ceci, une exception
// fatale (JS) au tout premier lancement finit en SIGABRT natif sans aucune
// trace exploitable côté App Store Connect (cf. crash reporté par la review
// Apple du 23/08/2026, Guideline 2.1(a) : abort() via
// expo.controller.errorRecoveryQueue, sans message d'erreur récupérable).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LAST_FATAL_ERROR_STORAGE_KEY = '@loocateme:last_fatal_error';

try {
  const errorUtils = global.ErrorUtils;
  if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
    const previousHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      try {
        const payload = JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack || null,
          isFatal: !!isFatal,
          ts: Date.now(),
        });
        // Best-effort : le pont natif peut déjà avoir reçu l'appel avant que
        // l'abort() qui suit ne coupe le thread JS, donc une partie des cas
        // sont malgré tout persistés.
        AsyncStorage.setItem(LAST_FATAL_ERROR_STORAGE_KEY, payload).catch(() => {});
      } catch (_) {
        // ne jamais faire planter le handler d'erreur lui-même
      }
      if (typeof previousHandler === 'function') {
        previousHandler(error, isFatal);
      }
    });
  }
} catch (_) {
  // no-op : si ErrorUtils n'est pas dispo (env de test, etc.), on laisse le
  // comportement par défaut de RN inchangé.
}
