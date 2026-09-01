import { Platform } from 'react-native';

// Nom du store affiché dans les mentions légales d'abonnement.
// Sur iOS, la guideline App Store 2.3.10 interdit toute référence à Google Play
// dans le binaire — on n'affiche donc QUE « App Store » côté iOS.
export const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

// Liens légaux — hébergés sur le site vitrine public loocate.me.
export const PRIVACY_POLICY_URL = "https://loocate.me/confidentialite";
export const TERMS_URL = "https://loocate.me/cgu";
// EULA standard Apple (Licensed Application End User License Agreement),
// requise par la guideline App Store 3.1.2(c) dans le flux d abonnement.
export const APPLE_EULA_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
