import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Image,
  ScrollView,
  Dimensions,
  PanResponder,
  SafeAreaView,
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
import * as Location from 'expo-location';
import { buildSocialProfileUrl } from '../services/socialUrls';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../components/contexts/UserContext';
import { trackProfileView, trackSocialClick, createReport, blockUser, getFollowStatus as apiGetFollowStatus, createFollowRequest as apiCreateFollowRequest } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { useTheme } from '../components/contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

const REPORT_CATEGORIES = [
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'impersonation', label: 'Usurpation d’identité' },
  { value: 'scam', label: 'Arnaque' },
  { value: 'other', label: 'Autre' },
];

const UserProfileScreen = ({ user, onReturnToList, onReturnToAccount, socialMediaIcons, onOpenMessages, onOpenConversation }) => {
  const { user: currentUser } = React.useContext(UserContext);
  const { colors } = useTheme();
  const [actionMenuVisible, setActionMenuVisible] = React.useState(false);
  const [reportVisible, setReportVisible] = React.useState(false);
  const [reportCategory, setReportCategory] = React.useState('harassment');
  const [reportReason, setReportReason] = React.useState('');
  const [reportDescription, setReportDescription] = React.useState('');
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const [followStatus, setFollowStatus] = React.useState('none'); // 'none' | 'pending' | 'accepted'
  const [followLoading, setFollowLoading] = React.useState(false);
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      return isHorizontal && dx > 10;
    },
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, vx } = gestureState;
      if (dx > 60 || vx > 0.3) {
        onReturnToList && onReturnToList();
      }
    },
  });

  // Dynamic scaling based on number of social networks to avoid scrolling and fill the page reasonably
  const socialsArr = (user?.socialMedias ?? user?.socialMedia ?? []);
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
  const imgSize = Math.min(width * 0.4, 160) * scale;
  const iconSize = Math.min(width * 0.2, 72) * scale;
  const usernameFont = Math.min(width * 0.075, 30) * scale;
  const baseBioFont = Math.min(width * 0.04, 18) * scale;
  const bioFont = Math.max(14, Math.min(baseBioFont, 22));
  const placeholderIconSize = Math.min(width * 0.18, 72) * scale;

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

  // Mesure dynamique de la largeur du nom pour adapter la box image+nom
  const [measuredNameWidth, setMeasuredNameWidth] = React.useState(0);
  const SAFE_LEFT_FOR_BACK = 56; // espace minimum pour le bouton retour
  const boxHorizontalPadding = Math.max(16, Math.round(width * 0.05));
  const maxBoxWidth = Math.max(220, width - 2 * SAFE_LEFT_FOR_BACK);
  // Légère marge supplémentaire pour éviter un rendu trop serré autour de l'image et du nom
  const extraSlack = Math.max(10, Math.round(width * 0.025));
  const minBoxWidth = Math.min(maxBoxWidth, Math.round(width * 0.92));
  const desiredBoxWidth = Math.max(
    minBoxWidth,
    Math.min(
      maxBoxWidth,
      Math.max(imgSize, measuredNameWidth) + 2 * boxHorizontalPadding + extraSlack
    )
  );

  // Track a profile view when this screen mounts or when the viewed user changes
  React.useEffect(() => {
    const targetId = user?._id || user?.id;
    const myId = currentUser?._id || currentUser?.id;
    if (!targetId) return;
    if (myId && String(myId) === String(targetId)) return; // don't track self
    (async () => {
      try { await trackProfileView(String(targetId)); } catch (_) {}
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
          try { publish('social_click_tracked', { platform: mapPlatform(platform), targetUserId: String(targetId) }); } catch (_) {}
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
            Alert.alert('Impossible d\'ouvrir Instagram', "Veuillez réessayer plus tard.");
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
    const first = (user?.firstName || '').trim();
    const last = (user?.lastName || '').trim();
    const custom = (user?.customName || '').trim();
    const hasFull = first && last;
    const full = hasFull ? `${first} ${last}`.trim() : '';
    const fallback = user?.username || user?.name || (user?.email ? String(user.email).split('@')[0] : '') || 'Utilisateur';
    if (displayPref === 'custom') return custom || full || fallback;
    return full || custom || fallback;
  }, [user, displayPref]);

  // Compute distance on the fly if not provided (e.g., when coming from search)
  const [computedDistance, setComputedDistance] = React.useState(null);
  const distanceBetweenMeters = React.useCallback((lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
      if (diffDay === 1) return "Hier";
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
      'Bloquer cet utilisateur ?'
      , 'Vous ne verrez plus cet utilisateur et il ne pourra plus vous contacter.',
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
      ]
    );
  };

  const handleSubmitReport = async () => {
    if (!user?._id) return;
    if (!reportReason.trim()) {
      Alert.alert('Motif requis', 'Merci d’indiquer un motif.');
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
      Alert.alert('Erreur', e?.message || 'Impossible d’envoyer le signalement.');
    } finally {
      setReportSubmitting(false);
    }
  };


  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
        <Text style={styles.error}>Aucun utilisateur sélectionné.</Text>
        <TouchableOpacity style={styles.modalButton} onPress={onReturnToList}>
          <Text style={styles.modalButtonText}>Retour à la liste</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Charger l'état de suivi au montage
  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user?._id && !user?.id) return;
      try {
        const targetId = user._id || user.id;
        const res = await apiGetFollowStatus(targetId);
        const st = res?.status || 'none';
        if (mounted) setFollowStatus(st);
      } catch (_) {
        if (mounted) setFollowStatus('none');
      }
    };
    load();
    return () => { mounted = false; };
  }, [user?._id, user?.id]);

  const handleMessagePress = async () => {
    if (!user) return;
    if (followStatus === 'accepted') {
      if (onOpenConversation) onOpenConversation(user);
      else try { publish('chat:openConversation', user); } catch (_) {}
      return;
    }
    if (followStatus === 'pending') return; // désactivé
    // none -> créer une demande de suivi
    try {
      setFollowLoading(true);
      await apiCreateFollowRequest(user._id || user.id);
      setFollowStatus('pending');
    } catch (e) {
      try { Alert.alert('Erreur', e?.message || 'Impossible d’envoyer la demande'); } catch (_) {}
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onReturnToList}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Image
          source={require('../assets/appIcons/backArrow.png')}
          style={styles.backButtonImage}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setActionMenuVisible(true)}
        hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
      >
        <Text style={styles.menuButtonText}>...</Text>
      </TouchableOpacity>
      {/* Bouton Suivre/Message en icône seule (lien) */}
      <TouchableOpacity
        style={[
          styles.followIconButton,
          {
            backgroundColor: followStatus === 'accepted' ? colors.accent : colors.surfaceAlt,
            borderColor: colors.accent,
            opacity: (followLoading || followStatus === 'pending') ? 0.6 : 1,
          },
        ]}
        onPress={handleMessagePress}
        disabled={followLoading || followStatus === 'pending'}
        hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
        accessibilityLabel={followStatus === 'accepted' ? 'Ouvrir la conversation' : followStatus === 'pending' ? 'Demande en attente' : 'Envoyer une demande de suivi'}
      >
        {followLoading ? (
          <ActivityIndicator color={followStatus === 'accepted' ? '#fff' : colors.accent} />
        ) : (
          <Feather
            name="link-2"
            size={22}
            color={followStatus === 'accepted' ? '#fff' : colors.accent}
          />
        )}
      </TouchableOpacity>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: width * 0.05, paddingTop: height * 0.01, paddingBottom: Math.max(24, height * 0.06), flexGrow: 1 }}>

        <View style={styles.userInfoContainer}>
          <View style={styles.profileHeader}>
            <View style={[styles.imgUsernameSplitBox, { backgroundColor: colors.surfaceAlt, width: desiredBoxWidth, paddingHorizontal: boxHorizontalPadding }]}>
              <View style={styles.userProfilePictureContainer}>
                {user.photo ? (
                  <ImageWithPlaceholder uri={user.photo} style={[styles.profileImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]} />
                ) : (
                  <View style={[styles.placeholderImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}>
                    <Image
                      source={require('../assets/appIcons/userProfile.png')}
                      style={[styles.placeholderIcon, { width: placeholderIconSize, height: placeholderIconSize }]}
                    />
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <Text style={[styles.usernameUnderPhoto, { fontSize: usernameFont }]}>{displayName}</Text>
                {/* Mesure invisible en une seule ligne */}
                <Text
                  style={[styles.usernameUnderPhoto, { fontSize: usernameFont, position: 'absolute', opacity: 0 }]}
                  numberOfLines={1}
                  onLayout={(e) => {
                    const w = e?.nativeEvent?.layout?.width || 0;
                    if (w && Math.abs(w - measuredNameWidth) > 0.5) setMeasuredNameWidth(w);
                  }}
                >
                  {displayName}
                </Text>
              </View>
            </View>

            {(user?.bio ?? '').trim().length > 0 ? (
              <View style={styles.bioContainer}>
                <View style={styles.bioTextContainer}>
                  <Text
                    style={[
                      styles.value,
                      { fontSize: bioFont, textAlign: 'center', color: colors.textPrimary },
                    ]}
                  >
                    {user.bio}
                  </Text>
                </View>
              </View>
            ) : null}

            {currentUser?.isVisible !== false && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: height * 0.015 }}>
                <View style={[styles.distancePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent, marginRight: 8 }]}>
                  <Text style={[styles.distanceText, { color: colors.accent }]}>{user.distance ?? computedDistance ?? '—'}</Text>
                </View>
                {user.updatedAt && (
                  <View style={[styles.distancePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                    <Text style={[styles.distanceText, { color: colors.accent }]}>{formatLastSeen(user.updatedAt)}</Text>
                  </View>
                )}
              </View>
            )}

          </View>

          <View style={styles.socialMediaContainer}>
            {(() => {
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
                      style={styles.socialMediaTile}
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
                <Text style={[styles.value, { color: colors.textSecondary }]}>Aucun réseau social</Text>
              );
            })()}
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={actionMenuVisible} animationType="fade" onRequestClose={() => setActionMenuVisible(false)}>
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
                <TouchableOpacity style={[styles.menuAction, styles.menuCancel]} onPress={() => setActionMenuVisible(false)}>
                  <Text style={styles.menuCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent visible={reportVisible} animationType="fade" onRequestClose={() => setReportVisible(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setReportVisible(false); }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ width: '100%' }}
              >
                <ScrollView
                  contentContainerStyle={[styles.reportCard, { backgroundColor: colors.surface }]}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Signaler un utilisateur</Text>
                  <Text style={[styles.reportWarning, { color: colors.textSecondary }]}>Les signalements abusifs peuvent entraîner des sanctions. Merci d’être honnête.</Text>

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
                          <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{cat.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Motif</Text>
                  <TextInput
                    style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bg }]}
                    placeholder="Expliquez brièvement le motif"
                    placeholderTextColor={colors.textSecondary}
                    value={reportReason}
                    onChangeText={setReportReason}
                  />

                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>Description (optionnelle)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextarea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bg }]}
                    placeholder="Détails supplémentaires"
                    placeholderTextColor={colors.textSecondary}
                    value={reportDescription}
                    onChangeText={setReportDescription}
                    multiline
                  />

                  <TouchableOpacity style={styles.modalButton} onPress={handleSubmitReport} disabled={reportSubmitting}>
                    <Text style={styles.modalButtonText}>{reportSubmitting ? 'Envoi...' : 'Envoyer le signalement'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={() => setReportVisible(false)} disabled={reportSubmitting}>
                    <Text style={styles.modalButtonText}>Annuler</Text>
                  </TouchableOpacity>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>


    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: width * 0.08,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: height * 0.02,
    marginBottom: height * 0.03,
    color: '#00c2cb',
  },
  userInfoContainer: {
    marginBottom: height * 0.04,
  },
  usernameTitleContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  usernameTextContainer: {
    alignItems: 'flex-start',
    width: '100%',
  },
  bioContainer: {
    width: '100%',
    marginTop: height * 0.02,
    alignItems: 'center',
  },
  bioTitleContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  bioTextContainer: {
    alignItems: 'center',
    width: '100%',
  },
  profileHeader: {
    flexDirection: width > 600 ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: height * 0.03,
  },
  imgUsernameSplitBox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    // Réduit pour éviter le chevauchement avec le bouton retour
    width: '88%',
    alignSelf: 'center',
    paddingVertical: height * 0.02,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },

  userProfilePictureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: width > 600 ? width * 0.05 : width * 0.03,
    marginBottom: width > 600 ? 0 : height * 0.02,
    marginRight: width > 600 ? 20 : 15,
  },

  usernameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.01,
  },
  usernameUnderPhoto: {
    marginTop: 8,
    fontSize: Math.min(width * 0.075, 30),
    color: '#00c2cb',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  profileImage: {
    width: Math.min(width * 0.4, 160),
    height: Math.min(width * 0.4, 160),
    borderRadius: Math.min(width * 0.2, 80),
  },
  placeholderImage: {
    width: Math.min(width * 0.4, 160),
    height: Math.min(width * 0.4, 160),
    backgroundColor: '#00c2cb',
    borderRadius: Math.min(width * 0.2, 80),
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    width: Math.min(width * 0.18, 72),
    height: Math.min(width * 0.18, 72),
    tintColor: '#fff',
  },
  userInfoText: {
    marginLeft: width > 600 ? width * 0.05 : 0,
    alignItems: width > 600 ? 'flex-start' : 'center',
  },
  label: {
    fontSize: Math.min(width * 0.045, 18),
    color: '#00c2cb',
    marginBottom: 5,
  },
  value: {
    fontSize: Math.min(width * 0.04, 16),
    color: '#3f4a4b',
  },
  editButton: {
    backgroundColor: '#00c2cb',
    paddingVertical: height * 0.01,
    paddingHorizontal: width * 0.05,
    borderRadius: 10,
    marginTop: height * 0.01,
  },
  editButtonText: {
    color: '#fff',
    fontSize: Math.min(width * 0.04, 16),
  },
  socialMediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  socialMediaTile: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height * 0.02,
    marginHorizontal: width * 0.03,
    padding: Math.max(6, width * 0.02),
    borderRadius: 999,
  },
  socialMediaIcon: {
    width: Math.min(width * 0.2, 72),
    height: Math.min(width * 0.2, 72),
    resizeMode: 'contain',
  },
  socialMediaText: {
    fontSize: width * 0.04,
    marginTop: height * 0.01,
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
    paddingTop: height * 0.05,
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
  iconContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  selectedTile: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  returnToListButton: {
    backgroundColor: '#00c2cb',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 30,
    right: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  settingsButton: {
    backgroundColor: '#00c2cb',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 30,
    right: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  roundButtonImage: {
    width: 30,
    height: 30,
    tintColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    padding: 8,
  },
  followIconButton: {
    position: 'absolute',
    top: 56,
    right: 14,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#00c2cb',
    letterSpacing: 2,
  },
  backButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: width * 0.05,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    padding: 16,
    alignSelf: 'center',
  },
  modalLabel: {
    fontSize: width * 0.04,
    marginTop: 8,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    backgroundColor: '#00c2cb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#e0f7f9',
  },
  cancelButtonText: {
    color: '#00c2cb',
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  targetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  targetChipActive: {
    borderColor: '#00c2cb',
    backgroundColor: '#e6fbfc',
  },
  targetChipText: {
    fontSize: width * 0.04,
    color: '#333',
  },
  targetChipTextActive: {
    color: '#00aab2',
    fontWeight: '600',
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
