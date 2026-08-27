import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import ImageView from 'react-native-image-viewing';
import EventVideoViewerModal from '../components/EventVideoViewerModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigation, useRoute } from '@react-navigation/native';
import { useVibe } from '../components/contexts/VibeContext';
import { UserContext } from '../components/contexts/UserContext';
import { formatLocationType, getLocationTypeEmoji } from '../components/LocationUtils';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useBoost } from '../hooks/useBoost';
import { useLocationData } from '../hooks/useLocationData';
import { useCrossedPaths } from '../hooks/useCrossedPaths';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { useNavigateToUser } from '../hooks/useNavigateToUser';
import StoryRingAvatar from '../components/StoryRingAvatar';
import StoryUnseenBubble from '../components/StoryUnseenBubble';
import StoryViewerModal from '../components/StoryViewerModal';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import ProfileCard from '../components/ProfileCard';
import UltraBoostProgressBar from '../components/UltraBoostProgressBar';
import CheckinVerifyModal from '../components/CheckinVerifyModal';
import * as Location from 'expo-location';
import { calculateDistance } from '../components/ServerUtils';
import { forceCheckIn, forceCheckOut } from '../components/ApiRequest';
import { cancelCheckinVerification, markCheckinVerified } from '../components/CheckinVerificationScheduler';
import {
  loadDevLocationOverride,
  getDevLocationOverride,
  subscribeDevLocationOverride,
} from '../utils/devLocationOverride';
import { suppressLocationHeartbeat } from '../utils/devLocationSuppression';
import { mapBackendUser } from '../utils/mappers';
import socialMediaIcons from '../constants/socialMediaIcons';
import { getPdfIconName } from '../constants/pdfIcons';
import { trackLocationView } from '../components/ApiRequest';

const ULTRA_BOOST_TARGET_MS = 20 * 60 * 1000;
const MANUAL_CHECKIN_DISTANCE_M = 50;
const MAX_PDF_MEDIA = 3;
// L'Android WebView ne sait pas rendre un PDF nativement (contrairement à
// WKWebView sur iOS) : on passe par la visionneuse Google Docs en lecture
// intégrée, ce qui évite de sortir vers un navigateur externe.
const pdfViewerUri = (url) =>
  Platform.OS === 'android' ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}` : url;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.34);

// Couleur hero par type de lieu (fond + fondu bas), pour les lieux sans photo
// de couverture (gratuits) — une couleur choisie pour évoquer le type plutôt
// qu'un dégradé générique. Clé = emoji renvoyé par getLocationTypeEmoji, qui
// normalise déjà les libellés backend (FR + emoji) et les clés OSM brutes.
const HERO_TYPE_COLORS = {
  '🍺': '#7B4B2A', // Bar — marron boisé (comptoir en bois)
  '🪩': '#6C3FA0', // Boîte de nuit — violet
  '🍴': '#D9552B', // Restaurant — rouge-orangé chaleureux
  '☕': '#B87333', // Café — caramel torréfié
  '🎬': '#C62828', // Cinéma — rouge
  '🎯': '#3D7DFF', // Loisir — bleu
  '🏋️': '#E8871E', // Salle de sport — orange
  '🌳': '#3A8F4A', // Parc — vert
  '🏖️': '#2FBFC4', // Plage — turquoise (mer)
  '🎢': '#E23DA0', // Parc d'attractions — magenta fête foraine
  '📚': '#34406B', // Bibliothèque — bleu nuit studieux
  '🏟️': '#1D9E75', // Centre sportif — vert stade
  '🎓': '#2C4A7C', // Éducation — bleu académique
  '🧑‍💻': '#4A5C7A', // Coworking — gris-bleu pro
  '🍦': '#F2789E', // Glacier — rose bonbon
  '🛒': '#C98A2B', // Marché — ocre/moutarde
  '🏛️': '#7A2E3A', // Musée — bordeaux
  '🥞': '#E0A835', // Brunch — miel doré
  '🌆': '#C15FA0', // Rooftop — rose/violet crépuscule
  '🎤': '#FF3D8B', // Karaoké — magenta néon
  '🎮': '#8A3FFF', // Club de jeux — violet arcade
  '🤖': '#6B6B6B', // Test — gris neutre
  '📍': '#5B6472', // Lieu / type inconnu — gris-bleu neutre
};

function getHeroTypeColor(type) {
  const emoji = getLocationTypeEmoji(type);
  return HERO_TYPE_COLORS[emoji] || HERO_TYPE_COLORS['📍'];
}

// Couleur du ciel à la hauteur où le hero se termine (~34% de l'écran),
// approximée depuis les dégradés de Day/NightSkyBackground (cf. render
// principal, qui affiche ces mêmes composants en fond de page) — le hero
// dégrade vers cette couleur en bas plutôt que vers la couleur du type
// jusqu'au bout, pour se fondre sans coupure nette dans le ciel visible
// juste en dessous.
const HERO_SKY_BOTTOM = { moon: '#10182B', sun: '#7DBBE8' };

/**
 * LocationScreen — Refonte radicale "Full-Height".
 *
 *  - Header immersif : image de couverture + gradient progressif.
 *  - Floating Info Card : nom, type, popularité, distance, qui chevauche le hero.
 *  - Liste de ProfileCards condensées (photo, bio, réseaux).
 *  - Bouton d'action fixe en bas avec BlurView.
 *  - Tout pilote par `useVibeTheme` (zéro `if (isMoon)` cosmétique éparpillé).
 */
const LocationScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { locationId, tertiles, scrollToEventId, openVerifyModal, initialLocation } = route.params ?? {};
  const navigateToUser = useNavigateToUser();

  const { isMoon } = useVibe();
  const { user, updateUser } = useContext(UserContext);
  const theme = useVibeTheme();
  const { palette, radius, spacing, shadows, typography } = theme;
  const insets = useSafeAreaInsets();

  const { checkAccess, storiesUnlocked, boostUnlocked, isPremium, premiumSystemEnabled } = useFeatureGate();
  const { activateBoost, isBoosted, loading: boostLoading } = useBoost();
  const { location, users, monthlyUsers, loading, refreshing, refresh } = useLocationData(
    locationId,
    initialLocation,
  );
  const {
    items: crossedItems,
    loading: crossedLoading,
    loadingMore: crossedLoadingMore,
    hasMore: crossedHasMore,
    loadMore: loadMoreCrossed,
  } = useCrossedPaths(locationId);
  const [storyViewerIndex, setStoryViewerIndex] = useState(null);
  const [lastStorySeenAt, setLastStorySeenAt] = useState(null);
  const [pdfViewer, setPdfViewer] = useState(null); // { url, title } | null
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  // Bouton "Je suis là" (cf. plan §2.4) : nécessite de connaître la distance
  // au lieu affiché. Toujours actif sur cet écran (pas seulement en mode de
  // check-in 'manuel') : contrairement à la liste des lieux, l'utilisateur a
  // déjà explicitement ouvert la page de CE lieu précis, donc un bouton de
  // secours pour confirmer manuellement sa présence a du sens même en mode
  // 'auto', par exemple si la détection GPS automatique tarde à se
  // déclencher. On ne watch le GPS que si ça peut réellement servir (pas déjà
  // check-in ici), pour ne pas consommer de batterie inutilement sur cet
  // écran par ailleurs statique côté position.
  const isUserHereForManualCheckin = !!(
    user?.currentPoiId &&
    locationId &&
    String(user.currentPoiId) === String(locationId)
  );
  const [manualCheckinCoords, setManualCheckinCoords] = useState(null);
  const [manualCheckinLoading, setManualCheckinLoading] = useState(false);
  const [manualCheckinSuccess, setManualCheckinSuccess] = useState(false);

  useEffect(() => {
    if (isUserHereForManualCheckin) return;
    let subscription;
    let offDevOverride;
    let cancelled = false;
    (async () => {
      // watchPositionAsync interroge directement l'OS et ne peut pas être
      // intercepté par l'override GPS de dev (cf. DevLocationOverride.js) —
      // même limitation, même contournement que hooks/usePresence.js. Sans
      // ça, la distance calculée ici ignore l'override alors que le reste de
      // l'app (liste des lieux, heartbeat) l'applique, ce qui désynchronise
      // ce bouton du reste de l'UI en dev.
      if (__DEV__) {
        await loadDevLocationOverride();
        const override = getDevLocationOverride();
        if (override) {
          setManualCheckinCoords({ latitude: override.latitude, longitude: override.longitude });
          offDevOverride = subscribeDevLocationOverride((next) => {
            if (!cancelled && next) setManualCheckinCoords({ latitude: next.latitude, longitude: next.longitude });
          });
          return;
        }
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (pos) => {
          if (!cancelled) {
            setManualCheckinCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          }
        },
      );
      // La permission/le watcher peuvent résoudre APRÈS que le composant se
      // soit démonté ou que l'effet ait été ré-exécuté (changement de
      // isUserHereForManualCheckin) : si `cancelled` est déjà
      // vrai à ce moment-là, la fonction de cleanup ci-dessous s'est déjà
      // exécutée et n'a rien pu retirer puisque `subscription` n'était pas
      // encore assignée — on retire donc immédiatement dans ce cas, sinon on
      // fuit un watcher GPS natif actif en continu (jamais nettoyé).
      if (cancelled) {
        try {
          sub.remove();
        } catch (_) {}
      } else {
        subscription = sub;
      }
    })();
    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
      if (offDevOverride) offDevOverride();
    };
  }, [isUserHereForManualCheckin]);

  const distanceToLocation = useMemo(() => {
    if (!manualCheckinCoords || !location?.location?.coordinates) return null;
    const [lon, lat] = location.location.coordinates;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    return calculateDistance(manualCheckinCoords.latitude, manualCheckinCoords.longitude, lat, lon);
  }, [manualCheckinCoords, location]);

  const showManualCheckinButton =
    !isUserHereForManualCheckin &&
    typeof distanceToLocation === 'number' &&
    distanceToLocation <= MANUAL_CHECKIN_DISTANCE_M;

  const handleManualCheckin = async () => {
    if (manualCheckinLoading || !manualCheckinCoords || !locationId) return;
    setManualCheckinLoading(true);
    try {
      const res = await forceCheckIn({
        locationId,
        lat: manualCheckinCoords.latitude,
        lon: manualCheckinCoords.longitude,
        mode: 'manual',
      });
      if (res?.user) updateUser(mapBackendUser(res.user));
      setManualCheckinSuccess(true);
      setTimeout(() => setManualCheckinSuccess(false), 2500);
      refresh();
    } catch (e) {
      console.warn('[LocationScreen] handleManualCheckin failed', e?.message || e);
      // RATE_LIMITED est déjà affiché par la modale globale (cf. App.js,
      // événement 'location_rate_limited' publié depuis ApiRequest.js) : ne
      // pas doubler avec cette Alert générique.
      if (e?.code !== 'RATE_LIMITED') {
        Alert.alert(t('locationScreen.checkinErrorTitle'), e?.message || t('locationScreen.checkinErrorMessage'));
      }
    } finally {
      setManualCheckinLoading(false);
    }
  };

  // Événements créés par le pro (palier pro2+, cf. dashboard business) :
  // affichés tant que non expirés. Plusieurs événements peuvent coexister.
  // L'Event Boost (palier pro3+) ne fait qu'envoyer une notification pour
  // l'un d'eux, il ne crée pas de contenu séparé.
  const activeEvents = useMemo(() => {
    const now = Date.now();
    return (location?.events || []).filter((e) => !e.expiresAt || new Date(e.expiresAt).getTime() > now);
  }, [location?.events]);

  const scrollViewRef = useRef(null);
  const eventSectionRefs = useRef({});
  const [hasScrolledToEvent, setHasScrolledToEvent] = useState(false);

  useEffect(() => {
    if (!scrollToEventId || hasScrolledToEvent || activeEvents.length === 0) return;
    // Les positions ne sont mesurées qu'après le premier layout : on retente
    // brièvement le temps que la section événements soit rendue et mesurée.
    const timer = setInterval(() => {
      const targetY = eventSectionRefs.current[scrollToEventId] ?? eventSectionRefs.current[activeEvents[0]._id];
      if (targetY != null && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: Math.max(targetY - 16, 0), animated: true });
        setHasScrolledToEvent(true);
        clearInterval(timer);
      }
    }, 150);
    const timeout = setTimeout(() => clearInterval(timer), 3000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [scrollToEventId, hasScrolledToEvent, activeEvents]);

  // Suivi "vu/non vu" des stories du lieu (persisté localement, façon Instagram :
  // anneau dégradé tant qu'une story plus récente que la dernière consultation existe).
  useEffect(() => {
    if (!locationId) return;
    AsyncStorage.getItem(`story_seen_${locationId}`)
      .then(setLastStorySeenAt)
      .catch(() => {});
  }, [locationId]);

  const markStoriesSeen = () => {
    if (!locationId) return;
    const now = new Date().toISOString();
    setLastStorySeenAt(now);
    AsyncStorage.setItem(`story_seen_${locationId}`, now).catch(() => {});
  };

  const openStoryViewer = (index) => setStoryViewerIndex(index);
  const closeStoryViewer = () => {
    setStoryViewerIndex(null);
    markStoriesSeen();
  };

  // Alimente les statistiques de fréquentation des lieux pro (vues sur 1/7/30j)
  useEffect(() => {
    if (!locationId) return;
    trackLocationView(locationId).catch(() => {});
  }, [locationId]);

  // Ouvre le modal de vérification "Es-tu bien ici ?" quand on arrive depuis
  // la notification programmée ~5 min après le check-in (App.js navigate avec
  // openVerifyModal: true), seulement si l'utilisateur est toujours détecté
  // dans ce lieu.
  useEffect(() => {
    const isHereNow = !!(user?.currentPoiId && location?._id && String(user.currentPoiId) === String(location._id));
    if (openVerifyModal && isHereNow) {
      setVerifyModalVisible(true);
      navigation.setParams({ openVerifyModal: undefined });
    }
  }, [openVerifyModal, user?.currentPoiId, location?._id]);

  const handleGoToLocation = () => {
    if (!location?.location?.coordinates) return;
    const [lon, lat] = location.location.coordinates;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`);
  };

  const handleBoost = () => {
    if (isBoosted || boostLoading) return;
    if (checkAccess('boost')) activateBoost(locationId);
  };

  const handleConfirmCheckin = () => {
    setVerifyModalVisible(false);
    const [lon, lat] = location?.location?.coordinates || [];
    if (lat != null && lon != null) {
      markCheckinVerified({ locationId, lat, lon }).catch(() => {});
    } else {
      cancelCheckinVerification().catch(() => {});
    }
  };

  const handleCorrectCheckin = () => {
    setVerifyModalVisible(false);
    // Le choix manuel du lieu se fait désormais via le mode de check-in
    // manuel ("Je suis là"), plus via un sélecteur de lieux proches ici.
  };

  // "Je ne suis dans aucun lieu" depuis la modale de vérification "Es-tu bien
  // ici ?", disponible en production — corrige un faux positif de détection GPS.
  const handleNotHereFromVerify = async () => {
    setVerifyModalVisible(false);
    if (correcting) return;
    if (isBoosted) {
      Alert.alert(t('locationScreen.boostActiveHereTitle'), t('locationScreen.boostActiveHereMessage'));
      return;
    }
    setCorrecting(true);
    try {
      const res = await forceCheckOut();
      suppressLocationHeartbeat();
      await cancelCheckinVerification();
      if (res?.user) updateUser(mapBackendUser(res.user));
      refresh();
    } catch (e) {
      if (e?.code === 'BOOST_ACTIVE') {
        Alert.alert(t('locationScreen.boostActiveHereTitle'), e?.message || t('locationScreen.boostActiveMessage'));
      } else {
        console.warn('[LocationScreen] handleNotHereFromVerify failed', e?.message || e);
      }
    } finally {
      setCorrecting(false);
    }
  };

  // Image de cover : priorité à la couverture pro (bannerUrl), puis champs
  // courants (futur-proof OSM/Wikidata).
  const coverUri =
    location?.bannerUrl || location?.coverUrl || location?.imageUrl || location?.photoUrl || location?.image || null;


  const activeStories = useMemo(() => {
    const now = Date.now();
    return (location?.stories || []).filter((s) => !s.expiresAt || new Date(s.expiresAt).getTime() > now);
  }, [location]);

  // 'none' (aucune story), 'unseen' (au moins une story plus récente que la
  // dernière consultation) ou 'seen' (toutes déjà vues) — pilote l'anneau
  // façon Instagram autour de la photo de profil.
  const storyRingState = useMemo(() => {
    if (!activeStories.length) return 'none';
    if (!lastStorySeenAt) return 'unseen';
    const lastSeenMs = new Date(lastStorySeenAt).getTime();
    const hasUnseen = activeStories.some((s) => new Date(s.createdAt || s.expiresAt || 0).getTime() > lastSeenMs);
    return hasUnseen ? 'unseen' : 'seen';
  }, [activeStories, lastStorySeenAt]);

  // Nombre de stories non encore vues, affiché dans la bulle au-dessus de l'anneau.
  const unseenStoriesCount = useMemo(() => {
    if (!activeStories.length) return 0;
    if (!lastStorySeenAt) return activeStories.length;
    const lastSeenMs = new Date(lastStorySeenAt).getTime();
    return activeStories.filter((s) => new Date(s.createdAt || s.expiresAt || 0).getTime() > lastSeenMs).length;
  }, [activeStories, lastStorySeenAt]);

  // Index de la première story non vue (façon Instagram) : à l'ouverture, on
  // reprend là où on s'était arrêté. Si tout a déjà été vu, on repart du début.
  const firstUnseenStoryIndex = useMemo(() => {
    if (!activeStories.length || !lastStorySeenAt) return 0;
    const lastSeenMs = new Date(lastStorySeenAt).getTime();
    const idx = activeStories.findIndex((s) => new Date(s.createdAt || s.expiresAt || 0).getTime() > lastSeenMs);
    return idx === -1 ? 0 : idx;
  }, [activeStories, lastStorySeenAt]);

  const popularity = useMemo(() => {
    const s = location?.stars || 0;
    if (s >= 3) return { label: t('locationScreen.popularityVeryPopular'), stars: 3 };
    if (s === 2) return { label: t('locationScreen.popularityPopular'), stars: 2 };
    if (s === 1) return { label: t('locationScreen.popularityActive'), stars: 1 };
    return { label: t('locationScreen.popularityCalm'), stars: 0 };
  }, [location]);

  // ─── Loading / Error ───────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={[typography.h2, { marginBottom: spacing.lg }]}>{t('locationScreen.notFound')}</Text>
        <TouchableOpacity
          style={[styles.errorBtn, { backgroundColor: palette.accentSoft }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: palette.accent, fontWeight: '800' }}>{t('locationScreen.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Hero ──────────────────────────────────────────────────────
  const renderHero = () => {
    const HeroContent = (
      <>
        {/* Back button flottant */}
        <SafeAreaView edges={['top']} style={styles.heroSafeTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.heroBackBtn, { backgroundColor: palette.overlay }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={isMoon ? '#fff' : '#111'} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGoToLocation}
            style={[styles.heroBackBtn, { backgroundColor: palette.overlay }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="navigate" size={20} color={isMoon ? '#fff' : '#111'} />
          </TouchableOpacity>
        </SafeAreaView>
      </>
    );

    if (coverUri) {
      return (
        <View style={styles.hero}>
          <ImageWithPlaceholder uri={coverUri} style={StyleSheet.absoluteFill} />
          {HeroContent}
        </View>
      );
    }

    // Fallback : dégradé teinté par type de lieu en haut, qui rejoint la
    // couleur du ciel (page en fond) en bas — pas de coupure nette à la
    // jonction hero/page — avec un badge emoji du type bien visible au
    // centre (contrairement à un simple watermark low-opacity).
    return (
      <View style={styles.hero}>
        <LinearGradient
          colors={[getHeroTypeColor(location.type), isMoon ? HERO_SKY_BOTTOM.moon : HERO_SKY_BOTTOM.sun]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroIconWrap}>
          <View style={[styles.heroTypeBadge, { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.4)' }]}>
            <Text style={{ fontSize: 52 }}>{getLocationTypeEmoji(location.type)}</Text>
          </View>
        </View>
        {HeroContent}
      </View>
    );
  };

  // ─── Floating info card ────────────────────────────────────────
  const renderFloatingCard = () => (
    <View
      style={[
        styles.floatingCard,
        {
          backgroundColor: palette.bgElevated,
          borderRadius: radius.xl,
          borderWidth: isMoon ? 1 : 0,
          borderColor: palette.border,
          marginTop: -spacing.xxl - spacing.md,
          marginHorizontal: spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
        },
        shadows.floating,
      ]}
    >
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.typePillText, { color: palette.accent }]}>{formatLocationType(location.type)}</Text>
          </View>
          {isUserHere && (
            <View
              style={[
                styles.typePill,
                { backgroundColor: palette.accent, marginLeft: spacing.xs, flexDirection: 'row', alignItems: 'center' },
              ]}
            >
              <View style={styles.hereDot} />
              <Text style={[styles.typePillText, { color: isMoon ? '#050505' : '#FFFFFF', marginLeft: 4 }]}>
                Vous êtes ici
              </Text>
            </View>
          )}
        </View>
        <View style={styles.popularityWrap}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Text
              key={i}
              style={{
                fontSize: 14,
                marginLeft: 2,
                opacity: i < popularity.stars ? 1 : 0.25,
              }}
            >
              ⭐
            </Text>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
        {location.logoUrl && (
          <View style={{ marginRight: spacing.sm }}>
            {storyRingState === 'unseen' && unseenStoriesCount > 0 && (
              <View style={styles.storyUnseenBubbleWrap} pointerEvents="none">
                <StoryUnseenBubble count={unseenStoriesCount} />
              </View>
            )}
            <StoryRingAvatar
              uri={location.logoUrl}
              size={80}
              state={storyRingState}
              isMoon={isMoon}
              gradient={palette.gradient}
              onPress={
                activeStories.length && storiesUnlocked ? () => openStoryViewer(firstUnseenStoryIndex) : undefined
              }
            />
          </View>
        )}
        <Text style={[typography.h1, { flex: 1 }]} numberOfLines={2}>
          {location.name}
        </Text>
      </View>

      <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
        <View style={styles.metaItem}>
          <Ionicons name="people" size={14} color={palette.textMuted} />
          <Text style={[typography.body, { marginLeft: 4 }]}>{users.length} sur place</Text>
        </View>
        {users.length > 0 && (
          <View style={[styles.presenceStack, { marginLeft: 8 }]}>
            {users.slice(0, 3).map((u, i) => (
              <ImageWithPlaceholder
                key={u._id || i}
                uri={u.profileImageUrl}
                style={[styles.presenceBubble, { borderColor: palette.bgElevated, marginLeft: i === 0 ? 0 : -8 }]}
              />
            ))}
          </View>
        )}
        {monthlyUsers > 0 && (
          <>
            <View style={[styles.metaDot, { backgroundColor: palette.border }]} />
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={palette.textMuted} />
              <Text style={[typography.body, { marginLeft: 4 }]}>{monthlyUsers} ce mois</Text>
            </View>
          </>
        )}
      </View>

      {showManualCheckinButton && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleManualCheckin}
          disabled={manualCheckinLoading}
          style={[
            styles.primaryButton,
            {
              borderRadius: radius.pill,
              paddingVertical: spacing.md,
              marginTop: spacing.md,
              backgroundColor: manualCheckinSuccess ? '#4CAF50' : palette.accent,
              opacity: manualCheckinLoading ? 0.7 : 1,
            },
          ]}
        >
          {manualCheckinLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={manualCheckinSuccess ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={18}
                color="#fff"
              />
              <Text style={styles.primaryButtonText}>
                {manualCheckinSuccess ? t('locationScreen.checkinConfirmed') : t('locationScreen.imHere')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  // ─── Bannière Ultra Boost (offre du lieu, cf. push envoyé par
  // ultraBoost.service.js côté backend — même texte "20 minutes") ─
  const ultraBoostActive =
    location?.ultraBoost?.active && location.ultraBoost.until && new Date(location.ultraBoost.until) > new Date();

  const isUserHere = !!(user?.currentPoiId && location?._id && String(user.currentPoiId) === String(location._id));

  const renderUltraBoostSection = () => {
    if (!ultraBoostActive) return null;

    const cardStyle = [
      styles.boostCard,
      {
        marginHorizontal: spacing.lg,
        marginTop: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: isMoon ? 'rgba(255,215,0,0.08)' : 'rgba(255,215,0,0.10)',
        borderColor: '#FFD700',
        borderWidth: 1.5,
      },
    ];

    // L'utilisateur est physiquement sur place et n'a pas encore reçu la
    // récompense : on affiche la progression du temps passé (cible 20 min).
    if (isUserHere && !isBoosted && user?.currentLocationSince) {
      return (
        <View style={[cardStyle, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.boostIcon}>
              <Text style={{ fontSize: 22 }}>🔥</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.boostTitle, { color: palette.text }]}>Tu es sur place !</Text>
              <Text style={[styles.boostSubtitle, { color: palette.textMuted }]}>
                Reste encore un peu pour débloquer ton boost de profil gratuit.
              </Text>
            </View>
          </View>
          <UltraBoostProgressBar
            startedAt={user.currentLocationSince}
            targetMs={ULTRA_BOOST_TARGET_MS}
            palette={palette}
            spacing={spacing}
            radius={radius}
            typography={typography}
          />
        </View>
      );
    }

    // L'offre est active mais l'utilisateur n'est pas (encore) sur place :
    // bannière d'invitation statique.
    if (!isUserHere) {
      return (
        <View style={cardStyle}>
          <View style={styles.boostIcon}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.boostTitle, { color: palette.text }]}>Offre spéciale de ce lieu</Text>
            <Text style={[styles.boostSubtitle, { color: palette.textMuted }]}>
              Passe 20 minutes sur place pour débloquer un boost de profil gratuit !
            </Text>
          </View>
        </View>
      );
    }

    // Sur place mais déjà boosté (récompense obtenue) : rien à afficher ici,
    // le bouton fixe en bas montre déjà l'état "Boosté".
    return null;
  };

  const renderEventsSection = () => {
    if (activeEvents.length === 0) return null;
    return activeEvents.map((event, idx) => (
      <EventCard
        key={event._id}
        event={event}
        isFirst={idx === 0}
        onLayout={(e) => {
          eventSectionRefs.current[event._id] = e.nativeEvent.layout.y;
        }}
      />
    ));
  };

  // ─── PDF pro (Premium Pro 1/2) ───────────────────────
  // Les stories sont accessibles uniquement via l'anneau sur la photo de
  // profil du lieu (StoryRingAvatar plus haut) : un seul point d'entrée.
  const renderProSection = () => {
    // Max 3 PDF affichés (aligné sur la limite d'ajout côté dashboard business).
    const media = (location.media || []).filter((m) => m.type === 'PDF').slice(0, MAX_PDF_MEDIA);
    if (!media.length) return null;
    return (
      <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
        {media.map((m) => (
          <TouchableOpacity
            key={m._id || m.url}
            activeOpacity={0.85}
            onPress={() => {
              setPdfLoadFailed(false);
              setPdfViewer({ url: m.url, title: m.title });
            }}
            style={[
              styles.pdfCard,
              {
                backgroundColor: palette.surface,
                borderRadius: radius.md,
                marginBottom: spacing.sm,
                borderWidth: 1,
                borderColor: palette.border,
              },
              shadows.floating,
            ]}
          >
            <View style={[styles.pdfIconWrap, { backgroundColor: palette.accentSoft }]}>
              <Ionicons name={getPdfIconName(m.icon)} size={20} color={palette.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.body, { color: palette.text, fontWeight: '700' }]} numberOfLines={1}>
                {m.title}
              </Text>
              <Text style={[typography.caption, { color: palette.textMuted, marginTop: 2 }]}>{t('locationScreen.viewPdf')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderPdfViewer = () => {
    if (!pdfViewer) return null;
    return (
      <Modal visible animationType="slide" onRequestClose={() => setPdfViewer(null)} presentationStyle="pageSheet">
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.bg }}>
          <View style={[styles.pdfViewerHeader, { borderBottomColor: palette.border, paddingHorizontal: spacing.lg }]}>
            <Text style={[typography.body, { flex: 1, color: palette.text, fontWeight: '800' }]} numberOfLines={1}>
              {pdfViewer.title}
            </Text>
            <TouchableOpacity
              onPress={() => setPdfViewer(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.pdfViewerCloseBtn, { backgroundColor: palette.surface }]}
            >
              <Ionicons name="close" size={20} color={palette.text} />
            </TouchableOpacity>
          </View>
          {pdfLoadFailed ? (
            <View style={[styles.center, { flex: 1 }]}>
              <Ionicons name="alert-circle-outline" size={36} color={palette.textFaint} />
              <Text style={[typography.body, { color: palette.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
                {t('locationScreen.pdfLoadError')}
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(pdfViewer.url)}
                style={[styles.errorBtn, { backgroundColor: palette.accentSoft, marginTop: spacing.md }]}
              >
                <Text style={{ color: palette.accent, fontWeight: '800' }}>{t('locationScreen.openInBrowser')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              source={{ uri: pdfViewerUri(pdfViewer.url) }}
              style={{ flex: 1 }}
              startInLoadingState
              renderLoading={() => (
                <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: palette.bg }]}>
                  <ActivityIndicator size="large" color={palette.accent} />
                </View>
              )}
              onError={() => setPdfLoadFailed(true)}
              onHttpError={() => setPdfLoadFailed(true)}
            />
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  const renderStoryViewer = () => {
    if (storyViewerIndex === null || !activeStories.length) return null;
    return (
      <StoryViewerModal
        stories={activeStories}
        initialIndex={storyViewerIndex}
        onClose={closeStoryViewer}
        insetsTop={insets.top}
        spacing={spacing}
      />
    );
  };

  // ─── Liste des ProfileCards ────────────────────────────────────
  const renderProfileList = () => (
    <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
      <Text style={[typography.h2, { marginBottom: spacing.md }]}>{t('locationScreen.profilesHere')}</Text>
      {users.length === 0 ? (
        <View
          style={[
            styles.emptyState,
            {
              backgroundColor: palette.surface,
              borderRadius: radius.lg,
              borderColor: palette.border,
              borderWidth: isMoon ? 1 : 0,
            },
          ]}
        >
          <Ionicons name="people-outline" size={36} color={palette.textFaint} />
          <Text style={[typography.body, { marginTop: spacing.sm, textAlign: 'center' }]}>
            {t('locationScreen.noProfilesHere')}
          </Text>
        </View>
      ) : (
        users.map((u, i) => (
          <ProfileCard
            key={u._id || i}
            user={u}
            index={i}
            isMoon={isMoon}
            palette={palette}
            shadows={shadows}
            radius={radius}
            spacing={spacing}
            socialMediaIcons={socialMediaIcons}
            onPress={() => navigateToUser(u)}
          />
        ))
      )}
    </View>
  );

  // ─── Section "Croisé récemment" (priorisée après la présence live) ────
  const formatCrossedAt = (dateStr) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.max(1, Math.round(diffMs / 60000));
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    const diffJ = Math.round(diffH / 24);
    return `il y a ${diffJ}j`;
  };

  const renderCrossedPathsSection = () => (
    <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
      <Text style={[typography.h2, { marginBottom: spacing.md }]}>{t('locationScreen.recentlyCrossed')}</Text>

      {crossedLoading ? (
        <ActivityIndicator color={palette.textFaint} />
      ) : crossedItems.length === 0 ? (
        <Text style={[typography.body, { color: palette.textMuted }]}>
          Aucun croisement récent ici.
        </Text>
      ) : (
        <>
          {crossedItems.map((c, i) => (
            <ProfileCard
              key={c.user?._id || i}
              user={c.user}
              index={i}
              isMoon={isMoon}
              palette={palette}
              shadows={shadows}
              radius={radius}
              spacing={spacing}
              socialMediaIcons={socialMediaIcons}
              subtitle={`Vu ${formatCrossedAt(c.lastSeenAt)} · ${c.crossCount}x`}
              onPress={() => navigateToUser(c.user)}
            />
          ))}
          {crossedHasMore && (
            <TouchableOpacity
              onPress={loadMoreCrossed}
              disabled={crossedLoadingMore}
              style={[styles.emptyState, { backgroundColor: palette.surface, borderRadius: radius.lg, paddingVertical: spacing.sm }]}
            >
              {crossedLoadingMore ? (
                <ActivityIndicator color={palette.textFaint} />
              ) : (
                <Text style={[typography.body, { color: palette.text, fontWeight: '700' }]}>{t('locationScreen.seeMore')}</Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {premiumSystemEnabled && !isPremium && (
        <TouchableOpacity
          onPress={() => checkAccess('crossed_paths_history')}
          style={[styles.emptyState, { backgroundColor: palette.surface, borderRadius: radius.lg, marginTop: spacing.sm, paddingVertical: spacing.sm }]}
        >
          <Text style={[typography.body, { color: palette.textMuted, textAlign: 'center' }]}>
            {t('locationScreen.crossedPathsPremiumHint')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ─── Bouton fixe (Se signaler / Chatter) ──────────────────────
  const renderFixedAction = () => {
    const bottomPad = Math.max(insets.bottom, spacing.md);
    return (
      <View pointerEvents="box-none" style={[styles.fixedActionWrap, { paddingBottom: bottomPad }]}>
        <BlurView intensity={isMoon ? 50 : 70} tint={isMoon ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: isMoon ? 'rgba(5,5,5,0.55)' : 'rgba(255,255,255,0.55)' }]}
        />
        <View style={[styles.fixedActionInner, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleBoost}
            style={[
              styles.primaryButton,
              {
                borderRadius: radius.pill,
                paddingVertical: spacing.md,
                shadowColor: palette.accent,
              },
            ]}
          >
            <LinearGradient
              colors={palette.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
            />
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isBoosted ? t('locationScreen.boosted') : boostUnlocked ? t('locationScreen.boostProfileHere') : t('locationScreen.boostLockedAfterCheckins')}
            </Text>
          </TouchableOpacity>
          {isUserHere && (
            <TouchableOpacity
              onPress={handleNotHereFromVerify}
              disabled={correcting}
              style={[styles.forceCheckinLink, { opacity: correcting ? 0.6 : 1 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="log-out-outline" size={15} color={palette.textMuted} />
              <Text
                style={[
                  typography.caption,
                  {
                    color: palette.textMuted,
                    fontWeight: '600',
                    marginLeft: 4,
                    textDecorationLine: 'underline',
                  },
                ]}
              >
                Je ne suis plus ici
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Fond cohérent avec LocationListScreen (même palette que l'interstitiel) */}
      {isMoon ? (
        <NightSkyBackground style={StyleSheet.absoluteFill} />
      ) : (
        <DaySkyBackground style={StyleSheet.absoluteFill} />
      )}
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressBackgroundColor={palette.bgElevated}
          />
        }
      >
        {renderHero()}
        {renderFloatingCard()}
        {renderUltraBoostSection()}
        {renderEventsSection()}
        {renderProSection()}
        {renderProfileList()}
        {renderCrossedPathsSection()}
      </ScrollView>

      {renderFixedAction()}
      {renderStoryViewer()}
      {renderPdfViewer()}

      <CheckinVerifyModal
        visible={verifyModalVisible}
        locationName={location?.name}
        onConfirm={handleConfirmCheckin}
        onCorrect={handleCorrectCheckin}
        onNotHere={handleNotHereFromVerify}
        onClose={() => setVerifyModalVisible(false)}
      />
    </View>
  );
};

// Carte d'un événement affiché sur la fiche du lieu. Composant séparé (plutôt
// qu'une fonction render inline) car chaque carte vidéo a besoin de son propre
// player via useVideoPlayer — un hook ne peut pas être appelé dynamiquement
// dans une boucle au sein du même composant.
const EventCard = ({ event, isFirst, onLayout }) => {
  const { isMoon } = useVibe();
  const theme = useVibeTheme();
  const { palette, radius, spacing } = theme;
  const isVideo = event.mediaType === 'video';
  // Aperçu muet en boucle par défaut ; le son est activé le temps du
  // visionnage plein écran (voir EventVideoViewerModal) puis redésactivé
  // à la fermeture, sur ce même player (pas de second player instancié).
  const player = useVideoPlayer(isVideo ? event.mediaUrl : null, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [isImageViewerVisible, setImageViewerVisible] = useState(false);
  const [isVideoViewerVisible, setVideoViewerVisible] = useState(false);

  useEffect(() => {
    if (!isVideo) return undefined;
    player.play();
    return () => {
      try {
        player.pause();
      } catch {
        // player déjà libéré (démontage) : rien à faire.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, player]);

  const eventDateObj = event.eventDate ? new Date(event.eventDate) : null;
  const eventDateLabel = eventDateObj
    ? eventDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null;
  const eventDateDay = eventDateObj ? eventDateObj.getDate() : null;
  const eventDateMonth = eventDateObj
    ? eventDateObj.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase()
    : null;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.boostCard,
        {
          flexDirection: 'column',
          alignItems: 'stretch',
          marginHorizontal: spacing.lg,
          marginTop: isFirst ? spacing.lg : spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: isMoon ? 'rgba(255,61,173,0.08)' : 'rgba(255,61,173,0.10)',
          borderColor: palette.accent,
          borderWidth: 1.5,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {eventDateDay ? (
          <View style={[styles.eventDateBadge, { backgroundColor: palette.accent, borderRadius: radius.md }]}>
            <Text style={styles.eventDateBadgeDay}>{eventDateDay}</Text>
            <Text style={styles.eventDateBadgeMonth}>{eventDateMonth}</Text>
          </View>
        ) : (
          <View style={styles.boostIcon}>
            <Text style={{ fontSize: 22 }}>📅</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          {eventDateLabel && <Text style={[styles.eventDateLabel, { color: palette.accent }]}>{eventDateLabel}</Text>}
          <Text style={[styles.boostTitle, { color: palette.text }]}>{event.title}</Text>
        </View>
      </View>
      {!!event.body && (
        <Text style={[styles.boostSubtitle, { color: palette.textMuted, marginTop: spacing.sm }]}>{event.body}</Text>
      )}
      {event.mediaUrl && (
        <View
          style={{
            marginTop: spacing.md,
            borderRadius: radius.md,
            overflow: 'hidden',
            aspectRatio: 16 / 9,
            backgroundColor: '#000',
          }}
        >
          {isVideo ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                player.muted = false;
                setVideoViewerVisible(true);
              }}
              style={{ width: '100%', height: '100%' }}
            >
              <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setImageViewerVisible(true)}
              style={{ width: '100%', height: '100%' }}
            >
              <Image source={{ uri: event.mediaUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </TouchableOpacity>
          )}
        </View>
      )}
      {!isVideo && event.mediaUrl && (
        <ImageView
          images={[{ uri: event.mediaUrl }]}
          imageIndex={0}
          visible={isImageViewerVisible}
          onRequestClose={() => setImageViewerVisible(false)}
        />
      )}
      {isVideo && event.mediaUrl && (
        <EventVideoViewerModal
          visible={isVideoViewerVisible}
          player={player}
          onClose={() => {
            player.muted = true;
            setVideoViewerVisible(false);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },

  storyUnseenBubbleWrap: {
    position: 'absolute',
    top: -38,
    left: -60,
    right: -60,
    alignItems: 'center',
    zIndex: 2,
  },

  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: '#0A0A12',
    justifyContent: 'space-between',
  },
  heroIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTypeBadge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSafeTop: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  floatingCard: {},

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hereDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  popularityWrap: { flexDirection: 'row', alignItems: 'center' },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 10 },
  presenceStack: { flexDirection: 'row', alignItems: 'center' },
  presenceBubble: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, overflow: 'hidden' },

  boostCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boostIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostTitle: { fontSize: 15, fontWeight: '800' },
  boostSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },

  eventDateBadge: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateBadgeDay: { fontSize: 20, fontWeight: '900', color: '#fff', lineHeight: 22 },
  eventDateBadgeMonth: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  eventDateLabel: { fontSize: 13, fontWeight: '800', marginBottom: 2, textTransform: 'capitalize' },

  pdfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pdfIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pdfViewerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  emptyState: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  fixedActionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    paddingTop: 10,
  },
  fixedActionInner: {
    paddingTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  forceCheckinLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 4,
  },
});

export default LocationScreen;
