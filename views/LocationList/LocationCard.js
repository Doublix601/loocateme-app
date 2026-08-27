import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ImageWithPlaceholder from '../../components/ImageWithPlaceholder';
import AnimatedGradientBorder from '../../components/AnimatedGradientBorder';
import { formatLocationType } from '../../components/LocationUtils';
import { formatDistance } from '../../components/ServerUtils';

const MANUAL_CHECKIN_DISTANCE_M = 50;

// Etoiles de popularité (0 à 3, valeur backend figée — ne varie pas avec la
// présence en direct/userCount, cohérent avec LocationScreen.js).
function getStars(item, starIsDark) {
  const starsCount = item?.stars || 0;
  if (starsCount === 3) return <Text style={{ fontSize: 18 }}>⭐⭐⭐</Text>;
  if (starsCount === 2) return <Text style={{ fontSize: 18 }}>⭐⭐</Text>;
  if (starsCount === 1) return <Text style={{ fontSize: 18 }}>⭐</Text>;
  return <Text style={{ color: starIsDark ? '#FFFFFF' : '#ccc', opacity: starIsDark ? 0.3 : 1, fontSize: 18 }}>★</Text>;
}

// Carte "Lieu" — reprend `LocationItem` (React.memo) de l'ancien
// LocationListScreen.js monolithique, réorganisée visuellement (alignement/
// espacement) mais sans retirer aucune information : nom, distance/
// "actuellement ici", bannière/logo pro, badges vérifié/sponsorisé, badge
// type, avatars visiteurs + compteur, étoiles, bordure néon animée la nuit,
// bouton "Je suis là".
const LocationCard = React.memo(function LocationCard({
  item,
  index,
  colors,
  isDark,
  isMoon,
  currentUserPoiId,
  checkInMode,
  checkingInLocationId,
  isBoosted,
  visibleSetRef,
  onSelect,
  onCorrectCheckin,
  onManualCheckIn,
  onLongPressHere,
}) {
  const { t } = useTranslation();
  const isUserHere = item._id === currentUserPoiId;
  const canManualCheckIn =
    checkInMode === 'manual' &&
    !isUserHere &&
    typeof item.distance === 'number' &&
    item.distance <= MANUAL_CHECKIN_DISTANCE_M;
  const isCheckingInHere = checkingInLocationId === item._id;
  // Désactive TOUS les boutons "je suis là" tant qu'un check-in est en vol
  // (empêche un 2e tap sur un autre lieu pendant que le 1er est en cours).
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
      onPress={() => onSelect(item)}
      onLongPress={isUserHere ? () => onLongPressHere?.(item) : undefined}
      delayLongPress={350}
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
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
          {isUserHere ? null : (
            item.distance !== undefined && (
              <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
                {formatDistance(item.distance)}
              </Text>
            )
          )}
        </View>
        <View style={styles.badgesRow}>
          <View style={[styles.typeBadge, isDark && styles.typeBadgeDark]}>
            <Text style={[styles.typeText, isDark && styles.typeTextDark]}>{formatLocationType(item.type)}</Text>
          </View>
          {item.isPro && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓</Text>
            </View>
          )}
          {item.isSponsored && (
            <View style={styles.sponsoredBadge}>
              <Text style={styles.sponsoredText}>{t('locationList.card.sponsored')}</Text>
            </View>
          )}
        </View>
        <View style={styles.activeUsersContainer}>
          <Text style={[styles.usersCountText, { color: colors.textSecondary }]}>
            {t('locationList.card.visitors', { count: item.userCount || 0 })}
          </Text>
          <View style={styles.avatarStack}>
            {(item.activeUsers || []).map((u, avatarIndex) => {
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
                      marginLeft: avatarIndex === 0 ? 0 : -12,
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
              onManualCheckIn(item);
            }}
            disabled={isAnyCheckInInFlight}
            style={{ opacity: isAnyCheckInInFlight ? 0.6 : 1, marginTop: 10, alignSelf: 'flex-start' }}
          >
            <LinearGradient
              colors={colors.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.manualCheckinButton}
            >
              {isCheckingInHere ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.manualCheckinButtonText}>{t('locationList.card.imHere')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.popularityContainer}>
        <Text style={styles.popularityStars}>{getStars(item, isDark)}</Text>
      </View>
      {isUserHere && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            onCorrectCheckin();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.editLocationButton, { opacity: isBoosted ? 0.4 : 1 }]}
        >
          <Ionicons name="pencil" size={14} color={colors.accent} />
          <Text style={[styles.editLocationButtonText, { color: colors.accent }]}>{t('locationList.card.editLocation')}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const isActive = !!visibleSetRef?.current?.has(index);

  // Le Canvas Skia de AnimatedGradientBorder ne respecte pas pointerEvents="none"
  // sous Android/New Architecture (bug connu de @shopify/react-native-skia :
  // sa vue native intercepte le touch quel que soit pointerEvents) et bloque
  // silencieusement tous les taps sur la carte en dessous. On désactive la
  // bordure néon sur Android — mieux vaut perdre l'effet visuel que rendre
  // les lieux non cliquables.
  if (Platform.OS !== 'android' && isUserHere) {
    return (
      <AnimatedGradientBorder borderRadius={20} index={index} active={isActive} marginBottom={16}>
        {card}
      </AnimatedGradientBorder>
    );
  }

  // Vibe nuit : bordure néon ANIMÉE réservée aux 2 cartes "mises en avant"
  // (item._featuredRank). Les autres cartes gardent leur bordure rose statique
  // (cf. styles.locationCard borderColor) — un Canvas Skia animé par carte
  // visible était le principal coût de rendu / cause de scroll saccadé (UI-04).
  if (Platform.OS !== 'android' && isMoon && item._featuredRank) {
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

const styles = StyleSheet.create({
  locationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 16,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    position: 'relative',
  },
  editLocationButton: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editLocationButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  locationInfo: { flex: 1 },
  locationHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  locationName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, flex: 1, marginRight: 8 },
  distanceText: { fontSize: 13, fontWeight: '600' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, gap: 6 },
  typeBadge: {
    backgroundColor: 'rgba(0, 194, 203, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 6,
  },
  manualCheckinButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default LocationCard;
