// Background location updates for up to 1 hour, every 15 minutes
// Requires expo-location and expo-task-manager
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { updateMyLocation, forceCheckOut } from './ApiRequest';
import { reportPermissionStatus } from '../services/EngagementTrackingService';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import { shouldSendPersisted, markSent, roundCoord } from '../utils/locationSendGuard';

const TASK_NAME = 'HEARTBEAT_TASK';
const STORAGE_START_KEY = 'bg_loc_start_ts';
const STORAGE_AUTO_INVISIBLE_KEY = 'bg_loc_auto_invisible';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let taskDefined = false;

async function autoStopAndMakeInvisible() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch {}
  try {
    await AsyncStorage.removeItem(STORAGE_START_KEY);
  } catch {}
  try {
    // `setVisibility` n'a jamais existé dans ApiRequest.js (import mort depuis
    // l'introduction de ce fichier) : cet appel levait silencieusement une
    // TypeError, avalée par ce catch, donc l'utilisateur n'était jamais
    // réellement check-out côté serveur une fois les 6h de tracking arrière-plan
    // écoulées — il restait visible dans son lieu jusqu'au filet de sécurité
    // du cron expireStalePresence (jusqu'à 20 min de plus). forceCheckOut()
    // est la route déjà utilisée par le bouton "Je ne suis plus ici" et
    // fonctionne bien en production (cf. LocationListScreen.js).
    await forceCheckOut();
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
      if (!startTs || now - startTs > SIX_HOURS_MS) {
        // Stop updates after 6 hours and set invisible until app reopen
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

      // Un check-out explicite récent (LocationScreen) suspend les heartbeats
      // automatiques pour éviter qu'ils ne re-matchent l'utilisateur sur le
      // lieu qu'il vient de quitter (cf. utils/devLocationSuppression.js).
      if (isLocationHeartbeatSuppressed()) return;

      // En mode manuel, seul le bouton explicite "Je suis là" doit assigner
      // currentPoiId — le backend check-in dès qu'il reçoit un heartbeat qui
      // matche un lieu par proximité GPS, donc le seul levier ici est de ne
      // pas l'envoyer. Cette tâche tourne hors arbre React (app en arrière-
      // plan/tuée) : pas d'accès à UserContext, d'où la lecture d'une copie
      // persistée (cf. UserContext.js#updateUser). Même garde-fou que
      // hooks/usePresence.js et LocationService.js#immediateCheckIn.
      try {
        const mode = await AsyncStorage.getItem('user_checkInMode');
        if (mode === 'manual') return;
      } catch (_) {}

      const roundedLat = roundCoord(lat);
      const roundedLon = roundCoord(lon);
      // Cette tâche tourne hors arbre React, potentiellement dans un contexte
      // JS séparé de usePresence/LocationService (app tuée, tâche headless) :
      // shouldSendPersisted relit l'état persisté en AsyncStorage avant de
      // décider, pour éviter un heartbeat dupliqué avec un envoi tout juste
      // fait par un autre chemin pour une position quasi identique.
      if (!(await shouldSendPersisted(roundedLat, roundedLon))) return;

      try {
        const { post } = await import('./ApiRequest');
        // La réponse n'est pas exploitée ici : ApiRequest.request() diffuse déjà
        // `res.user` sur l'event `api:mutation`, et UserContext.js s'y abonne
        // pour se resynchroniser automatiquement — y compris quand cette tâche
        // tourne hors arbre React pendant que l'app est en arrière-plan/tuée. Ne
        // pas réintroduire un chemin de sync parallèle ici.
        await post('/user/heartbeat', { lat: roundedLat, lon: roundedLon });
        markSent(roundedLat, roundedLon);
      } catch (e) {
        // Swallow errors; task will run again later
      }
    } catch (e) {
      // ignore
    }
  });
  taskDefined = true;
}

export async function startBackgroundLocationForSixHours() {
  try {
    defineTaskOnce();
    // Do not start twice
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (!started) {
      // Permissions
      const fg = await Location.requestForegroundPermissionsAsync();
      reportPermissionStatus({ locationPermissionStatus: fg.status === 'granted' ? 'granted' : 'denied' });
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
        timeInterval: FIVE_MINUTES_MS,
        // Minimal movement to reduce battery
        distanceInterval: 100,
        // Android foreground service notification while in background
        foregroundService: {
          notificationTitle: 'LoocateMe',
          notificationBody: i18n.t('backgroundLocation.notificationBody'),
          notificationColor: '#00c2cb',
        },
        pausesUpdatesAutomatically: true,
        showsBackgroundIndicator: false,
      });
    } else {
      // refresh the 6 hours window if currently running
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
  try {
    await AsyncStorage.removeItem(STORAGE_START_KEY);
  } catch {}
}

export const BGLocKeys = { STORAGE_AUTO_INVISIBLE_KEY };
