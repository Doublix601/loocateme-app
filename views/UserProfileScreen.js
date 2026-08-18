import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  ScrollView,
  Dimensions,
  Linking,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import * as Location from 'expo-location';
import { buildSocialProfileUrl } from '../services/socialUrls';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../components/contexts/UserContext';
import {
  trackProfileView,
  trackSocialClick,
  createReport,
  blockUser,
} from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import SuperlikeService from '../services/SuperlikeService';
import PremiumService from '../services/PremiumService';
import PremiumNudgeService from '../services/PremiumNudgeService';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { incrementSuperlikeSentCount, useProgressiveUnlock } from '../hooks/useProgressiveUnlock';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { Feather } from '@expo/vector-icons';
import socialMediaIcons from '../constants/socialMediaIcons';

const { width, height } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(height * 0.48);

// Fondu bas du hero : plutôt qu'un dégradé blanc/clair (palette.heroGradient,
// pensé pour des overlays de type carte au-dessus de fonds Sun/Moon), on force
// un dégradé NOIR concentré sur les ~35% bas de la photo pour garantir la
// lisibilité du texte blanc (nom/âge/statut) quel que soit le thème Sun/Moon.
const HERO_PHOTO_GRADIENT = ['transparent', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)'];
const HERO_PHOTO_GRADIENT_LOCATIONS = [0, 0.55, 0.8, 1];

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

const REPORT_CATEGORIES = [
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'impersonation', label: "Usurpation d'identité" },
  { value: 'scam', label: 'Arnaque' },
  { value: 'other', label: 'Autre' },
];

// TODO: pas de copy officielle "Dispo ce soir" trouvée ailleurs dans l'app
// (MyAccountScreen n'a que des phrases longues de confirmation de statut).
// Libellés courts provisoires en attendant une validation produit/UX.
const STATUS_LABELS = {
  green: 'Disponible',
  orange: 'Visibilité restreinte',
  red: 'Invisible',
};
const STATUS_COLORS = {
  red: '#F44336',
  orange: '#FF9800',
  green: '#4CAF50',
};

// Pas de helper d'âge générique existant dans utils/age.js (uniquement
// isAtLeast18). Calcul local à partir de user.birthdate.
const computeAge = (birthdate) => {
  if (!birthdate) return null;
  try {
    const dob = new Date(birthdate);
    if (isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age >= 0 ? age : null;
  } catch (_) {
    return null;
  }
};

const UserProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const user = route.params?.user;
  const { user: currentUser } = React.useContext(UserContext);
  const { isPremium: premiumAccessActive, premiumSystemEnabled } = usePremiumAccess();
  const { superlikeUnlocked } = useProgressiveUnlock();
  const [actionMenuVisible, setActionMenuVisible] = React.useState(false);
  const [reportVisible, setReportVisible] = React.useState(false);
  const [reportCategory, setReportCategory] = React.useState('harassment');
  const [reportReason, setReportReason] = React.useState('');
  const [reportDescription, setReportDescription] = React.useState('');
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const [superlikeBalance, setSuperlikeBalance] = React.useState(() => PremiumService.getSuperlikesRemaining());
  const [superlikeSent, setSuperlikeSent] = React.useState(false);
  const [superlikeLoading, setSuperlikeLoading] = React.useState(false);
  const { isDark, colors } = useTheme();
  const { isMoon } = useVibe();
  const { palette, radius, spacing, shadows, typography } = useVibeTheme();
  const insets = useSafeAreaInsets();
  const skyFillStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -insets.top,
    bottom: -insets.bottom,
  };

  // Dynamic scaling based on number of social networks to avoid scrolling and fill the page reasonably
  const socialsArr = user?.socialMedias ?? user?.socialMedia ?? [];
  const socialCountForScale = Array.isArray(socialsArr) ? socialsArr.length : 0;
  const computeScale = (count) => {
    if (count <= 0) return 1.1;
    if (count === 1) return 1.05;
    if (count <= 3) return 1.0;
    if (count <= 6) return 0.9;
    if (count <= 9) return 0.85;
    return 0.8;
  };

  const scale = computeScale(socialCountForScale);
  // 4 icônes par ligne : gabarit de tuile calibré pour tenir 4 par ligne tout
  // en restant lisible (icône plus grande qu'avant + marges/padding resserrés
  // sur la tuile, voir socialMediaTile ci-dessous).
  const iconSize = Math.min(width * 0.19, 68) * scale;
  const baseBioFont = Math.min(width * 0.04, 18) * scale;
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));

  // Swipe-back handled natively by React Navigation native stack.

  const INSTAGRAM_USERNAME_REGEX = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
  const TIKTOK_USERNAME_REGEX = /^[A-Za-z0-9._]{2,24}$/;

  const extractInstagramUsername = (input = '') => {
    let v = String(input).trim();
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
        v = path.split('/')[0] || '';
      }
    } catch (_e) {}
    if (v.startsWith('@')) v = v.slice(1);
    return v;
  };

  const extractTikTokUsername = (input = '') => {
    let v = String(input).trim();
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
        const firstSeg = (path.split('/')[0] || '').trim();
        v = firstSeg.startsWith('@') ? firstSeg.slice(1) : firstSeg;
      }
    } catch (_e) {}
    if (v.startsWith('@')) v = v.slice(1);
    return v;
  };

  // Track a profile view when this screen mounts or when the viewed user changes
  React.useEffect(() => {
    const targetId = user?._id || user?.id;
    const myId = currentUser?._id || currentUser?.id;
    if (!targetId) return;
    if (myId && String(myId) === String(targetId)) return; // don't track self
    (async () => {
      try {
        await trackProfileView(String(targetId));
      } catch (_) {}

      // Nudge Premium (bannière discrète, cooldown/plafond gérés par PremiumNudgeService)
      try {
        const nudge = await PremiumNudgeService.bumpCounter('profile_views', 5, {
          isPremium: premiumAccessActive,
          premiumSystemEnabled,
        });
        if (nudge) publish('premium:nudge', nudge);
      } catch (e) {
        console.error('[UserProfile] Nudge logic error:', e);
      }
    })();
  }, [user?._id, user?.id]);

  const openSocial = async (platform, rawHandle) => {
    const handle = String(rawHandle || '').trim();
    // On considère le tap comme un clic, même si le handle est vide/invalide.
    // On ne bloque que si la plateforme est absente.
    if (!platform) return;
    try {
      // Fire-and-forget: track social click
      try {
        const targetId = user?._id || user?.id;
        const mapPlatform = (p) => {
          const v = String(p || '').toLowerCase();
          if (v === 'twitter') return 'x';
          if (v === 'yt' || v === 'youtube.com') return 'youtube';
          if (v === 'fb' || v === 'facebook.com') return 'facebook';
          if (v === 'ig' || v === 'instagram.com') return 'instagram';
          if (v === 'tt') return 'tiktok';
          return v;
        };
        if (targetId) {
          await trackSocialClick(String(targetId), mapPlatform(platform));
          // Notifier le reste de l'app qu'un clic social a été tracké
          try {
            publish('social_click_tracked', { platform: mapPlatform(platform), targetUserId: String(targetId) });
          } catch (_) {}
        }
      } catch (_) {}

      // Si aucun handle, on s'arrête après le tracking (on n'a rien à ouvrir)
      if (!handle) return;

      if (platform === 'instagram') {
        const username = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(username)) {
          Alert.alert('Lien invalide', "Nom d'utilisateur Instagram invalide");
          return;
        }
        const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
        const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
        // Try opening the app directly; if it fails, fall back to web
        try {
          await Linking.openURL(appUrl);
          return;
        } catch (e1) {
          try {
            await Linking.openURL(webUrl);
            return;
          } catch (e2) {
            Alert.alert("Impossible d'ouvrir Instagram", 'Veuillez réessayer plus tard.');
            return;
          }
        }
      } else if (platform === 'tiktok') {
        const username = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(username)) {
          Alert.alert('Lien invalide', "Nom d'utilisateur TikTok invalide");
          return;
        }
        const webUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
        // Try multiple deep link patterns as TikTok differs across platforms/versions
        const candidates = [
          `tiktok://user/@${encodeURIComponent(username)}`,
          `tiktok://user/profile/@${encodeURIComponent(username)}`,
          `tiktok://user?uniqueId=${encodeURIComponent(username)}`,
          `tiktok://@${encodeURIComponent(username)}`,
        ];
        for (let i = 0; i < candidates.length; i += 1) {
          const url = candidates[i];
          try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
              try {
                await Linking.openURL(url);
                return;
              } catch (_e) {
                // continue to next candidate
              }
            }
          } catch (_e) {
            // continue
          }
        }
        // Fallback to web profile
        try {
          await Linking.openURL(webUrl);
          return;
        } catch (_e2) {
          Alert.alert("Impossible d'ouvrir TikTok", 'Veuillez réessayer plus tard.');
          return;
        }
      }
      // Other platforms: build a web profile URL from handle and open
      if (/^https?:\/\//i.test(handle)) {
        await Linking.openURL(handle);
        return;
      }
      const webUrlOther = buildSocialProfileUrl(platform, handle);
      if (webUrlOther) {
        try {
          await Linking.openURL(webUrlOther);
          return;
        } catch (_e3) {
          // ignore
        }
      }
    } catch (_e) {
      // Silent catch: nothing else to do
    }
  };

  const [displayPref, setDisplayPref] = React.useState('full');
  React.useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISPLAY_NAME_PREF_KEY);
        if (v === 'custom' || v === 'full') setDisplayPref(v);
      } catch (_) {}
    })();
  }, []);

  const displayName = React.useMemo(() => {
    return (
      user?.customName ||
      (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username) ||
      user?.name ||
      (user?.email ? String(user.email).split('@')[0] : '') ||
      'Utilisateur'
    );
  }, [user]);

  const age = React.useMemo(() => computeAge(user?.birthdate), [user?.birthdate]);

  // Ville dérivée côté backend (reverse geocoding). Peut être vide pour les
  // comptes récents/pas encore géocodés : on masque alors proprement ce segment.
  const cityLabel = user?.city || null;

  // Lieu précis actuel : uniquement présent si le backend l'a renvoyé, ce qui
  // n'est le cas que si l'utilisateur cible a activé
  // privacyPreferences.shareCurrentLocation (défaut désactivé).
  const currentPlaceLabel = user?.currentLocation?.name || null;

  // Compute distance on the fly if not provided (e.g., when coming from search)
  const [computedDistance, setComputedDistance] = React.useState(null);
  const distanceBetweenMeters = React.useCallback((lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  const formatDistance = React.useCallback((meters) => {
    if (meters == null || isNaN(meters)) return '—';
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  }, []);

  const formatLastSeen = React.useCallback((dateInput) => {
    if (!dateInput) return null;
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return null;
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffSec < 60) return "À l'instant";
      if (diffMin < 60) return `Il y a ${diffMin} min`;
      if (diffHr < 24) return `Il y a ${diffHr} h`;
      if (diffDay === 1) return 'Hier';
      return `Il y a ${diffDay} j`;
    } catch (_) {
      return null;
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        if (user?.distance) return; // already provided by list
        const coords = user?.locationCoordinates; // [lon, lat]
        if (!Array.isArray(coords) || coords.length < 2) return;
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat1 = loc.coords.latitude;
        const lon1 = loc.coords.longitude;
        const [lon2, lat2] = coords;
        const meters = distanceBetweenMeters(lat1, lon1, lat2, lon2);
        setComputedDistance(formatDistance(meters));
      } catch (_) {
        // ignore errors silently
      }
    })();
  }, [user, distanceBetweenMeters, formatDistance]);

  const handleBlockUser = async () => {
    if (!user?._id) return;
    Alert.alert(
      'Bloquer cet utilisateur ?',
      'Vous ne verrez plus cet utilisateur et il ne pourra plus vous contacter.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(user._id);
              setActionMenuVisible(false);
              Alert.alert('Utilisateur bloqué', 'Cet utilisateur a été bloqué.');
            } catch (e) {
              Alert.alert('Erreur', e?.message || 'Impossible de bloquer cet utilisateur.');
            }
          },
        },
      ],
    );
  };

  const handleSubmitReport = async () => {
    if (!user?._id) return;
    if (!reportReason.trim()) {
      Alert.alert('Motif requis', "Merci d'indiquer un motif.");
      return;
    }
    try {
      setReportSubmitting(true);
      await createReport({
        reportedUserId: user._id,
        category: reportCategory,
        reason: reportReason.trim(),
        description: reportDescription.trim(),
      });
      setReportVisible(false);
      setActionMenuVisible(false);
      setReportReason('');
      setReportDescription('');
      Alert.alert('Signalement envoyé', 'Merci pour votre signalement.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer le signalement.");
    } finally {
      setReportSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>Aucun utilisateur sélectionné.</Text>
        <TouchableOpacity style={styles.modalButton} onPress={() => navigation.goBack()}>
          <Text style={styles.modalButtonText}>Retour à la liste</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSuperlike = async () => {
    if (superlikeSent || superlikeLoading) return;
    if (!superlikeUnlocked) {
      Alert.alert('Bientôt débloqué', 'Les superlikes se débloquent après ton premier check-in.');
      return;
    }
    if (superlikeBalance <= 0) {
      publish('ui:open_consumables', { type: 'superlike' });
      return;
    }
    setSuperlikeLoading(true);
    try {
      const targetId = user?._id || user?.id;
      const result = await SuperlikeService.send(targetId);
      if (result.success) {
        setSuperlikeSent(true);
        setSuperlikeBalance(PremiumService.getSuperlikesRemaining());
        try {
          await incrementSuperlikeSentCount();
        } catch (_) {}
        Alert.alert('⭐ Superlike envoyé !', `${displayName} a été notifié(e) que tu le/la remarques.`);
      } else if (result.reason === 'no_superlikes') {
        publish('ui:open_consumables', { type: 'superlike' });
      } else {
        Alert.alert('Erreur', "Impossible d'envoyer le superlike.");
      }
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer le superlike.");
    } finally {
      setSuperlikeLoading(false);
    }
  };

  const statusKey = user.status === 'red' ? 'red' : user.status === 'orange' ? 'orange' : 'green';
  const statusColor = STATUS_COLORS[statusKey];
  const statusLabel = STATUS_LABELS[statusKey];

  // ─── Hero : photo pleine largeur sur ~1/3 de l'écran + fondu ────────
  const renderHero = () => (
    <View style={styles.hero}>
      {user.photo ? (
        <ImageWithPlaceholder uri={user.photo} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={palette.heroFallback}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!user.photo && (
        <View style={styles.heroIconWrap}>
          <Image
            source={require('../assets/appIcons/userProfile.png')}
            style={{ width: 96, height: 96, tintColor: 'rgba(255,255,255,0.45)' }}
          />
        </View>
      )}
      <LinearGradient
        colors={HERO_PHOTO_GRADIENT}
        locations={HERO_PHOTO_GRADIENT_LOCATIONS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Boutons flottants (retour / menu / superlike) */}
      <SafeAreaView edges={['top']} style={styles.heroSafeTop} pointerEvents="box-none">
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            style={[styles.heroRoundBtn, { backgroundColor: palette.overlay }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            accessibilityLabel="Retour"
          >
            <Feather name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroRoundBtn, { backgroundColor: palette.overlay }]}
            onPress={() => setActionMenuVisible(true)}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            accessibilityLabel="Plus d'options"
          >
            <Text style={styles.menuButtonText}>⋯</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroActionsColumn}>
          <TouchableOpacity
            style={[
              styles.heroRoundBtn,
              {
                backgroundColor: superlikeSent ? 'rgba(255,215,0,0.35)' : palette.overlay,
                opacity: superlikeLoading || superlikeSent ? 0.75 : superlikeUnlocked ? 1 : 0.4,
              },
            ]}
            onPress={handleSuperlike}
            disabled={superlikeLoading || superlikeSent}
            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
            accessibilityLabel={superlikeUnlocked ? 'Envoyer un superlike' : 'Superlike verrouillé, débloqué après ton premier check-in'}
          >
            {superlikeLoading ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <Text style={{ fontSize: 18 }}>{superlikeSent ? '✓' : superlikeUnlocked ? '⭐' : '🔒'}</Text>
            )}
            {superlikeBalance > 0 && !superlikeSent && (
              <View style={styles.superlikeBadge}>
                <Text style={styles.superlikeBadgeText}>{superlikeBalance}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Nom + âge + statut/ville en overlay bas du fondu (sur la photo) */}
      <View style={styles.heroNameOverlay} pointerEvents="none">
        <Text style={styles.heroNameText} numberOfLines={1}>
          {displayName}
          {age != null ? `, ${age}` : ''}
        </Text>
        <View style={[styles.statusRow, { marginTop: spacing.xs }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.heroStatusText}>{statusLabel}</Text>
          {!!cityLabel && (
            <>
              <Text style={styles.heroStatusSeparator}>·</Text>
              <Text style={styles.heroCityText}>{cityLabel}</Text>
            </>
          )}
        </View>
        {!!currentPlaceLabel && (
          <Text style={styles.heroCurrentPlaceText} numberOfLines={1}>
            Actuellement à {currentPlaceLabel}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {isMoon ? <NightSkyBackground style={skyFillStyle} /> : <DaySkyBackground style={skyFillStyle} />}
      <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: Math.max(24, height * 0.06) + insets.bottom,
            flexGrow: 1,
          }}
        >
          {renderHero()}

          <View style={{ paddingHorizontal: spacing.lg }}>
            {!!user.mutualConnection && (
              <View
                style={[
                  styles.mutualBanner,
                  {
                    backgroundColor: palette.accentSoft,
                    borderRadius: radius.md,
                    marginTop: spacing.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <Feather name="heart" size={16} color={palette.accent} />
                <Text style={{ marginLeft: 8, color: palette.accent, fontWeight: '700', flex: 1 }}>
                  Cette personne veut entrer en contact
                </Text>
              </View>
            )}

            {user.updatedAt && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
                <View
                  style={[styles.distancePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                >
                  <Text style={[styles.distanceText, { color: colors.accent }]}>
                    {formatLastSeen(user.updatedAt)}
                  </Text>
                </View>
              </View>
            )}

            {/* Bio */}
            <View
              style={[
                styles.bioContainer,
                { backgroundColor: palette.surface, borderRadius: radius.lg, marginTop: spacing.lg },
                shadows.card,
              ]}
            >
              <View style={styles.bioTitleContainer}>
                <Text style={[typography.caption, { color: palette.textFaint, fontWeight: '700' }]}>BIO</Text>
              </View>
              <View style={styles.bioTextContainer}>
                {(() => {
                  const bioText = String(user?.bio || '').trim();
                  const isEmpty = bioText.length === 0;
                  return (
                    <Text
                      style={[
                        styles.value,
                        {
                          fontSize: bioFont,
                          textAlign: 'left',
                          width: '100%',
                          color: isEmpty ? palette.textFaint : palette.text,
                          fontStyle: isEmpty ? 'italic' : 'normal',
                          lineHeight: bioFont * 1.4,
                        },
                      ]}
                    >
                      {isEmpty ? 'Aucune bio renseignée.' : bioText}
                    </Text>
                  );
                })()}
              </View>
            </View>

            {/* Réseaux sociaux */}
            <View style={[styles.socialMediaContainer, { marginTop: spacing.lg }]}>
              {(() => {
                const isMe = String(currentUser?._id || currentUser?.id) === String(user?._id || user?.id);
                if (!isMe && (user.status === 'orange' || user.status === 'red') && !user.mutualConnection) {
                  return (
                    <Text style={[styles.orangeStatusText, { color: colors.textSecondary }]}>
                      L'utilisateur ne partage pas ses réseaux sociaux
                    </Text>
                  );
                }
                const socials = user.socialMedias ?? user.socialMedia ?? [];
                return socials.length > 0 ? (
                  socials.map((social, index) => {
                    // Supporte différents schémas d'objets provenant de diverses sources
                    // - Backend: { type, handle }
                    // - Ancien front: { platform, username }
                    // - Très ancien: { socialMedia, identifier }
                    const rawPlatform = social.platform ?? social.type ?? social.socialMedia;
                    const canonPlatform = (() => {
                      const v = String(rawPlatform || '').toLowerCase();
                      if (v === 'twitter' || v === 'twitter.com' || v === 'x.com') return 'x';
                      if (v === 'yt' || v === 'youtu.be' || v === 'youtube.com') return 'youtube';
                      if (v === 'fb' || v === 'facebook.com') return 'facebook';
                      if (v === 'ig' || v === 'insta' || v === 'instagram.com') return 'instagram';
                      if (v === 'tt' || v === 'tiktok.com') return 'tiktok';
                      if (v === 'snap' || v === 'snapchat.com') return 'snapchat';
                      return rawPlatform;
                    })();
                    const iconSrc = canonPlatform ? socialMediaIcons[canonPlatform] : undefined;
                    if (!iconSrc) return null;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.socialMediaTile, { backgroundColor: palette.surface, borderRadius: radius.md }]}
                        onPress={() => {
                          // Support de plusieurs schémas: username | handle | link | identifier
                          const handle = social.username || social.handle || social.link || social.identifier || '';
                          openSocial(canonPlatform, handle);
                        }}
                      >
                        <Image
                          source={iconSrc}
                          style={[styles.socialMediaIcon, { width: iconSize, height: iconSize }]}
                        />
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={[styles.value, { color: palette.textMuted }]}>Aucun réseau social</Text>
                );
              })()}
            </View>
          </View>
        </ScrollView>

        <Modal
          transparent
          visible={actionMenuVisible}
          animationType="fade"
          onRequestClose={() => setActionMenuVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setActionMenuVisible(false)}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback>
                <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>Actions</Text>
                  <TouchableOpacity style={styles.menuAction} onPress={handleBlockUser}>
                    <Text style={styles.menuActionText}>Bloquer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.menuAction}
                    onPress={() => {
                      setActionMenuVisible(false);
                      setReportVisible(true);
                    }}
                  >
                    <Text style={styles.menuActionText}>Signaler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.menuAction, styles.menuCancel]}
                    onPress={() => setActionMenuVisible(false)}
                  >
                    <Text style={styles.menuCancelText}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal transparent visible={reportVisible} animationType="fade" onRequestClose={() => setReportVisible(false)}>
          <TouchableWithoutFeedback
            onPress={() => {
              Keyboard.dismiss();
              setReportVisible(false);
            }}
          >
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                  <ScrollView
                    contentContainerStyle={[styles.reportCard, { backgroundColor: colors.surface }]}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Signaler un utilisateur</Text>
                    <Text style={[styles.reportWarning, { color: colors.textSecondary }]}>
                      Les signalements abusifs peuvent entraîner des sanctions. Merci d'être honnête.
                    </Text>

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Catégorie</Text>
                    <View style={styles.categoryGrid}>
                      {REPORT_CATEGORIES.map((cat) => {
                        const selected = reportCategory === cat.value;
                        return (
                          <TouchableOpacity
                            key={cat.value}
                            style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                            onPress={() => setReportCategory(cat.value)}
                          >
                            <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Motif</Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bg },
                      ]}
                      placeholder="Expliquez brièvement le motif"
                      placeholderTextColor={colors.textSecondary}
                      value={reportReason}
                      onChangeText={setReportReason}
                    />

                    <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Description (optionnelle)</Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        styles.modalTextarea,
                        { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bg },
                      ]}
                      placeholder="Détails supplémentaires"
                      placeholderTextColor={colors.textSecondary}
                      value={reportDescription}
                      onChangeText={setReportDescription}
                      multiline
                    />

                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={handleSubmitReport}
                      disabled={reportSubmitting}
                    >
                      <Text style={styles.modalButtonText}>
                        {reportSubmitting ? 'Envoi...' : 'Envoyer le signalement'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.deleteButton]}
                      onPress={() => setReportVisible(false)}
                      disabled={reportSubmitting}
                    >
                      <Text style={styles.modalButtonText}>Annuler</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  heroSafeTop: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopRow: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroActionsColumn: {
    position: 'absolute',
    top: 112,
    right: 16,
    alignItems: 'center',
  },
  heroRoundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNameOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 16,
  },
  heroNameText: {
    color: '#fff',
    fontSize: Math.min(width * 0.08, 32),
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroStatusText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroStatusSeparator: {
    color: 'rgba(255,255,255,0.75)',
    marginHorizontal: 6,
    fontWeight: '700',
  },
  heroCityText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroCurrentPlaceText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  mutualBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bioContainer: {
    width: '100%',
    padding: 15,
  },
  bioTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bioTextContainer: {
    width: '100%',
  },
  value: {
    fontSize: Math.min(width * 0.04, 16),
    color: '#3f4a4b',
  },
  socialMediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialMediaTile: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height * 0.02,
    marginHorizontal: width * 0.01,
    padding: Math.max(5, width * 0.01),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  socialMediaIcon: {
    width: Math.min(width * 0.19, 68),
    height: Math.min(width * 0.19, 68),
    resizeMode: 'contain',
  },
  orangeStatusText: {
    fontSize: Math.min(width * 0.04, 16),
    textAlign: 'center',
  },
  distancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e6fbfc',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00c2cb',
  },
  distanceText: {
    color: '#00aab2',
    fontWeight: '600',
  },
  reportCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    padding: 16,
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: width * 0.06,
    fontWeight: 'bold',
    marginBottom: height * 0.02,
    color: '#00c2cb',
  },
  modalInput: {
    width: '100%',
    height: height * 0.06,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: width * 0.03,
    marginBottom: height * 0.02,
  },
  modalButton: {
    backgroundColor: '#00c2cb',
    padding: width * 0.03,
    borderRadius: 10,
    marginBottom: height * 0.01,
    width: '80%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: width * 0.05,
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  menuButtonText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 2,
  },
  superlikeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  superlikeBadgeText: { color: '#000', fontSize: 9, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
  },
  menuCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 12,
    padding: 16,
  },
  menuTitle: {
    fontSize: width * 0.055,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  menuAction: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuActionText: {
    fontSize: width * 0.05,
    textAlign: 'center',
    color: '#00c2cb',
    fontWeight: '600',
  },
  menuCancel: {
    borderBottomWidth: 0,
    marginTop: 6,
  },
  menuCancelText: {
    fontSize: width * 0.05,
    textAlign: 'center',
    color: '#ff4d4d',
    fontWeight: '700',
  },
  error: {
    fontSize: width * 0.05,
    color: 'red',
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
  reportWarning: {
    fontSize: width * 0.04,
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
  sectionLabel: {
    fontSize: width * 0.045,
    fontWeight: '600',
    marginBottom: 6,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f7f7f7',
  },
  categoryChipSelected: {
    borderColor: '#00c2cb',
    backgroundColor: '#e6fbfc',
  },
  categoryChipText: {
    fontSize: width * 0.04,
    color: '#333',
  },
  categoryChipTextSelected: {
    color: '#00aab2',
    fontWeight: '600',
  },
  modalTextarea: {
    height: height * 0.14,
    textAlignVertical: 'top',
  },
});

export default UserProfileScreen;
