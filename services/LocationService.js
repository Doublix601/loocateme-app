import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyLocation, post } from '../components/ApiRequest';
import { publish } from '../components/EventBus';

// Location check-in orchestration with three explicit modes
export const ScanMode = Object.freeze({
  INITIAL_SCAN: 'INITIAL_SCAN',
  BACKGROUND_STAY: 'BACKGROUND_STAY',
  MANUAL_BYPASS: 'MANUAL_BYPASS',
});

const TWO_MIN_MS = 2 * 60 * 1000;
const K_COLD_START_DONE = 'lm_cold_start_done_v1';

let backgroundTimer = null;

function clearBgTimer() {
  if (backgroundTimer) {
    try { clearTimeout(backgroundTimer); } catch (_) {}
  }
  backgroundTimer = null;
}

async function getPermissionProfile() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    return {
      hasFg: fg?.status === 'granted',
      hasBg: bg?.status === 'granted',
    };
  } catch (e) {
    return { hasFg: false, hasBg: false };
  }
}

async function getBalancedPosition() {
  const { hasFg } = await getPermissionProfile();
  if (!hasFg) return null;
  try {
    // Try fast last known first
    const last = await Location.getLastKnownPositionAsync({});
    if (last?.coords) return last;
  } catch (_) {}
  try {
    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeout: 10000 });
  } catch (e) {
    try {
      return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest, timeout: 8000 });
    } catch (_) {
      return null;
    }
  }
}

async function immediateCheckIn() {
  const pos = await getBalancedPosition();
  if (!pos?.coords) return false;
  try {
    await updateMyLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    // Nudge UI proactively (also ApiRequest will emit api:mutation)
    try { publish('userlist:refresh'); } catch (_) {}
    return true;
  } catch (e) {
    console.warn('[LocationService] immediateCheckIn failed', e?.message || e);
    return false;
  }
}

export const LocationService = {
  // Utility to mark cold-start handled (used by App.js)
  markColdStartDone: async () => {
    try { await AsyncStorage.setItem(K_COLD_START_DONE, '1'); } catch (_) {}
  },
  hasColdStartRun: async () => {
    try { return (await AsyncStorage.getItem(K_COLD_START_DONE)) === '1'; } catch (_) { return false; }
  },

  cancelBackgroundStay: () => {
    clearBgTimer();
  },

  // Main entry point
  performCheckIn: async (mode = ScanMode.INITIAL_SCAN) => {
    const perms = await getPermissionProfile();

    if (mode === ScanMode.MANUAL_BYPASS) {
      // Always immediate
      return await immediateCheckIn();
    }

    if (mode === ScanMode.INITIAL_SCAN) {
      // Highest priority: bypass buffer on cold start regardless of permission level
      return await immediateCheckIn();
    }

    if (mode === ScanMode.BACKGROUND_STAY) {
      // Respect 2-minute buffer when allowed to run in background (Always)
      clearBgTimer();
      if (!perms.hasFg) return false;

      const schedule = () => {
        backgroundTimer = setTimeout(async () => {
          backgroundTimer = null;
          await immediateCheckIn();
        }, TWO_MIN_MS);
      };

      if (perms.hasBg) {
        // Start 2-minute dwell timer
        schedule();
        return true;
      } else {
        // While-In-Use only: when app is foregrounded, no background dwell — immediate at open
        return await immediateCheckIn();
      }
    }

    return false;
  },
};
