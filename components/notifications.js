// Helper cross-platform pour les notifications locales Expo
// Utilise exclusivement Notifications.scheduleNotificationAsync
// avec trigger: null pour l'affichage immédiat (compatible iOS, Expo managed)

import { Platform } from 'react-native';

export async function getNotificationsModule() {
  const mod = await import('expo-notifications');
  const Notifications = mod?.default ?? mod;
  return Notifications;
}

export async function ensureNotificationsSetup() {
  const Notifications = await getNotificationsModule();
  try {
    Notifications.setNotificationHandler?.({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (_) {}
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance?.HIGH || 4,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
      });
    } catch (_) {}
  }
  return Notifications;
}

export async function ensureNotificationPermissions(Notifications) {
  const api = Notifications || (await ensureNotificationsSetup());
  try {
    const perm = await api.getPermissionsAsync();
    let status = perm?.status;
    if (status !== 'granted') {
      const req = await api.requestPermissionsAsync();
      status = req?.status;
      return status === 'granted';
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Envoie une notification locale en utilisant scheduleNotificationAsync.
 * - Immédiat: trigger: null
 * - Différé: trigger: { seconds }
 */
export async function sendLocalNotification(content, { delaySeconds = 0 } = {}) {
  const Notifications = await ensureNotificationsSetup();
  const hasPerm = await ensureNotificationPermissions(Notifications);
  if (!hasPerm) {
    const err = new Error('Notifications non autorisées');
    err.code = 'E_NO_PERMISSION';
    throw err;
  }
  const delay = Number(delaySeconds) || 0;
  if (delay > 0) {
    return Notifications.scheduleNotificationAsync({
      content,
      trigger: { seconds: Math.max(1, delay) },
    });
  }
  // immédiat
  return Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}
