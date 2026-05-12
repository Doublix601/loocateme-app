import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
  PanResponder,
  Platform,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useVibe } from '../components/contexts/VibeContext';
import { formatLocationType } from '../components/LocationUtils';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useBoost } from '../hooks/useBoost';
import { useLocationData } from '../hooks/useLocationData';
import { useVibeTheme } from '../hooks/useVibeTheme';
import SocialPulseAvatar from '../components/SocialPulseAvatar';
import ProfileCard from '../components/ProfileCard';

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
const LocationScreen = ({ locationId, onReturnToList, onSelectUser, socialMediaIcons = {} }) => {
  const { isMoon } = useVibe();
  const theme = useVibeTheme();
  const { palette, radius, spacing, shadows, typography } = theme;
  const insets = useSafeAreaInsets();

  const { checkAccess } = useFeatureGate();
  const { activateBoost, isBoosted, boostUntil, boostBalance, loading: boostLoading } = useBoost();
  const { location, users, loading, refreshing, refresh } = useLocationData(locationId);

  // Swipe-right pour revenir à la liste (préservé depuis l'ancienne version).
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) && g.dx > 0,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) onReturnToList && onReturnToList();
      },
    })
  ).current;

  const handleGoToLocation = () => {
    if (!location?.location?.coordinates) return;
    const [lon, lat] = location.location.coordinates;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`);
  };

  const handleBoost = () => {
    if (isBoosted || boostLoading) return;
    if (checkAccess('boost')) activateBoost();
  };

  // Image de cover : on tente plusieurs champs courants (futur-proof OSM/Wikidata).
  const coverUri =
    location?.coverUrl ||
    location?.imageUrl ||
    location?.photoUrl ||
    location?.image ||
    null;

  const popularity = useMemo(() => {
    const s = location?.stars || 0;
    const count = users?.length || 0;
    if (s >= 3) return { label: 'Très populaire', stars: 3 };
    if (s === 2) return { label: 'Populaire', stars: 2 };
    if (s === 1 || count > 0) return { label: 'Actif', stars: 1 };
    return { label: 'Calme', stars: 0 };
  }, [location, users]);

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
          onPress={onReturnToList}
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
            onPress={onReturnToList}
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
        <ImageBackground
          source={{ uri: coverUri }}
          style={styles.hero}
          imageStyle={{ resizeMode: 'cover' }}
        >
          {HeroContent}
        </ImageBackground>
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

      <Text
        style={[typography.h1, { marginTop: spacing.sm }]}
        numberOfLines={2}
      >
        {location.name}
      </Text>

      <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
        <View style={styles.metaItem}>
          <Ionicons name="people" size={14} color={palette.textMuted} />
          <Text style={[typography.body, { marginLeft: 4 }]}>
            {users.length} sur place
          </Text>
        </View>
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

  // ─── Boost CTA ─────────────────────────────────────────────────
  const renderBoostCard = () => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleBoost}
      disabled={isBoosted || boostLoading}
      style={[
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
          opacity: isBoosted ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.boostIcon}>
        <Text style={{ fontSize: 22 }}>{isBoosted ? '⚡' : '🔥'}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[styles.boostTitle, { color: palette.text }]}>
          {isBoosted ? 'Boost actif' : 'Boostez votre profil'}
        </Text>
        <Text style={[styles.boostSubtitle, { color: palette.textMuted }]}>
          {isBoosted
            ? `Expire dans ${Math.max(0, Math.ceil((boostUntil - new Date()) / 60000))} min.`
            : boostBalance > 0
              ? `${boostBalance} boost${boostBalance > 1 ? 's' : ''} disponible${boostBalance > 1 ? 's' : ''}.`
              : '3x plus visible pendant 30 min.'}
        </Text>
      </View>
      {boostLoading ? (
        <ActivityIndicator color="#FFD700" />
      ) : (
        <View style={[styles.boostBadgePill, isBoosted && { backgroundColor: '#FFD700' }]}>
          <Text style={[styles.boostBadgeText, isBoosted && { color: '#000' }]}>
            {isBoosted ? 'ACTIF' : 'GO'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

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
              onPress={() => onSelectUser && onSelectUser(u)}
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
            onPress={() => onSelectUser && onSelectUser(u)}
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
              {isBoosted ? 'Boosté' : 'Me signaler ici'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }} {...panResponder.panHandlers}>
      <ScrollView
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
        {renderBoostCard()}
        {renderSocialPulse()}
        {renderProfileList()}
      </ScrollView>

      {renderFixedAction()}
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
  boostBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#FFD700',
  },
  boostBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFD700', letterSpacing: 0.5 },

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
