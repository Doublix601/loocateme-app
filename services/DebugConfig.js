// Source de vérité unique pour la configuration debug.
// Importé par PremiumService et IAPStore — ne jamais importer DebugScreen ici
// pour éviter les dépendances circulaires.

export const DEBUG_CONFIG = {
  IAP_DISABLED: false,  // true → aucun appel Apple/Google, achat simulé immédiatement
  FORCE_PREMIUM: false, // true → isPremium() retourne toujours true
};

export function setDebugFlag(key, value) {
  if (key in DEBUG_CONFIG) {
    DEBUG_CONFIG[key] = value;
  }
}