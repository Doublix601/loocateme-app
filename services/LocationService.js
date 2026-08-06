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

// Même marge que MIN_LEAD_M côté serveur (user.service.js) : évite un faux
// check-in local causé par l'imprécision GPS quand deux lieux voisins sont
// à moins de 12 m l'un de l'autre.
const LOCAL_MIN_LEAD_M = 12;

async function confirmLocalVenue(locationId, candidates) {
  await BluetoothProximityService.setLocalConfirmedVenue(locationId);
  try {
    const match = candidates?.find((c) => c.id === locationId);
    publish('ble:local-venue-resolved', { locationId, name: match?.name || '' });
  } catch (_) {}
  return locationId;
}

// Dernier recours quand le réseau est indisponible (et peut ne jamais
// revenir) : au lieu d'abandonner le check-in, on tente une résolution
// purement locale à partir de la dernière position GPS connue et du cache
// des lieux proches (cf. NearbyVenueCache) — sans aucun appel serveur.
//
// S'il n'y a qu'un seul lieu candidat à proximité (cas courant : "le seul
// lieu autour de moi est celui dans lequel je viens d'entrer"), il n'y a pas
// besoin d'un autre utilisateur BLE pour confirmer, exactement comme le
// ferait le serveur. Le pairing BLE (resolveVenueLocally) n'intervient qu'en
// cas d'ambiguïté (plusieurs lieux proches), pour départager comme le fait
// resolveAmbiguousVenueViaBle côté serveur.
//
// Dans tous les cas où on ne peut pas confirmer automatiquement (aucun lieu
// à portée, ambiguïté non résolue), on publie quand même la liste des
// candidats pour que l'utilisateur puisse choisir lui-même (cf.
// components/OfflineVenueBanner.js) — on ne le laisse jamais sans recours.
async function tryLocalOfflineResolution(lat, lon) {
  try {
    const cached = await getCachedNearbyVenues();
    if (!cached.length) {
      try {
        publish('ble:local-venue-unresolved', { candidates: [] });
      } catch (_) {}
      return null;
    }

    const candidates = cached
      .map((v) => ({ ...v, dist: haversineMeters(lat, lon, v.lat, v.lon) }))
      .filter((v) => v.dist <= (v.radius || 50))
      .sort((a, b) => a.dist - b.dist);

    if (!candidates.length) {
      try {
        publish('ble:local-venue-unresolved', { candidates: [] });
      } catch (_) {}
      return null;
    }

    const nearest = candidates[0];
    const second = candidates[1];
    const hasMinLead = !second || second.dist - nearest.dist >= LOCAL_MIN_LEAD_M;
    if (hasMinLead) {
      // Un seul lieu plausible (ou nettement le plus proche) : pas besoin de
      // confirmation par un pair, comme le ferait le serveur.
      return await confirmLocalVenue(nearest.id, candidates);
    }

    // Ambiguïté (plusieurs lieux trop proches) : on a besoin d'un pair déjà
    // confirmé sur l'un des candidats pour trancher.
    const candidateIds = candidates.map((v) => v.id);
    const resolved = BluetoothProximityService.resolveVenueLocally(candidateIds);
    if (resolved) return await confirmLocalVenue(resolved, candidates);

    try {
      publish('ble:local-venue-unresolved', {
        candidates: candidates.map((c) => ({ id: c.id, name: c.name, dist: Math.round(c.dist) })),
      });
    } catch (_) {}
    return null;
  } catch (_) {
    return null;
  }
}

// Sélection manuelle par l'utilisateur (bannière offline) quand la
// résolution automatique n'a pas pu trancher, ou pour corriger un lieu mal
// détecté. Fonctionne sans réseau : uniquement local (diffusion BLE) tant
// que la connexion n'est pas revenue.
export async function manuallyConfirmVenueOffline(locationId, name = '') {
  await BluetoothProximityService.setLocalConfirmedVenue(locationId);
  try {
    publish('ble:local-venue-resolved', { locationId, name, manual: true });
  } catch (_) {}
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
