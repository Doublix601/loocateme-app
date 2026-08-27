import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import ImageWithPlaceholder from '../../components/ImageWithPlaceholder';

const { width } = Dimensions.get('window');

/**
 * ProfileHero — photo pleine largeur façon carte (ratio ~4:5, coins arrondis)
 * avec nom + statut de visibilité + ville en overlay texte blanc sur dégradé
 * sombre en bas de l'image (style Tinder/Hinge). Icône crayon discrète en coin
 * qui renvoie vers les Réglages (l'upload photo lui-même reste géré là-bas).
 *
 * `photoRef` est mesuré par le SpotlightOverlay onboarding — garder la View qui
 * porte la ref au même endroit visuel (la carte photo) pour ne pas casser
 * l'étape 1 de l'onboarding.
 */
const ProfileHero = ({ photoRef, statusRef, user, isPremium, colors, isDark, cityLabel, currentPlaceLabel, onOpenStatusPicker, onEditPhoto }) => {
  const { t } = useTranslation();
  const displayName =
    user?.customName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username);

  const statusColor = user?.status === 'red' ? '#F44336' : user?.status === 'orange' ? '#FF9800' : '#4CAF50';
  const statusLabel = user?.status === 'red' ? t('myAccount.status.incognito') : user?.status === 'orange' ? t('myAccount.status.private') : t('myAccount.status.public');

  return (
    <View
      ref={photoRef}
      style={[
        styles.card,
        {
          width: '100%',
          aspectRatio: 4 / 5,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onEditPhoto}
        disabled={!onEditPhoto}
        style={styles.image}
        accessibilityRole="button"
        accessibilityLabel={t('myAccount.editPhotoA11y')}
      >
        {user?.photo ? (
          <ImageWithPlaceholder uri={user.photo} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder, { backgroundColor: colors.accent }]}>
            <Image source={require('../../assets/appIcons/userProfile.png')} style={styles.placeholderIcon} />
          </View>
        )}
      </TouchableOpacity>
      {onEditPhoto ? (
        <TouchableOpacity style={styles.editButton} onPress={onEditPhoto} accessibilityLabel={t('myAccount.editPhotoA11y')}>
          <Ionicons name="camera" size={18} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Dégradé sombre bas d'image pour la lisibilité du texte overlay */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.75)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View ref={statusRef} style={styles.overlayContent}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {(isPremium ?? user?.isPremium) ? (
            <View style={styles.premiumPill}>
              <Text style={styles.premiumPillText}>{t('profileHero.premiumBadge')}</Text>
            </View>
          ) : null}
        </View>
        <View>
          <TouchableOpacity
            style={styles.statusRow}
            onPress={onOpenStatusPicker}
            accessibilityLabel={t('myAccount.status.pickLabel')}
          >
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>
              {statusLabel}
              {cityLabel ? ` · ${cityLabel}` : ''}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#fff" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
        {currentPlaceLabel ? (
          <Text style={styles.currentPlaceText} numberOfLines={1}>
            {t('myAccount.currentlyAt', { place: currentPlaceLabel })}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    width: Math.min(width * 0.22, 96),
    height: Math.min(width * 0.22, 96),
    tintColor: '#fff',
  },
  editButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#fff',
    fontSize: Math.min(width * 0.07, 28),
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
  },
  premiumPill: {
    backgroundColor: '#f6c453',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumPillText: {
    color: '#2a1c00',
    fontSize: 11,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  currentPlaceText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
});

export default ProfileHero;
