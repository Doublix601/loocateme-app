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
  Platform,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { getCurrentPositionSmart } from '../utils/locationHelper';
import { getLocations, updateMyLocation, seedOsmLocation, getUsersAroundMe } from '../components/ApiRequest';
import { subscribe, publish } from '../components/EventBus';
import PremiumNudgeService from '../services/PremiumNudgeService';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { formatLocationType } from '../components/LocationUtils';
import { calculateDistance, formatDistance } from '../components/ServerUtils';
import { UserContext } from '../components/contexts/UserContext';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AnimatedGradientBorder from '../components/AnimatedGradientBorder';
import { OverpassService, isTypeAllowedForVibe } from '../services/OverpassService';
import VibeFAB from '../components/VibeFAB';
import { useMainSwiper } from '../components/contexts/MainSwiperContext';

const LocationListScreen = () => {
  const navigation = useNavigation();
  const { goToPage } = useMainSwiper();
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
  const { user: currentUser } = useContext(UserContext);
  const { isPremium, premiumSystemEnabled } = usePremiumAccess();
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
      // Dédoublonnage robuste : on privilégie l'osmId s'il existe, sinon l'id MongoDB.
      // Cela permet de fusionner un lieu backend synchronisé (qui a un osmId)
      // avec son équivalent brut provenant d'Overpass.
      const key = it?.osmId ? `osm:${it.osmId}` : it?._id;
      if (!key) return acc;
      if (acc.map.has(key)) return acc; // dedupe
      acc.map.set(key, it);
      acc.list.push(it);
      return acc;
    }, { map: new Map(), list: [] }).list;

    if (!userCoords) return merged;

    return merged.map(loc => {
      const coords = loc?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return loc;
      const distance = calculateDistance(
        userCoords.latitude,
        userCoords.longitude,
        coords[1],
        coords[0]
      );
      return { ...loc, distance };
    });
  }, [filteredLocations, filteredOsmPois, userCoords]);

  // PulseList ordering: le lieu "Pro Boost" sponsorisé (renvoyé par le backend
  // avec isSponsored:true, un seul possible à la fois) est toujours épinglé en
  // tête, avant le tri normal par popularité (étoiles) puis distance croissante.
  // 3★ > 2★ > 1★ > 0★ ; à égalité d'étoiles on trie par distance.
  const pulseItems = useMemo(() => {
    const sorted = [...locationsWithDistance].sort((a, b) => {
      if (a.isSponsored && !b.isSponsored) return -1;
      if (b.isSponsored && !a.isSponsored) return 1;
      return (b.stars || 0) - (a.stars || 0) || (a.distance || 0) - (b.distance || 0);
    });
    // Mark first two high-rated items for tall card style
    let featuredCount = 0;
    return sorted.map((it) => {
      if (featuredCount < 2 && (it.stars || 0) >= 2) {
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
      fetchNearbyLocations({ skipUpdateMyLocation: true, silent: true, limit: MIN_LOCATIONS, vibe });
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
                    const merged = { ...item, ...seeded };
                    navigation.navigate('Location', { locationId: merged._id || merged.id, tertiles: merged.tertiles || null });
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
            navigation.navigate('Location', { locationId: item._id || item.id, tertiles: item.tertiles || null });
          }}
        >
          <View style={styles.locationInfo}>
            {item.isPro && (item.bannerUrl || item.logoUrl) && (
              <View style={item.bannerUrl ? styles.proBannerContainer : null}>
                {item.bannerUrl && (
                  <ImageWithPlaceholder
                    uri={item.bannerThumbUrl || item.bannerUrl}
                    style={styles.proBanner}
                  />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={[styles.locationName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}>{item.name}</Text>
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
  }, [colors, isDark, isMoon, navigation, currentUser?.currentPoiId]);

  const renderLocation = ({ item, index }) => <LocationItem item={item} index={index} />;

  // Fetch Overpass on significant coordinate changes only (~110m, 3 decimals).
  // The service itself enforces a time-based throttle + failure backoff.
  const roundedLat = userCoords ? Math.round(userCoords.latitude * 1000) / 1000 : null;
  const roundedLon = userCoords ? Math.round(userCoords.longitude * 1000) / 1000 : null;
  useEffect(() => {
    let active = true;
    (async () => {
      if (roundedLat == null || roundedLon == null) return;

      // On attend une frame pour laisser respirer l'UI
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!active) return;

      // Attendre que les interactions (animations) soient finies avant de charger Overpass
      // car c'est une requête lourde qui peut ralentir le thread JS au moment du rendu.
      await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
      if (!active) return;

      try {
        const pois = await OverpassService.fetchAround({ lat: roundedLat, lon: roundedLon, radius: 3000, vibe });
        if (active) setOsmPois(pois);
      } catch (_) {}
    })();
    return () => { active = false; };
  }, [roundedLat, roundedLon, vibe]);


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
    return <Text style={{ color: starIsDark ? '#FFFFFF' : '#ccc', opacity: starIsDark ? 0.3 : 1, fontSize: 18 }}>★</Text>;
  };

  const fetchNearbyLocations = async (options = {}) => {
    const { skipUpdateMyLocation = false, silent = false, vibe: overrideVibe } = options;
    const currentVibe = overrideVibe || vibe;
    try {
      if (!silent) setLoading(true);

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
        location = await getCurrentPositionSmart();
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

      setLocationError(false);
      const { latitude, longitude } = location.coords;
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
            const periodicNudge = await PremiumNudgeService.evaluate('periodic_home', { isPremium, premiumSystemEnabled });
            if (periodicNudge) publish('premium:nudge', periodicNudge);
          } catch (_) {
            // Signal purement observationnel : ne doit jamais impacter la liste principale.
          }
        })();
      }

      // 3. Lancer les requêtes API en parallèle
      const reqLimit = options.limit || displayLimit;
      const tasks = [];

      if (!skipUpdateMyLocation) {
        tasks.push(updateMyLocation({ lat: latitude, lon: longitude }).catch(err => console.error('Error updating my location:', err)));
      }

      tasks.push(getLocations({ lat: latitude, lon: longitude, limit: reqLimit, vibe: currentVibe }));

      const results = await Promise.all(tasks);
      // Si on n'a PAS skippé updateMyLocation, alors getLocations est le 2ème élément (index 1)
      // Sinon, c'est le 1er élément (index 0).
      const res = skipUpdateMyLocation ? results[0] : results[1];

      if (res && Array.isArray(res.locations)) {
        const normalized = res.locations.map((it) => {
          const userCount = it?.userCount || 0;
          const stars = typeof it?.stars === 'number' ? it.stars : parseInt(it?.stars, 10) || 0;
          const isPersistent = (it?.popularity || 0) >= 1000 || stars === 3;
          return { ...it, stars, userCount, isPersistent };
        });

        setLocations(normalized);
        setHasMore(normalized.length >= reqLimit && reqLimit < MAX_LOCATIONS);
      }

      // NOTE: On a supprimé l'appel OverpassService.fetchAround ici
      // car il est déjà géré par le useEffect([roundedLat, roundedLon, vibe])
      // qui se déclenchera suite au setUserCoords(...) ci-dessus.

    } catch (e) {
      console.error('Error fetching locations:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setDisplayLimit(MIN_LOCATIONS);
    await fetchNearbyLocations({ limit: MIN_LOCATIONS, vibe });
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
        paddingTop: insets.top + 10,
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
          onPress={() => goToPage(0)}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          accessibilityLabel="Rechercher"
        >
          <Text style={{ fontSize: 22 }}>🔎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => goToPage(2)}
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
      {/* Fond cohérent avec la vibe (même palette que l'interstitiel) */}
      {isMoon ? (
        <NightSkyBackground style={skyFillStyle} />
      ) : (
        <DaySkyBackground style={skyFillStyle} />
      )}
      <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]}>
        {renderHeader()}
        {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
      ) : locationError ? (
        <ScrollView
          contentContainerStyle={[styles.listContent, { flexGrow: 1, justifyContent: 'center', alignItems: 'center' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00c2cb"]} progressViewOffset={10} />}
          alwaysBounceVertical
          bounces
          overScrollMode="always"
        >
          <Text style={{ fontSize: 56, marginBottom: 12, opacity: 0.85 }}>📍</Text>
          <Text style={[styles.emptyText, { color: colors.textPrimary, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' }]}>Localisation indisponible</Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32, lineHeight: 20 }}>
            Active les services de localisation dans les réglages de ton appareil pour voir les lieux autour de toi.
          </Text>
          <TouchableOpacity onPress={() => fetchNearbyLocations({ vibe })} style={{ backgroundColor: '#00c2cb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Réessayer</Text>
          </TouchableOpacity>
        </ScrollView>
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
          <Text style={[styles.emptyText, { color: colors.textPrimary, textAlign: 'center', marginBottom: 6, fontSize: 18, fontWeight: '700' }]}>Zone calme pour l'instant</Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32, lineHeight: 20 }}>
            Aucun lieu actif n'a été repéré autour de toi. Élargis le périmètre ou propose un nouveau lieu.
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
              <Text style={{ color: colors.textPrimary }}>Suggérer ce lieu</Text>
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
      <VibeFAB />
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
});

export default LocationListScreen;
