import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { ensureNotificationsSetup, ensureNotificationPermissions } from './notifications';

const KEY_LAST_ACTIVE_AT = 'notif:lastActiveAt';
const KEY_SCHEDULED_ID = 'notif:inactivityScheduledId';
const SIX_HOURS = 6 * 60 * 60; // seconds

export async function cancelInactivityReminder() {
  try {
    const mod = await import('expo-notifications');
    const Notifications = mod?.default ?? mod;
    const id = await AsyncStorage.getItem(KEY_SCHEDULED_ID);
    if (id) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch (_) {}
      await AsyncStorage.removeItem(KEY_SCHEDULED_ID);
    }
  } catch (_) {}
}

export async function scheduleInactivityReminder({ delaySeconds = SIX_HOURS } = {}) {
  // Ensure permissions and module
  const Notifications = await ensureNotificationsSetup();
  const hasPerm = await ensureNotificationPermissions(Notifications);
  if (!hasPerm) return null;
  // Cancel previous if any
  await cancelInactivityReminder();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'LoocateMe',
      body: 'Reconnecte-toi pour rester visible !',
      data: { reason: 'inactivity_reminder', url: 'loocateme://nearby' },
      sound: 'default',
    },
    trigger: {
      type: 'timeInterval',
      seconds: Math.max(1, Number(delaySeconds) || SIX_HOURS),
      repeats: false
    },
  });
  await AsyncStorage.setItem(KEY_SCHEDULED_ID, String(id));
  return id;
}

export async function touchUserActivity() {
  try { await AsyncStorage.setItem(KEY_LAST_ACTIVE_AT, String(Date.now())); } catch (_) {}
}

export function initInactivityTracking({ devShortDelaySeconds } = {}) {
  // On app start, mark activity and schedule on background transitions
  touchUserActivity();

  let sub;
  try {
    sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        // Cancel any pending reminder and mark activity
        await cancelInactivityReminder();
        await touchUserActivity();
      } else if (state === 'background' || state === 'inactive') {
        // Schedule reminder in 6h (or 5s in dev)
        const delay = __DEV__ ? 5 : SIX_HOURS;
        await scheduleInactivityReminder({ delaySeconds: delay });
      }
    });
  } catch (_) {}

  return () => { try { sub && sub.remove && sub.remove(); } catch (_) {} };
}
