import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyLocation, post } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { scheduleCheckinVerification, cancelCheckinVerification } from '../components/CheckinVerificationScheduler';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import { shouldSend, markSent, roundCoord } from '../utils/locationSendGuard';
import NetInfo from '@react-native-community/netinfo';
import { BluetoothProximityService } from './BluetoothProximityService';
import { getCachedNearbyVenues } from './NearbyVenueCache';
import { haversineMeters } from '../utils/geo';

// Injecté depuis App.js (LocationService est hors arbre React) : permet de
// répercuter un check-in automatique (dwell GPS ou BLE) sur UserContext,
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

// "Systématique" : tant qu'on est hors-réseau et sans réponse (ni résolution
// auto, ni réponse manuelle), on retente/re-sollicite l'utilisateur toutes
// les 3 min — plutôt que de le laisser sans lieu indéfiniment.
const OFFLINE_REPROMPT_MS = 3 * 60 * 1000;
// Une réponse (auto ou manuelle) n'est valable que tant qu'on ne s'est pas
// éloigné de plus de 50 m — au-delà, on considère qu'on a pu changer de lieu.
const OFFLINE_ANSWER_RESET_DISTANCE_M = 50;

let offlineAnswer = null; // { locationId: string|null, at: number, lat: number, lon: number }
let offlinePromptTimer = null;

// Une réponse déjà donnée (auto ou manuelle) reste valable indéfiniment tant
// qu'on ne s'éloigne pas — pas de re-demande sur simple écoulement du temps.
// Seule l'ABSENCE de réponse est retentée périodiquement (cf.
// offlinePromptTick), pour ne jamais reposer une question déjà répondue.
function isOfflineAnswerStillValid(lat, lon) {
  if (!offlineAnswer) return false;
  return haversineMeters(lat, lon, offlineAnswer.lat, offlineAnswer.lon) <= OFFLINE_ANSWER_RESET_DISTANCE_M;
}

function markOfflineAnswered(locationId, lat, lon) {
  offlineAnswer = { locationId, at: Date.now(), lat, lon };
}

async function confirmLocalVenue(locationId, candidates, lat, lon) {
  await BluetoothProximityService.setLocalConfirmedVenue(locationId);
  markOfflineAnswered(locationId, lat, lon);
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
    // Déjà répondu récemment (auto ou manuellement) sans avoir bougé depuis :
    // on ne re-sollicite pas l'utilisateur à chaque cycle. Ne s'applique que
    // si on a une position à comparer (voir cas "aucune position du tout"
    // ci-dessous, qui ne peut de toute façon pas savoir s'il a bougé).
    if (lat != null && lon != null && isOfflineAnswerStillValid(lat, lon)) return offlineAnswer.locationId;

    const cached = await getCachedNearbyVenues();
    if (!cached.length) {
      try {
        publish('ble:local-venue-unresolved', { candidates: [] });
      } catch (_) {}
      return null;
    }

    // Aucune position exploitable (GPS jamais fixé, ex : sous-sol avec wifi
    // mais sans réception satellite) : impossible de filtrer par distance.
    // On teste tous les lieux du cache comme candidats via BLE uniquement —
    // la portée physique du signal (quelques mètres) fait déjà le filtrage.
    if (lat == null || lon == null) {
      const candidateIds = cached.map((v) => v.id);
      const resolved = BluetoothProximityService.resolveVenueLocally(candidateIds);
      if (resolved) return await confirmLocalVenue(resolved, cached, null, null);
      try {
        publish('ble:local-venue-unresolved', { candidates: cached.map((c) => ({ id: c.id, name: c.name })) });
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
      return await confirmLocalVenue(nearest.id, candidates, lat, lon);
    }

    // Ambiguïté (plusieurs lieux trop proches) : on a besoin d'un pair déjà
    // confirmé sur l'un des candidats pour trancher.
    const candidateIds = candidates.map((v) => v.id);
    const resolved = BluetoothProximityService.resolveVenueLocally(candidateIds);
    if (resolved) return await confirmLocalVenue(resolved, candidates, lat, lon);

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

async function getLastKnownCoordsOnly() {
  try {
    const last = await Location.getLastKnownPositionAsync({});
    return last?.coords || null;
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
  const coords = await getLastKnownCoordsOnly();
  if (coords) markOfflineAnswered(locationId, coords.latitude, coords.longitude);
  try {
    publish('ble:local-venue-resolved', { locationId, name, manual: true });
  } catch (_) {}
}

// "Je ne suis dans aucun lieu" — répond explicitement à l'échelle de
// confirmation, aussi bien hors-réseau (bannière offline) qu'en ligne. Arrête
// la diffusion BLE d'un lieu et empêche la relance systématique de reproposer
// une question déjà répondue tant qu'on ne bouge pas.
export async function manuallyClearVenueOffline() {
  await BluetoothProximityService.setLocalConfirmedVenue(null);
  const coords = await getLastKnownCoordsOnly();
  if (coords) markOfflineAnswered(null, coords.latitude, coords.longitude);
  try {
    publish('ble:local-venue-resolved', { locationId: null, name: '', manual: true });
  } catch (_) {}
}

// Relance systématique : tant que le réseau est indisponible et que
// l'utilisateur n'a pas répondu (auto ou manuellement), on retente la
// résolution à intervalle régulier plutôt que de le laisser sans lieu et
// sans question. Démarré/arrêté par App.js en même temps que le Bluetooth
// (cf. privacyPreferences.bluetoothProximity).
async function offlinePromptTick() {
  try {
    const net = await NetInfo.fetch();
    if (net?.isConnected && net?.isInternetReachable) return; // réseau dispo : rien à faire ici
    if (!BluetoothProximityService.isActive()) return;
    const coords = await getLastKnownCoordsOnly();
    // Pas de coords du tout (GPS jamais fixé) : tryLocalOfflineResolution
    // gère ce cas en testant tous les candidats du cache via BLE seul.
    await tryLocalOfflineResolution(coords?.latitude ?? null, coords?.longitude ?? null);
  } catch (_) {
    // best-effort
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

// Aucun GPS exploitable, mais le Bluetooth est actif. Priorité au serveur
// s'il est joignable (résultat "officiel", visible par tout le monde
// immédiatement) ; sinon repli sur la résolution locale (cf.
// tryLocalOfflineResolution), qui gère déjà le cas "aucune position".
async function tryGpsLessCheckIn() {
  const net = await NetInfo.fetch();
  if (net?.isConnected && net?.isInternetReachable) {
    try {
      const { checkInViaBle } = await import('../components/ApiRequest');
      const res = await checkInViaBle();
      if (res?.resolved && res?.user) {
        try {
          publish('userlist:refresh');
        } catch (_) {}
        applyServerUser(res.user);
        const locationId = res.user.currentLocation;
        try {
          await BluetoothProximityService.setLocalConfirmedVenue(locationId ? String(locationId) : null);
        } catch (_) {}
        return true;
      }
      // Réseau dispo mais aucun pair BLE confirmé à proximité pour trancher :
      // pas d'erreur, juste rien à en tirer pour l'instant.
      return false;
    } catch (e) {
      console.warn('[LocationService] checkInViaBle failed', e?.message || e);
      // Tombe au repli local ci-dessous.
    }
  }
  const coords = await getLastKnownCoordsOnly();
  const resolved = await tryLocalOfflineResolution(coords?.latitude ?? null, coords?.longitude ?? null);
  return !!resolved;
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
    // le réseau peut malgré tout être disponible, donc pas la peine
    // d'abandonner. Si le Bluetooth est actif, on tente un check-in basé
    // uniquement sur les pairs déjà confirmés à proximité (serveur si en
    // ligne, sinon résolution locale via le cache).
    if (!BluetoothProximityService.isActive()) return false;
    return await tryGpsLessCheckIn();
  }

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;

  // Règle "5 min minimum" pour l'auto check-in (cf. AUTO_CHECKIN_DWELL_MS
  // ci-dessus) : on n'envoie le heartbeat qui déclenche l'assignation
  // automatique de currentPoiId côté backend que si l'utilisateur est estimé
  // (via le cache local des lieux proches) à proximité du même lieu depuis au
  // moins 5 minutes en continu. Tant que ce n'est pas le cas, on ne bloque
  // pas pour autant tout le reste (BLE, résolution offline, retour visuel
  // optimiste) : seule cette assignation "officielle" est retardée.
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

// À appeler à la déconnexion (auth:logout, cf. App.js) pour éviter que l'état
// de dwell/offline d'un compte ne fuite sur le compte suivant connecté sur le
// même appareil sans redémarrage de l'app.
function resetState() {
  autoDwellPoiId = null;
  autoDwellStartedAt = null;
  clearBgTimer();
  currentCheckInMode = 'auto';
  offlineAnswer = null;
  if (offlinePromptTimer) {
    try {
      clearInterval(offlinePromptTimer);
    } catch (_) {}
  }
  offlinePromptTimer = null;
}

export const LocationService = {
  // Reflète le user.checkInMode courant (cf. UserContext) pour piloter le
  // heartbeat GPS automatique. À appeler depuis les écrans qui connaissent le
  // user (LocationListScreen, LocationScreen) après hydratation/mise à jour.
  setCheckInMode,
  getCheckInMode: () => currentCheckInMode,
  resetState,
  setUserUpdater,

  // Démarre la relance systématique hors-réseau (cf. offlinePromptTick).
  startOfflinePrompter: () => {
    if (offlinePromptTimer) return;
    offlinePromptTick();
    offlinePromptTimer = setInterval(offlinePromptTick, OFFLINE_REPROMPT_MS);
  },
  stopOfflinePrompter: () => {
    if (offlinePromptTimer) clearInterval(offlinePromptTimer);
    offlinePromptTimer = null;
    offlineAnswer = null;
  },

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
