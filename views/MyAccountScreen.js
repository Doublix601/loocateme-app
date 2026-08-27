import { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  RefreshControl,
  Dimensions,
  Alert,
  Platform,
  Linking,
  Share,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import { UserContext } from '../components/contexts/UserContext';
import {
  upsertSocial as apiUpsertSocial,
  removeSocial as apiRemoveSocial,
  reorderSocial as apiReorderSocial,
  getMyUser,
  updateUserStatus as apiUpdateUserStatus,
  claimSupervise as apiClaimSupervise,
  claimBoost as apiClaimBoost,
  apiUpdateShareCurrentLocation,
} from '../components/ApiRequest';
import { proxifyImageUrl } from '../components/ServerUtils';
import Toast from '../components/Toast';
import { buildSocialProfileUrl } from '../services/socialUrls';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { usePremiumAccess } from '../hooks/usePremiumAccess';
import { useMainSwiper } from '../components/contexts/MainSwiperContext';
import SpotlightOverlay from '../components/SpotlightOverlay';
import { TAB_BAR_HEIGHT } from '../components/MainTabBar';
import { hasSeenProfileOnboarding, markProfileOnboardingDone } from '../utils/onboarding';
import {
  shouldShowShareLocationNudge,
  recordShareLocationNudgeShown,
  recordShareLocationNudgeDismissedForever,
} from '../utils/shareLocationNudge';
import SuperlikeHistoryModal from '../components/SuperlikeHistoryModal';
import ConsumablesShopSheet from '../components/ConsumablesShopSheet';
import PremiumService from '../services/PremiumService';
import { subscribe } from '../components/EventBus';

import ProfileHero from './MyAccount/ProfileHero';
import BioSection from './MyAccount/BioSection';
import WarningsBanner from './MyAccount/WarningsBanner';
import ShareLocationNudge from './MyAccount/ShareLocationNudge';
import RewardsCard from './MyAccount/RewardsCard';
import SocialGrid from './MyAccount/SocialGrid';
import ReferralLink from './MyAccount/ReferralLink';
import ActionsFooter from './MyAccount/ActionsFooter';
import AddSocialModal from './MyAccount/AddSocialModal';
import EditSocialModal from './MyAccount/EditSocialModal';
import StatusPickerModal from './MyAccount/StatusPickerModal';
import QrModal from './MyAccount/QrModal';

const { width, height } = Dimensions.get('window');
const H = height;

const MyAccountScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { goToPage, currentPage, lockSwiper, unlockSwiper } = useMainSwiper();
  const { colors, isDark } = useTheme();
  const { isMoon } = useVibe();
  const insets = useSafeAreaInsets();
  const skyFillStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -insets.top,
    bottom: -insets.bottom,
  };
  const { user, updateUser } = useContext(UserContext);
  const { isPremium, hasStatsAccess, premiumSystemEnabled, effectiveStatisticsEnabled } = usePremiumAccess();
  const [superlikeBalance, setSuperlikeBalance] = useState(PremiumService.getSuperlikesRemaining());
  const [boostBalance, setBoostBalance] = useState(PremiumService.getBoostsRemaining());
  const refreshConsumableCounts = () => {
    setSuperlikeBalance(PremiumService.getSuperlikesRemaining());
    setBoostBalance(PremiumService.getBoostsRemaining());
  };
  const { flags } = useFeatureFlags();
  const warningsCount = user?.moderation?.warningsCount || 0;
  const [newValue, setNewValue] = useState('');
  // Partage / QR
  const [qrVisible, setQrVisible] = useState(false);
  const [superlikeHistoryVisible, setSuperlikeHistoryVisible] = useState(false);
  const [superlikeHistoryTab, setSuperlikeHistoryTab] = useState('received');
  const [consumablesShopVisible, setConsumablesShopVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [myUserId, setMyUserId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [streakClaiming, setStreakClaiming] = useState(false);

  // ── Pulse animations : icônes Superlike (étoile) et Boost (éclair) ────
  const superlikePulse = useRef(new Animated.Value(1)).current;
  const boostPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const makeLoop = (val, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(val, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
    const loop1 = makeLoop(superlikePulse, 0);
    const loop2 = makeLoop(boostPulse, 400);
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, []);

  // ── Spotlight onboarding ──────────────────────────────────────
  const [spotStep, setSpotStep] = useState(-1);
  const [spotRect, setSpotRect] = useState(null);
  const spotStarted = useRef(false);
  const scrollViewRef = useRef(null);
  const photoRef = useRef(null);
  const bioRef = useRef(null);
  const socialRef = useRef(null);
  const statusRef = useRef(null);

  const SPOT_STEPS = [
    {
      ref: photoRef,
      borderRadius: 24,
      title: t('myAccountScreen.spot.photoTitle'),
      description: t('myAccountScreen.spot.photoDesc'),
    },
    {
      ref: bioRef,
      borderRadius: 16,
      title: t('myAccountScreen.spot.bioTitle'),
      description: t('myAccountScreen.spot.bioDesc'),
    },
    {
      ref: socialRef,
      borderRadius: 16,
      title: t('myAccountScreen.spot.socialTitle'),
      description: t('myAccountScreen.spot.socialDesc'),
    },
    {
      ref: statusRef,
      borderRadius: 16,
      title: t('myAccountScreen.spot.statusTitle'),
      description: t('myAccountScreen.spot.statusDesc'),
    },
  ];

  // Scrolle vers l'élément puis mesure sa position fenêtre
  const scrollAndMeasure = (stepIdx) =>
    new Promise((resolve) => {
      const step = SPOT_STEPS[stepIdx];
      if (!step?.ref?.current) return resolve(null);
      step.ref.current.measureLayout(
        scrollViewRef.current,
        (_, yInScroll, _w, elH) => {
          const targetScroll = Math.max(0, yInScroll - H * 0.28);
          scrollViewRef.current?.scrollTo({ y: targetScroll, animated: true });
          setTimeout(() => {
            step.ref.current?.measureInWindow((x, y, w, h) => {
              resolve({ x, y, width: w, height: h, borderRadius: step.borderRadius });
            });
          }, 350);
        },
        () => {
          setTimeout(() => {
            step.ref.current?.measureInWindow((x, y, w, h) => {
              resolve({ x, y, width: w, height: h, borderRadius: step.borderRadius });
            });
          }, 350);
        },
      );
    });

  const goToStep = async (idx) => {
    if (idx < 0 || idx >= SPOT_STEPS.length) return;
    const rect = await scrollAndMeasure(idx);
    if (!rect) {
      // La mesure a échoué (ref pas encore montée / layout natif pas encore
      // terminé — plus fréquent sur Android au tout premier lancement). Sans
      // rect, le modal du halo ne s'affiche jamais (visible = spotStep >= 0
      // && !!spotRect), donc aucun bouton "Suivant"/"Passer" n'est atteignable
      // pour débloquer le swiper : on abandonne proprement plutôt que de
      // laisser lockSwiper() actif indéfiniment.
      await endOnboarding();
      return;
    }
    setSpotRect(rect);
    setSpotStep(idx);
  };

  const endOnboarding = async () => {
    setSpotStep(-1);
    setSpotRect(null);
    unlockSwiper();
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    await markProfileOnboardingDone();
  };

  // Démarre uniquement quand l'utilisateur arrive sur la page profil (page 2)
  useEffect(() => {
    if (currentPage !== 2 || spotStarted.current) return;
    (async () => {
      const seen = await hasSeenProfileOnboarding();
      if (seen) return;
      spotStarted.current = true;
      lockSwiper();
      setTimeout(() => goToStep(0), 600);
    })();
  }, [currentPage]);

  // Suggestion d'activation du partage de position (carte inline, cf. utils/shareLocationNudge.js)
  const [shareLocationNudgeVisible, setShareLocationNudgeVisible] = useState(false);
  const [activatingShareLocation, setActivatingShareLocation] = useState(false);

  useEffect(() => {
    if (currentPage !== 2) return;
    if (user?.privacyPreferences?.shareCurrentLocation) return;
    let mounted = true;
    (async () => {
      const show = await shouldShowShareLocationNudge();
      if (!mounted || !show) return;
      setShareLocationNudgeVisible(true);
      await recordShareLocationNudgeShown();
    })();
    return () => {
      mounted = false;
    };
  }, [currentPage, user?.privacyPreferences?.shareCurrentLocation]);

  const handleActivateShareLocation = async () => {
    if (activatingShareLocation) return;
    setActivatingShareLocation(true);
    try {
      const res = await apiUpdateShareCurrentLocation(true);
      if (updateUser) {
        updateUser({
          ...user,
          privacyPreferences: {
            ...(user?.privacyPreferences || {}),
            ...(res?.user?.privacyPreferences || {}),
            shareCurrentLocation: true,
          },
        });
      }
      setShareLocationNudgeVisible(false);
      await recordShareLocationNudgeDismissedForever();
    } catch (e) {
      Alert.alert(t('myAccountScreen.errorTitle'), e?.message || t('myAccountScreen.shareLocationUpdateError'));
    } finally {
      setActivatingShareLocation(false);
    }
  };

  const handleDismissShareLocationNudge = async () => {
    setShareLocationNudgeVisible(false);
    await recordShareLocationNudgeDismissedForever();
  };

  const handleSpotNext = async () => {
    const next = spotStep + 1;
    if (next >= SPOT_STEPS.length) {
      await endOnboarding();
    } else {
      await goToStep(next);
    }
  };

  const handleSpotSkip = () => endOnboarding();
  // ─────────────────────────────────────────────────────────────

  const [showSocialModal, setShowSocialModal] = useState(false);
  const [selectedSocialPlatform, setSelectedSocialPlatform] = useState('');
  const [socialLinks, setSocialLinks] = useState(user.socialMedia || []);
  const [socialModalVisible, setSocialModalVisible] = useState(false);

  const cityLabel = user?.city || null;
  const currentPlaceLabel = user?.currentLocation?.name || null;

  // Keep local socialLinks in sync with context user updates
  useEffect(() => {
    setSocialLinks(user?.socialMedia || []);
  }, [user?.socialMedia]);

  // Rafraîchit les compteurs de superlikes/boosts à chaque retour sur l'écran
  useEffect(() => {
    const unsub = navigation.addListener('focus', refreshConsumableCounts);
    return unsub;
  }, [navigation]);

  // Ouvre l'historique des superlikes reçus quand on tape sur la notification push (App.js).
  useEffect(() => {
    const unsub = subscribe('ui:open_superlike_history', (payload) => {
      goToPage(2);
      setSuperlikeHistoryTab(payload?.tab || 'received');
      setSuperlikeHistoryVisible(true);
    });
    return unsub;
  }, [goToPage]);

  // On mount, if socials are empty (e.g., after auto-login), fetch my user from backend and hydrate context
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const empty = !user?.socialMedia || user.socialMedia.length === 0;
        if (!empty) return;
        const res = await getMyUser();
        const me = res?.user;
        if (!me || !mounted) return;
        const mappedSocial = mapNetworksToSocialMedia(me.socialNetworks || []);
        setSocialLinks(mappedSocial);
        if (updateUser) {
          updateUser({
            ...user,
            username: me.username || me.name || user?.username || '',
            firstName: typeof me.firstName === 'string' ? me.firstName : user?.firstName || '',
            lastName: typeof me.lastName === 'string' ? me.lastName : user?.lastName || '',
            customName: typeof me.customName === 'string' ? me.customName : user?.customName || '',
            bio: typeof me.bio === 'string' ? me.bio : user?.bio || '',
            photo: me.profileImageUrl || user?.photo || null,
            socialMedia: mappedSocial,
            isPremium: !!me.isPremium,
            streak: {
              count: typeof me?.streak?.count === 'number' ? me.streak.count : (user?.streak?.count ?? 0),
              lastCheckInDate: me?.streak?.lastCheckInDate ?? user?.streak?.lastCheckInDate ?? null,
              supervisePendingClaim: !!(me?.streak?.supervisePendingClaim ?? user?.streak?.supervisePendingClaim),
              boostPendingClaim: !!(me?.streak?.boostPendingClaim ?? user?.streak?.boostPendingClaim),
              lastClaimedAt: me?.streak?.lastClaimedAt ?? user?.streak?.lastClaimedAt ?? null,
            },
            role: me.role || user?.role || 'user',
            premiumTrialEnd: me.premiumTrialEnd || null,
            consent: me.consent || user?.consent || { accepted: false, version: '', consentAt: null },
            privacyPreferences: me.privacyPreferences ||
              user?.privacyPreferences || { analytics: false },
            moderation: me.moderation ||
              user?.moderation || {
                warningsCount: 0,
                lastWarningAt: null,
                lastWarningReason: '',
                lastWarningType: '',
                warningsHistory: [],
                bannedUntil: null,
                bannedPermanent: false,
              },
          });
        }
        try {
          setMyUserId(String(me?._id || me?.id || ''));
        } catch (_) {}
      } catch (e) {
        console.error('[MyAccount] getMyUser error', {
          code: e?.code,
          message: e?.message,
          status: e?.status,
          details: e?.details,
        });
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenStats = async () => {
    if (!effectiveStatisticsEnabled) {
      Alert.alert(
        t('myAccountScreen.comingSoonTitle'),
        t('myAccountScreen.comingSoonStats'),
      );
      return;
    }

    try {
      const res = await getMyUser();
      const me = res?.user;
      const nowPremium = !!me?.isPremium;
      const nowHasPremiumRight = nowPremium;
      const freshHasStatsAccess =
        (flags.statisticsEnabled || premiumSystemEnabled) && (!premiumSystemEnabled || nowHasPremiumRight);
      if (updateUser && me) {
        updateUser({
          ...user,
          username: me.username || me.name || user?.username || '',
          firstName: typeof me.firstName === 'string' ? me.firstName : user?.firstName || '',
          lastName: typeof me.lastName === 'string' ? me.lastName : user?.lastName || '',
          customName: typeof me.customName === 'string' ? me.customName : user?.customName || '',
          bio: typeof me.bio === 'string' ? me.bio : user?.bio || '',
          photo: me.profileImageUrl || user?.photo || null,
          socialMedia: Array.isArray(me.socialNetworks)
            ? mapNetworksToSocialMedia(me.socialNetworks)
            : user?.socialMedia || [],
          isPremium: nowPremium,
          streak: {
            count: typeof me?.streak?.count === 'number' ? me.streak.count : (user?.streak?.count ?? 0),
            lastCheckInDate: me?.streak?.lastCheckInDate ?? user?.streak?.lastCheckInDate ?? null,
            supervisePendingClaim: !!(me?.streak?.supervisePendingClaim ?? user?.streak?.supervisePendingClaim),
            boostPendingClaim: !!(me?.streak?.boostPendingClaim ?? user?.streak?.boostPendingClaim),
            lastClaimedAt: me?.streak?.lastClaimedAt ?? user?.streak?.lastClaimedAt ?? null,
          },
          role: me.role || user?.role || 'user',
          premiumTrialEnd: me.premiumTrialEnd || null,
          consent: me.consent || user?.consent || { accepted: false, version: '', consentAt: null },
          privacyPreferences: me.privacyPreferences ||
            user?.privacyPreferences || { analytics: false },
        });
      }
      if (freshHasStatsAccess) {
        navigation.navigate('Statistics');
      } else {
        navigation.navigate('PremiumPaywall', { source: 'stats_button' });
      }
    } catch (_) {
      if (hasStatsAccess) navigation.navigate('Statistics');
      else navigation.navigate('PremiumPaywall', { source: 'stats_button' });
    }
  };

  // Au cas où l'effet précédent ne se déclenche pas, récupérer l'id
  useEffect(() => {
    (async () => {
      try {
        if (myUserId) return;
        const res = await getMyUser();
        const me = res?.user;
        if (me) setMyUserId(String(me?._id || me?.id || ''));
      } catch (_) {}
    })();
  }, [myUserId]);

  // --- Partage profil: deep link + fallback store ---
  const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.loocateme.app'; // placeholder
  const IOS_STORE_URL = 'https://apps.apple.com/app/id0000000000'; // placeholder
  const getStoreUrlForPlatform = () => (Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL);
  const buildProfileDeepLink = (id) => `loocateme://profile/${encodeURIComponent(id || '')}`;

  const handleShareProfile = async () => {
    const deepLink = buildProfileDeepLink(myUserId);
    const store = getStoreUrlForPlatform();
    const message = `Découvre mon profil LoocateMe 👋\n\nLien direct: ${deepLink}\n\nTu n'as pas encore l'app ? Installe-la ici: ${store}`;
    try {
      await Share.share({ message, url: deepLink, title: 'Mon profil LoocateMe' });
    } catch (e) {
      Alert.alert(t('myAccountScreen.shareTitle'), e?.message || t('myAccountScreen.shareError'));
    }
  };

  const QR_SIZE = Math.floor(Math.min(width * 0.7, 320));
  const qrUrl = (() => {
    const data = buildProfileDeepLink(myUserId);
    const size = `${QR_SIZE}x${QR_SIZE}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(data)}`;
  })();
  const [qrImageUri, setQrImageUri] = useState('');
  useEffect(() => {
    if (!qrUrl) {
      setQrImageUri('');
      return;
    }
    setQrImageUri(proxifyImageUrl(qrUrl));
  }, [qrUrl]);
  const [selectedSocialLink, setSelectedSocialLink] = useState(null);

  // Allowed social platforms (must match backend validation)
  const ALLOWED_PLATFORMS = ['instagram', 'facebook', 'x', 'snapchat', 'tiktok', 'linkedin', 'youtube'];

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
    } catch (_e) {
      // Not a valid URL, keep raw value
    }
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

  const mapNetworksToSocialMedia = (networks = []) =>
    networks
      .map((n) => {
        const raw = String(n?.type || '').toLowerCase();
        const platform = raw === 'twitter' ? 'x' : raw;
        if (!ALLOWED_PLATFORMS.includes(platform)) return null;
        return { platform, username: n?.handle || '' };
      })
      .filter(Boolean);

  const refreshMyProfile = async () => {
    try {
      const res = await getMyUser();
      const me = res?.user;
      if (!me || !updateUser) return;
      // Resynchronise le cache local boost/superlike (PremiumService, source
      // affichée par RewardsCard) avec ce `boostBalance`/`superlikeBalance`
      // fraîchement reçu — sans cet appel, un claim de récompense de série
      // incrémente bien le solde côté serveur mais l'app continue d'afficher
      // l'ancien solde indéfiniment.
      PremiumService.updateFromUser(me);
      updateUser({
        ...user,
        firstName: typeof me.firstName === 'string' ? me.firstName : user?.firstName || '',
        lastName: typeof me.lastName === 'string' ? me.lastName : user?.lastName || '',
        customName: typeof me.customName === 'string' ? me.customName : user?.customName || '',
        username: me.username || me.name || user?.username || '',
        bio: typeof me.bio === 'string' ? me.bio : user.bio || '',
        photo: me.profileImageUrl || user.photo || null,
        birthdate: me.birthdate || user.birthdate || null,
        gender: me.gender || user.gender || '',
        socialMedia: Array.isArray(me.socialNetworks)
          ? mapNetworksToSocialMedia(me.socialNetworks)
          : user.socialMedia || [],
        isPremium: !!me.isPremium,
        streak: {
          count: typeof me?.streak?.count === 'number' ? me.streak.count : (user?.streak?.count ?? 0),
          lastCheckInDate: me?.streak?.lastCheckInDate ?? user?.streak?.lastCheckInDate ?? null,
          supervisePendingClaim: !!(me?.streak?.supervisePendingClaim ?? user?.streak?.supervisePendingClaim),
          boostPendingClaim: !!(me?.streak?.boostPendingClaim ?? user?.streak?.boostPendingClaim),
          lastClaimedAt: me?.streak?.lastClaimedAt ?? user?.streak?.lastClaimedAt ?? null,
        },
        role: me.role || user?.role || 'user',
        premiumTrialEnd: me.premiumTrialEnd || null,
        consent: me.consent || user.consent || { accepted: false, version: '', consentAt: null },
        privacyPreferences: me.privacyPreferences || user.privacyPreferences || { analytics: false },
        moderation: me.moderation ||
          user.moderation || {
            warningsCount: 0,
            lastWarningAt: null,
            lastWarningReason: '',
            lastWarningType: '',
            warningsHistory: [],
            bannedUntil: null,
            bannedPermanent: false,
          },
      });
    } catch (_) {}
  };

  const handleClaimStreakReward = async () => {
    if (streakClaiming) return;
    setStreakClaiming(true);
    try {
      if (user?.streak?.boostPendingClaim) {
        await apiClaimBoost();
        setToastMessage(t('myAccountScreen.boostClaimedToast'));
      } else if (user?.streak?.supervisePendingClaim) {
        await apiClaimSupervise();
        setToastMessage(t('myAccountScreen.superlikeClaimedToast'));
      } else {
        return;
      }
      setToastVisible(true);
      await refreshMyProfile();
      refreshConsumableCounts();
    } catch (e) {
      Alert.alert(t('myAccountScreen.errorTitle'), e?.message || t('myAccountScreen.claimRewardError'));
    } finally {
      setStreakClaiming(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshMyProfile();
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpdateStatus = async (status) => {
    if (user?.status === status) {
      return;
    }
    if (status === 'red' && !isPremium) {
      navigation.navigate('PremiumPaywall', { source: 'invisible_mode' });
      return;
    }
    try {
      const res = await apiUpdateUserStatus(status);
      if (res && res.user) {
        updateUser({ ...user, status: res.user.status });

        let message = '';
        if (status === 'green') {
          message =
            t('myAccountScreen.statusVisible');
        } else if (status === 'orange') {
          message = t('myAccountScreen.statusRestricted');
        } else if (status === 'red') {
          message = t('myAccountScreen.statusInvisible');
        }

        if (message) {
          setToastMessage(message);
          setToastVisible(true);
        }
      }
    } catch (e) {
      console.error('[MyAccount] Update status error', e);
      Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.statusUpdateError'));
    }
  };

  const handleAddSocial = async () => {
    try {
      const platform = String(selectedSocialPlatform || '').toLowerCase();
      let handle = String(newValue || '').trim();
      if (!ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.unsupportedPlatform'));
        return;
      }
      if (!handle) {
        Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.handleRequired'));
        return;
      }
      if (platform === 'instagram') {
        handle = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
          Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.invalidInstagramHandle'));
          return;
        }
      } else if (platform === 'tiktok') {
        handle = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(handle)) {
          Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.invalidTiktokHandle'));
          return;
        }
      }
      const res = await apiUpsertSocial({ type: platform, handle });
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setShowSocialModal(false);
      setSelectedSocialPlatform('');
      setNewValue('');
      await refreshMyProfile();
    } catch (e) {
      console.error('[MyAccount] Add social error', {
        code: e?.code,
        message: e?.message,
        status: e?.status,
        details: e?.details,
        response: e?.response,
      });
      Alert.alert(t('myAccountScreen.errorTitle'), e?.message || t('myAccountScreen.addSocialError'));
    }
  };

  const handleSocialLongPress = (social) => {
    setSelectedSocialLink(social);
    setSelectedSocialPlatform(social.platform);
    setNewValue(social.username);
    setSocialModalVisible(true);
  };

  const openSocial = async (platform, rawHandle) => {
    const handle = String(rawHandle || '').trim();
    if (!platform || !handle) return;
    try {
      if (platform === 'instagram') {
        const username = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(username)) {
          Alert.alert(t('myAccountScreen.invalidLinkTitle'), t('myAccountScreen.invalidInstagramHandleShort'));
          return;
        }
        const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
        const webUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
        try {
          await Linking.openURL(appUrl);
          return;
        } catch (_e1) {
          try {
            await Linking.openURL(webUrl);
            return;
          } catch (_e2) {
            Alert.alert(t('myAccountScreen.cannotOpenInstagramTitle'), t('myAccountScreen.tryAgainLater'));
            return;
          }
        }
      } else if (platform === 'tiktok') {
        const username = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(username)) {
          Alert.alert(t('myAccountScreen.invalidLinkTitle'), t('myAccountScreen.invalidTiktokHandleShort'));
          return;
        }
        const webUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
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
                // continue
              }
            }
          } catch (_e) {
            // continue
          }
        }
        try {
          await Linking.openURL(webUrl);
          return;
        } catch (_e2) {
          Alert.alert(t('myAccountScreen.cannotOpenTiktokTitle'), t('myAccountScreen.tryAgainLater'));
          return;
        }
      }
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
      // noop
    }
  };

  const handleSocialEdit = async () => {
    try {
      const platform = selectedSocialLink?.platform;
      let handle = String(newValue || '').trim();
      if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.unsupportedPlatform'));
        return;
      }
      if (!handle) {
        Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.handleRequired'));
        return;
      }
      if (platform === 'instagram') {
        handle = extractInstagramUsername(handle);
        if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
          Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.invalidInstagramHandle'));
          return;
        }
      } else if (platform === 'tiktok') {
        handle = extractTikTokUsername(handle);
        if (!TIKTOK_USERNAME_REGEX.test(handle)) {
          Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.invalidTiktokHandle'));
          return;
        }
      }
      const res = await apiUpsertSocial({ type: platform, handle });
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setSocialModalVisible(false);
      await refreshMyProfile();
    } catch (e) {
      console.error('[MyAccount] Edit social error', {
        code: e?.code,
        message: e?.message,
        status: e?.status,
        details: e?.details,
        response: e?.response,
      });
      Alert.alert(t('myAccountScreen.errorTitle'), e?.message || t('myAccountScreen.editSocialError'));
    }
  };

  const handleSocialDelete = async () => {
    try {
      const platform = selectedSocialLink?.platform;
      if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
        Alert.alert(t('myAccountScreen.errorTitle'), t('myAccountScreen.unsupportedPlatform'));
        return;
      }
      const res = await apiRemoveSocial(platform);
      const networks = res?.user?.socialNetworks || [];
      const mapped = mapNetworksToSocialMedia(networks);
      setSocialLinks(mapped);
      updateUser({ ...user, socialMedia: mapped });
      setSocialModalVisible(false);
      await refreshMyProfile();
    } catch (e) {
      console.error('[MyAccount] Delete social error', {
        code: e?.code,
        message: e?.message,
        status: e?.status,
        details: e?.details,
        response: e?.response,
      });
      Alert.alert(t('myAccountScreen.errorTitle'), e?.message || t('myAccountScreen.deleteSocialError'));
    }
  };

  const handleReorderSocial = async (newOrder) => {
    setSocialLinks(newOrder);
    updateUser({ ...user, socialMedia: newOrder });
    try {
      await apiReorderSocial(newOrder.map((s) => s.platform));
    } catch (e) {
      console.error('[MyAccount] Reorder social error', e);
      await refreshMyProfile();
    }
  };

  return (
    <>
      <View style={{ flex: 1 }}>
        {isMoon ? <NightSkyBackground style={skyFillStyle} /> : <DaySkyBackground style={skyFillStyle} />}
        <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]}>
          <TouchableOpacity
            style={[
              styles.backButton,
              { top: insets.top + 10, backgroundColor: isDark ? 'rgba(12,20,24,0.55)' : 'rgba(255,255,255,0.85)' },
            ]}
            onPress={() => goToPage(1)}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            accessibilityLabel={t('myAccountScreen.backLabel')}
          >
            <Image source={require('../assets/appIcons/backArrow.png')} style={styles.backButtonImage} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topSettingsButton,
              { top: insets.top + 10, backgroundColor: isDark ? 'rgba(12,20,24,0.55)' : 'rgba(255,255,255,0.85)' },
            ]}
            onPress={() => navigation.navigate('Settings')}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            accessibilityLabel={t('myAccountScreen.settingsLabel')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.accent} />
          </TouchableOpacity>

          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            scrollEnabled={spotStep < 0}
            contentContainerStyle={{
              paddingHorizontal: width * 0.05,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16,
              flexGrow: 1,
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            {/* 1. Hero identité (photo, nom, statut, ville) */}
            <ProfileHero
              photoRef={photoRef}
              statusRef={statusRef}
              user={user}
              isPremium={isPremium}
              colors={colors}
              isDark={isDark}
              cityLabel={cityLabel}
              currentPlaceLabel={currentPlaceLabel}
              onOpenStatusPicker={() => setStatusPickerVisible(true)}
            />

            {/* 2. Bio (lecture seule) */}
            <BioSection bioRef={bioRef} bio={user?.bio} colors={colors} isDark={isDark} />

            {/* 3. Suggestion partage position (conditionnel) */}
            {shareLocationNudgeVisible && (
              <ShareLocationNudge
                colors={colors}
                isDark={isDark}
                activating={activatingShareLocation}
                onActivate={handleActivateShareLocation}
                onDismiss={handleDismissShareLocationNudge}
              />
            )}

            {/* 4. Parrainage (lien discret) */}
            <ReferralLink colors={colors} isDark={isDark} onPress={() => navigation.navigate('Referral')} />

            {/* 5. Avertissements (conditionnel) */}
            <WarningsBanner
              warningsCount={warningsCount}
              colors={colors}
              onPress={() => navigation.navigate('Warnings')}
            />

            {/* 6. Récompenses (streak + superlikes/boosts fusionnés) */}
            <RewardsCard
              colors={colors}
              isDark={isDark}
              accentGradient={colors.accentGradient}
              streak={user?.streak}
              streakClaiming={streakClaiming}
              onClaimStreak={handleClaimStreakReward}
              onStreakInfoPress={() =>
                Alert.alert(
                  t('myAccountScreen.streakTitle'),
                  t('myAccountScreen.streakMessage'),
                )
              }
              superlikeBalance={superlikeBalance}
              boostBalance={boostBalance}
              superlikePulse={superlikePulse}
              boostPulse={boostPulse}
              onOpenSuperlikeHistory={() => setSuperlikeHistoryVisible(true)}
              onOpenConsumablesShop={() => setConsumablesShopVisible(true)}
              isPremium={isPremium}
              premiumSystemEnabled={premiumSystemEnabled}
              onOpenPaywall={() => navigation.navigate('PremiumPaywall', { source: 'rewards_card' })}
            />

            {/* 7. Réseaux sociaux (grille agrandie) */}
            <SocialGrid
              socialRef={socialRef}
              socialLinks={socialLinks}
              colors={colors}
              isDark={isDark}
              onAddPress={() => setShowSocialModal(true)}
              onOpenSocial={openSocial}
              onLongPressSocial={handleSocialLongPress}
              onReorderSocial={handleReorderSocial}
              onDragStart={lockSwiper}
              onDragEnd={unlockSwiper}
            />

            {/* 8. Footer d'actions : partager / QR / stats */}
            <ActionsFooter
              colors={colors}
              isDark={isDark}
              onShare={handleShareProfile}
              onShowQr={() => setQrVisible(true)}
              onOpenStats={handleOpenStats}
            />

            <AddSocialModal
              visible={showSocialModal}
              onClose={() => setShowSocialModal(false)}
              colors={colors}
              isDark={isDark}
              selectedPlatform={selectedSocialPlatform}
              onSelectPlatform={(platform) => {
                setSelectedSocialPlatform(platform);
                const existing = socialLinks.find((s) => s.platform === platform);
                setNewValue(existing?.username || '');
              }}
              value={newValue}
              onChangeValue={setNewValue}
              onSave={handleAddSocial}
            />

            <EditSocialModal
              visible={socialModalVisible}
              onClose={() => setSocialModalVisible(false)}
              colors={colors}
              isDark={isDark}
              platform={selectedSocialPlatform}
              value={newValue}
              onChangeValue={setNewValue}
              onSave={handleSocialEdit}
              onDelete={handleSocialDelete}
            />
          </ScrollView>

          <StatusPickerModal
            visible={statusPickerVisible}
            onClose={() => setStatusPickerVisible(false)}
            colors={colors}
            isDark={isDark}
            currentStatus={user?.status}
            onSelect={(status) => {
              setStatusPickerVisible(false);
              handleUpdateStatus(status);
            }}
          />

          <SuperlikeHistoryModal
            visible={superlikeHistoryVisible}
            initialTab={superlikeHistoryTab}
            onClose={() => {
              setSuperlikeHistoryVisible(false);
              refreshConsumableCounts();
            }}
          />

          <ConsumablesShopSheet
            visible={consumablesShopVisible}
            onClose={() => {
              setConsumablesShopVisible(false);
              refreshConsumableCounts();
            }}
            userId={myUserId}
          />

          <QrModal
            visible={qrVisible}
            onClose={() => setQrVisible(false)}
            colors={colors}
            isDark={isDark}
            qrImageUri={qrImageUri}
            qrUrl={qrUrl}
            qrSize={QR_SIZE}
            onImageError={() => {
              if (qrImageUri !== qrUrl) setQrImageUri(qrUrl);
            }}
          />

          <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
        </SafeAreaView>
      </View>

      {/* Spotlight onboarding profil */}
      <SpotlightOverlay
        visible={spotStep >= 0 && !!spotRect}
        rect={spotRect}
        title={SPOT_STEPS[spotStep]?.title}
        description={SPOT_STEPS[spotStep]?.description}
        stepIndex={spotStep}
        totalSteps={SPOT_STEPS.length}
        onNext={handleSpotNext}
        onSkip={handleSpotSkip}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonImage: {
    width: 22,
    height: 22,
    tintColor: '#00c2cb',
  },
  topSettingsButton: {
    position: 'absolute',
    top: 10,
    right: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MyAccountScreen;
