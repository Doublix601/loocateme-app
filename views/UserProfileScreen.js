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
} from 'react-native';
import * as Location from 'expo-location';
import { buildSocialProfileUrl } from '../services/socialUrls';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../components/contexts/UserContext';
import { trackProfileView, trackSocialClick } from '../components/ApiRequest';
import { publish } from '../components/EventBus';
import { useTheme } from '../components/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

const UserProfileScreen = ({ user, onReturnToList, onReturnToAccount, socialMediaIcons }) => {
  const { user: currentUser } = React.useContext(UserContext);
  const { colors } = useTheme();
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
  backButtonImage: {
    width: 28,
    height: 28,
    tintColor: '#00c2cb',
  },
  error: {
    fontSize: width * 0.05,
    color: 'red',
    textAlign: 'center',
    marginBottom: height * 0.02,
  },
});

export default UserProfileScreen;
