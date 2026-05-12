import React, { useEffect, useState, useContext, useMemo, useRef } from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
  Platform,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { getLocations, updateMyLocation, seedOsmLocation } from '../components/ApiRequest';
import { subscribe } from '../components/EventBus';
import { formatLocationType } from '../components/LocationUtils';
import { calculateDistance, formatDistance } from '../components/ServerUtils';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AnimatedGradientBorder from '../components/AnimatedGradientBorder';
import { OverpassService, isTypeAllowedForVibe } from '../services/OverpassService';

const LocationListScreen = ({ onSelectLocation, onReturnToAccount, onSearchPeople, initialScrollOffset = 0, onScroll }) => {
  const { colors, isDark } = useTheme();
  const { isMoon, vibe, transitioningTo } = useVibe();
  const insets = useSafeAreaInsets();
  const skyFillStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -insets.top,
    bottom: -insets.bottom,
  };
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]); // backend locations
  const [osmPois, setOsmPois] = useState([]); // overpass locations
  const [filteredOsmPois, setFilteredOsmPois] = useState([]); // vibe-filtered OSM
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  // Pagination des lieux backend : minimum 20, on charge +10 quand l'utilisateur
  // atteint le bas de la liste, jusqu'à un plafond de 50 (cf. backend `limit`).
  const MIN_LOCATIONS = 20;
  const MAX_LOCATIONS = 50;
  const LOCATIONS_STEP = 10;
  const [displayLimit, setDisplayLimit] = useState(MIN_LOCATIONS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // `hasMore` indique si le backend peut encore renvoyer des lieux supplémentaires.
  // Dès qu'une requête retourne moins de `limit` résultats, on sait qu'on a vidé
  // la zone et il est inutile de continuer à incrémenter `displayLimit`.
  // Cela évite l'affichage prématuré du message « Vous avez exploré tous les
  // lieux actifs à proximité » lorsque la DB locale est peu peuplée.
  const [hasMore, setHasMore] = useState(true);
  const { user: currentUser } = useContext(UserContext);
  const flatListRef = useRef(null);
  const currentScrollOffset = useRef(0);

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
        }
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
        const next = Array.isArray(osmPois) ? osmPois.filter(p => isTypeAllowedForVibe(p?.type, vibe)) : [];
        setFilteredOsmPois(next);
      } catch (_) {}
    };

    // Defer heavy filtering until after transition animations
    if (transitioningTo) {
      const handle = InteractionManager.runAfterInteractions(task);
      return () => { try { handle?.cancel?.(); } catch (_) {} };
    }
    task();
  }, [osmPois, vibe, transitioningTo]);

  // Locations backend : le filtre par vibe est désormais entièrement délégué au
  // backend (`TYPES_BY_VIBE` + élargissement progressif du rayon + remplissage
  // jusqu'au minimum requis). On NE re-filtre PAS ici côté client, sinon on
  // exclurait les lieux de remplissage que le backend a ajoutés pour garantir
  // les 20 lieux minimum demandés par l'utilisateur, quelle que soit la vibe.
  const filteredLocations = useMemo(() => {
    return Array.isArray(locations) ? locations : [];
  }, [locations]);

  const locationsWithDistance = useMemo(() => {
    const merged = [...filteredLocations, ...filteredOsmPois].reduce((acc, it) => {
      const key = it?._id || `${it?.osmId}`;
      if (!key) return acc;
      if (acc.map.has(key)) return acc; // dedupe
      acc.map.set(key, it);
      acc.list.push(it);
      return acc;
    }, { map: new Map(), list: [] }).list;

    if (!userCoords) return merged;

    return merged.map(loc => {
      const distance = calculateDistance(
        userCoords.latitude,
        userCoords.longitude,
        loc.location.coordinates[1],
        loc.location.coordinates[0]
      );
      return { ...loc, distance };
    });
  }, [filteredLocations, filteredOsmPois, userCoords]);

  // PulseList ordering by vibe.
  // Règle de tri stricte (Spec §4) : Priorité aux lieux Étoilés (Pro) > Proximité géographique.
  // Les lieux "Pro" sont identifiés par `isPromoted` OU `stars >= 2` (étoilés persistants).
  const pulseItems = useMemo(() => {
    const items = [...locationsWithDistance];
    const greenCount = (it) => {
      if (Array.isArray(it?.activeUsers)) return it.activeUsers.filter(u => (u?.status || 'green') === 'green').length;
      const uc = it?.userCount || 0; return uc;
    };

    // Client-side priority by vibe (category boost)
    const dayBoost = new Set(['coworking_space','cafe','gym','library']);
    const nightBoost = new Set(['bar','pub','nightclub','restaurant']);
    const neutral = new Set(['cinema','fast_food']);
    const boosted = (it) => {
      const t = it?.type || '';
      if ((isMoon ? nightBoost : dayBoost).has(t)) return 2; // strong boost
      if (neutral.has(t)) return 1; // light boost appears after strong
      return 0;
    };

    const isPro = (it) => !!it?.isPromoted || (typeof it?.stars === 'number' && it.stars >= 2);

    // Partition: Pro/étoilés en tête, triés par étoiles puis proximité
    const featured = items
      .filter(isPro)
      .sort((a, b) => (b.stars || 0) - (a.stars || 0) || (a.distance || 0) - (b.distance || 0));
    const nonFeatured = items.filter(it => !isPro(it));
    const hotspots = nonFeatured
      .filter(it => greenCount(it) > 0)
      .sort((a,b) => greenCount(b) - greenCount(a) || (a.distance||0) - (b.distance||0));
    const exploration = nonFeatured
      .filter(it => greenCount(it) === 0)
      .sort((a,b) => boosted(b) - boosted(a) || (a.distance||0) - (b.distance||0));

    // Mark first two featured for tall style
    const featuredMarked = featured.map((it, idx) => idx < 2 ? { ...it, _featuredRank: idx + 1 } : it);

    return [...featuredMarked, ...hotspots, ...exploration];
  }, [locationsWithDistance, isMoon]);

  // Liste effectivement affichée : on borne au `displayLimit` courant pour
  // respecter l'infinite scroll (20 → 30 → 40 → 50 max).
  const visibleItems = useMemo(() => {
    return pulseItems.slice(0, Math.min(displayLimit, MAX_LOCATIONS));
  }, [pulseItems, displayLimit]);

  // Reset de la pagination à chaque changement de Vibe (Soleil/Lune).
  // Spec §2: le compteur revient à 20 et la liste se reconstruit pendant
  // l'écran de chargement de 8s déclenché par VibeFAB.
  const prevVibeRef = useRef(vibe);
  useEffect(() => {
    if (prevVibeRef.current !== vibe) {
      prevVibeRef.current = vibe;
      setDisplayLimit(MIN_LOCATIONS);
      setLoadingMore(false);
      setLoadMoreError(false);
      setHasMore(true);
      // Recharger les 20 lieux prioritaires correspondant aux tags du nouveau mode
      fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, limit: MIN_LOCATIONS });
      // Remonter en haut de liste
      try { flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false }); } catch (_) {}
    }
  }, [vibe]);

  // Suivi de visibilité pour stopper les animations hors‑écran
  const visibleSetRef = useRef(new Set());
  const [visibleTick, setVisibleTick] = useState(0);
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const set = visibleSetRef.current;
    const next = new Set();
    (viewableItems || []).forEach(v => {
      if (typeof v?.index === 'number') next.add(v.index);
    });
    // remplacer le set
    visibleSetRef.current = next;
    setVisibleTick(t => t + 1);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const LocationItem = useMemo(() => {
    return React.memo(({ item, index }) => {
      const isUserHere = item._id === currentUser?.currentPoiId;
      const green = Array.isArray(item?.activeUsers)
        ? item.activeUsers.filter(u => (u?.status || 'green') === 'green').length
        : (item?.userCount || 0);

      const card = (
        <TouchableOpacity
          style={[
            styles.locationCard,
            { backgroundColor: colors.surface, marginBottom: isUserHere ? 0 : 16,
              borderWidth: isMoon ? 1.5 : 0,
              borderColor: isMoon ? 'rgba(255,45,168,0.35)' : 'transparent',
              shadowColor: isMoon ? '#2dbdff' : '#000',
              shadowOpacity: isMoon ? 0.45 : (isDark ? 0.2 : 0.08),
            }
          ]}
          onPress={async () => {
            onScroll && onScroll(currentScrollOffset.current);
            // POI Overpass non persisté: on l'upsert en base avant d'ouvrir l'écran
            // de détail pour éviter un 404/500 sur `getLocationById('osm:*')`.
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
                    onSelectLocation({ ...item, ...seeded });
                    return;
                  }
                }
              } catch (e) {
                // En cas d'erreur (type non supporté, réseau, etc.), on retombe
                // sur le comportement standard: la nav passera l'id `osm:*` et
                // le backend renverra un 404 propre.
                console.warn('[LocationListScreen] seedOsmLocation failed:', e?.message || e);
              }
            }
            onSelectLocation({ ...item });
          }}
        >
          <View style={styles.locationInfo}>
            <View style={styles.locationHeaderRow}>
              <Text style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.text }]}>{item.name}</Text>
              {isUserHere ? (
                <Text style={[styles.distanceText, { color: '#00c2cb', fontWeight: '600' }]}>
                  Actuellement ici
                </Text>
              ) : (
                item.distance !== undefined && (
                  <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                    {formatDistance(item.distance)}
                  </Text>
                )
              )}
            </View>
            <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
              <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(item.type)}</Text>
            </View>
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {green > 0 ? `${green} personne${green>1?'s':''} prête${green>1?'s':''} à discuter ici` : 'Découvre ce lieu'}
              </Text>
            </View>
            <View style={styles.activeUsersContainer}>
              <Text style={[styles.usersCountText, { color: colors.textSecondary }]}>
                {item.userCount || 0} visiteur{(item.userCount || 0) > 1 ? 's' : ''}
              </Text>
              <View style={styles.avatarStack}>
                {(item.activeUsers || []).map((u, index) => {
                  const isUserBoosted = u.boostUntil && new Date(u.boostUntil) > new Date();
                  const isGhost = u.location && u.location.updatedAt && new Date(u.location.updatedAt) < new Date(Date.now() - 5 * 60 * 1000) && isUserBoosted;

                  return (
                    <View key={u._id} style={[styles.avatarWrapper, {
                      marginLeft: index === 0 ? 0 : -12,
                      borderColor: isUserBoosted ? '#FFD700' : colors.surface,
                      backgroundColor: isDark ? '#333' : '#eee',
                      opacity: isGhost ? 0.6 : 1,
                      borderWidth: isUserBoosted ? 1.5 : 1
                    }]}>
                      <ImageWithPlaceholder
                        uri={u.profileImageUrl}
                        style={styles.smallAvatar}
                      />
                      <View style={[styles.statusDotSmall, {
                        backgroundColor: u.status === 'green' ? '#4CAF50' : '#FF9800',
                        borderColor: colors.surface
                      }]} />
                    </View>
                  );
                })}
              </View>
            </View>
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
          <AnimatedGradientBorder borderRadius={20} index={index} active={isActive} marginBottom={16} colors={["#ff2da8", "#2dbdff", "#ff2da8", "#2dbdff", "#ff2da8"]}>
            {card}
          </AnimatedGradientBorder>
        );
      }

      return card;
    });
  }, [colors, isDark, onSelectLocation, onScroll, currentUser?.currentPoiId]);

  const renderLocation = ({ item, index }) => <LocationItem item={item} index={index} />;

  // Fetch Overpass on significant coordinate changes only (~110m, 3 decimals).
  // The service itself enforces a time-based throttle + failure backoff.
  const roundedLat = userCoords ? Math.round(userCoords.latitude * 1000) / 1000 : null;
  const roundedLon = userCoords ? Math.round(userCoords.longitude * 1000) / 1000 : null;
  useEffect(() => {
    (async () => {
      if (roundedLat == null || roundedLon == null) return;
      try {
        const pois = await OverpassService.fetchAround({ lat: roundedLat, lon: roundedLon, radius: 1500, vibe });
        setOsmPois(pois);
      } catch (_) {}
    })();
  }, [roundedLat, roundedLon, vibe]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Seuleument capturer si le mouvement est principalement horizontal
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          // Swipe vers la droite -> SearchView
          onSearchPeople && onSearchPeople();
        } else if (gestureState.dx < -50) {
          // Swipe vers la gauche -> MyAccountScreen
          onReturnToAccount && onReturnToAccount();
        }
      },
    })
  ).current;

  // Important: do not intercept horizontal gestures here so that
  // the parent navigator can handle global swipes (Search / MyAccount).

  useEffect(() => {
    fetchNearbyLocations();

    // Listen for mutations that should trigger a refresh
    const unsub = subscribe('api:mutation', ({ path }) => {
      // Rafraîchir la liste suite aux mutations liées à la position MAIS sans renvoyer un POST
      // pour éviter une boucle infinie (mitraillette à requêtes).
      if (path && (path.includes('/users/location') || path.includes('/user/location') || path.includes('/user/heartbeat'))) {
        fetchNearbyLocations({ skipUpdateMyLocation: true });
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (initialScrollOffset > 0 && flatListRef.current && locations.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false });
      }, 100);
    }
  }, [locations.length]);


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
    return <Text style={{ color: starIsDark ? '#FFFFFF' : '#ccc', opacity: starIsDark ? 0.3 : 1, fontSize: 18 }}>★</Text>;
  };

  const fetchNearbyLocations = async (options = {}) => {
    const { skipUpdateMyLocation = false, silent = false } = options;
    try {
      if (!silent) setLoading(true);
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permission to access location was denied');
        return;
      }

      // Optimization for Android: high accuracy can be slow.
      // Using balanced accuracy and a timeout to ensure quick feedback.
      let location;
      try {
        // First try to get last known location for immediate feedback if available
        location = await Location.getLastKnownPositionAsync({});

        // Then start fetching fresh location in the background if last known is old or null
        // On Android, getCurrentPositionAsync is much faster with a timeout and lower accuracy.
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).then(loc => {
          if (loc && (!location || loc.timestamp > location.timestamp)) {
             // If we already finished loading but got a better location,
             // we could trigger a silent refresh here if we wanted.
          }
        }).catch(() => {});
      } catch (err) {
        console.warn('Location fetching logic error', err);
      }

      if (!location) {
        // Fallback to a slow but sure high accuracy if nothing else worked
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 5000,
          });
        } catch (e) {
          console.warn('Final fallback failed', e);
        }
      }

      if (!location) {
        console.warn('Could not determine position');
        return;
      }

      const { latitude, longitude } = location.coords;
      setUserCoords({ latitude, longitude });

      // En fonction de l'origine de l'appel, on peut éviter d'envoyer un POST /users/location
      // pour casser toute boucle de rafraîchissement.
      let res;
      const reqLimit = options.limit || displayLimit;
      if (skipUpdateMyLocation) {
        res = await getLocations({ lat: latitude, lon: longitude, limit: reqLimit, vibe });
      } else {
        const results = await Promise.all([
          updateMyLocation({ lat: latitude, lon: longitude }).catch(err => console.error('Error updating my location:', err)),
          getLocations({ lat: latitude, lon: longitude, limit: reqLimit, vibe })
        ]);
        res = results[1];
      }

      if (res && Array.isArray(res.locations)) {
        // Garde-fou UI: appliquer le même filtrage que le backend
        // et garantir au moins 1★ d'affichage lorsqu'un lieu est occupé
        const normalized = res.locations.map((it) => {
          const userCount = it?.userCount || 0;
          const stars = typeof it?.stars === 'number' ? it.stars : parseInt(it?.stars, 10) || 0;
          // Un lieu avec popularity >= 1000 reste considéré comme persistent (3 étoiles)
          const isPersistent = (it?.popularity || 0) >= 1000 || stars === 3;
          return { ...it, stars, userCount, isPersistent };
        });

        // Plus de filtrage restrictif ici, le backend a déjà fait le travail de sélection
        setLocations(normalized);
        // Si le backend renvoie moins de `reqLimit` lieux, c'est qu'on a vidé
        // la zone : on coupe la pagination pour éviter les requêtes inutiles
        // et l'affichage prématuré du message de fin de liste.
        setHasMore(normalized.length >= reqLimit && reqLimit < MAX_LOCATIONS);
      }

      // Overpass OSM fetch with throttle (catégories dépendantes du vibe)
      try {
        const pois = await OverpassService.fetchAround({ lat: latitude, lon: longitude, radius: 1500, vibe });
        setOsmPois(pois);
      } catch (_) {}
    } catch (e) {
      console.error('Error fetching locations:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setDisplayLimit(MIN_LOCATIONS);
    await fetchNearbyLocations({ limit: MIN_LOCATIONS });
    setRefreshing(false);
  };

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
    setTimeout(() => { handleLoadMore(); }, 0);
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
            Vous avez exploré tous les lieux actifs à proximité. Déplacez-vous ou faites une recherche pour en voir plus.
          </Text>
        </View>
      );
    }
    return null;
  };


  const renderHeader = () => (
    <View style={[
      styles.header,
      {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: isDark ? 0 : 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 10,
        borderBottomWidth: isDark ? 1 : 0,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent'
      }
    ]}>
      <Text style={[styles.headerTitle, { color: '#00c2cb', flex: 1 }]} numberOfLines={1}>Lieux à proximité</Text>
      <View style={styles.headerIcons}>
        <TouchableOpacity
          onPress={() => onSearchPeople && onSearchPeople()}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          accessibilityLabel="Rechercher"
        >
          <Text style={{ fontSize: 22 }}>🔎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onReturnToAccount}
          style={styles.headerProfileButton}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          accessibilityLabel="Mon compte"
        >
          <Image source={require('../assets/appIcons/userProfile.png')} style={[styles.profileIcon, { tintColor: '#00c2cb' }]} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Fond cohérent avec la vibe (même palette que l’interstitiel) */}
      {isMoon ? (
        <NightSkyBackground style={skyFillStyle} />
      ) : (
        <DaySkyBackground style={skyFillStyle} />
      )}
      <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]} {...panResponder.panHandlers}>
        {renderHeader()}
        {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
      ) : visibleItems.length === 0 ? (
        // Etat vide: permettre le pull-to-refresh même sans éléments
        <ScrollView
          contentContainerStyle={[styles.listContent, { flexGrow: 1, justifyContent: 'center', alignItems: 'center' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00c2cb"]} progressViewOffset={10} />}
          alwaysBounceVertical
          bounces
          overScrollMode="always"
        >
          <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>🌙</Text>
          <Text style={[styles.emptyText, { color: colors.text, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' }]}>Zone calme pour l’instant</Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32, lineHeight: 20 }}>
            Aucun lieu actif n’a été repéré autour de toi. Élargis le périmètre ou propose un nouveau lieu.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => {
              if (userCoords) {
                OverpassService.fetchAround({ lat: userCoords.latitude, lon: userCoords.longitude, radius: 3000, force: true, vibe }).then(setOsmPois).catch(()=>{});
              }
            }} style={{ backgroundColor: '#00c2cb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Élargir le périmètre</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { /* future: suggestion flow */ }} style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#eaeaea' }}>
              <Text style={{ color: colors.text }}>Suggérer ce lieu</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleItems}
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
              colors={["#00c2cb"]}
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
          ListFooterComponent={renderListFooter}
          // Assure le tirage pour rafraîchir même s'il y a peu d'éléments
          contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: insets.bottom + 20 }]}
          // Hérite des props ScrollView pour un meilleur comportement cross‑plateforme
          bounces
          overScrollMode="always"
        />
      )}
      </SafeAreaView>
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
    marginRight: 10
  },
  headerProfileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 194, 203, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIcon: { width: 24, height: 24 },
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
});

export default LocationListScreen;
