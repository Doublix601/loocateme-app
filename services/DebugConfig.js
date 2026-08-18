// Source de vérité unique pour la configuration debug.
// Importé par PremiumService et IAPStore — ne jamais importer DebugScreen ici
// pour éviter les dépendances circulaires.

import Constants, { ExecutionEnvironment } from 'expo-constants';

export const DEBUG_CONFIG = {
  IAP_DISABLED: false, // true → aucun appel Apple/Google, achat simulé immédiatement
  FORCE_PREMIUM: false, // true → isPremium() retourne toujours true
};

// Expo Go (Test Store RevenueCat) ne génère des packages factices que pour
// les types standards (MONTHLY/ANNUAL) — jamais pour des produits
// consommables custom (loocateme_boost_pack_1, etc.). Les abonnements
// "marchent" en Test Store car matchés par packageType, mais un consommable
// ne trouvera jamais de package correspondant : ce n'est pas un bug de
// catalogue à corriger, juste une limitation du mode Browser d'Expo Go à
// contourner par une simulation locale (cf. ConsumablesShopSheet.js).
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export function setDebugFlag(key, value) {
  if (key in DEBUG_CONFIG) {
    DEBUG_CONFIG[key] = value;
  }
}
