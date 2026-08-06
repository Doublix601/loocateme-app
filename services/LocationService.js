import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyLocation, post } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { incrementCheckinCount } from '../hooks/useProgressiveUnlock';
import { scheduleCheckinVerification, cancelCheckinVerification } from '../components/CheckinVerificationScheduler';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import { shouldSend, markSent, roundCoord } from '../utils/locationSendGuard';
import { BluetoothProximityService } from './BluetoothProximityService';
import { getCachedNearbyVenues } from './NearbyVenueCache';

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
    try {
      clearTimeout(backgroundTimer);
    } catch (_) {}
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Dernier recours quand le réseau est indisponible (et peut ne jamais
// revenir) : au lieu d'abandonner le check-in, on tente une résolution
// purement locale, en confrontant les lieux GPS-candidats proches (cache
// local, cf. NearbyVenueCache) aux détections BLE d'autres utilisateurs déjà
// confirmés sur place — sans aucun appel serveur. Optimiste et best-effort :
// la vérité "officielle" sera de toute façon recalculée côté serveur dès que
// le réseau (et donc le heartbeat GPS normal) reviendra.
async function tryLocalOfflineResolution(lat, lon) {
  try {
    const cached = await getCachedNearbyVenues();
    if (!cached.length) return null;
    const candidateIds = cached
      .filter((v) => haversineMeters(lat, lon, v.lat, v.lon) <= (v.radius || 50))
      .map((v) => v.id);
    if (!candidateIds.length) return null;
    const resolved = BluetoothProximityService.resolveVenueLocally(candidateIds);
    if (resolved) {
      await BluetoothProximityService.setLocalConfirmedVenue(resolved);
      try {
        publish('ble:local-venue-resolved', { locationId: resolved });
      } catch (_) {}
    }
    return resolved;
  } catch (_) {
    return null;
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

async function immediateCheckIn(force = true) {
  if (isLocationHeartbeatSuppressed()) return false;
  const pos = await getBalancedPosition();
  if (!pos?.coords) return false;

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  if (!shouldSend(lat, lon, { force })) {
    // Un heartbeat (usePresence) vient déjà d'envoyer une position quasi
    // identique — on évite un doublon réseau pour le même déplacement.
    return false;
  }

  const roundedLat = roundCoord(lat);
  const roundedLon = roundCoord(lon);

  try {
    const res = await updateMyLocation({ lat: roundedLat, lon: roundedLon });
    markSent(roundedLat, roundedLon);
    // Nudge UI proactively (also ApiRequest will emit api:mutation)
    try {
      publish('userlist:refresh');
    } catch (_) {}
    try {
      await incrementCheckinCount();
    } catch (_) {}
    const locationId = res?.user?.currentLocation;
    try {
      if (locationId) {
        await scheduleCheckinVerification({
          locationId: String(locationId),
          lat,
          lon,
        });
      } else {
        await cancelCheckinVerification();
      }
    } catch (_) {}
    // Tient l'annonce BLE à jour avec le lieu réellement confirmé côté
    // serveur, pour que les pairs à proximité puissent s'y recaler localement.
    try {
      await BluetoothProximityService.setLocalConfirmedVenue(locationId ? String(locationId) : null);
    } catch (_) {}
    return true;
  } catch (e) {
    console.warn('[LocationService] immediateCheckIn failed', e?.message || e);
    // Réseau indisponible (et peut-être durablement) : on tente une
    // résolution 100% locale via BLE avant d'abandonner ce cycle.
    if (BluetoothProximityService.isActive()) {
      const resolved = await tryLocalOfflineResolution(lat, lon);
      if (resolved) return true;
    }
    return false;
  }
}

export const LocationService = {
  // Utility to mark cold-start handled (used by App.js)
  markColdStartDone: async () => {
    try {
      await AsyncStorage.setItem(K_COLD_START_DONE, '1');
    } catch (_) {}
  },
  hasColdStartRun: async () => {
    try {
      return (await AsyncStorage.getItem(K_COLD_START_DONE)) === '1';
    } catch (_) {
      return false;
    }
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
          await immediateCheckIn(false);
        }, TWO_MIN_MS);
      };

      if (perms.hasBg) {
        // Start 2-minute dwell timer
        schedule();
        return true;
      } else {
        // While-In-Use only: when app is foregrounded, no background dwell —
        // immediate at open, mais dédupliqué si usePresence vient déjà d'envoyer
        // une position quasi identique au même retour en foreground.
        return await immediateCheckIn(false);
      }
    }

    return false;
  },
};
