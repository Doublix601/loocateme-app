// Planifie une notification locale ~5 min après un check-in, pour demander à
// l'utilisateur de confirmer qu'il est bien dans le lieu détecté (le matching
// GPS auto peut se tromper entre deux POIs proches). Calqué sur le pattern de
// components/NotificationScheduler.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureNotificationsSetup, ensureNotificationPermissions } from './notifications';

const KEY_SCHEDULED_ID = 'notif:checkinVerifyScheduledId';
const FIVE_MIN = 5 * 60; // seconds

export async function cancelCheckinVerification() {
  try {
    const Notifications = await ensureNotificationsSetup();
    const id = await AsyncStorage.getItem(KEY_SCHEDULED_ID);
    if (id) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (_) {}
      await AsyncStorage.removeItem(KEY_SCHEDULED_ID);
    }
  } catch (_) {}
}

export async function scheduleCheckinVerification({ locationId, locationName }) {
  if (!locationId) return null;
  const Notifications = await ensureNotificationsSetup();
  const hasPerm = await ensureNotificationPermissions(Notifications);
  if (!hasPerm) return null;

  await cancelCheckinVerification();

  const delaySeconds = __DEV__ ? 15 : FIVE_MIN;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Es-tu bien ici ?',
      body: locationName ? `On t'a détecté à ${locationName}. C'est bien ça ?` : 'Confirme ton lieu actuel.',
      data: { kind: 'checkin_verify', locationId },
      sound: 'default',
    },
    trigger: {
      type: 'timeInterval',
      seconds: delaySeconds,
      repeats: false,
    },
  });
  await AsyncStorage.setItem(KEY_SCHEDULED_ID, String(id));
  return id;
}
