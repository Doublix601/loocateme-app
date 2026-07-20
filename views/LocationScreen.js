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
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigation, useRoute } from '@react-navigation/native';
import { useVibe } from '../components/contexts/VibeContext';
import { UserContext } from '../components/contexts/UserContext';
import { formatLocationType } from '../components/LocationUtils';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useBoost } from '../hooks/useBoost';
import { useLocationData } from '../hooks/useLocationData';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { useNavigateToUser } from '../hooks/useNavigateToUser';
import SocialPulseAvatar from '../components/SocialPulseAvatar';
import StoryRingAvatar from '../components/StoryRingAvatar';
import StoryViewerModal from '../components/StoryViewerModal';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import ProfileCard from '../components/ProfileCard';
import UltraBoostProgressBar from '../components/UltraBoostProgressBar';
import socialMediaIcons from '../constants/socialMediaIcons';
import { getPdfIconName } from '../constants/pdfIcons';
import { trackLocationView } from '../components/ApiRequest';

const ULTRA_BOOST_TARGET_MS = 20 * 60 * 1000;
const MAX_PDF_MEDIA = 3;
// L'Android WebView ne sait pas rendre un PDF nativement (contrairement à
// WKWebView sur iOS) : on passe par la visionneuse Google Docs en lecture
// intégrée, ce qui évite de sortir vers un navigateur externe.
const pdfViewerUri = (url) =>
  Platform.OS === 'android'
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.34);

/**
 * LocationScreen — Refonte radicale "Full-Height".
 *
 *  - Header immersif : image de couverture + gradient progressif.
 *  - Floating Info Card : nom, type, popularité, distance, qui chevauche le hero.
 *  - Social Pulse : grille horizontale d'avatars circulaires (statut/néon).
 *  - Liste de ProfileCards condensées (photo, bio, réseaux).
 *  - Bouton d'action fixe en bas avec BlurView.
 *  - Tout pilote par `useVibeTheme` (zéro `if (isMoon)` cosmétique éparpillé).
 */
const LocationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { locationId, tertiles, scrollToEventId } = route.params ?? {};
  const navigateToUser = useNavigateToUser();

  const { isMoon } = useVibe();
  const { user } = useContext(UserContext);
  const theme = useVibeTheme();
  const { palette, radius, spacing, shadows, typography } = theme;
  const insets = useSafeAreaInsets();

  const { checkAccess } = useFeatureGate();
  const { activateBoost, isBoosted, loading: boostLoading } = useBoost();
  const { location, users, monthlyUsers, loading, refreshing, refresh } = useLocationData(locationId);
  const [storyViewerIndex, setStoryViewerIndex] = useState(null);
  const [lastStorySeenAt, setLastStorySeenAt] = useState(null);
  const [pdfViewer, setPdfViewer] = useState(null); // { url, title } | null
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);

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
    AsyncStorage.getItem(`story_seen_${locationId}`).then(setLastStorySeenAt).catch(() => {});
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

  const handleGoToLocation = () => {
    if (!location?.location?.coordinates) return;
    const [lon, lat] = location.location.coordinates;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`);
  };

  const handleBoost = () => {
    if (isBoosted || boostLoading) return;
    if (checkAccess('boost')) activateBoost(locationId);
  };

  // Image de cover : priorité à la couverture pro (bannerUrl), puis champs
  // courants (futur-proof OSM/Wikidata).
  const coverUri =
    location?.bannerUrl ||
    location?.coverUrl ||
    location?.imageUrl ||
    location?.photoUrl ||
    location?.image ||
    null;

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

  const popularity = useMemo(() => {
    const s = location?.stars || 0;
    if (s >= 3) return { label: 'Très populaire', stars: 3 };
    if (s === 2) return { label: 'Populaire', stars: 2 };
    if (s === 1) return { label: 'Actif', stars: 1 };
    return { label: 'Calme', stars: 0 };
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
        <Text style={[typography.h2, { marginBottom: spacing.lg }]}>Lieu introuvable</Text>
        <TouchableOpacity
          style={[styles.errorBtn, { backgroundColor: palette.accentSoft }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: palette.accent, fontWeight: '800' }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Hero ──────────────────────────────────────────────────────
  const renderHero = () => {
    const HeroContent = (
      <>
        <LinearGradient
          colors={palette.heroGradient}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
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
    // Fallback : gradient signature + icône
    return (
      <View style={styles.hero}>
        <LinearGradient
          colors={palette.heroFallback}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroIconWrap}>
          <Ionicons
            name={isMoon ? 'moon' : 'sunny'}
            size={96}
            color={isMoon ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.45)'}
          />
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
        <View style={[styles.typePill, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.typePillText, { color: palette.accent }]}>
            {formatLocationType(location.type)}
          </Text>
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
            <StoryRingAvatar
              uri={location.logoUrl}
              size={80}
              state={storyRingState}
              isMoon={isMoon}
              gradient={palette.gradient}
              onPress={activeStories.length ? () => openStoryViewer(0) : undefined}
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
          <Text style={[typography.body, { marginLeft: 4 }]}>
            {users.length} sur place
          </Text>
        </View>
        {monthlyUsers > 0 && (
          <>
            <View style={[styles.metaDot, { backgroundColor: palette.border }]} />
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={palette.textMuted} />
              <Text style={[typography.body, { marginLeft: 4 }]}>
                {monthlyUsers} ce mois
              </Text>
            </View>
          </>
        )}
        <View style={[styles.metaDot, { backgroundColor: palette.border }]} />
        <View style={styles.metaItem}>
          <Ionicons name="pulse" size={14} color={palette.textMuted} />
          <Text style={[typography.body, { marginLeft: 4 }]}>
            {popularity.label}
          </Text>
        </View>
      </View>
    </View>
  );

  // ─── Bannière Ultra Boost (offre du lieu, cf. push envoyé par
  // ultraBoost.service.js côté backend — même texte "20 minutes") ─
  const ultraBoostActive =
    location?.ultraBoost?.active &&
    location.ultraBoost.until &&
    new Date(location.ultraBoost.until) > new Date();

  const isUserHere = !!(
    user?.currentPoiId &&
    location?._id &&
    String(user.currentPoiId) === String(location._id)
  );

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
              <Text style={[styles.boostTitle, { color: palette.text }]}>
                Tu es sur place !
              </Text>
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
            <Text style={[styles.boostTitle, { color: palette.text }]}>
              Offre spéciale de ce lieu
            </Text>
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
        onLayout={(e) => { eventSectionRefs.current[event._id] = e.nativeEvent.layout.y; }}
      />
    ));
  };

  // ─── Stories & PDF pro (Premium Pro 1/2) ───────────────────────
  const renderProSection = () => {
    // Max 3 PDF affichés (aligné sur la limite d'ajout côté dashboard business).
    const media = (location.media || []).filter((m) => m.type === 'PDF').slice(0, MAX_PDF_MEDIA);
    if (!activeStories.length && !media.length) return null;
    return (
      <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
        {activeStories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: media.length ? spacing.md : 0 }}>
            {activeStories.map((story, idx) => (
              <TouchableOpacity
                key={story._id || idx}
                onPress={() => openStoryViewer(idx)}
                style={{
                  width: 64,
                  height: 100,
                  borderRadius: radius.md,
                  marginRight: spacing.sm,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: palette.accent,
                }}
              >
                <ImageWithPlaceholder
                  uri={story.mediaType === 'video' ? story.thumbnailUrl : story.url}
                  style={{ width: '100%', height: '100%' }}
                />
                {story.mediaType === 'video' && (
                  <View style={styles.storyPlayBadge} pointerEvents="none">
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
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
              <Text style={[typography.caption, { color: palette.textMuted, marginTop: 2 }]}>
                Voir le PDF
              </Text>
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
      <Modal
        visible
        animationType="slide"
        onRequestClose={() => setPdfViewer(null)}
        presentationStyle="pageSheet"
      >
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.bg }}>
          <View
            style={[
              styles.pdfViewerHeader,
              { borderBottomColor: palette.border, paddingHorizontal: spacing.lg },
            ]}
          >
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
                Impossible d'afficher ce PDF.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(pdfViewer.url)}
                style={[styles.errorBtn, { backgroundColor: palette.accentSoft, marginTop: spacing.md }]}
              >
                <Text style={{ color: palette.accent, fontWeight: '800' }}>Ouvrir dans le navigateur</Text>
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

  // ─── Social Pulse (grille horizontale d'avatars) ───────────────
  const renderSocialPulse = () => {
    if (!users.length) return null;
    return (
      <View style={{ marginTop: spacing.xl }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: spacing.lg }]}>
          <Text style={typography.h2}>Social Pulse</Text>
          <Text style={[typography.caption, { textTransform: 'uppercase' }]}>
            {users.length} actif{users.length > 1 ? 's' : ''}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            gap: spacing.sm,
          }}
        >
          {users.map((u, i) => (
            <SocialPulseAvatar
              key={u._id || i}
              user={u}
              size={60}
              isMoon={isMoon}
              index={i}
              onPress={() => navigateToUser(u)}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  // ─── Liste des ProfileCards ────────────────────────────────────
  const renderProfileList = () => (
    <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
      <Text style={[typography.h2, { marginBottom: spacing.md }]}>
        Les profils ici
      </Text>
      {users.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: palette.surface, borderRadius: radius.lg, borderColor: palette.border, borderWidth: isMoon ? 1 : 0 }]}>
          <Ionicons name="people-outline" size={36} color={palette.textFaint} />
          <Text style={[typography.body, { marginTop: spacing.sm, textAlign: 'center' }]}>
            Personne n'est ici pour le moment.{'\n'}Soyez le premier à vous signaler !
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

  // ─── Bouton fixe (Se signaler / Chatter) ──────────────────────
  const renderFixedAction = () => {
    const bottomPad = Math.max(insets.bottom, spacing.md);
    return (
      <View
        pointerEvents="box-none"
        style={[styles.fixedActionWrap, { paddingBottom: bottomPad }]}
      >
        <BlurView
          intensity={isMoon ? 50 : 70}
          tint={isMoon ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isMoon ? 'rgba(5,5,5,0.55)' : 'rgba(255,255,255,0.55)' },
          ]}
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
              {isBoosted ? 'Boosté' : 'Booster mon profil ici'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
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
        {renderSocialPulse()}
        {renderProfileList()}
      </ScrollView>

      {renderFixedAction()}
      {renderStoryViewer()}
      {renderPdfViewer()}
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
  const player = useVideoPlayer(isVideo ? event.mediaUrl : null, (p) => {
    p.loop = false;
  });

  const eventDateLabel = event.eventDate
    ? new Date(event.eventDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
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
        <View style={styles.boostIcon}>
          <Text style={{ fontSize: 22 }}>📅</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[styles.boostTitle, { color: palette.text }]}>{event.title}</Text>
          {eventDateLabel && (
            <Text style={[styles.boostSubtitle, { color: palette.textMuted }]}>{eventDateLabel}</Text>
          )}
        </View>
      </View>
      {!!event.body && (
        <Text style={[styles.boostSubtitle, { color: palette.textMuted, marginTop: spacing.sm }]}>
          {event.body}
        </Text>
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
            <VideoView
              player={player}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              nativeControls
            />
          ) : (
            <Image
              source={{ uri: event.mediaUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },

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

  floatingCard: { },

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
  popularityWrap: { flexDirection: 'row', alignItems: 'center' },

  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 10 },

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

  storyPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

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
});

export default LocationScreen;
