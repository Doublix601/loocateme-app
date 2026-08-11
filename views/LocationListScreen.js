import React, { useEffect, useState, useContext, useMemo, useRef, useCallback } from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Dimensions,
  Platform,
  InteractionManager,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { getCurrentPositionSmart } from '../utils/locationHelper';
import {
  getLocations,
  updateMyLocation,
  seedOsmLocation,
  getUsersAroundMe,
  forceCheckIn,
  getMyReferralInfo,
  apiUpdateCheckInMode,
  apiUpdateInvisibleMode,
} from '../components/ApiRequest';
import { LocationService } from '../services/LocationService';
import Toast from '../components/Toast';
import { isLocationHeartbeatSuppressed } from '../utils/devLocationSuppression';
import NearbyLocationPicker from '../components/NearbyLocationPicker';
import { markCheckinVerified } from '../components/CheckinVerificationScheduler';
import { subscribe, publish } from '../components/EventBus';
import PremiumNudgeService from '../services/PremiumNudgeService';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { useBoost } from '../hooks/useBoost';
import { formatLocationType } from '../components/LocationUtils';
import { calculateDistance, formatDistance } from '../components/ServerUtils';
import { UserContext } from '../components/contexts/UserContext';
import { mapBackendUser } from '../utils/mappers';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import { useMainSwiper } from '../components/contexts/MainSwiperContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AnimatedGradientBorder from '../components/AnimatedGradientBorder';
import { OverpassService, isTypeAllowedForVibe } from '../services/OverpassService';
import VibeFAB from '../components/VibeFAB';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationMapView from '../components/LocationMapView';
import ClusterPickerModal from '../components/ClusterPickerModal';

// Mémorise le dernier mode consulté (liste/carte) entre les sessions, même
// pattern que loocateme_theme_mode dans ThemeContext.
const VIEW_MODE_KEY = 'loocateme_view_mode';

// Score de secours pour interclasser les POI OSM (sans stars/userCount
// serveur) avec les lieux backend déjà triés par score composite. Constantes
// dupliquées depuis loocateme_backend/src/config/locationScoring.js — à
// garder synchronisées si les poids sont retunés côté serveur.
const DISTANCE_REF_METERS = 800;
const USERCOUNT_CAP = 8;
const WEIGHT_DISTANCE = 0.45;
const WEIGHT_STARS = 0.35;
const WEIGHT_USERS = 0.2;

// Fusionne des listes de lieux en dédupliquant par osmId (priorité) sinon
// _id — partagé entre le merge backend/Overpass "autour de moi" et
// l'accumulateur "lieux explorés en panant la carte" (cf. handleMapViewportChange).
function mergeByOsmId(...lists) {
  const map = new Map();
  const list = [];
  for (const it of lists.flat()) {
    const key = it?.osmId ? `osm:${it.osmId}` : it?._id;
    if (!key || map.has(key)) continue;
    map.set(key, it);
    list.push(it);
  }
  return list;
}

// Patch optimiste de `activeUsers`/`userCount` sur les cartes de la liste :
// `fetchNearbyLocations` retape le cache Redis 60s de `getLocations` côté
// backend, donc un refetch immédiat après check-in/check-out peut renvoyer
// des `userCount`/`activeUsers` encore périmés — l'ancien lieu continue
// d'afficher l'utilisateur dans sa pile d'avatars pendant jusqu'à 60s. Gère
// les deux sens (contrairement à l'ancien patch, appliqué uniquement au
// check-in manuel) : `nextPoiId` null = check-out (retire seulement),
// `nextPoiId` défini = check-in (retire de l'ancien lieu si différent,
// ajoute au nouveau).
function applyOptimisticLocationPatch(locations, { myRawId, previousPoiId, nextPoiId, meEntry }) {
  if (!myRawId) return locations;
  let changed = false;
  const next = locations.map((loc) => {
    const locId = String(loc._id);
    if (previousPoiId && locId === String(previousPoiId) && locId !== String(nextPoiId || '')) {
      const nextActiveUsers = (loc.activeUsers || []).filter((u) => String(u._id) !== myRawId);
      if (nextActiveUsers.length === (loc.activeUsers || []).length) return loc;
      changed = true;
      return { ...loc, activeUsers: nextActiveUsers, userCount: Math.max(0, (loc.userCount || 0) - 1) };
    }
    if (nextPoiId && locId === String(nextPoiId)) {
      const already = (loc.activeUsers || []).some((u) => String(u._id) === myRawId);
      if (already) return loc;
      changed = true;
      return { ...loc, activeUsers: [meEntry, ...(loc.activeUsers || [])], userCount: (loc.userCount || 0) + 1 };
    }
    return loc;
  });
  return changed ? next : locations;
}

const LocationListScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { isMoon, vibe, transitioningTo } = useVibe();
  const { lockSwiper, unlockSwiper } = useMainSwiper();
  // Réf toujours à jour sur la vibe courante, à utiliser dans les callbacks/
  // effets à dépendances figées (ex: l'abonnement 'api:mutation' ci-dessous,
  // monté une seule fois au mount) qui ne peuvent pas dépendre de `vibe` sans
  // se ré-abonner à chaque bascule jour/nuit.
  const vibeRef = useRef(vibe);
  useEffect(() => {
    vibeRef.current = vibe;
  }, [vibe]);
  const insets = useSafeAreaInsets();
  const skyFillStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -insets.top,
    bottom: -insets.bottom,
  };
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [locations, setLocations] = useState([]); // backend locations
  const [osmPois, setOsmPois] = useState([]); // overpass locations
  const [filteredOsmPois, setFilteredOsmPois] = useState([]); // vibe-filtered OSM
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  // Pagination des lieux backend : minimum 20, on charge +10 quand l'utilisateur
  // atteint le bas de la liste, jusqu'à un plafond de 50 (cf. backend `limit`).
  const MIN_LOCATIONS = 40;
  const MAX_LOCATIONS = 80;
  const LOCATIONS_STEP = 20;
  const [displayLimit, setDisplayLimit] = useState(MIN_LOCATIONS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // `hasMore` indique si le backend peut encore renvoyer des lieux supplémentaires.
  // Dès qu'une requête retourne moins de `limit` résultats, on sait qu'on a vidé
  // la zone et il est inutile de continuer à incrémenter `displayLimit`.
  // Cela évite l'affichage prématuré du message « Vous avez exploré tous les
  // lieux actifs à proximité » lorsque la DB locale est peu peuplée.
  const [hasMore, setHasMore] = useState(true);
  const { user: currentUser, updateUser } = useContext(UserContext);
  // Réf toujours à jour sur le lieu checké courant, pour connaître l'ANCIEN
  // lieu au moment où l'abonnement 'api:mutation' ci-dessous (monté une
  // seule fois, deps []) reçoit un check-in/check-out confirmé par le
  // serveur — cf. applyOptimisticLocationPatch.
  const previousPoiIdRef = useRef(currentUser?.currentPoiId || null);
  useEffect(() => {
    previousPoiIdRef.current = currentUser?.currentPoiId || null;
  }, [currentUser?.currentPoiId]);
  const checkInMode = currentUser?.checkInMode === 'manual' ? 'manual' : 'auto';
  const [togglingCheckInMode, setTogglingCheckInMode] = useState(false);
  const [checkingInLocationId, setCheckingInLocationId] = useState(null);
  // Compteur "latest wins" (même pattern que fetchRequestIdRef) : si l'utilisateur
  // tape sur "je suis là" pour un 2e lieu avant que la 1re requête ait fini, on ne
  // veut appliquer que la réponse du DERNIER tap, quel que soit l'ordre de résolution.
  const checkInRequestIdRef = useRef(0);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const showToast = useCallback((message) => {
    setToastMessage(message);
    setToastVisible(true);
  }, []);
  // Le service côté client (heartbeat GPS déclenchant le check-in auto backend)
  // doit toujours refléter le mode courant de l'utilisateur — cf. LocationService.
  useEffect(() => {
    LocationService.setCheckInMode(checkInMode);
  }, [checkInMode]);
  // Etat "mode invisible actif" renvoyé par le backend sur /api/locations (403
  // INVISIBLE_MODE_ACTIVE) : bloque l'affichage de la liste/carte tant qu'il
  // n'est pas désactivé par l'utilisateur.
  const [invisibleModeBlocking, setInvisibleModeBlocking] = useState(false);
  const [disablingInvisibleMode, setDisablingInvisibleMode] = useState(false);

  const handleToggleCheckInMode = useCallback(async () => {
    if (togglingCheckInMode) return;
    const nextMode = checkInMode === 'auto' ? 'manual' : 'auto';
    setTogglingCheckInMode(true);
    try {
      await apiUpdateCheckInMode(nextMode);
      LocationService.setCheckInMode(nextMode);
      updateUser?.({ ...currentUser, checkInMode: nextMode });
      showToast(nextMode === 'manual' ? 'Check-in manuel activé' : 'Check-in automatique activé');
    } catch (e) {
      console.warn('[LocationListScreen] apiUpdateCheckInMode failed', e?.message || e);
      Alert.alert('Erreur', "Impossible de changer le mode de check-in pour l'instant.");
    } finally {
      setTogglingCheckInMode(false);
    }
  }, [togglingCheckInMode, checkInMode, currentUser, updateUser, showToast]);

  const handleManualCheckIn = useCallback(
    async (item) => {
      const c = userCoordsRef.current;
      if (!c || checkingInLocationId) return;
      // Capturé avant l'appel réseau : si un 2e tap (autre lieu) démarre une
      // requête plus récente pendant que celle-ci est encore en vol, on doit
      // ignorer la réponse de celle-ci quel que soit l'ordre de résolution
      // (sinon le 1er lieu tapé peut "gagner" si sa requête répond en dernier).
      const myRequestId = ++checkInRequestIdRef.current;
      const previousPoiId = currentUser?.currentPoiId || null;
      setCheckingInLocationId(item._id);
      try {
        const res = await forceCheckIn({ locationId: item._id, lat: c.latitude, lon: c.longitude, mode: 'manual' });
        if (myRequestId !== checkInRequestIdRef.current) {
          // Une requête plus récente a été lancée entre-temps : on abandonne
          // silencieusement cette réponse obsolète sans toucher au state.
          return;
        }
        // Mise à jour immédiate (optimiste depuis la réponse serveur) du
        // UserContext global : sans ça, currentUser.currentPoiId ne bouge
        // qu'après le fetchNearbyLocations ci-dessous (silencieux, donc pas
        // instantané visuellement) et l'utilisateur ne se voit pas "checké"
        // tout de suite après avoir appuyé sur "Je suis là".
        if (res?.user) updateUser(mapBackendUser(res.user));

        // Patch optimiste de la carte lieu (cf. applyOptimisticLocationPatch) :
        // `fetchNearbyLocations` ci-dessous retape le cache Redis 60s de
        // `getLocations` côté backend, donc un refetch immédiat après check-in
        // peut renvoyer des `userCount`/`activeUsers` encore périmés.
        const myRawId = res?.user?._id ? String(res.user._id) : null;
        if (myRawId) {
          const meEntry = {
            _id: myRawId,
            profileImageUrl: res.user.profileImageUrl || null,
            boostUntil: res.user.boostUntil || null,
            status: res.user.status || 'green',
            location: { updatedAt: new Date().toISOString() },
          };
          setLocations((prev) =>
            applyOptimisticLocationPatch(prev, {
              myRawId,
              previousPoiId,
              nextPoiId: String(item._id),
              meEntry,
            }),
          );
        }

        showToast(`Tu es maintenant à ${item.name} !`);
        // reuseCoords: `c` (la position qui vient de servir au check-in) pour éviter
        // qu'un nouveau fix GPS ne retarde l'affichage du userCount à jour (cf.
        // commentaire détaillé dans fetchNearbyLocations).
        fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, vibe, reuseCoords: c });
      } catch (e) {
        console.warn('[LocationListScreen] manual forceCheckIn failed', e?.message || e);
        // RATE_LIMITED est déjà affiché par la modale globale (cf. App.js,
        // événement 'location_rate_limited' publié depuis ApiRequest.js) : ne
        // pas doubler avec cette Alert générique.
        if (e?.code !== 'RATE_LIMITED') {
          Alert.alert('Erreur', e?.message || "Impossible de confirmer ta présence pour l'instant.");
        }
      } finally {
        // Ne réinitialise l'indicateur "en vol" que si aucune requête plus
        // récente n'a pris le relais entre-temps, pour ne pas ré-activer les
        // boutons alors qu'un autre check-in est toujours en cours.
        if (myRequestId === checkInRequestIdRef.current) setCheckingInLocationId(null);
      }
    },
    // currentUser (objet entier, ré-instancié à chaque heartbeat GPS/mise à
    // jour du UserContext) ne doit PAS être une dépendance ici : ce callback
    // ne lit que currentPoiId (previousPoiId ci-dessus). Dépendre de l'objet
    // entier recréait cette fonction à chaque heartbeat, ce qui recréait
    // LocationItem (cf. son useMemo plus bas) et remontait toute la liste —
    // d'où le "reload" visible des photos des cartes toutes les quelques
    // secondes alors que rien n'avait réellement changé.
    [checkingInLocationId, showToast, vibe, updateUser, currentUser?.currentPoiId],
  );
  const { isPremium, premiumSystemEnabled } = usePremiumAccess();
  const { isBoosted } = useBoost();
  const flatListRef = useRef(null);
  const currentScrollOffset = useRef(0);
  const userCoordsRef = useRef(userCoords);
  useEffect(() => {
    userCoordsRef.current = userCoords;
  }, [userCoords]);
  const [placePicker, setPlacePicker] = useState(null); // { lat, lon } | null
  const [clusterPickerItems, setClusterPickerItems] = useState(null); // Location[] | null
  const handleClusterOpen = useCallback((items) => setClusterPickerItems(items), []);
  const [correctingCheckin, setCorrectingCheckin] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  // Une fois affichée, la carte reste montée (cachée via style) pour éviter de
  // recharger la WebView/MapLibre à chaque bascule liste ↔ carte.
  const [hasShownMap, setHasShownMap] = useState(false);
  useEffect(() => {
    if (viewMode === 'map') setHasShownMap(true);
  }, [viewMode]);

  // Chargement dynamique de la carte quand on la pan loin de sa position
  // réelle (cf. plan "carte scalable, pas de nouvel appel massif à chaque
  // pan"). Accumulateur de lieux "explorés" + garde-fous côté client :
  // - MAP_REGION_FETCH_MIN_DISTANCE_M : pas de refetch pour un petit pan.
  // - fetchedRegionKeysRef : pas de refetch d'une région déjà visitée.
  // - MAP_EXPLORED_CAP : plafond FIFO pour borner la mémoire sur une longue session.
  // S'ajoute (sans les remplacer) aux protections déjà en place côté serveur :
  // cache Redis 60s + singleflight + rate-limit 30/min (getLocations), et le
  // throttle global 30s d'OverpassService.
  const [mapExploredLocations, setMapExploredLocations] = useState([]);
  const fetchedRegionKeysRef = useRef(new Set());
  const lastFetchCoordsRef = useRef(null);
  const mapFetchDebounceRef = useRef(null);
  // 600m (au lieu de 300m) : chaque appel tire 2 requêtes (sun+moon), donc
  // doubler la distance mini divise par ~4 le nombre de régions déclenchées
  // sur une même zone explorée, sans que l'utilisateur le perçoive (les
  // marqueurs/clusters déjà accumulés restent affichés entre deux fetches).
  const MAP_REGION_FETCH_MIN_DISTANCE_M = 600;
  const MAP_EXPLORED_CAP = 300;
  const MAP_REGION_KEY_PRECISION = 3; // aligné sur l'arrondi du cache backend (toFixed(3))
  const MAP_FETCH_DEBOUNCE_MS = 500;

  // Dernier centre de viewport connu, mis à jour à CHAQUE événement de la
  // WebView (indépendamment du debounce/dedup de fetch ci-dessous) : sert de
  // référence pour re-fetcher immédiatement au bon endroit lors d'un
  // changement de vibe, même si l'utilisateur a pané loin de sa position réelle.
  const lastMapCenterRef = useRef(null);

  // Fetch effectif des lieux backend pour un centre donné, sans passer par le
  // debounce/dedup de handleMapViewportChange (utilisé pour un refresh
  // explicite : changement de vibe ou bouton refresh manuel de la carte).
  const fetchMapRegion = useCallback(
    async (lat, lon, forVibe) => {
      try {
        const res = await getLocations({ lat, lon, vibe: forVibe, limit: MIN_LOCATIONS });
        const backendLocationsForRegion = res?.locations || [];
        setMapExploredLocations((prev) => {
          const combined = mergeByOsmId(backendLocationsForRegion, prev);
          return combined.length > MAP_EXPLORED_CAP
            ? combined.slice(0, MAP_EXPLORED_CAP)
            : combined;
        });
      } catch (e) {
        console.warn('[LocationListScreen] map region fetch failed:', e?.message || e);
      }
    },
    [],
  );

  const handleMapViewportChange = useCallback(
    ({ center }) => {
      if (viewMode !== 'map') return; // défense en profondeur (la WebView n'existe pas hors mode carte)
      if (!Array.isArray(center) || center.length < 2) return;
      const [lon, lat] = center;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;

      lastMapCenterRef.current = { lat, lon };

      const last = lastFetchCoordsRef.current;
      if (last) {
        const moved = calculateDistance(last.lat, last.lon, lat, lon);
        if (moved < MAP_REGION_FETCH_MIN_DISTANCE_M) return;
      }

      // Anti-rafale : un pan continu peut franchir plusieurs seuils de
      // distance en quelques centaines de ms (plusieurs événements webview
      // avant que l'utilisateur ne s'arrête réellement). On ne garde que le
      // dernier viewport reçu dans la fenêtre de debounce, évitant de tirer
      // une paire de requêtes par franchissement plutôt qu'une seule pour la
      // position finale.
      if (mapFetchDebounceRef.current) clearTimeout(mapFetchDebounceRef.current);
      mapFetchDebounceRef.current = setTimeout(async () => {
        mapFetchDebounceRef.current = null;

        const regionKey = `${lat.toFixed(MAP_REGION_KEY_PRECISION)}:${lon.toFixed(MAP_REGION_KEY_PRECISION)}`;
        if (fetchedRegionKeysRef.current.has(regionKey)) return;
        fetchedRegionKeysRef.current.add(regionKey);
        lastFetchCoordsRef.current = { lat, lon };

        // On ne va chercher que les lieux backend ici : la carte n'affiche que
        // les lieux réellement enregistrés dans l'app (cf. isAppLocation), un
        // POI OSM brut serait de toute façon filtré avant affichage — inutile
        // d'interroger Overpass pour cet accumulateur.
        // La carte ne montre que les lieux de la vibe active (jour ou nuit),
        // comme la liste swipeable.
        fetchMapRegion(lat, lon, vibe);
      }, MAP_FETCH_DEBOUNCE_MS);
    },
    [viewMode, vibe, fetchMapRegion],
  );

  // Point d'entrée unique pour réactualiser la carte (accumulateur
  // mapExploredLocations) : utilisé à la fois par le changement de vibe et
  // par le bouton de rafraîchissement manuel, pour le dernier centre de
  // viewport connu — ou la position de l'utilisateur si la carte n'a encore
  // jamais été pannée. Ignore volontairement le debounce/dedup de
  // handleMapViewportChange (pan) : un refresh explicite doit toujours
  // repartir d'un état propre, même si la même région a déjà été fetchée.
  const refreshMapData = useCallback(
    (forVibe) => {
      const center = lastMapCenterRef.current
        || (userCoords ? { lat: userCoords.latitude, lon: userCoords.longitude } : null);
      if (!center) return Promise.resolve();
      fetchedRegionKeysRef.current = new Set();
      lastFetchCoordsRef.current = null;
      initialMapFetchDoneRef.current = true;
      return fetchMapRegion(center.lat, center.lon, forVibe);
    },
    [userCoords, fetchMapRegion],
  );

  // Au changement de vibe : reset immédiat de l'accumulateur (les marqueurs
  // de l'ancienne vibe n'ont plus rien à faire sur la carte) PUIS re-fetch
  // via refreshMapData, sans attendre un nouvel événement de la WebView.
  // Ainsi la carte se réactualise automatiquement dès le changement de mode
  // jour/nuit, sans action manuelle.
  const mapVibeInitRef = useRef(vibe);
  useEffect(() => {
    if (mapVibeInitRef.current === vibe) return; // pas de reset au montage initial
    mapVibeInitRef.current = vibe;

    setMapExploredLocations([]);

    // Contournement en attendant un vrai correctif du repaint WebView (cf.
    // renderMarkers dans map-app.js) : la carte reste visuellement figée
    // après un changement de vibe malgré des données à jour. En repassant
    // sur la liste, on évite d'exposer une carte à l'affichage obsolète —
    // l'utilisateur devra rebasculer manuellement sur la carte pour la voir
    // (ce qui déclenche déjà un repaint correct, cf. bug précédent).
    if (viewMode === 'map') {
      setViewMode('list');
      AsyncStorage.setItem(VIEW_MODE_KEY, 'list').catch(() => {});
    }

    if (hasShownMap) {
      refreshMapData(vibe);
    } else {
      // La carte n'a jamais été ouverte : reset simple, laisser le fetch
      // initial (cf. effet suivant) s'en charger dès sa première ouverture.
      fetchedRegionKeysRef.current = new Set();
      lastFetchCoordsRef.current = null;
      initialMapFetchDoneRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe]);

  useEffect(() => {
    return () => {
      if (mapFetchDebounceRef.current) clearTimeout(mapFetchDebounceRef.current);
    };
  }, []);

  // Premier affichage de la carte : on amorce l'accumulateur avec les lieux
  // de la vibe active autour de la position actuelle, sans attendre un pan de
  // l'utilisateur (l'effet ci-dessus prend le relais pour les changements de
  // vibe suivants).
  const initialMapFetchDoneRef = useRef(false);
  useEffect(() => {
    if (!hasShownMap || !userCoords || initialMapFetchDoneRef.current) return;
    initialMapFetchDoneRef.current = true;
    handleMapViewportChange({ center: [userCoords.longitude, userCoords.latitude] });
  }, [hasShownMap, userCoords, handleMapViewportChange]);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((saved) => {
        if (saved === 'map' || saved === 'list') setViewMode(saved);
      })
      .catch(() => {});
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next = prev === 'list' ? 'map' : 'list';
      AsyncStorage.setItem(VIEW_MODE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  // Navigation vers le détail d'un lieu, partagée entre le tap sur une carte
  // de la liste et le tap sur un pin de la carte — pour éviter toute
  // divergence entre les deux modes (cf. plan "vue carte").
  const selectingLocationRef = useRef(false);
  const handleSelectLocation = useCallback(
    async (item) => {
      // Garde anti-double-tap : un tap sur un pin de la carte n'a plus de
      // modal intermédiaire pour absorber un double-tap pendant le seed OSM
      // (appel réseau), ce qui déclencherait un double seed/double navigate.
      if (selectingLocationRef.current) return;
      selectingLocationRef.current = true;
      try {
        const isOsm = typeof item?._id === 'string' && item._id.startsWith('osm:');
        if (isOsm) {
          try {
            const coords = item?.location?.coordinates || [];
            const lon = typeof coords[0] === 'number' ? coords[0] : null;
            const lat = typeof coords[1] === 'number' ? coords[1] : null;
            if (lat != null && lon != null && item?.osmId != null) {
              const res = await seedOsmLocation({
                osmId: item.osmId,
                name: item.name,
                type: item.type,
                lat,
                lon,
              });
              const seeded = res?.location;
              if (seeded && seeded._id) {
                const merged = { ...item, ...seeded };
                navigation.navigate('Location', {
                  locationId: merged._id || merged.id,
                  tertiles: merged.tertiles || null,
                  initialLocation: merged,
                });
                return;
              }
            }
          } catch (e) {
            console.warn('[LocationListScreen] seedOsmLocation failed:', e?.message || e);
          }
        }
        navigation.navigate('Location', {
          locationId: item._id || item.id,
          tertiles: item.tertiles || null,
          initialLocation: item,
        });
      } finally {
        selectingLocationRef.current = false;
      }
    },
    [navigation],
  );

  const handleClusterPickerSelect = useCallback(
    (item) => {
      setClusterPickerItems(null);
      handleSelectLocation(item);
    },
    [handleSelectLocation],
  );

  const handleCorrectCheckinPress = useCallback(() => {
    if (isBoosted) {
      Alert.alert('Boost en cours', "Ton boost est actif : attends qu'il se termine pour changer de lieu.");
      return;
    }
    const c = userCoordsRef.current;
    if (!c) return;
    setPlacePicker({ lat: c.latitude, lon: c.longitude });
  }, [isBoosted]);

  const handleSelectCorrectedPlace = useCallback(async (place) => {
    if (correctingCheckin) return;
    setCorrectingCheckin(true);
    try {
      const c = userCoordsRef.current;
      if (!c) return;
      const res = await forceCheckIn({ locationId: place._id, lat: c.latitude, lon: c.longitude });
      if (res?.user) updateUser(mapBackendUser(res.user));
      await markCheckinVerified({ locationId: place._id, lat: c.latitude, lon: c.longitude });
      setPlacePicker(null);
    } catch (e) {
      if (e?.code === 'BOOST_ACTIVE') {
        setPlacePicker(null);
        Alert.alert('Boost en cours', e?.message || "Ton boost est actif : attends qu'il se termine pour changer de lieu.");
      } else {
        console.warn('[LocationListScreen] forceCheckIn failed', e?.message || e);
      }
    } finally {
      setCorrectingCheckin(false);
    }
  }, [correctingCheckin, updateUser]);
  // Anti double-déclenchement du pull-to-refresh manuel (le backend a déjà
  // son propre rate-limit + cache 10s, cf. locationsListLimiter côté API) :
  // on bloque juste les appels quasi simultanés (double tir accidentel du
  // geste), sans empêcher un refresh légitime après un déplacement réel.
  const REFRESH_MIN_INTERVAL_MS = 3 * 1000;
  const lastRefreshAtRef = useRef(0);

  // Garde anti-race : fetchNearbyLocations peut être déclenché par plusieurs
  // sources concurrentes (mount, useFocusEffect, changement de vibe, pull-to-
  // refresh, load more). Si une requête lancée en mode "moon" résout APRÈS une
  // requête plus récente lancée en mode "sun" (résolution hors-ordre côté
  // réseau), elle écraserait `locations` avec des lieux de nuit périmés alors
  // que l'utilisateur est déjà en mode jour. On ne garde que la réponse de la
  // requête la plus récente (pattern "latest wins").
  const fetchRequestIdRef = useRef(0);

  // Cache mémoire de session par vibe (sun/moon), pour éviter de refetch
  // /api/locations + Overpass à chaque bascule jour/nuit si on revient sur
  // une vibe déjà consultée récemment sans avoir bougé. L'intérêt n'est pas
  // la vitesse perçue (déjà masquée par l'interstitiel de 8s du VibeFAB)
  // mais de réduire le volume de requêtes réseau vers le backend.
  const VIBE_CACHE_TTL_MS = 45 * 1000;
  const vibeCacheRef = useRef({
    sun: { zoneKey: null, fetchedAt: 0, locations: [], osmPois: [], displayLimit: MIN_LOCATIONS, hasMore: true },
    moon: { zoneKey: null, fetchedAt: 0, locations: [], osmPois: [], displayLimit: MIN_LOCATIONS, hasMore: true },
  });
  const getZoneKey = (lat, lon) => (lat == null || lon == null ? null : `${lat}:${lon}`);
  const readVibeCache = (v, zoneKey) => {
    const entry = vibeCacheRef.current[v];
    if (!entry || zoneKey == null || entry.zoneKey !== zoneKey) return null;
    if (Date.now() - entry.fetchedAt > VIBE_CACHE_TTL_MS) return null;
    return entry;
  };
  const writeVibeCache = (v, patch) => {
    vibeCacheRef.current[v] = { ...vibeCacheRef.current[v], ...patch, fetchedAt: Date.now() };
  };

  // Watch for location updates to keep distances accurate
  useEffect(() => {
    let subscription;
    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10, // Update every 10 meters
        },
        (location) => {
          setUserCoords({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        },
      );
    };

    startWatching();
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Contrainte stricte: afficher uniquement les types autorisés par le mode (jour/nuit).
  // Le mapping vibe → types est centralisé dans OverpassService (cf. ALLOWED_TYPES_BY_VIBE)
  // pour garantir la cohérence entre la requête Overpass et le filtre UI.
  useEffect(() => {
    const task = () => {
      try {
        const next = Array.isArray(osmPois) ? osmPois.filter((p) => isTypeAllowedForVibe(p?.type, vibe)) : [];
        setFilteredOsmPois(next);
      } catch (_) {}
    };

    // Defer heavy filtering until after transition animations
    if (transitioningTo) {
      const handle = InteractionManager.runAfterInteractions(task);
      return () => {
        try {
          handle?.cancel?.();
        } catch (_) {}
      };
    }
    task();
  }, [osmPois, vibe, transitioningTo]);

  // Une fois la transition jour/nuit terminée (transitioningTo repasse à null
  // après avoir été non-null), on rafraîchit les lieux pour refléter le nouveau vibe.
  const wasTransitioningRef = useRef(false);
  useEffect(() => {
    if (transitioningTo) {
      wasTransitioningRef.current = true;
    } else if (wasTransitioningRef.current) {
      wasTransitioningRef.current = false;
      fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, vibe });
    }
  }, [transitioningTo, vibe]);

  // Locations backend : le filtre par vibe est désormais entièrement délégué au
  // backend (`TYPES_BY_VIBE` + élargissement progressif du rayon + remplissage
  // jusqu'au minimum requis). On NE re-filtre PAS ici côté client, sinon on
  // exclurait les lieux de remplissage que le backend a ajoutés pour garantir
  // les 20 lieux minimum demandés par l'utilisateur, quelle que soit la vibe.
  const filteredLocations = useMemo(() => {
    return Array.isArray(locations) ? locations : [];
  }, [locations]);

  const locationsWithDistance = useMemo(() => {
    // Dédoublonnage robuste : on privilégie l'osmId s'il existe, sinon l'id MongoDB.
    // Cela permet de fusionner un lieu backend synchronisé (qui a un osmId)
    // avec son équivalent brut provenant d'Overpass.
    const merged = mergeByOsmId(filteredLocations, filteredOsmPois);

    if (!userCoords) return merged;

    return merged.map((loc) => {
      const coords = loc?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return loc;
      const distance = calculateDistance(userCoords.latitude, userCoords.longitude, coords[1], coords[0]);
      return { ...loc, distance };
    });
  }, [filteredLocations, filteredOsmPois, userCoords]);

  // PulseList ordering: le lieu "Pro Boost" sponsorisé (renvoyé par le backend
  // avec isSponsored:true, un seul possible à la fois) est toujours épinglé en
  // tête. Les autres lieux sont déjà triés par score composite côté backend
  // (cf. location.controller.js : distance + stars + userCount, cf.
  // config/locationScoring.js pour les poids). On ne retrie PAS ici les lieux
  // déjà scorés par le serveur — on calcule le même score uniquement pour les
  // POI OSM fusionnés (`filteredOsmPois`, sans stars/userCount serveur) afin
  // de les interclasser correctement avec les lieux backend.
  const scoreForClientRanking = (loc) => {
    if (typeof loc?.distance !== 'number') return -Infinity;
    const distanceScore = Math.exp(-loc.distance / DISTANCE_REF_METERS);
    const starsScore = (loc.stars || 0) / 3;
    const userScore = Math.min(loc.userCount || 0, USERCOUNT_CAP) / USERCOUNT_CAP;
    return WEIGHT_DISTANCE * distanceScore + WEIGHT_STARS * starsScore + WEIGHT_USERS * userScore;
  };

  const pulseItems = useMemo(() => {
    const backendOrder = new Map(locationsWithDistance.map((loc, index) => [loc._id ?? loc.osmId, index]));
    const sorted = [...locationsWithDistance].sort((a, b) => {
      if (a.isSponsored && !b.isSponsored) return -1;
      if (b.isSponsored && !a.isSponsored) return 1;
      const aIsBackend = backendOrder.has(a._id ?? a.osmId) && a.stars !== undefined;
      const bIsBackend = backendOrder.has(b._id ?? b.osmId) && b.stars !== undefined;
      if (aIsBackend && bIsBackend) {
        return (backendOrder.get(a._id ?? a.osmId) ?? 0) - (backendOrder.get(b._id ?? b.osmId) ?? 0);
      }
      return scoreForClientRanking(b) - scoreForClientRanking(a);
    });
    // Mark first two items for tall card style (le score composite remplace
    // déjà la primauté des étoiles ; un filtre stars>=2 réintroduirait la
    // même distorsion distance/popularité qu'on cherche à corriger).
    let featuredCount = 0;
    return sorted.map((it) => {
      if (featuredCount < 2) {
        featuredCount++;
        return { ...it, _featuredRank: featuredCount };
      }
      return it;
    });
  }, [locationsWithDistance]);

  // Liste effectivement affichée : on borne au `displayLimit` courant pour
  // respecter l'infinite scroll (20 → 30 → 40 → 50 max).
  const visibleItems = useMemo(() => {
    return pulseItems.slice(0, Math.min(displayLimit, MAX_LOCATIONS));
  }, [pulseItems, displayLimit]);

  // Restructuration en 3 sections (mode liste uniquement, cf. plan §2.3) :
  // - "Mis en avant" : lieux isSponsored (peut aussi apparaître ailleurs).
  // - "Ça bouge maintenant" : top N par nombre de visiteurs actuels.
  // - "D'autres lieux pour toi" : reste, via le même score composite client
  //   déjà utilisé (pulseItems), en excluant seulement les lieux déjà montrés
  //   dans "Ça bouge maintenant" (dédupliqué par id).
  const NOW_TRENDING_COUNT = 10;
  const sponsoredItems = useMemo(() => pulseItems.filter((it) => it.isSponsored), [pulseItems]);
  // Auto-défilement du carousel "Mis en avant" toutes les 7s quand il y a
  // plusieurs lieux sponsorisés (sinon un seul est affiché en carte pleine
  // largeur, pas de FlatList - cf. renderListSectionsHeader). En pause tant
  // que l'utilisateur interagit avec le carousel (cf. onTouchStart/onTouchEnd).
  const sponsoredListRef = useRef(null);
  const sponsoredScrollIndexRef = useRef(0);
  const sponsoredTouchActiveRef = useRef(false);
  const sponsoredAutoScrollIntervalRef = useRef(null);
  const stopSponsoredAutoScroll = useCallback(() => {
    if (sponsoredAutoScrollIntervalRef.current) {
      clearInterval(sponsoredAutoScrollIntervalRef.current);
      sponsoredAutoScrollIntervalRef.current = null;
    }
  }, []);
  const startSponsoredAutoScroll = useCallback(() => {
    stopSponsoredAutoScroll();
    if (sponsoredItems.length <= 1) return;
    sponsoredAutoScrollIntervalRef.current = setInterval(() => {
      if (sponsoredTouchActiveRef.current) return;
      const nextIndex = (sponsoredScrollIndexRef.current + 1) % sponsoredItems.length;
      sponsoredScrollIndexRef.current = nextIndex;
      sponsoredListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 7000);
  }, [sponsoredItems.length, stopSponsoredAutoScroll]);
  useEffect(() => {
    sponsoredScrollIndexRef.current = 0;
    startSponsoredAutoScroll();
    return stopSponsoredAutoScroll;
  }, [sponsoredItems.length, startSponsoredAutoScroll, stopSponsoredAutoScroll]);
  // BUG: une transition jour/nuit (overlay plein écran + LocationItem redéfini
  // via useMemo([...,  isMoon]), donc remonté) peut interrompre en plein vol
  // une séquence tactile en cours sur le carousel, sans jamais délivrer le
  // onTouchEnd/onTouchCancel correspondant. `sponsoredTouchActiveRef` reste
  // alors bloqué à `true`, et la garde en tête de onTouchStart empêche tout
  // futur lockSwiper() de s'exécuter : le carousel ne verrouille plus jamais
  // le swipe de navigation entre onglets après un changement de vibe. On
  // force donc un reset propre à chaque transition.
  useEffect(() => {
    sponsoredTouchActiveRef.current = false;
    unlockSwiper();
  }, [transitioningTo, isMoon, unlockSwiper]);
  const handleSponsoredScrollToIndexFailed = useCallback((info) => {
    sponsoredListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: true,
    });
  }, []);
  const trendingItems = useMemo(() => {
    return [...pulseItems]
      // Un lieu sponsorisé a déjà sa propre section "Mis en avant" : on évite
      // qu'il apparaisse une seconde fois ici.
      .filter((it) => !it.isSponsored)
      .sort((a, b) => (b.userCount || 0) - (a.userCount || 0))
      .filter((it) => (it.userCount || 0) > 0)
      .slice(0, NOW_TRENDING_COUNT);
  }, [pulseItems]);
  const trendingIds = useMemo(
    () => new Set(trendingItems.map((it) => it._id ?? it.osmId)),
    [trendingItems],
  );
  const otherItems = useMemo(
    () => visibleItems.filter((it) => !trendingIds.has(it._id ?? it.osmId) && !it.isSponsored),
    [visibleItems, trendingIds],
  );

  // Vue carte : n'afficher que les lieux réellement enregistrés dans notre
  // backend (id Mongo réel), pour exclure les POI OSM bruts jamais ajoutés à
  // l'app (id synthétique `osm:<id>` généré par OverpassService, cf.
  // handleSelectLocation qui utilise déjà cette même distinction). La liste
  // swipeable, elle, continue d'afficher tous les lieux (inchangé). On fusionne
  // avec les lieux chargés en panant la carte loin de sa position réelle
  // (cf. handleMapViewportChange) pour que la carte reste utile/explorable.
  const isAppLocation = (loc) => typeof loc?._id === 'string' && !loc._id.startsWith('osm:');
  const mapVisibleItems = useMemo(
    () =>
      mergeByOsmId(visibleItems, mapExploredLocations)
        .filter(isAppLocation)
        .filter((loc) => isTypeAllowedForVibe(loc?.type, vibe)),
    [visibleItems, mapExploredLocations, vibe],
  );

  // Reset de la pagination à chaque changement de Vibe (Soleil/Lune).
  // Spec §2: le compteur revient à 20 et la liste se reconstruit pendant
  // l'écran de chargement de 8s déclenché par VibeFAB.
  const prevVibeRef = useRef(vibe);
  useEffect(() => {
    if (prevVibeRef.current !== vibe) {
      prevVibeRef.current = vibe;

      // Le reset/refetch de l'accumulateur de la carte (mapExploredLocations)
      // pour la nouvelle vibe est géré par un effet dédié, cf. plus haut
      // (fetchMapRegion sur lastMapCenterRef/userCoords).

      const zoneKey = getZoneKey(roundedLat, roundedLon);
      const cached = readVibeCache(vibe, zoneKey);

      if (cached) {
        // Cache hit : on a déjà ces données pour cette vibe/zone, pas besoin
        // de refetch. On restaure aussi la profondeur de pagination (si
        // l'utilisateur avait scrollé à 80 lieux, on ne repart pas de 40).
        setLocations(cached.locations);
        setOsmPois(cached.osmPois);
        setDisplayLimit(cached.displayLimit);
        setHasMore(cached.hasMore);
        setLoadingMore(false);
        setLoadMoreError(false);
      } else {
        setDisplayLimit(MIN_LOCATIONS);
        setLoadingMore(false);
        setLoadMoreError(false);
        setHasMore(true);
        // Recharger les 20 lieux prioritaires correspondant aux tags du nouveau mode
        fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, limit: MIN_LOCATIONS, vibe });
      }
      // Remonter en haut de liste
      try {
        flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
      } catch (_) {}
    }
  }, [vibe]);

  // Suivi de visibilité pour stopper les animations hors‑écran
  const visibleSetRef = useRef(new Set());
  const [visibleTick, setVisibleTick] = useState(0);
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const set = visibleSetRef.current;
    const next = new Set();
    (viewableItems || []).forEach((v) => {
      if (typeof v?.index === 'number') next.add(v.index);
    });
    // remplacer le set
    visibleSetRef.current = next;
    setVisibleTick((t) => t + 1);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const MANUAL_CHECKIN_DISTANCE_M = 50;

  const LocationItem = useMemo(() => {
    return React.memo(({ item, index }) => {
      const isUserHere = item._id === currentUser?.currentPoiId;
      const canManualCheckIn =
        checkInMode === 'manual' &&
        !isUserHere &&
        typeof item.distance === 'number' &&
        item.distance <= MANUAL_CHECKIN_DISTANCE_M;
      const isCheckingInHere = checkingInLocationId === item._id;
      // Désactive TOUS les boutons "je suis là" (pas seulement celui tapé) tant
      // qu'un check-in est en vol, pour empêcher un 2e tap sur un autre lieu
      // pendant que le 1er est encore en cours (source de la course décrite
      // plus haut sur checkInRequestIdRef).
      const isAnyCheckInInFlight = !!checkingInLocationId;

      const card = (
        <TouchableOpacity
          style={[
            styles.locationCard,
            {
              backgroundColor: colors.surface,
              marginBottom: isUserHere ? 0 : 16,
              borderWidth: isMoon ? 1.5 : 0,
              borderColor: isMoon ? 'rgba(255,45,168,0.35)' : 'transparent',
              shadowColor: isMoon ? '#2dbdff' : '#000',
              shadowOpacity: isMoon ? 0.45 : isDark ? 0.2 : 0.08,
            },
          ]}
          onPress={() => handleSelectLocation(item)}
        >
          <View style={styles.locationInfo}>
            {item.isPro && (item.bannerUrl || item.logoUrl) && (
              <View style={item.bannerUrl ? styles.proBannerContainer : null}>
                {item.bannerUrl && (
                  <ImageWithPlaceholder uri={item.bannerThumbUrl || item.bannerUrl} style={styles.proBanner} />
                )}
                {item.logoUrl && (
                  <ImageWithPlaceholder
                    uri={item.logoThumbUrl || item.logoUrl}
                    style={[
                      item.bannerUrl ? styles.proLogoOverlap : styles.proLogoInline,
                      { borderColor: colors.surface },
                    ]}
                  />
                )}
              </View>
            )}
            <View style={styles.locationHeaderRow}>
              <Text
                style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>
              {isUserHere ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.distanceText, { color: '#00c2cb', fontWeight: '600' }]}>Actuellement ici</Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleCorrectCheckinPress();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 6, opacity: isBoosted ? 0.4 : 1 }}
                  >
                    <Ionicons name="pencil" size={14} color="#00c2cb" />
                  </TouchableOpacity>
                </View>
              ) : (
                item.distance !== undefined && (
                  <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                    {formatDistance(item.distance)}
                  </Text>
                )
              )}
            </View>
            {(item.isPro || item.isSponsored) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                {item.isPro && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓</Text>
                  </View>
                )}
                {item.isSponsored && (
                  <View style={styles.sponsoredBadge}>
                    <Text style={styles.sponsoredText}>SPONSORISÉ</Text>
                  </View>
                )}
              </View>
            )}
            <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
              <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(item.type)}</Text>
            </View>
            <View style={styles.activeUsersContainer}>
              <Text style={[styles.usersCountText, { color: colors.textSecondary }]}>
                {item.userCount || 0} visiteur{(item.userCount || 0) > 1 ? 's' : ''}
              </Text>
              <View style={styles.avatarStack}>
                {(item.activeUsers || []).map((u, index) => {
                  const isUserBoosted = u.boostUntil && new Date(u.boostUntil) > new Date();
                  const isGhost =
                    u.location &&
                    u.location.updatedAt &&
                    new Date(u.location.updatedAt) < new Date(Date.now() - 5 * 60 * 1000) &&
                    isUserBoosted;

                  return (
                    <View
                      key={u._id}
                      style={[
                        styles.avatarWrapper,
                        {
                          marginLeft: index === 0 ? 0 : -12,
                          borderColor: isUserBoosted ? '#FFD700' : colors.surface,
                          backgroundColor: isDark ? '#333' : '#eee',
                          opacity: isGhost ? 0.6 : 1,
                          borderWidth: isUserBoosted ? 1.5 : 1,
                        },
                      ]}
                    >
                      <ImageWithPlaceholder uri={u.profileImageUrl} style={styles.smallAvatar} />
                      <View
                        style={[
                          styles.statusDotSmall,
                          {
                            backgroundColor: u.status === 'green' ? '#4CAF50' : '#FF9800',
                            borderColor: colors.surface,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
            {canManualCheckIn && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleManualCheckIn(item);
                }}
                disabled={isAnyCheckInInFlight}
                style={[styles.manualCheckinButton, { opacity: isAnyCheckInInFlight ? 0.6 : 1 }]}
              >
                {isCheckingInHere ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.manualCheckinButtonText}>Je suis là</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.popularityContainer}>
            <Text style={styles.popularityStars}>{getStars(item, isDark)}</Text>
          </View>
        </TouchableOpacity>
      );

      const isActive = visibleSetRef.current.has(index);

      if (isUserHere) {
        return (
          <AnimatedGradientBorder borderRadius={20} index={index} active={isActive} marginBottom={16}>
            {card}
          </AnimatedGradientBorder>
        );
      }

      // Neon vibe: apply animated gradient border to all cards in Night mode
      if (isMoon) {
        return (
          <AnimatedGradientBorder
            borderRadius={20}
            index={index}
            active={isActive}
            marginBottom={16}
            colors={['#ff2da8', '#2dbdff', '#ff2da8', '#2dbdff', '#ff2da8']}
          >
            {card}
          </AnimatedGradientBorder>
        );
      }

      return card;
    });
  }, [
    colors,
    isDark,
    isMoon,
    currentUser?.currentPoiId,
    handleCorrectCheckinPress,
    handleSelectLocation,
    isBoosted,
    checkInMode,
    checkingInLocationId,
    handleManualCheckIn,
  ]);

  const renderLocation = ({ item, index }) => <LocationItem item={item} index={index} />;

  // Fetch Overpass on significant coordinate changes only (~110m, 3 decimals).
  // The service itself enforces a time-based throttle + failure backoff.
  const roundedLat = userCoords ? Math.round(userCoords.latitude * 1000) / 1000 : null;
  const roundedLon = userCoords ? Math.round(userCoords.longitude * 1000) / 1000 : null;
  useEffect(() => {
    let active = true;
    (async () => {
      if (roundedLat == null || roundedLon == null) return;

      // Déjà en cache pour cette vibe/zone (écrit par l'effet [vibe] ou un
      // précédent fetch) : pas besoin de rappeler Overpass.
      const zoneKey = getZoneKey(roundedLat, roundedLon);
      const cached = readVibeCache(vibe, zoneKey);
      if (cached) {
        setOsmPois(cached.osmPois);
        return;
      }

      // On attend une frame pour laisser respirer l'UI
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!active) return;

      // Attendre que les interactions (animations) soient finies avant de charger Overpass
      // car c'est une requête lourde qui peut ralentir le thread JS au moment du rendu.
      await new Promise((resolve) => InteractionManager.runAfterInteractions(resolve));
      if (!active) return;

      try {
        const pois = await OverpassService.fetchAround({ lat: roundedLat, lon: roundedLon, radius: 3000, vibe });
        if (active) {
          setOsmPois(pois);
          writeVibeCache(vibe, { zoneKey, osmPois: pois });
        }
      } catch (_) {}
    })();
    return () => {
      active = false;
    };
  }, [roundedLat, roundedLon, vibe]);

  useEffect(() => {
    fetchNearbyLocations();

    // Listen for mutations that should trigger a refresh
    const unsub = subscribe('api:mutation', ({ path, user: backendUser }) => {
      // Rafraîchir la liste suite aux mutations liées à la position MAIS sans renvoyer un POST
      // pour éviter une boucle infinie (mitraillette à requêtes).
      if (
        path &&
        (path.includes('/users/location') || path.includes('/user/location') || path.includes('/user/heartbeat'))
      ) {
        // Patch optimiste (cf. applyOptimisticLocationPatch), généralisé ici à
        // TOUS les flows de check-in/check-out (correction de check-in, QR
        // code, BLE, heartbeat auto GPS, heartbeat en arrière-plan) — pas
        // seulement le "Je suis là" manuel (qui applique en plus son propre
        // patch synchrone juste après l'await, ci-dessus : idempotent avec
        // celui-ci grâce aux gardes "already"/"length inchangée"). Couvre
        // aussi le check-out, jusqu'ici jamais reflété sur les cartes.
        if (backendUser?._id) {
          const myRawId = String(backendUser._id);
          const previousPoiId = previousPoiIdRef.current;
          const nextPoiId = backendUser.currentLocation ? String(backendUser.currentLocation) : null;
          if (previousPoiId !== nextPoiId) {
            const meEntry = {
              _id: myRawId,
              profileImageUrl: backendUser.profileImageUrl || null,
              boostUntil: backendUser.boostUntil || null,
              status: backendUser.status || 'green',
              location: { updatedAt: new Date().toISOString() },
            };
            setLocations((prev) =>
              applyOptimisticLocationPatch(prev, { myRawId, previousPoiId, nextPoiId, meEntry }),
            );
          }
        }
        // BUG (root cause de l'asymétrie sun→moon vs moon→sun) : cet effet a
        // un tableau de dépendances vide ([]), donc ce callback ferme sur la
        // valeur de `vibe` telle qu'elle était AU MOMENT DU MONT (souvent
        // 'sun', l'app étant généralement ouverte de jour). Sans le override
        // explicite ci-dessous, `fetchNearbyLocations` retombe sur son propre
        // closure de `vibe` (tout aussi figé) et interroge TOUJOURS le
        // backend avec la vibe de mount, jamais la vibe actuelle.
        // Combiné à la garde anti-race "latest wins" (fetchRequestIdRef), ce
        // fetch périmé peut résoudre APRÈS le fetch légitime déclenché par le
        // changement de vibe et écraser silencieusement `locations` avec des
        // lieux de la mauvaise vibe (ex: places de jour alors que l'UI est
        // passée en mode nuit) — d'où les sections qui se vident après un
        // switch jour→nuit tant qu'on n'a pas forcé un fetch explicite
        // (pull-to-refresh) avec la bonne vibe. Le sens nuit→jour semblait
        // "fonctionner" uniquement parce que la vibe de mount (sun) coïncidait
        // avec la vibe cible dans ce cas précis, masquant le bug.
        // reuseCoords: on vient de faire un heartbeat/check-in avec une position
        // fraîche il y a quelques ms, inutile de ré-acquérir le GPS (cf. commentaire
        // détaillé dans fetchNearbyLocations) — sans ça, ce refresh peut être retardé
        // de dizaines de secondes en intérieur/signal faible.
        fetchNearbyLocations({
          skipUpdateMyLocation: true,
          silent: true,
          vibe: vibeRef.current,
          reuseCoords: userCoordsRef.current,
        });
      }
    });

    return () => unsub();
  }, []);

  // Scroll position is preserved automatically by React Navigation's native stack.

  const getStars = (item, starIsDark) => {
    const starsCount = item?.stars || 0;
    const userCount = item?.userCount || 0;

    // Determine the number of stars based on backend stars field
    if (starsCount === 3) {
      return <Text style={{ fontSize: 18 }}>⭐⭐⭐</Text>;
    }
    if (starsCount === 2) {
      return <Text style={{ fontSize: 18 }}>⭐⭐</Text>;
    }
    // Si starsCount est 1 OU s'il y a des utilisateurs présents, on affiche 1 étoile jaune
    if (starsCount === 1 || userCount > 0) {
      return <Text style={{ fontSize: 18 }}>⭐</Text>;
    }

    // Default to 1 grey star for 0 stars
    return (
      <Text style={{ color: starIsDark ? '#FFFFFF' : '#ccc', opacity: starIsDark ? 0.3 : 1, fontSize: 18 }}>★</Text>
    );
  };

  const fetchNearbyLocations = async (options = {}) => {
    const { skipUpdateMyLocation = false, silent = false, skipLastKnown = false, vibe: overrideVibe, reuseCoords = null, forceFresh = false } = options;
    const currentVibe = overrideVibe || vibe;
    const myRequestId = ++fetchRequestIdRef.current;
    try {
      if (!silent) setLoading(true);

      let latitude;
      let longitude;

      if (reuseCoords) {
        // Refresh "données serveur uniquement" après une mutation (check-in manuel,
        // heartbeat) : on a déjà une position fraîche de quelques centaines de ms
        // (celle utilisée pour l'appel qui vient de se terminer), donc pas besoin de
        // ré-acquérir le GPS. Sans ce court-circuit, `getCurrentPositionSmart` peut
        // retomber sur `getCurrentPositionAsync` (jusqu'à ~1 min en intérieur/signal
        // faible) si aucune position "last known" récente n'est disponible côté OS,
        // et retarder d'autant l'affichage du nouveau compteur de visiteurs alors que
        // le serveur, lui, a déjà la bonne donnée depuis longtemps.
        ({ latitude, longitude } = reuseCoords);
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Permission to access location was denied');
          setLocationError(true);
          if (!silent) setLoading(false);
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          console.warn('Location services are disabled at the OS level (Settings > Location)');
          setLocationError(true);
          if (!silent) setLoading(false);
          return;
        }

        let location;
        try {
          // getCurrentPositionSmart applique l'override dev (si défini) et retente en
          // Accuracy.Low si Balanced échoue (voir utils/locationHelper.js).
          location = await getCurrentPositionSmart({ skipLastKnown });
        } catch (locErr) {
          // Position indisponible (GPS/services de localisation désactivés au niveau OS)
          console.warn('Location unavailable:', locErr?.message);
          setLocationError(true);
          if (!silent) setLoading(false);
          return;
        }

        if (!location) {
          console.warn('Could not determine position');
          setLocationError(true);
          if (!silent) setLoading(false);
          return;
        }

        ({ latitude, longitude } = location.coords);
      }

      setLocationError(false);
      setUserCoords({ latitude, longitude });

      // Nudge Premium (signal passif, fire-and-forget) : uniquement au tout premier
      // chargement (skipUpdateMyLocation=false distingue le cold-start du refresh
      // silencieux/loadMore) et seulement pour les comptes non-premium, pour éviter
      // de spammer /users/nearby à chaque pull-to-refresh alors que le nudge lui-même
      // est de toute façon plafonné à 1x/7j.
      if (!skipUpdateMyLocation && !isPremium) {
        (async () => {
          try {
            let radiusNudge = null;
            const nearby = await getUsersAroundMe({ lat: latitude, lon: longitude, radius: 2000 });
            if (nearby && typeof nearby.maxRadius === 'number' && nearby.maxRadius < 2000) {
              radiusNudge = await PremiumNudgeService.evaluate('radius_limited', { isPremium, premiumSystemEnabled });
            }
            if (radiusNudge) {
              publish('premium:nudge', radiusNudge);
              return;
            }
            // radius_limited n'a rien retourné (hors cooldown ou pas plafonné) : on
            // laisse une chance au rappel périodique, moins prioritaire.
            const periodicNudge = await PremiumNudgeService.evaluate('periodic_home', {
              isPremium,
              premiumSystemEnabled,
            });
            if (periodicNudge) publish('premium:nudge', periodicNudge);
          } catch (_) {
            // Signal purement observationnel : ne doit jamais impacter la liste principale.
          }
        })();
      }

      // Nudge parrainage (signal passif, fire-and-forget) : contrairement aux nudges
      // premium ci-dessus, celui-ci reste pertinent même pour un utilisateur déjà premium
      // (le parrainage est indépendant du gating premium), donc pas de garde `!isPremium` ici.
      if (!skipUpdateMyLocation) {
        (async () => {
          try {
            const referralInfo = await getMyReferralInfo();
            const referralCapReachedThisMonth = (referralInfo?.currentMonthValidatedCount ?? 0) >= (referralInfo?.targetCount ?? 5);
            const inviteNudge = await PremiumNudgeService.evaluate('invite_friends_periodic', {
              isPremium,
              premiumSystemEnabled,
              referralCapReachedThisMonth,
            });
            if (inviteNudge) publish('premium:nudge', inviteNudge);
          } catch (_) {
            // Signal purement observationnel : ne doit jamais impacter la liste principale.
          }
        })();
      }

      // 3. Lancer les requêtes API en parallèle
      const reqLimit = options.limit || displayLimit;
      const tasks = [];

      if (!skipUpdateMyLocation && !isLocationHeartbeatSuppressed()) {
        tasks.push(
          updateMyLocation({ lat: latitude, lon: longitude }).catch((err) =>
            console.error('Error updating my location:', err),
          ),
        );
      }

      tasks.push(getLocations({ lat: latitude, lon: longitude, limit: reqLimit, vibe: currentVibe, forceFresh }));

      const results = await Promise.all(tasks);
      // Si on n'a PAS skippé updateMyLocation, alors getLocations est le 2ème élément (index 1)
      // Sinon, c'est le 1er élément (index 0).
      const res = skipUpdateMyLocation ? results[0] : results[1];

      // Une requête plus récente (autre vibe, autre déclencheur) a déjà résolu :
      // on ignore cette réponse périmée pour ne jamais écraser l'état courant.
      if (myRequestId !== fetchRequestIdRef.current) {
        return;
      }

      if (res && Array.isArray(res.locations)) {
        const normalized = res.locations.map((it) => {
          const userCount = it?.userCount || 0;
          const stars = typeof it?.stars === 'number' ? it.stars : parseInt(it?.stars, 10) || 0;
          const isPersistent = (it?.popularity || 0) >= 1000 || stars === 3;
          return { ...it, stars, userCount, isPersistent };
        });

        const hasMoreResult = normalized.length >= reqLimit && reqLimit < MAX_LOCATIONS;
        setLocations(normalized);
        setHasMore(hasMoreResult);

        const zoneKey = getZoneKey(Math.round(latitude * 1000) / 1000, Math.round(longitude * 1000) / 1000);
        writeVibeCache(currentVibe, {
          zoneKey,
          locations: normalized,
          displayLimit: reqLimit,
          hasMore: hasMoreResult,
        });
      }

      // NOTE: On a supprimé l'appel OverpassService.fetchAround ici
      // car il est déjà géré par le useEffect([roundedLat, roundedLon, vibe])
      // qui se déclenchera suite au setUserCoords(...) ci-dessus.
      setInvisibleModeBlocking(false);
    } catch (e) {
      const isInvisibleModeError =
        e?.status === 403 && (e?.code === 'INVISIBLE_MODE_ACTIVE' || e?.response?.error === 'INVISIBLE_MODE_ACTIVE');
      if (isInvisibleModeError) {
        setInvisibleModeBlocking(true);
      } else {
        console.error('Error fetching locations:', e);
        // Sans ça, un refresh manuel qui échoue (réseau, 429...) est
        // indiscernable d'un refresh qui a réussi mais n'a rien trouvé de
        // nouveau : le spinner s'arrête silencieusement dans les deux cas.
        if (!silent) showToast("Impossible d'actualiser pour l'instant.");
      }
    } finally {
      // NB: `setLoading` n'est PAS gardé par `myRequestId` contrairement à
      // `setLocations`/`setHasMore` ci-dessus. Chaque fetchNearbyLocations()
      // déclenche en interne un POST /users/location qui publie 'api:mutation',
      // capté par l'abonnement ci-dessous qui relance aussitôt un fetch
      // "silent" (donc sans reset de loading) — ce qui incrémente
      // fetchRequestIdRef AVANT que l'appel initial (non-silent) n'atteigne ce
      // bloc. Si on gardait ce reset par la même staleness-guard, `loading`
      // resterait bloqué à `true` indéfiniment (aucun appel "silent" ne le
      // remet jamais à false), et la liste semblerait ne plus jamais charger.
      if (!silent) setLoading(false);
    }
  };

  const onRefresh = async () => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
      // Trop tôt : on ignore l'appel API mais on rejoue quand même l'animation
      // du spinner pour ne pas donner l'impression que le geste n'a rien fait.
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 400);
      return;
    }
    lastRefreshAtRef.current = now;
    setRefreshing(true);
    setDisplayLimit(MIN_LOCATIONS);
    await fetchNearbyLocations({ limit: MIN_LOCATIONS, vibe, skipLastKnown: true, forceFresh: true });
    setRefreshing(false);
  };

  // Rafraîchissement silencieux de la liste/carte à chaque reprise de focus
  // de l'écran (retour depuis LocationScreen, changement d'onglet, etc.),
  // pour que la présence des autres utilisateurs reste à jour sans action
  // manuelle de la part de l'utilisateur.
  useFocusEffect(
    useCallback(() => {
      fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, vibe });
    }, [vibe]),
  );

  // Charge plus de lieux backend (jusqu'à MAX_LOCATIONS) quand l'utilisateur
  // approche du bas de la liste. Lazy loading: l'appel API n'est déclenché
  // qu'à la demande (scroll) et le déchargement hors-écran est géré par FlatList
  // via `removeClippedSubviews` + `windowSize`.
  const handleLoadMore = async () => {
    if (loadingMore) return;
    if (loadMoreError) return; // l'utilisateur doit cliquer sur "Réessayer"
    if (displayLimit >= MAX_LOCATIONS) return;
    // Stop si on sait déjà qu'il n'y a plus rien à charger côté backend.
    // Évite la cascade d'appels qui faisait grimper `displayLimit` jusqu'à 50
    // alors que la zone ne contenait qu'une poignée de lieux.
    if (!hasMore && pulseItems.length <= displayLimit) return;
    // Évite de re-fetcher si on n'a même pas encore consommé tout le buffer local.
    // Cas typique : le backend a renvoyé 20 lieux et l'utilisateur scrolle ;
    // on incrémente d'abord la fenêtre, puis on fetch si nécessaire.
    const next = Math.min(MAX_LOCATIONS, displayLimit + LOCATIONS_STEP);
    if (next === displayLimit) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    setDisplayLimit(next);
    try {
      // Si le buffer local couvre déjà la nouvelle fenêtre, pas besoin d'appel
      // réseau supplémentaire (les données ont déjà été renvoyées par le backend).
      if (pulseItems.length < next && hasMore) {
        await fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, limit: next });
      }
    } catch (_) {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRetryLoadMore = () => {
    setLoadMoreError(false);
    // Relance immédiate
    setTimeout(() => {
      handleLoadMore();
    }, 0);
  };

  // Footer dynamique : spinner pendant le chargement, message de fin lorsque le
  // plafond est atteint, ou bouton "Réessayer" en cas d'erreur réseau.
  const renderListFooter = () => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#00c2cb" />
          <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSecondary }}>
            Chargement de lieux supplémentaires…
          </Text>
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ marginBottom: 8, fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
            Impossible de charger plus de lieux. Vérifie ta connexion.
          </Text>
          <TouchableOpacity
            onPress={handleRetryLoadMore}
            style={{ backgroundColor: '#00c2cb', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Message de fin : seulement si on a vraiment atteint le plafond (50) OU
    // si le backend a confirmé qu'il n'y a plus rien à servir (`!hasMore`) ET
    // que la fenêtre courante couvre déjà tout le buffer local.
    const reachedCap = displayLimit >= MAX_LOCATIONS && visibleItems.length >= MAX_LOCATIONS;
    const exhausted = !hasMore && visibleItems.length >= pulseItems.length && pulseItems.length > 0;
    if (reachedCap || exhausted) {
      return (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic' }}>
            Vous avez exploré tous les lieux actifs à proximité. Déplacez-vous ou faites une recherche pour en voir
            plus.
          </Text>
        </View>
      );
    }
    return null;
  };

  // "Mis en avant" (sponsorisés, scroll horizontal) + "Ça bouge maintenant"
  // (top visiteurs) : rendus en ListHeaderComponent de la FlatList principale
  // ("D'autres lieux pour toi"), pour conserver la virtualisation/pagination
  // existante sur la plus grosse liste tout en gardant un seul scroll global.
  // En mode "sun", colors.accent (cyan/bleu) manque de contraste sur le
  // fond bleu de DaySkyBackground : on bascule sur du blanc, lisible sur
  // le ciel bleu comme sur le ciel nocturne.
  const sectionTitleColor = isMoon ? colors.accent : '#ffffff';

  const renderListSectionsHeader = () => {
    if (viewMode === 'map') return null;
    if (sponsoredItems.length === 0 && trendingItems.length === 0 && otherItems.length === 0) return null;
    return (
      <View>
        {sponsoredItems.length > 0 && (
          <View style={[styles.sectionContainer, styles.sponsoredSectionContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.16)' }]}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Mis en avant</Text>
            {sponsoredItems.length === 1 ? (
              // Un seul item dans un FlatList horizontal de 280px laisse un grand vide
              // à droite (l'écran ne fait presque jamais 280px de large) : on l'affiche
              // en carte pleine largeur, comme le reste de la liste, plutôt qu'en scroll
              // horizontal qui n'a de sens qu'avec plusieurs items à faire défiler.
              <LocationItem item={sponsoredItems[0]} index={0} />
            ) : (
              <FlatList
                ref={sponsoredListRef}
                data={sponsoredItems}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => `sponsored-${item._id || item.osmId || item.name}`}
                renderItem={({ item, index }) => (
                  <View style={styles.horizontalCardWrapper}>
                    <LocationItem item={item} index={index} />
                  </View>
                )}
                contentContainerStyle={{ paddingRight: 20 }}
                onScrollToIndexFailed={handleSponsoredScrollToIndexFailed}
                onMomentumScrollEnd={(e) => {
                  // Resynchronise l'index de l'auto-scroll sur la position réelle
                  // après un scroll manuel, pour que le prochain saut auto-scroll
                  // reparte de là où l'utilisateur a laissé le carousel plutôt que
                  // de sauter en arrière à l'ancien index.
                  const itemWidth = styles.horizontalCardWrapper.width + styles.horizontalCardWrapper.marginRight;
                  const index = Math.round(e.nativeEvent.contentOffset.x / itemWidth);
                  sponsoredScrollIndexRef.current = Math.max(0, Math.min(index, sponsoredItems.length - 1));
                }}
                onTouchStart={() => {
                  // onTouchStart précède tout mouvement, donc précède
                  // l'évaluation de onMoveShouldSetPanResponderCapture du
                  // swiper de navigation (cf. MainSwiper.js) : lockSwiper()
                  // doit être posé ici et non sur onScrollBeginDrag, qui ne se
                  // déclenche qu'après que le geste a déjà pu être capturé par
                  // le parent (pattern repris de LocationMapView.js).
                  if (sponsoredTouchActiveRef.current) return;
                  sponsoredTouchActiveRef.current = true;
                  stopSponsoredAutoScroll();
                  lockSwiper();
                }}
                onTouchEnd={() => {
                  sponsoredTouchActiveRef.current = false;
                  unlockSwiper();
                  startSponsoredAutoScroll();
                }}
                onTouchCancel={() => {
                  sponsoredTouchActiveRef.current = false;
                  unlockSwiper();
                  startSponsoredAutoScroll();
                }}
              />
            )}
          </View>
        )}
        {trendingItems.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Ça bouge maintenant</Text>
            {trendingItems.map((item, index) => (
              <LocationItem key={item._id || item.osmId || item.name} item={item} index={index} />
            ))}
          </View>
        )}
        {otherItems.length > 0 && trendingItems.length > 0 && (
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>D'autres lieux pour toi</Text>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          paddingTop: insets.top + 10,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          elevation: isDark ? 0 : 5,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 10,
          borderBottomWidth: isDark ? 1 : 0,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent',
        },
      ]}
    >
      <Text style={[styles.headerTitle, { color: '#00c2cb', flex: 1 }]} numberOfLines={1}>
        Lieux à proximité
      </Text>
      <View style={styles.headerIcons}>
        <TouchableOpacity
          onPress={handleToggleCheckInMode}
          disabled={togglingCheckInMode}
          style={[styles.checkInModeToggle, { opacity: togglingCheckInMode ? 0.6 : 1 }]}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          accessibilityLabel={
            checkInMode === 'auto' ? 'Passer en check-in manuel' : 'Passer en check-in automatique'
          }
        >
          <Ionicons
            name={checkInMode === 'auto' ? 'radio-button-on-outline' : 'hand-left-outline'}
            size={16}
            color="#00c2cb"
          />
          <Text style={styles.checkInModeToggleText}>{checkInMode === 'auto' ? 'Auto' : 'Manuel'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleViewMode}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          accessibilityLabel={viewMode === 'list' ? 'Voir la carte' : 'Voir la liste'}
        >
          <Ionicons name={viewMode === 'list' ? 'map-outline' : 'list-outline'} size={22} color="#00c2cb" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Fond cohérent avec la vibe (même palette que l'interstitiel) */}
      {isMoon ? <NightSkyBackground style={skyFillStyle} /> : <DaySkyBackground style={skyFillStyle} />}
      <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]}>
        {renderHeader()}
        {invisibleModeBlocking ? (
          <View style={styles.invisibleModeContainer}>
            <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🕶️</Text>
            <Text
              style={[
                styles.emptyText,
                { color: colors.textPrimary, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' },
              ]}
            >
              Mode invisible actif
            </Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
              Tu ne peux pas voir les lieux autour de toi tant que le mode invisible est activé. Désactive-le pour
              parcourir les lieux.
            </Text>
            <TouchableOpacity
              disabled={disablingInvisibleMode}
              onPress={async () => {
                if (disablingInvisibleMode) return;
                setDisablingInvisibleMode(true);
                try {
                  await apiUpdateInvisibleMode(false);
                  updateUser?.({ ...currentUser, invisibleMode: false });
                  setInvisibleModeBlocking(false);
                  fetchNearbyLocations({ vibe });
                } catch (e) {
                  console.warn('[LocationListScreen] apiUpdateInvisibleMode failed', e?.message || e);
                  Alert.alert('Erreur', 'Impossible de désactiver le mode invisible pour l’instant.');
                } finally {
                  setDisablingInvisibleMode(false);
                }
              }}
              style={{
                backgroundColor: '#00c2cb',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 10,
                opacity: disablingInvisibleMode ? 0.6 : 1,
              }}
            >
              {disablingInvisibleMode ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>Désactiver le mode invisible</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : loading && !refreshing ? (
          <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
        ) : locationError ? (
          <ScrollView
            contentContainerStyle={[
              styles.listContent,
              { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#00c2cb']}
                progressViewOffset={10}
              />
            }
            alwaysBounceVertical
            bounces
            overScrollMode="always"
          >
            <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>📍</Text>
            <Text
              style={[
                styles.emptyText,
                { color: colors.textPrimary, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' },
              ]}
            >
              Localisation indisponible
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: 20,
                paddingHorizontal: 32,
                lineHeight: 20,
              }}
            >
              Active les services de localisation dans les réglages de ton appareil pour voir les lieux autour de toi.
            </Text>
            <TouchableOpacity
              onPress={() => fetchNearbyLocations({ vibe })}
              style={{ backgroundColor: '#00c2cb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Réessayer</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : viewMode === 'map' ? null : visibleItems.length === 0 ? (
          // Etat vide: permettre le pull-to-refresh même sans éléments
          <ScrollView
            contentContainerStyle={[
              styles.listContent,
              { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#00c2cb']}
                progressViewOffset={10}
              />
            }
            alwaysBounceVertical
            bounces
            overScrollMode="always"
          >
            <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🌙</Text>
            <Text
              style={[
                styles.emptyText,
                { color: colors.textPrimary, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' },
              ]}
            >
              Zone calme pour l'instant
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: 20,
                paddingHorizontal: 32,
                lineHeight: 20,
              }}
            >
              Aucun lieu actif n'a été repéré autour de toi. Élargis le périmètre ou propose un nouveau lieu.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  if (userCoords) {
                    OverpassService.fetchAround({
                      lat: userCoords.latitude,
                      lon: userCoords.longitude,
                      radius: 3000,
                      force: true,
                      vibe,
                    })
                      .then(setOsmPois)
                      .catch(() => {});
                  }
                }}
                style={{ backgroundColor: '#00c2cb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Élargir le périmètre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  /* future: suggestion flow */
                }}
                style={{
                  backgroundColor: colors.surface,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#eaeaea',
                }}
              >
                <Text style={{ color: colors.textPrimary }}>Suggérer ce lieu</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={otherItems}
            keyExtractor={(item) => item._id || item.osmId || String(item.name)}
            renderItem={renderLocation}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScroll={(event) => {
              currentScrollOffset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#00c2cb']}
                // Décale le spinner sous l'en‑tête sur Android si besoin
                progressViewOffset={10}
              />
            }
            // Optimization for performance
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={Platform.OS === 'android'}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={renderListSectionsHeader}
            ListFooterComponent={renderListFooter}
            // Assure le tirage pour rafraîchir même s'il y a peu d'éléments
            contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: insets.bottom + 20 }]}
            // Hérite des props ScrollView pour un meilleur comportement cross‑plateforme
            bounces
            overScrollMode="always"
          />
        )}
        {hasShownMap ? (
          <View
            style={[StyleSheet.absoluteFill, { display: viewMode === 'map' ? 'flex' : 'none' }]}
            pointerEvents={viewMode === 'map' ? 'auto' : 'none'}
          >
            <LocationMapView
              locations={mapVisibleItems}
              currentLocation={userCoords}
              currentPoiId={currentUser?.currentPoiId}
              isMoon={isMoon}
              onSelectLocation={handleSelectLocation}
              onViewportChange={handleMapViewportChange}
              onClusterOpen={handleClusterOpen}
            />
          </View>
        ) : null}
      </SafeAreaView>
      <VibeFAB />
      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
      <NearbyLocationPicker
        visible={!!placePicker}
        lat={placePicker?.lat}
        lon={placePicker?.lon}
        onSelect={handleSelectCorrectedPlace}
        onClose={() => setPlacePicker(null)}
      />
      <ClusterPickerModal
        visible={!!clusterPickerItems}
        locations={clusterPickerItems}
        onSelect={handleClusterPickerSelect}
        onClose={() => setClusterPickerItems(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.85 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { padding: 20 },
  locationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  locationInfo: { flex: 1 },
  locationHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  locationName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, flex: 1, marginRight: 8 },
  distanceText: { fontSize: 13, fontWeight: '600' },
  typeBadge: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  typeBadgeDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  typeText: { color: '#00c2cb', fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeTextDark: { color: '#fff' },
  activeUsersContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  usersCountText: { fontSize: 13, marginRight: 10, fontWeight: '500' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
  },
  smallAvatar: { width: '100%', height: '100%' },
  statusDotSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  popularityContainer: { alignItems: 'flex-end', marginLeft: 12 },
  popularityStars: { fontSize: 18 },
  emptyText: { textAlign: 'center', fontSize: 16, fontWeight: '500' },
  proBannerContainer: {
    marginBottom: 48,
  },
  proBanner: {
    width: '100%',
    height: 100,
    borderRadius: 12,
  },
  proLogoOverlap: {
    position: 'absolute',
    bottom: -36,
    left: 12,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  proLogoInline: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    marginBottom: 12,
  },
  verifiedBadge: {
    backgroundColor: '#00c2cb',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  verifiedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  sponsoredBadge: {
    backgroundColor: '#FF3DAD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: 8,
  },
  sponsoredText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  manualCheckinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#00c2cb',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 10,
    gap: 6,
  },
  manualCheckinButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  sectionContainer: {
    marginBottom: 8,
  },
  sponsoredSectionContainer: {
    marginBottom: 20,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  horizontalCardWrapper: {
    width: 280,
    marginRight: 14,
  },
  checkInModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    marginRight: 8,
    gap: 4,
  },
  checkInModeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00c2cb',
  },
  invisibleModeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});

export default LocationListScreen;
