// Service d’enregistrement de token push côté backend.
// Remarque: l’obtention du token FCM dépend de votre intégration (ex: @react-native-firebase/messaging).
// Ce module expose une fonction utilitaire pour transmettre le token au backend.

import { registerPushToken, unregisterPushToken } from './ApiRequest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ensureNotificationsSetup, ensureNotificationPermissions } from './notifications';

const PUSH_TOKEN_KEY = 'loocateme_push_token';

/**
 * Envoie un token FCM (ou APNS via FCM) au backend LoocateMe.
 * @param {string} token - Le token push (FCM)
 * @param {('ios'|'android'|'web'|'unknown')} platform - Plateforme
 */
export async function sendTokenToBackend(token, platform = 'unknown') {
  if (!token) return { ok: false, reason: 'EMPTY' };
  try {
    await registerPushToken({ token, platform });
    try { await AsyncStorage.setItem(PUSH_TOKEN_KEY, String(token)); } catch (_) {}
    return { ok: true };
  } catch (e) {
    console.warn('[PushService] register token failed', e?.message || e);
    return { ok: false, error: e };
  }
}

export async function registerCurrentDevicePushToken() {
  try {
    const Notifications = await ensureNotificationsSetup();
    const hasPerm = await ensureNotificationPermissions(Notifications);
    if (!hasPerm) return { ok: false, reason: 'PERMISSION_DENIED' };
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = res?.data || res?.token || String(res);
    const platform = Platform.OS === 'ios' ? 'ios' : (Platform.OS === 'android' ? 'android' : 'unknown');
    return await sendTokenToBackend(token, platform);
  } catch (e) {
    console.warn('[PushService] registerCurrentDevicePushToken failed', e?.message || e);
    return { ok: false, error: e };
  }
}

export async function unregisterCurrentDevicePushToken() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return { ok: false, reason: 'EMPTY' };
    await unregisterPushToken({ token });
    try { await AsyncStorage.removeItem(PUSH_TOKEN_KEY); } catch (_) {}
    return { ok: true };
  } catch (e) {
    console.warn('[PushService] unregister token failed', e?.message || e);
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
