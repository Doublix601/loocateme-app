import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyLocation, post } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { scheduleCheckinVerification, cancelCheckinVerification } from '../components/CheckinVerificationScheduler';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import { shouldSend, markSent, roundCoord } from '../utils/locationSendGuard';
import { getCachedNearbyVenues } from './NearbyVenueCache';
import { haversineMeters } from '../utils/geo';

// Injecté depuis App.js (LocationService est hors arbre React) : permet de
// répercuter un check-in automatique (dwell GPS) sur UserContext,
// sans attendre le prochain heartbeat au premier plan (cf. usePresence.js)
// qui ne tourne pas quand l'app est en arrière-plan.
let userUpdater = null;
function setUserUpdater(fn) {
  userUpdater = typeof fn === 'function' ? fn : null;
}
function applyServerUser(backendUser) {
  if (!backendUser || !userUpdater) return;
  try {
    userUpdater(backendUser);
  } catch (_) {}
}

// Location check-in orchestration with three explicit modes
export const ScanMode = Object.freeze({
  INITIAL_SCAN: 'INITIAL_SCAN',
  BACKGROUND_STAY: 'BACKGROUND_STAY',
  MANUAL_BYPASS: 'MANUAL_BYPASS',
});

const TWO_MIN_MS = 2 * 60 * 1000;
const K_COLD_START_DONE = 'lm_cold_start_done_v1';

// Règle "5 minutes minimum" pour le check-in AUTOMATIQUE côté client : le
// backend (user.service.js updateLocation) assigne currentLocation dès le
// premier heartbeat qui matche un POI ("Entrée immédiate dans le POI matché
// (instant)") — le délai de 5 min qu'il applique (MIN_STAY_MS) ne gate que
// l'enregistrement d'un `location_visit` (stats/parrainage/Ultra Boost), pas
// l'assignation de currentPoiId elle-même. Pour que l'auto check-in n'ait
// visuellement lieu qu'après 5 minutes passées en continu à proximité d'un
// même lieu (et pas dès la première position captée au démarrage de l'app),
// on retient donc côté client l'envoi du heartbeat qui déclencherait cette
// assignation, tant que ce délai n'est pas écoulé. Seul le mode 'auto' est
// concerné (le mode 'manual' n'envoie déjà plus ce heartbeat du tout, cf.
// currentCheckInMode plus bas) ; le bouton explicite "Je suis là"
// (forceCheckIn) reste, lui, toujours instantané.
const AUTO_CHECKIN_DWELL_MS = 5 * 60 * 1000;
let autoDwellPoiId = null;
let autoDwellStartedAt = null;

// Retourne true si l'utilisateur est resté sans interruption à proximité du
// même lieu `poiId` depuis au moins AUTO_CHECKIN_DWELL_MS. Réinitialise (et
// redémarre) le compteur dès que le lieu candidat change ou disparaît.
function isAutoCheckinDwellSatisfied(poiId) {
  if (!poiId) {
    autoDwellPoiId = null;
    autoDwellStartedAt = null;
    return false;
  }
  if (autoDwellPoiId !== poiId) {
    autoDwellPoiId = poiId;
    autoDwellStartedAt = Date.now();
    return false;
  }
  return Date.now() - autoDwellStartedAt >= AUTO_CHECKIN_DWELL_MS;
}

let backgroundTimer = null;

// Mode de check-in courant ('auto' | 'manual'), reflété depuis user.checkInMode
// (cf. UserContext). En mode 'manual', on n'envoie plus la position en
// arrière-plan pour déclencher le check-in automatique côté backend — seul le
// bouton explicite "Je suis là" (forceCheckIn avec mode: 'manual') doit
// déclencher un check-in. On ne peut pas empêcher le backend de traiter un
// heartbeat GPS s'il en reçoit un (il reste distance-driven), donc le levier
// côté client est bien de ne plus émettre ce heartbeat automatique.
let currentCheckInMode = 'auto';

// Hydratation initiale depuis AsyncStorage (même clé que UserContext) pour que
// le check-in déclenché au lancement (App.js, ScanMode.INITIAL_SCAN) respecte
// déjà le mode manuel, sans attendre que LocationListScreen ait monté son
// useEffect qui appelle setCheckInMode.
let checkInModeHydrated = false;
const checkInModeHydration = AsyncStorage.getItem('user_checkInMode')
  .then((mode) => {
    if (!checkInModeHydrated) {
      currentCheckInMode = mode === 'manual' ? 'manual' : 'auto';
    }
  })
  .catch(() => {})
  .finally(() => {
    checkInModeHydrated = true;
  });

function setCheckInMode(mode) {
  checkInModeHydrated = true;
  currentCheckInMode = mode === 'manual' ? 'manual' : 'auto';
}

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

// Même marge que MIN_LEAD_M côté serveur (user.service.js) : évite un faux
// check-in local causé par l'imprécision GPS quand deux lieux voisins sont
// à moins de 12 m l'un de l'autre.
const LOCAL_MIN_LEAD_M = 12;

async function getLastKnownCoordsOnly() {
  try {
    const last = await Location.getLastKnownPositionAsync({});
    return last?.coords || null;
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

// Estimation locale immédiate du lieu probable, à partir du cache des lieux
// proches déjà vus par l'app (cf. NearbyVenueCache), sans aucun appel réseau.
// Sert uniquement à donner un retour visuel instantané à l'utilisateur
// ("vous êtes ici") pendant que le vrai check-in attend son TTL (throttle
// serveur, cf. `shouldSend` / dwell timer BACKGROUND_STAY ci-dessous) — la
// valeur affichée est ensuite reconciliée avec la vérité serveur au prochain
// heartbeat (cf. usePresence.js, qui appelle déjà `updateUser` avec la
// réponse du serveur, y compris pour corriger une estimation locale erronée).
// On ne devine que s'il y a un candidat clairement le plus proche (même règle
// de marge que la résolution offline, cf. LOCAL_MIN_LEAD_M) : en cas
// d'ambiguïté, on préfère ne rien afficher plutôt que d'afficher un mauvais lieu.
async function guessLikelyVenueLocally(lat, lon) {
  try {
    if (lat == null || lon == null) return null;
    const cached = await getCachedNearbyVenues();
    if (!cached.length) return null;

    const candidates = cached
      .map((v) => ({ ...v, dist: haversineMeters(lat, lon, v.lat, v.lon) }))
      .filter((v) => v.dist <= (v.radius || 50))
      .sort((a, b) => a.dist - b.dist);

    if (!candidates.length) return null;

    const nearest = candidates[0];
    const second = candidates[1];
    const hasMinLead = !second || second.dist - nearest.dist >= LOCAL_MIN_LEAD_M;
    return hasMinLead ? nearest.id : null;
  } catch (_) {
    return null;
  }
}

async function publishOptimisticCheckIn() {
  try {
    const pos = await getBalancedPosition();
    if (!pos?.coords) return;
    const locationId = await guessLikelyVenueLocally(pos.coords.latitude, pos.coords.longitude);
    if (locationId) {
      publish('presence:optimistic', { locationId });
    }
  } catch (_) {
    // best-effort : une estimation ratée ne doit jamais bloquer le vrai check-in
  }
}

async function immediateCheckIn(force = true) {
  if (isLocationHeartbeatSuppressed()) return false;
  // En mode manuel, on n'émet plus le heartbeat GPS qui déclenche le check-in
  // automatique côté backend — seul le bouton "Je suis là" (forceCheckIn avec
  // mode: 'manual') doit assigner currentPoiId. On garde ce garde-fou tôt,
  // avant même d'acquérir le GPS, pour éviter tout appel réseau inutile.
  if (!checkInModeHydrated) await checkInModeHydration;
  if (currentCheckInMode === 'manual') return false;
  const pos = await getBalancedPosition();
  if (!pos?.coords) {
    // Pas de GPS du tout (ex : sous-sol avec wifi, satellites bloqués) :
    // rien à faire, on abandonne ce cycle.
    return false;
  }

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // Règle "5 min minimum" pour l'auto check-in (cf. AUTO_CHECKIN_DWELL_MS
  // ci-dessus) : on n'envoie le heartbeat qui déclenche l'assignation
  // automatique de currentPoiId côté backend que si l'utilisateur est estimé
  // (via le cache local des lieux proches) à proximité du même lieu depuis au
  // moins 5 minutes en continu. Tant que ce n'est pas le cas, on ne bloque
  // pas pour autant le retour visuel optimiste : seule cette assignation
  // "officielle" est retardée.
  const guessedPoiId = await guessLikelyVenueLocally(lat, lon);
  if (!isAutoCheckinDwellSatisfied(guessedPoiId)) {
    return false;
  }

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
    applyServerUser(res?.user);
    // incrementCheckinCount() est désormais déclenché de façon centralisée
    // par UserContext.js sur toute transition currentPoiId null -> défini
    // (cf. son abonnement à api:mutation), qu'importe le flow de check-in —
    // plus besoin de le dupliquer ici.
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
    return true;
  } catch (e) {
    console.warn('[LocationService] immediateCheckIn failed', e?.message || e);
    return false;
  }
}

// À appeler à la déconnexion (auth:logout, cf. App.js) pour éviter que l'état
// de dwell d'un compte ne fuite sur le compte suivant connecté sur le même
// appareil sans redémarrage de l'app.
function resetState() {
  autoDwellPoiId = null;
  autoDwellStartedAt = null;
  clearBgTimer();
  currentCheckInMode = 'auto';
}

export const LocationService = {
  // Reflète le user.checkInMode courant (cf. UserContext) pour piloter le
  // heartbeat GPS automatique. À appeler depuis les écrans qui connaissent le
  // user (LocationListScreen, LocationScreen) après hydratation/mise à jour.
  setCheckInMode,
  getCheckInMode: () => currentCheckInMode,
  resetState,
  setUserUpdater,

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
      // Highest priority: bypass the 5-minute auto-checkin dwell buffer on
      // cold start regardless of permission level. Ne force PAS le guard
      // shouldSend/markSent (locationSendGuard) : un vrai cold start a de
      // toute façon lastCoords=null donc shouldSend laisse déjà passer le
      // premier envoi ; forcer inconditionnellement ne fait que dupliquer un
      // heartbeat que usePresence vient parfois d'envoyer pour la même
      // position (ex: reconnexion sans redémarrage de l'app).
      return await immediateCheckIn(false);
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
        // Retour visuel instantané pendant le buffer de 2 minutes : on tente
        // une estimation locale du lieu (sans appel serveur) pour que
        // l'utilisateur voie tout de suite "vous êtes ici" au lieu de croire
        // à un bug. La valeur réelle est confirmée/corrigée dès le prochain
        // heartbeat (cf. usePresence.js).
        publishOptimisticCheckIn();
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
