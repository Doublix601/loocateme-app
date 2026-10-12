// État d'initialisation de RevenueCat.
//
// Sur Android, Purchases.configure() appelle un @ReactMethod natif `void`
// (RNPurchasesModule.setupPurchases) sans try/catch : avec une clé API vide ou
// absente, l'exception native (require(apiKey.isNotBlank()) puis
// getSharedInstance() non initialisé) n'est PAS capturée par le try/catch JS et
// tue le process au démarrage (Google Play : « Broken Functionality — l'appli
// s'ouvre mais continue à planter », version code 16). On ne configure donc le
// SDK que si la clé est exploitable, et on garde un drapeau pour que les autres
// appels Purchases.* restent des no-op / erreurs JS propres quand il ne l'est pas.

let configured = false;

export function isValidRevenueCatKey(key) {
  return typeof key === 'string' && key.trim().length > 0;
}

export function setPurchasesConfigured(value) {
  configured = !!value;
}

export function isPurchasesConfigured() {
  return configured;
}
