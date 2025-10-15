// Background location updates for up to 1 hour, every 15 minutes
// Requires expo-location and expo-task-manager
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyLocation, setVisibility } from './ApiRequest';

const TASK_NAME = 'BG_LOCATION_UPDATE';
const STORAGE_START_KEY = 'bg_loc_start_ts';
const STORAGE_AUTO_INVISIBLE_KEY = 'bg_loc_auto_invisible';
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
let taskDefined = false;

async function autoStopAndMakeInvisible() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch {}
  try { await AsyncStorage.removeItem(STORAGE_START_KEY); } catch {}
  try {
    await setVisibility(false);
    await AsyncStorage.setItem(STORAGE_AUTO_INVISIBLE_KEY, '1');
  } catch (e) {
    // ignore network errors; the server may not be reachable in background
  }
}

function defineTaskOnce() {
  if (taskDefined) return;
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.warn('[BG_LOCATION] Task error', error);
      return;
    }
    try {
      const startTsStr = await AsyncStorage.getItem(STORAGE_START_KEY);
      const startTs = startTsStr ? parseInt(startTsStr, 10) : 0;
      const now = Date.now();
      if (!startTs || now - startTs > ONE_HOUR_MS) {
        // Stop updates after 1 hour and set invisible until app reopen
        await autoStopAndMakeInvisible();
        return;
      }

      const { locations } = data || {};
      if (!locations || locations.length === 0) return;
      const last = locations[locations.length - 1];
      if (!last?.coords) return;

      const lat = last.coords.latitude;
      const lon = last.coords.longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;

      try {
        await updateMyLocation({ lat, lon });
      } catch (e) {
        // Swallow errors; task will run again later
      }
    } catch (e) {
      // ignore
    }
  });
  taskDefined = true;
}

export async function startBackgroundLocationForOneHour() {
  try {
    defineTaskOnce();
    // Do not start twice
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!started) {
      // Permissions
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') return false;
      // Background permissions (Android). On iOS, background must be enabled in app config.
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        // Try to start with foreground service anyway on Android
        // If not allowed, just skip
      }

      await AsyncStorage.setItem(STORAGE_START_KEY, String(Date.now()));

      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: FIFTEEN_MIN_MS,
        // Minimal movement to reduce battery
        distanceInterval: 50,
        // Android foreground service notification while in background
        foregroundService: {
          notificationTitle: 'LoocateMe',
          notificationBody: 'Partage de position actif (1h)',
          notificationColor: '#00c2cb',
        },
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: false,
      });
    } else {
      // refresh the hour window if currently running
      await AsyncStorage.setItem(STORAGE_START_KEY, String(Date.now()));
    }
    return true;
  } catch (e) {
    console.warn('[BG_LOCATION] Failed to start', e?.message || e);
    return false;
  }
}

export async function stopBackgroundLocation() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch {}
  try { await AsyncStorage.removeItem(STORAGE_START_KEY); } catch {}
}

export const BGLocKeys = { STORAGE_AUTO_INVISIBLE_KEY };
