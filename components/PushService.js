// Service d’enregistrement de token push côté backend.
// Remarque: l’obtention du token FCM dépend de votre intégration (ex: @react-native-firebase/messaging).
// Ce module expose une fonction utilitaire pour transmettre le token au backend.

import { registerPushToken } from './ApiRequest';

/**
 * Envoie un token FCM (ou APNS via FCM) au backend LoocateMe.
 * @param {string} token - Le token push (FCM)
 * @param {('ios'|'android'|'web'|'unknown')} platform - Plateforme
 */
export async function sendTokenToBackend(token, platform = 'unknown') {
  if (!token) return { ok: false, reason: 'EMPTY' };
  try {
    await registerPushToken({ token, platform });
    return { ok: true };
  } catch (e) {
    console.warn('[PushService] register token failed', e?.message || e);
    return { ok: false, error: e };
  }
}

/**
 * Exemple d’intégration avec @react-native-firebase/messaging (à adapter si vous ajoutez la dépendance):
 *
 * import messaging from '@react-native-firebase/messaging';
 * import { Platform } from 'react-native';
 *
 * export async function registerFcmIfPossible() {
 *   try {
 *     const authStatus = await messaging().requestPermission();
 *     const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
 *     if (!enabled) return { ok: false, reason: 'PERMISSION_DENIED' };
 *     const token = await messaging().getToken();
 *     const platform = Platform.OS === 'ios' ? 'ios' : (Platform.OS === 'android' ? 'android' : 'unknown');
 *     return await sendTokenToBackend(token, platform);
 *   } catch (e) {
 *     return { ok: false, error: e };
 *   }
 * }
 */
