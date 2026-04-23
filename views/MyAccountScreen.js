import { useState, useContext, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    StyleSheet,
    Image,
    ScrollView,
    RefreshControl,
    Dimensions,
    PanResponder,
    Alert,
    Platform,
    Pressable,
    Linking,
    Share,
    KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { UserContext } from '../components/contexts/UserContext';
import { updateProfile as apiUpdateProfile, uploadProfilePhoto as apiUploadProfilePhoto, upsertSocial as apiUpsertSocial, removeSocial as apiRemoveSocial, getMyUser, updateUserStatus as apiUpdateUserStatus } from '../components/ApiRequest';
import { proxifyImageUrl } from '../components/ServerUtils';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';
import Toast from '../components/Toast';
import { buildSocialProfileUrl } from '../services/socialUrls';
import { useTheme } from '../components/contexts/ThemeContext';
import { useLocale } from '../components/contexts/LocalizationContext';
import { useFeatureFlags } from '../components/contexts/FeatureFlagsContext';
import { usePremiumAccess } from '../hooks/usePremiumAccess';

const { width, height } = Dimensions.get('window');

const MyAccountScreen = ({
                             onReturnToList,
                             socialMediaIcons,
                             onReturnToSettings,
                             onOpenDataManagement,
                             onOpenStatistics,
                             onOpenPremiumPaywall,
                             onOpenWarnings,
                         }) => {
    const { colors, isDark } = useTheme();
    const { locale } = useLocale();
    const panResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
            const { dx, dy } = gestureState;
            const isHorizontal = Math.abs(dx) > Math.abs(dy);
            // Enable from anywhere on screen: start responding when a right swipe is detected
            return isHorizontal && dx > 10;
        },
        onPanResponderRelease: (_evt, gestureState) => {
            const { dx, vx } = gestureState;
            if (dx > 60 || vx > 0.3) {
                onReturnToList && onReturnToList();
            }
        },
    });
    const { user, updateUser } = useContext(UserContext);
    const { isPremium, hasStatsAccess, premiumSystemEnabled, effectiveStatisticsEnabled } = usePremiumAccess();
    const { flags } = useFeatureFlags();
    const warningsCount = user?.moderation?.warningsCount || 0;
    const [modalVisible, setModalVisible] = useState(false);
    const [editType, setEditType] = useState('');
    const [newValue, setNewValue] = useState('');
    // Partage / QR
    const [qrVisible, setQrVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const [myUserId, setMyUserId] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [measuredNameWidth, setMeasuredNameWidth] = useState(0);

    // Dynamically scale UI based on number of social networks to best fill the page without scrolling
    const socialCountForScale = Array.isArray(user?.socialMedia) ? user.socialMedia.length : 0;
    const computeScale = (count) => {
        if (count <= 0) return 1.1; // slightly larger to fill
        if (count === 1) return 1.05;
        if (count <= 3) return 1.0;
        if (count <= 6) return 0.9;
        if (count <= 9) return 0.85;
        return 0.8; // many socials -> reduce to fit
    };
    const scale = computeScale(socialCountForScale);
    const imgSize = Math.min(width * 0.4, 160) * scale;
    const iconSize = Math.min(width * 0.2, 72) * scale;
    const usernameFont = Math.min(width * 0.075, 30) * scale;
    const baseBioFont = Math.min(width * 0.04, 18) * scale;
    const bioFont = Math.max(14, Math.min(baseBioFont, 22));
    const placeholderIconSize = Math.min(width * 0.18, 72) * scale;

    const [showSocialModal, setShowSocialModal] = useState(false);
    const [selectedSocialPlatform, setSelectedSocialPlatform] = useState('');
    const [socialLinks, setSocialLinks] = useState(user.socialMedia || []);
    const [socialModalVisible, setSocialModalVisible] = useState(false);

    // Mesure dynamique de la largeur du nom pour adapter la box image+nom
    const valueStyle = { color: isDark ? '#fff' : '#3f4a4b' };
    const labelStyle = { color: '#00c2cb' };
    const textPrimaryStyle = { color: isDark ? '#fff' : colors.textPrimary };
    const textSecondaryStyle = { color: isDark ? '#eee' : colors.textSecondary };
    const subTextStyle = { color: isDark ? 'rgba(255,255,255,0.9)' : colors.textSecondary };
    const SAFE_LEFT_FOR_BACK = 56; // espace minimum à gauche pour le bouton retour (padding+icône)
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

    // Refs pour gérer le scroll et le focus dans le modal d'ajout de réseaux sociaux
    const addSocialScrollRef = useRef(null);
    const addSocialInputRef = useRef(null);

    // Keep local socialLinks in sync with context user updates
    useEffect(() => {
        setSocialLinks(user?.socialMedia || []);
    }, [user?.socialMedia]);

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
                        firstName: typeof me.firstName === 'string' ? me.firstName : (user?.firstName || ''),
                        lastName: typeof me.lastName === 'string' ? me.lastName : (user?.lastName || ''),
                        customName: typeof me.customName === 'string' ? me.customName : (user?.customName || ''),
                        // Ne pas injecter de placeholder en state: conserver vide si pas de bio côté API
                        bio: typeof me.bio === 'string' ? me.bio : (user?.bio || ''),
                        photo: me.profileImageUrl || user?.photo || null,
                        socialMedia: mappedSocial,
                        isVisible: me.isVisible !== false,
                        isPremium: !!me.isPremium,
                        role: me.role || user?.role || 'user',
                        premiumTrialEnd: me.premiumTrialEnd || null,
                        consent: me.consent || user?.consent || { accepted: false, version: '', consentAt: null },
                        privacyPreferences: me.privacyPreferences || user?.privacyPreferences || { analytics: false, marketing: false },
                        moderation: me.moderation || user?.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', lastWarningType: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
                    });
                }
                // Capture id utilisateur pour le partage
                try { setMyUserId(String(me?._id || me?.id || '')); } catch (_) {}
            } catch (e) {
                console.error('[MyAccount] getMyUser error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details });
            }
        })();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleOpenStats = async () => {
        if (!effectiveStatisticsEnabled) {
            Alert.alert(
                "Bientôt disponible 🚀",
                "Les statistiques arrivent très bientôt ! Tu pourras voir qui visite ton profil et tes réseaux sociaux."
            );
            return;
        }

        try {
            // One-shot re-sync from server to avoid stale context after plan change
            const res = await getMyUser();
            const me = res?.user;
            const nowPremium = !!me?.isPremium;
            const nowRole = me?.role || user?.role || 'user';
            const nowHasPremiumRight = nowPremium || nowRole === 'admin' || nowRole === 'moderator';
            const freshHasStatsAccess = (flags.statisticsEnabled || premiumSystemEnabled) && (!premiumSystemEnabled || nowHasPremiumRight);
            if (updateUser && me) {
                updateUser({
                    ...user,
                    username: me.username || me.name || user?.username || '',
                    firstName: typeof me.firstName === 'string' ? me.firstName : (user?.firstName || ''),
                    lastName: typeof me.lastName === 'string' ? me.lastName : (user?.lastName || ''),
                    customName: typeof me.customName === 'string' ? me.customName : (user?.customName || ''),
                    bio: typeof me.bio === 'string' ? me.bio : (user?.bio || ''),
                    photo: me.profileImageUrl || user?.photo || null,
                    socialMedia: Array.isArray(me.socialNetworks) ? mapNetworksToSocialMedia(me.socialNetworks) : (user?.socialMedia || []),
                    isVisible: me.isVisible !== false,
                    isPremium: nowPremium,
                    role: me.role || user?.role || 'user',
                    premiumTrialEnd: me.premiumTrialEnd || null,
                    consent: me.consent || user?.consent || { accepted: false, version: '', consentAt: null },
                    privacyPreferences: me.privacyPreferences || user?.privacyPreferences || { analytics: false, marketing: false },
                });
            }
            if (freshHasStatsAccess) {
                onOpenStatistics && onOpenStatistics();
            } else {
                onOpenPremiumPaywall && onOpenPremiumPaywall();
            }
        } catch (_) {
            // Fallback to current hook state
            if (hasStatsAccess) onOpenStatistics && onOpenStatistics();
            else onOpenPremiumPaywall && onOpenPremiumPaywall();
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

    const openMyProfileDeepLink = async () => {
        const deepLink = buildProfileDeepLink(myUserId);
        try {
            const can = await Linking.canOpenURL(deepLink);
            if (can) {
                await Linking.openURL(deepLink);
                return;
            }
        } catch (_) {}
        try {
            await Linking.openURL(getStoreUrlForPlatform());
        } catch (_) {
            Alert.alert('Erreur', "Impossible d'ouvrir le store");
        }
    };

    const handleShareProfile = async () => {
        const deepLink = buildProfileDeepLink(myUserId);
        const store = getStoreUrlForPlatform();
        const message = `Découvre mon profil LoocateMe 👋\n\nLien direct: ${deepLink}\n\nTu n'as pas encore l'app ? Installe-la ici: ${store}`;
        try {
            await Share.share({ message, url: deepLink, title: 'Mon profil LoocateMe' });
        } catch (e) {
            Alert.alert('Partage', e?.message || 'Impossible de partager.');
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
    const [photoOptionsModalVisible, setPhotoOptionsModalVisible] =
        useState(false);

    // Allowed social platforms (must match backend validation)
    const ALLOWED_PLATFORMS = ['instagram', 'facebook', 'x', 'snapchat', 'tiktok', 'linkedin', 'youtube'];

    // Instagram username regex (provided)
    const INSTAGRAM_USERNAME_REGEX = /^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
    // TikTok username regex (approximate: 2-24 chars, letters, numbers, dot, underscore)
    const TIKTOK_USERNAME_REGEX = /^[A-Za-z0-9._]{2,24}$/;

    // Sanitize a possibly pasted Instagram URL to just the username
    const extractInstagramUsername = (input = '') => {
        let v = String(input).trim();
        // If user pasted a full URL like https://www.instagram.com/username/
        try {
            if (/^https?:\/\//i.test(v)) {
                const u = new URL(v);
                // path like "/username/" or "/username"
                const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
                // username is first segment
                v = path.split('/')[0] || '';
            }
        } catch (_e) {
            // Not a valid URL, keep raw value
        }
        // Remove leading @ if present
        if (v.startsWith('@')) v = v.slice(1);
        return v;
    };

    const extractTikTokUsername = (input = '') => {
        let v = String(input).trim();
        try {
            if (/^https?:\/\//i.test(v)) {
                const u = new URL(v);
                // TikTok profile paths are like "/@username" or "/@username/video/..."
                const path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
                const firstSeg = (path.split('/')[0] || '').trim();
                v = firstSeg.startsWith('@') ? firstSeg.slice(1) : firstSeg;
            }
        } catch (_e) {}
        if (v.startsWith('@')) v = v.slice(1);
        return v;
    };

    // Map backend socialNetworks -> frontend socialMedia shape (normalize and filter)
    const mapNetworksToSocialMedia = (networks = []) =>
        networks
            .map((n) => {
                const raw = String(n?.type || '').toLowerCase();
                const platform = raw === 'twitter' ? 'x' : raw;
                if (!ALLOWED_PLATFORMS.includes(platform)) return null;
                return { platform, username: n?.handle || '' };
            })
            .filter(Boolean);

    // After any profile update, reload my profile from backend to keep context fully in sync
    const refreshMyProfile = async () => {
        try {
            const res = await getMyUser();
            const me = res?.user;
            if (!me || !updateUser) return;
            updateUser({
                ...user,
                firstName: typeof me.firstName === 'string' ? me.firstName : (user?.firstName || ''),
                lastName: typeof me.lastName === 'string' ? me.lastName : (user?.lastName || ''),
                customName: typeof me.customName === 'string' ? me.customName : (user?.customName || ''),
                username: me.username || me.name || user?.username || '',
                bio: typeof me.bio === 'string' ? me.bio : (user.bio || ''),
                photo: me.profileImageUrl || user.photo || null,
                socialMedia: Array.isArray(me.socialNetworks) ? mapNetworksToSocialMedia(me.socialNetworks) : (user.socialMedia || []),
                isVisible: me.isVisible !== false,
                isPremium: !!me.isPremium,
                role: me.role || user?.role || 'user',
                premiumTrialEnd: me.premiumTrialEnd || null,
                consent: me.consent || user.consent || { accepted: false, version: '', consentAt: null },
                privacyPreferences: me.privacyPreferences || user.privacyPreferences || { analytics: false, marketing: false },
                moderation: me.moderation || user.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', lastWarningType: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
            });
        } catch (_) {}
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
        try {
            const res = await apiUpdateUserStatus(status);
            if (res && res.user) {
                updateUser({ ...user, status: res.user.status });

                let message = '';
                if (status === 'green') {
                    message = "Vous êtes en mode visible. Tout le monde peut voir vos réseaux sociaux. Vous profitez pleinement de l'app.";
                } else if (status === 'orange') {
                    message = "Vous êtes en mode visible restreint. On ne peut pas voir vos réseaux sociaux.";
                } else if (status === 'red') {
                    message = "Vous êtes en mode invisible. Personne ne vous verra désormais.";
                }

                if (message) {
                    setToastMessage(message);
                    setToastVisible(true);
                }
            }
        } catch (e) {
            console.error('[MyAccount] Update status error', e);
            Alert.alert('Erreur', "Impossible de mettre à jour le statut");
        }
    };

    const handleEdit = (type) => {
        setEditType(type);
        setNewValue(user[type]);
        setModalVisible(true);
    };

    const handleSave = async () => {
        try {
            const raw = String(newValue ?? '');
            if (editType === 'username') {
                // Normaliser et valider selon la regex Instagram (vide interdit)
                let normalized = raw.trim().toLowerCase();
                const IG_RE = /^(?!.*\..)(?!.*\.$)[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9])?$/;
                if (!normalized || !IG_RE.test(normalized)) {
                    Alert.alert('Nom invalide', "Nom d'utilisateur invalide. Utilise 1–30 caractères: lettres, chiffres, points et underscores. Pas de point au début/à la fin ni deux points consécutifs.");
                    return;
                }
                const res = await apiUpdateProfile({ username: normalized });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    username: updated.username ?? updated.name ?? normalized,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'bio') {
                // La bio peut être une chaîne vide: on envoie tel quel
                const res = await apiUpdateProfile({ bio: raw });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? raw,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'firstName') {
                let normalized = raw.trim();
                if (normalized) {
                    const lower = normalized.toLocaleLowerCase(locale);
                    normalized = lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
                }
                const NAME_RE = /^(\p{Lu}[\p{L}\p{M}' -]*)$/u;
                if (normalized && !NAME_RE.test(normalized)) {
                    Alert.alert('Prénom invalide', "Le prénom doit commencer par une majuscule et peut contenir des lettres (accents autorisés), espaces, apostrophes ou tirets.");
                    return;
                }
                // Vérifier règles de combinaison côté client
                const candidateFirst = normalized;
                const candidateLast = (user.lastName || '').trim();
                const candidateCustom = (user.customName || '').trim();
                const hasCustom = candidateCustom.length > 0;
                const hasFirst = candidateFirst.length > 0;
                const hasLast = candidateLast.length > 0;
                if (!hasCustom && !(hasFirst && hasLast)) {
                    Alert.alert('Identité incomplète', 'Renseigne un Nom personnalisé OU un Prénom ET un Nom.');
                    return;
                }
                const res = await apiUpdateProfile({ firstName: candidateFirst });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    firstName: updated.firstName ?? candidateFirst,
                    lastName: updated.lastName ?? user.lastName,
                    customName: updated.customName ?? user.customName,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'lastName') {
                let normalized = raw.trim();
                if (normalized) {
                    const lower = normalized.toLocaleLowerCase(locale);
                    normalized = lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
                }
                const NAME_RE = /^(\p{Lu}[\p{L}\p{M}' -]*)$/u;
                if (normalized && !NAME_RE.test(normalized)) {
                    Alert.alert('Nom invalide', "Le nom doit commencer par une majuscule et peut contenir des lettres (accents autorisés), espaces, apostrophes ou tirets.");
                    return;
                }
                const candidateFirst = (user.firstName || '').trim();
                const candidateLast = normalized;
                const candidateCustom = (user.customName || '').trim();
                const hasCustom = candidateCustom.length > 0;
                const hasFirst = candidateFirst.length > 0;
                const hasLast = candidateLast.length > 0;
                if (!hasCustom && !(hasFirst && hasLast)) {
                    Alert.alert('Identité incomplète', 'Renseigne un Nom personnalisé OU un Prénom ET un Nom.');
                    return;
                }
                const res = await apiUpdateProfile({ lastName: candidateLast });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    firstName: updated.firstName ?? user.firstName,
                    lastName: updated.lastName ?? candidateLast,
                    customName: updated.customName ?? user.customName,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            } else if (editType === 'customName') {
                const normalized = raw.trim();
                // Interdire de vider le nom personnalisé si prénom ou nom sont vides
                const hasFirst = (user.firstName || '').trim().length > 0;
                const hasLast = (user.lastName || '').trim().length > 0;
                if (!normalized && (!hasFirst || !hasLast)) {
                    Alert.alert('Nom personnalisé requis', 'Impossible de supprimer le nom personnalisé tant que le prénom ou le nom est vide.');
                    return;
                }
                const res = await apiUpdateProfile({ customName: normalized });
                const updated = res?.user || {};
                updateUser({
                    ...user,
                    customName: updated.customName ?? normalized,
                    username: updated.username ?? updated.name ?? user.username,
                    bio: updated.bio ?? user.bio,
                    photo: updated.profileImageUrl ?? user.photo,
                });
                await refreshMyProfile();
            }
        } catch (e) {
            Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le profil');
        }
        setModalVisible(false);
    };

    const handleAddSocial = async () => {
        try {
            const platform = String(selectedSocialPlatform || '').toLowerCase();
            let handle = String(newValue || '').trim();
            if (!ALLOWED_PLATFORMS.includes(platform)) {
                Alert.alert('Erreur', 'Plateforme non supportée');
                return;
            }
            if (!handle) {
                Alert.alert('Erreur', "Veuillez saisir un identifiant");
                return;
            }
            // Specific validation for Instagram / TikTok
            if (platform === 'instagram') {
                handle = extractInstagramUsername(handle);
                if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
                    Alert.alert('Erreur', "Nom d'utilisateur Instagram invalide. Exemple: https://www.instagram.com/username/");
                    return;
                }
            } else if (platform === 'tiktok') {
                handle = extractTikTokUsername(handle);
                if (!TIKTOK_USERNAME_REGEX.test(handle)) {
                    Alert.alert('Erreur', "Nom d'utilisateur TikTok invalide. Exemple: https://www.tiktok.com/@username");
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
            console.error('[MyAccount] Add social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert('Erreur', e?.message || "Impossible d'ajouter le réseau social");
        }
    };

    const handleSocialLongPress = (social) => {
        setSelectedSocialLink(social);
        setSelectedSocialPlatform(social.platform);
        setNewValue(social.username);
        setSocialModalVisible(true);
    };

    // Open a social profile on simple tap (same behavior as in UserProfileScreen)
    const openSocial = async (platform, rawHandle) => {
        const handle = String(rawHandle || '').trim();
        if (!platform || !handle) return;
        try {
            if (platform === 'instagram') {
                const username = extractInstagramUsername(handle);
                if (!INSTAGRAM_USERNAME_REGEX.test(username)) {
                    Alert.alert('Lien invalide', "Nom d'utilisateur Instagram invalide");
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
                    Alert.alert("Impossible d'ouvrir TikTok", 'Veuillez réessayer plus tard.');
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
                Alert.alert('Erreur', 'Plateforme non supportée');
                return;
            }
            if (!handle) {
                Alert.alert('Erreur', "Veuillez saisir un identifiant");
                return;
            }
            if (platform === 'instagram') {
                handle = extractInstagramUsername(handle);
                if (!INSTAGRAM_USERNAME_REGEX.test(handle)) {
                    Alert.alert('Erreur', "Nom d'utilisateur Instagram invalide. Exemple: https://www.instagram.com/username/");
                    return;
                }
            } else if (platform === 'tiktok') {
                handle = extractTikTokUsername(handle);
                if (!TIKTOK_USERNAME_REGEX.test(handle)) {
                    Alert.alert('Erreur', "Nom d'utilisateur TikTok invalide. Exemple: https://www.tiktok.com/@username");
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
            console.error('[MyAccount] Edit social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert('Erreur', e?.message || "Impossible de modifier le réseau social");
        }
    };

    const handleSocialDelete = async () => {
        try {
            const platform = selectedSocialLink?.platform;
            if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
                Alert.alert('Erreur', 'Plateforme non supportée');
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
            console.error('[MyAccount] Delete social error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert('Erreur', e?.message || "Impossible de supprimer le réseau social");
        }
    };

    const handleProfileImageLongPress = () => {
        setPhotoOptionsModalVisible(true);
    };

    const handleCamera = async () => {
        try {
            // Check platform support
            if (Platform.OS === 'web') {
                Alert.alert('Non supporté', "La caméra n'est pas disponible sur le web.");
                return;
            }

            // Request camera permission first
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Autorisation requise',
                    "L'application a besoin de l'accès à la caméra pour prendre une photo.",
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8,
            });

            const canceled = result?.canceled ?? result?.cancelled;
            const uri = result?.assets?.[0]?.uri ?? result?.uri;
            if (!canceled && uri) {
                try {
                    const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
                    const file = { uri, name, type: 'image/jpeg' };
                    const res = await apiUploadProfilePhoto(file);
                    const updated = res?.user || {};
                    updateUser({
                        ...user,
                        photo: updated.profileImageUrl || uri,
                        username: updated.name ?? user.username,
                        bio: updated.bio ?? user.bio,
                    });
                    await refreshMyProfile();
                } catch (e2) {
                    Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
                }
            }
        } catch (e) {
            Alert.alert('Erreur', "Impossible d'ouvrir la caméra.");
        } finally {
            setPhotoOptionsModalVisible(false);
        }
    };

    const handleGallery = async () => {
        try {
            if (Platform.OS === 'web') {
                // Web: pick and upload as well so backend profileImageUrl stays in sync
                const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
                const canceled = result?.canceled ?? result?.cancelled;
                const uri = result?.assets?.[0]?.uri ?? result?.uri;
                if (!canceled && uri) {
                    try {
                        const res = await apiUploadProfilePhoto(uri);
                        const updated = res?.user || {};
                        updateUser({
                            ...user,
                            photo: updated.profileImageUrl || uri,
                            username: updated.name ?? user.username,
                            bio: updated.bio ?? user.bio,
                        });
                        await refreshMyProfile();
                    } catch (e2) {
                        console.error('[MyAccount] Upload photo (web) error', { code: e2?.code, message: e2?.message, status: e2?.status });
                        Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
                    }
                }
                return;
            }

            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Autorisation requise',
                    "L'application a besoin de l'accès à vos photos pour sélectionner une image.",
                );
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                quality: 0.8,
            });
            const canceled = result?.canceled ?? result?.cancelled;
            const uri = result?.assets?.[0]?.uri ?? result?.uri;
            if (!canceled && uri) {
                try {
                    const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
                    const file = { uri, name, type: 'image/jpeg' };
                    const res = await apiUploadProfilePhoto(file);
                    const updated = res?.user || {};
                    updateUser({
                        ...user,
                        photo: updated.profileImageUrl || uri,
                        username: updated.name ?? user.username,
                        bio: updated.bio ?? user.bio,
                    });
                    await refreshMyProfile();
                } catch (e2) {
                    Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
                }
            }
        } catch (e) {
            Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
        } finally {
            setPhotoOptionsModalVisible(false);
        }
    };

    const handleDeletePhoto = async () => {
        try {
            const { deleteProfilePhoto: apiDelete } = await import('../components/ApiRequest');
            const res = await apiDelete();
            const updated = res?.user || {};
            updateUser({
                ...user,
                photo: updated.profileImageUrl || null,
                username: updated.name ?? user.username,
                bio: updated.bio ?? user.bio,
            });
            await refreshMyProfile();
        } catch (e) {
            console.error('[MyAccount] Delete photo error', { code: e?.code, message: e?.message, status: e?.status, details: e?.details, response: e?.response });
            Alert.alert('Erreur', e?.message || "Impossible de supprimer la photo de profil");
        } finally {
            setPhotoOptionsModalVisible(false);
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

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: width * 0.05, paddingTop: height * 0.01, paddingBottom: Math.max(24, height * 0.06), flexGrow: 1 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                <Text style={styles.title}>Mon Compte</Text>
                <View style={styles.userInfoContainer}>
                    <View style={styles.profileHeader}>
                        <View style={[
                            styles.imgUsernameSplitBox,
                            { backgroundColor: colors.surfaceAlt, width: desiredBoxWidth, paddingHorizontal: boxHorizontalPadding }
                        ]}>
                            <View style={styles.userProfilePictureContainer}>
                                <TouchableOpacity onLongPress={handleProfileImageLongPress}>
                                    {user.photo ? (
                                        <ImageWithPlaceholder
                                            uri={user.photo}
                                            style={[styles.profileImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}
                                        />
                                    ) : (
                                        <View style={[styles.placeholderImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]}>
                                            <Image
                                                source={require('../assets/appIcons/userProfile.png')}
                                                style={[styles.placeholderIcon, { width: placeholderIconSize, height: placeholderIconSize }]}
                                            />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>
                            <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                <TouchableOpacity
                                    onLongPress={() => handleEdit('username')}
                                    delayLongPress={300}
                                    activeOpacity={1}
                                >
                                    <Text style={[styles.usernameUnderPhoto, { fontSize: usernameFont }, textPrimaryStyle]}>
                                        {user?.customName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username)}
                                    </Text>
                                    {/* Mesure invisible sur une ligne pour calculer la largeur exacte du nom */}
                                    <Text
                                        style={[styles.usernameUnderPhoto, { fontSize: usernameFont, position: 'absolute', opacity: 0 }]}
                                        numberOfLines={1}
                                        onLayout={(e) => {
                                            const w = e?.nativeEvent?.layout?.width || 0;
                                            if (w && Math.abs(w - measuredNameWidth) > 0.5) setMeasuredNameWidth(w);
                                        }}
                                    >
                                        {user?.customName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username)}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {/* Traffic Light UI for Status */}
                        <View style={[styles.statusSelector]}>
                            <TouchableOpacity
                                style={[styles.statusCircle, { backgroundColor: '#F44336', opacity: user.status === 'red' ? 1 : 0.3 }]}
                                onPress={() => handleUpdateStatus('red')}
                            />
                            <TouchableOpacity
                                style={[styles.statusCircle, { backgroundColor: '#FF9800', opacity: user.status === 'orange' ? 1 : 0.3 }]}
                                onPress={() => handleUpdateStatus('orange')}
                            />
                            <TouchableOpacity
                                style={[styles.statusCircle, { backgroundColor: '#4CAF50', opacity: user.status === 'green' ? 1 : 0.3 }]}
                                onPress={() => handleUpdateStatus('green')}
                            />
                        </View>

                        <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            width: '100%',
                            paddingHorizontal: 15,
                            marginTop: 15,
                            gap: 8
                        }}>
                            <TouchableOpacity
                                style={[styles.identityCard, { flex: 1, backgroundColor: colors.surfaceAlt }]}
                                onLongPress={() => handleEdit('firstName')}
                                delayLongPress={300}
                                activeOpacity={1}
                            >
                                <Text style={[styles.identityLabel, labelStyle]}>Prénom</Text>
                                <Text style={[styles.identityValue, textPrimaryStyle]} numberOfLines={1}>
                                    {user?.firstName || '—'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.identityCard, { flex: 1, backgroundColor: colors.surfaceAlt }]}
                                onLongPress={() => handleEdit('lastName')}
                                delayLongPress={300}
                                activeOpacity={1}
                            >
                                <Text style={[styles.identityLabel, labelStyle]}>Nom</Text>
                                <Text style={[styles.identityValue, textPrimaryStyle]} numberOfLines={1}>
                                    {user?.lastName || '—'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.identityCard, { flex: 1.5, backgroundColor: colors.surfaceAlt }]}
                                onLongPress={() => handleEdit('customName')}
                                delayLongPress={300}
                                activeOpacity={1}
                            >
                                <Text style={[styles.identityLabel, labelStyle]}>Custom</Text>
                                <Text style={[styles.identityValue, textPrimaryStyle]} numberOfLines={1}>
                                    {user?.customName || '—'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.bioContainer, { backgroundColor: colors.surfaceAlt }]}>
                            <View style={styles.bioTitleContainer}>
                                <Text style={[styles.label, labelStyle, { marginBottom: 0, fontWeight: '700' }]}>Bio</Text>
                                <Text style={{ marginLeft: 6, fontSize: 14 }}>🖋️</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.bioTextContainer}
                                onLongPress={() => handleEdit('bio')}
                                delayLongPress={300}
                                activeOpacity={1}
                            >
                                {(() => {
                                    const bioText = String(user?.bio || '').trim();
                                    const isEmpty = bioText.length === 0;
                                    return (
                                        <Text
                                            style={[
                                                styles.value,
                                                textPrimaryStyle,
                                                {
                                                    fontSize: bioFont,
                                                    textAlign: 'left',
                                                    width: '100%',
                                                    color: isEmpty ? colors.textMuted : (isDark ? '#fff' : colors.textPrimary),
                                                    fontStyle: isEmpty ? 'italic' : 'normal',
                                                    lineHeight: bioFont * 1.4
                                                },
                                            ]}
                                        >
                                            {isEmpty ? 'Maintenir pour ajouter une bio...' : bioText}
                                        </Text>
                                    );
                                })()}
                            </TouchableOpacity>
                        </View>


                        {warningsCount > 0 && (
                            <TouchableOpacity
                                style={[styles.warningCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                                onPress={onOpenWarnings}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.warningTitle, { color: colors.accent }]}>Avertissements</Text>
                                <Text style={[styles.warningText, { color: colors.textPrimary }]}>
                                    Vous avez {warningsCount} avertissement{warningsCount > 1 ? 's' : ''}.
                                </Text>
                                <Text style={[styles.warningMeta, { color: colors.textSecondary }]}>Appuyez pour voir le détail</Text>
                            </TouchableOpacity>
                        )}

                        {/* Boutons de partage entre la bio et les réseaux sociaux (icônes uniquement) */}
                        <View style={[styles.shareIconsRow, { backgroundColor: isDark ? 'rgba(0, 194, 203, 0.1)' : 'rgba(0, 194, 203, 0.05)' }]}>
                            <TouchableOpacity
                                style={styles.shareIconBtn}
                                onPress={handleShareProfile}
                                accessibilityLabel="Partager mon profil"
                            >
                                <Text style={styles.shareIconEmoji}>📤</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.shareIconBtn}
                                onPress={() => setQrVisible(true)}
                                accessibilityLabel="Afficher mon QR code"
                            >
                                <Text style={styles.shareIconEmoji}>🔳</Text>
                            </TouchableOpacity>
                            {/* Bouton statistiques (emoji diagramme vers le haut) */}
                            <TouchableOpacity
                                style={styles.shareIconBtn}
                                onPress={handleOpenStats}
                                accessibilityLabel="Voir mes statistiques"
                            >
                                <Text style={styles.shareIconEmoji}>📈</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.socialMediaContainer}>
                            <TouchableOpacity
                                onPress={() => setShowSocialModal(true)}
                                style={[styles.socialMediaTile, { backgroundColor: colors.surfaceAlt }]}>
                                <Image
                                    source={require('../assets/socialMediaIcons/addSocialNetwork_logo.png')}
                                    style={[styles.socialMediaIcon, { width: iconSize, height: iconSize, tintColor: isDark ? colors.textPrimary : undefined }]}
                                />
                            </TouchableOpacity>
                            {socialLinks.map((social, index) => {
                                const icon = social?.platform ? socialMediaIcons[social.platform] : undefined;
                                if (!icon) return null;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[styles.socialMediaTile, { backgroundColor: colors.surfaceAlt }]}
                                        onPress={() => openSocial(social.platform, social.username || social.handle)}
                                        onLongPress={() => handleSocialLongPress(social)}
                                    >
                                        <Image
                                            source={icon}
                                            style={[styles.socialMediaIcon, { width: iconSize, height: iconSize }]}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                    </View>
                </View>

                {/* Ancienne section Partage supprimée conformément aux specs (pas de titre, icônes seulement) */}

                <Modal visible={modalVisible} transparent={true} animationType="fade">
                    <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
                        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                        <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                            <Text style={[styles.modalTitle, textPrimaryStyle]}>
                                Modifier {
                                    editType === 'firstName' ? 'le Prénom' :
                                    editType === 'lastName' ? 'le Nom' :
                                    editType === 'customName' ? 'le Nom personnalisé' :
                                    editType === 'username' ? "le Nom d'utilisateur" :
                                    editType === 'bio' ? 'la Bio' :
                                    editType
                                }
                            </Text>
                            <TextInput
                                value={newValue}
                                onChangeText={setNewValue}
                                placeholder={
                                    editType === 'username' ? "Nom d'utilisateur (ex: Arnaud)" :
                                    editType === 'firstName' ? "Votre Prénom" :
                                    editType === 'lastName' ? "Votre Nom" :
                                    editType === 'customName' ? "Votre Nom personnalisé" :
                                    'Votre texte'
                                }
                                placeholderTextColor={isDark ? '#999' : '#666'}
                                style={[
                                    styles.modalInput,
                                    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                                    editType === 'bio' ? { height: Math.max(height * 0.18, 120), textAlignVertical: 'top', paddingTop: 10 } : null,
                                ]}
                                multiline={editType === 'bio'}
                                numberOfLines={editType === 'bio' ? 6 : 1}
                                blurOnSubmit={editType !== 'bio'}
                                returnKeyType={editType === 'bio' ? 'default' : 'done'}
                            />
                            {editType === 'username' ? (
                                <Text style={styles.modalHint}>Format requis: ^[A-Z][a-z]+$ (exemple: Arnaud)</Text>
                            ) : null}
                            <TouchableOpacity onPress={handleSave} style={styles.modalButton}>
                                <Text style={[styles.modalButtonText, { color: isDark ? '#fff' : colors.textPrimary }]}>Enregistrer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                style={styles.modalButton}>
                                <Text style={[styles.modalButtonText, { color: isDark ? '#fff' : colors.textPrimary }]}>Annuler</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal visible={showSocialModal} transparent={true} animationType="fade">
                    <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
                        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSocialModal(false)} />
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
                            <View style={[styles.modalCard, { backgroundColor: colors.surface }] }>
                                <TouchableOpacity
                                    style={styles.modalBackButton}
                                    onPress={() => setShowSocialModal(false)}
                                    hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                                >
                                    <Image
                                        source={require('../assets/appIcons/backArrow.png')}
                                        style={styles.modalBackButtonImage}
                                    />
                                </TouchableOpacity>
                                <Text style={[styles.modalTitle, textPrimaryStyle]}>Ajouter un réseau</Text>
                                <ScrollView
                                    ref={addSocialScrollRef}
                                    keyboardShouldPersistTaps="handled"
                                    contentContainerStyle={{ paddingBottom: Math.max(24, height * 0.05) }}
                                >
                                    <View style={styles.iconContainer}>
                                        {Object.keys(socialMediaIcons).map((platform) => (
                                            <TouchableOpacity
                                                key={platform}
                                                onPress={() => {
                                                    setSelectedSocialPlatform(platform);
                                                    setNewValue('');
                                                    // Focus champ et scroll pour le garder visible au-dessus du clavier
                                                    setTimeout(() => {
                                                        addSocialInputRef.current?.focus();
                                                        addSocialScrollRef.current?.scrollToEnd({ animated: true });
                                                    }, 50);
                                                }}
                                                style={[
                                                    styles.modalSocialMediaTile,
                                                    selectedSocialPlatform === platform && styles.selectedTile,
                                                    selectedSocialPlatform === platform && { backgroundColor: colors.border + '40' }
                                                ]}>
                                                <Image
                                                    source={socialMediaIcons[platform]}
                                                    style={[
                                                        styles.modalSocialMediaIcon,
                                                        selectedSocialPlatform !== platform && { opacity: 0.6 }
                                                    ]}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <View style={[styles.inputWrapper, { borderColor: selectedSocialPlatform ? '#00c2cb' : colors.border, backgroundColor: isDark ? '#0f1115' : '#ffffff' }]}>
                                        {selectedSocialPlatform ? (
                                            <Image
                                                source={socialMediaIcons[selectedSocialPlatform]}
                                                style={styles.inputPrefixIcon}
                                            />
                                        ) : null}
                                        <TextInput
                                            ref={addSocialInputRef}
                                            value={newValue}
                                            onChangeText={setNewValue}
                                            placeholder={selectedSocialPlatform ? `@username ou ID ${selectedSocialPlatform}` : "Sélectionnez un réseau"}
                                            placeholderTextColor={isDark ? '#666' : '#999'}
                                            style={[styles.wrappedInput, { color: colors.textPrimary }]}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            returnKeyType="done"
                                            onFocus={() => {
                                                setTimeout(() => addSocialScrollRef.current?.scrollToEnd({ animated: true }), 50);
                                            }}
                                        />
                                    </View>
                                    {selectedSocialPlatform === 'Snapchat' && <Text style={styles.modalHint}>Note: Snapchat n'autorise pas les liens directs, entrez juste votre nom d'utilisateur.</Text>}
                                </ScrollView>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity
                                        onPress={handleAddSocial}
                                        style={[
                                            styles.iconRoundButton,
                                            styles.iconEdit,
                                            (!selectedSocialPlatform || !newValue) && { opacity: 0.5 },
                                        ]}
                                        disabled={!selectedSocialPlatform || !newValue}
                                        accessibilityLabel="Enregistrer"
                                    >
                                        <Text style={styles.iconEmoji}>💾</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </Modal>

                <Modal visible={socialModalVisible} transparent={true} animationType="fade">
                    <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
                        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSocialModalVisible(false)} />
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }] }>
                            <TouchableOpacity
                                style={styles.modalBackButton}
                                onPress={() => setSocialModalVisible(false)}
                                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                            >
                                <Image
                                    source={require('../assets/appIcons/backArrow.png')}
                                    style={styles.modalBackButtonImage}
                                />
                            </TouchableOpacity>
                            <Text style={styles.modalTitle}>Modifier {selectedSocialPlatform}</Text>
                            <View style={[styles.inputWrapper, { borderColor: '#00c2cb', backgroundColor: isDark ? '#0f1115' : '#ffffff' }]}>
                                {selectedSocialPlatform && socialMediaIcons[selectedSocialPlatform] ? (
                                    <Image
                                        source={socialMediaIcons[selectedSocialPlatform]}
                                        style={styles.inputPrefixIcon}
                                    />
                                ) : null}
                                <TextInput
                                    value={newValue}
                                    onChangeText={setNewValue}
                                    placeholder="Nom d'utilisateur"
                                    placeholderTextColor={isDark ? '#666' : '#999'}
                                    style={[styles.wrappedInput, { color: colors.textPrimary }]}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    onPress={handleSocialDelete}
                                    style={[styles.iconRoundButton, styles.iconDelete]}
                                    accessibilityLabel="Supprimer">
                                    <Text style={[styles.iconEmoji, { color: isDark ? colors.background : '#fff', textAlign: 'center' }]}>✖</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleSocialEdit}
                                    style={[styles.iconRoundButton, styles.iconEdit]}
                                    accessibilityLabel="Enregistrer">
                                    <Text style={styles.iconEmoji}>💾</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                <Modal visible={photoOptionsModalVisible} transparent={true} animationType="fade">
                    <View style={[styles.modalContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
                        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
                        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoOptionsModalVisible(false)} />
                        <View style={[styles.modalCard, { backgroundColor: colors.surface }] }>
                            <TouchableOpacity
                                style={styles.modalBackButton}
                                onPress={() => setPhotoOptionsModalVisible(false)}
                                hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                            >
                                <Image
                                    source={require('../assets/appIcons/backArrow.png')}
                                    style={styles.modalBackButtonImage}
                                />
                            </TouchableOpacity>
                            <Text style={styles.modalTitle}>Photo de profil</Text>

                            <View style={{ alignItems: 'center', marginBottom: height * 0.02 }}>
                                {user.photo ? (
                                    <ImageWithPlaceholder uri={user.photo} style={[styles.profileImage, { width: imgSize, height: imgSize, borderRadius: imgSize / 2 }]} />
                                ) : (
                                    <View style={styles.placeholderImage}>
                                        <Image
                                            source={require('../assets/appIcons/userProfile.png')}
                                            style={styles.placeholderIcon}
                                        />
                                    </View>
                                )}
                            </View>

                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    onPress={handleCamera}
                                    style={[styles.iconRoundButton, styles.iconEdit]}
                                    accessibilityLabel="Prendre une photo">
                                    <Text style={styles.iconEmoji}>📷</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleGallery}
                                    style={[styles.iconRoundButton, styles.iconEdit]}
                                    accessibilityLabel="Choisir depuis la galerie">
                                    <Text style={styles.iconEmoji}>🖼️</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleDeletePhoto}
                                    style={[styles.iconRoundButton, styles.iconDelete]}
                                    accessibilityLabel="Supprimer la photo">
                                    <Text style={[styles.iconEmoji, { color: isDark ? colors.background : '#fff', textAlign: 'center' }]}>✖</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>

            {/* QR Code Modal */}
            <Modal visible={qrVisible} animationType="slide" transparent onRequestClose={() => setQrVisible(false)}>
                <View style={[styles.qrBackdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)' }]}>
                    <View style={[styles.qrCard, { backgroundColor: colors.surface }]}>
                        <Text style={styles.modalTitle}>Scanne pour voir mon profil</Text>
                        {qrImageUri ? (
                            <Image
                                source={{ uri: qrImageUri }}
                                style={{ width: QR_SIZE, height: QR_SIZE }}
                                resizeMode="contain"
                                onError={() => {
                                    if (qrImageUri !== qrUrl) {
                                        setQrImageUri(qrUrl);
                                    }
                                }}
                            />
                        ) : null}
                        <Text style={[styles.qrHint, { color: colors.textSecondary }]}>Si l'app n'est pas installée, tu seras redirigé(e) vers le store ({Platform.OS === 'ios' ? 'App Store' : 'Google Play'}).</Text>
                        <TouchableOpacity
                            onPress={() => setQrVisible(false)}
                            style={[styles.modalButton, { marginTop: 12, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' }]}
                            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                        >
                            <Text style={[styles.modalButtonText, { textAlign: 'center' }]}>✖</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <TouchableOpacity
                style={styles.returnToListButton}
                onPress={onReturnToList}>
                <Image
                    source={require('../assets/appIcons/userList.png')}
                    style={styles.roundButtonImage}
                />
            </TouchableOpacity>

            {/* Bouton texte supprimé et remplacé par un bouton circulaire 📈 à côté des boutons de partage */}

            <TouchableOpacity
                style={styles.settingsButton}
                onPress={onReturnToSettings}>
                <Image
                    source={require('../assets/appIcons/settings.png')}
                    style={styles.roundButtonImage}
                />
            </TouchableOpacity>

            <Toast
                message={toastMessage}
                visible={toastVisible}
                onHide={() => setToastVisible(false)}
            />

        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: width * 0.08, // Responsive font size based on screen width
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: height * 0.03, // Responsive margin
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
        marginTop: height * 0.025,
        padding: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    bioTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '100%',
        marginBottom: 8,
    },
    bioTextContainer: {
        alignItems: 'center',
        width: '100%',
    },
    statusSelector: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: height * 0.02,
    },
    statusCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginHorizontal: 15,
    },
    warningCard: {
        width: '100%',
        borderRadius: 10,
        borderWidth: 1,
        padding: 12,
        marginTop: height * 0.02,
        alignItems: 'center',
    },
    warningTitle: {
        fontSize: width * 0.05,
        fontWeight: '700',
        marginBottom: 6,
    },
    warningText: {
        fontSize: width * 0.042,
        textAlign: 'center',
    },
    warningList: {
        marginTop: 6,
        width: '100%',
    },
    warningMeta: {
        marginTop: 6,
        fontSize: width * 0.038,
        textAlign: 'center',
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
        width: '88%',
        alignSelf: 'center',
        paddingVertical: height * 0.02,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
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
    identityCard: {
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        minHeight: 70,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    identityLabel: {
        fontSize: 10,
        color: '#00c2cb',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '700',
        marginBottom: 6,
    },
    identityValue: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
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
        padding: Math.max(8, width * 0.025),
        borderWidth: 0,
        borderColor: 'transparent',
        borderRadius: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
        elevation: 2,
    },
    socialMediaIcon: {
        width: Math.min(width * 0.2, 72),
        height: Math.min(width * 0.2, 72),
        resizeMode: 'contain',
    },
    modalSocialMediaIcon: {
        width: Math.min(width * 0.12, 44),
        height: Math.min(width * 0.12, 44),
        resizeMode: 'contain',
    },
    socialMediaText: {
        fontSize: width * 0.04,
        marginTop: height * 0.01,
    },
    modalSocialMediaTile: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: height * 0.015,
        marginHorizontal: width * 0.02,
        padding: 8,
        borderRadius: 12,
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: width * 0.05,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalCard: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: width * 0.05,
    },
    modalTitle: {
        fontSize: width * 0.06,
        fontWeight: 'bold',
        marginTop: 10,
        marginBottom: height * 0.02,
        color: '#00c2cb',
        textAlign: 'center',
    },
    modalInput: {
        width: '100%',
        height: height * 0.06, // Responsive height
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 10,
        paddingLeft: width * 0.03,
        marginBottom: height * 0.02,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        height: height * 0.06,
        borderWidth: 1.5,
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: height * 0.02,
    },
    inputPrefixIcon: {
        width: 24,
        height: 24,
        marginRight: 10,
        resizeMode: 'contain',
    },
    wrappedInput: {
        flex: 1,
        height: '100%',
        fontSize: 16,
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
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    modalHint: {
        fontSize: 12,
        color: '#fff',
        alignSelf: 'flex-start',
        marginBottom: height * 0.01,
        opacity: 0.7,
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
        borderColor: '#00c2cb',
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginTop: height * 0.01,
        marginBottom: height * 0.005,
    },
    iconRoundButton: {
        width: Math.min(width * 0.16, 64),
        height: Math.min(width * 0.16, 64),
        borderRadius: Math.min(width * 0.08, 32),
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 8,
    },
    iconEdit: {
        backgroundColor: '#00c2cb',
    },
    iconDelete: {
        backgroundColor: '#f44336',
    },
    iconCancel: {
        backgroundColor: '#9e9e9e',
    },
    iconEmoji: {
        fontSize: Math.min(width * 0.08, 28),
        color: '#fff',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    modalBackButton: {
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1,
        padding: 8,
    },
    modalBackButtonImage: {
        width: 28,
        height: 28,
        tintColor: '#00c2cb',
    },
    // --- Icônes de partage (entre bio et réseaux sociaux) ---
    shareIconsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        marginTop: height * 0.03,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    shareIconBtn: {
        width: Math.min(width * 0.14, 56),
        height: Math.min(width * 0.14, 56),
        borderRadius: Math.min(width * 0.07, 28),
        backgroundColor: '#00c2cb',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
        elevation: 4,
    },
    shareIconEmoji: {
        fontSize: 22,
        color: '#fff',
    },
    // --- Partage styles ---
    shareTitle: {
        fontSize: width * 0.06,
        fontWeight: '600',
        color: '#00c2cb',
        marginBottom: 8,
    },
    shareRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    shareButton: {
        backgroundColor: '#00c2cb',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        minWidth: '48%',
        marginVertical: 6,
    },
    shareButtonText: {
        color: '#fff',
        fontSize: Math.min(width * 0.045, 16),
        fontWeight: '600',
        textAlign: 'center',
    },
    qrBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    qrCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        alignItems: 'center',
        padding: 16,
        width: '100%',
        maxWidth: 420,
    },
    qrHint: {
        marginTop: 10,
        color: '#fff',
        textAlign: 'center',
        opacity: 0.8,
    },
    returnToListButton: {
        backgroundColor: '#00c2cb',
        width: Math.min(width * 0.14, 56),
        height: Math.min(width * 0.14, 56),
        borderRadius: Math.min(width * 0.07, 28),
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: Math.max(height * 0.02, 16),
        right: Math.max(width * 0.05, 16) + Math.min(width * 0.14, 56) + Math.max(width * 0.03, 12),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    settingsButton: {
        backgroundColor: '#00c2cb',
        width: Math.min(width * 0.14, 56),
        height: Math.min(width * 0.14, 56),
        borderRadius: Math.min(width * 0.07, 28),
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: Math.max(height * 0.02, 16),
        right: Math.max(width * 0.05, 16),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    dataButton: {
        backgroundColor: '#00c2cb',
        height: Math.min(width * 0.14, 56),
        borderRadius: Math.min(width * 0.07, 28),
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: Math.max(height * 0.02, 16),
        left: Math.max(width * 0.05, 16),
        paddingHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    dataButtonText: {
        color: '#fff',
        fontWeight: '700',
    },
    roundButtonImage: {
        width: Math.min(Math.min(width * 0.14, 56) * 0.55, 28),
        height: Math.min(Math.min(width * 0.14, 56) * 0.55, 28),
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
});

export default MyAccountScreen;
