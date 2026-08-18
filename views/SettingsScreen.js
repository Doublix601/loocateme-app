import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Image,
  Dimensions,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import DaySkyBackground from '../components/DaySkyBackground';
import NightSkyBackground from '../components/NightSkyBackground';
import ImageWithPlaceholder from '../components/ImageWithPlaceholder';

import { UserContext } from '../components/contexts/UserContext';
import {
  setVisibility as apiSetVisibility,
  getPrivacyPolicy,
  updateConsent,
  exportMyData,
  deleteMyAccount,
  logout as apiLogout,
  clearApiCache,
  redeemReferralCode,
  getMyUser,
  updateBluetoothConsent,
  apiUpdateInvisibleMode,
  apiUpdateShareCurrentLocation,
  apiUpdateNotificationPreferences,
  updateProfile as apiUpdateProfile,
  uploadProfilePhoto as apiUploadProfilePhoto,
  deleteProfilePhoto as apiDeleteProfilePhoto,
  unblockUser as apiUnblockUser,
  getBlockedUsers,
  apiChangePassword,
  apiRequestEmailChange,
} from '../components/ApiRequest';
import { BluetoothProximityService } from '../services/BluetoothProximityService';
import IAPStore from '../services/IAPStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../components/contexts/ThemeContext';
import { useVibe } from '../components/contexts/VibeContext';

const { width, height } = Dimensions.get('window');

const DISPLAY_NAME_PREF_KEY = 'display_name_mode'; // 'full' | 'custom'

// Types de notifications push exposés côté backend (voir push.service.js,
// littéraux `kind: '...'`). Libellés FR pensés pour un usage utilisateur ; les
// kinds purement internes/admin (ban, report_created, boost_purchase,
// ultra_boost) sont volontairement omis de cette liste. 'story' et 'event'
// retirés : aucune notification backend réelle ne porte ces kinds (les
// littéraux `kind: 'story'`/`'event'` du backend sont des types de job
// BullMQ de transcodage vidéo, pas des notifications).
const NOTIFICATION_KINDS = [
  { kind: 'superlike', label: 'Superlikes reçus' },
  { kind: 'superlike_accepted', label: 'Superlikes acceptés' },
  { kind: 'event_boost', label: "Boosts d'événements" },
  { kind: 'streak_expiring', label: 'Rappels de série' },
  { kind: 'profile_view', label: 'Vues de profil' },
  { kind: 'social_click', label: 'Consultations de tes réseaux sociaux' },
  { kind: 'inactive_profile_views', label: 'Vues reçues pendant votre absence' },
  { kind: 'referral_validated', label: 'Parrainage validé' },
  { kind: 'referral_reward_granted', label: 'Récompense de parrainage' },
  { kind: 'night_mode_activated', label: 'Activation du mode nuit' },
  { kind: 'at_risk_reactivation', label: 'Relances de réactivation' },
  { kind: 'weekly_digest', label: 'Résumé hebdomadaire' },
];

// Regroupement des types de notifications par catégorie, affichées en
// sections déroulantes dans l'onglet Paramètres.
const NOTIFICATION_CATEGORIES = [
  { key: 'social', label: 'Activité sociale', kinds: ['superlike', 'superlike_accepted', 'profile_view', 'social_click'] },
  {
    key: 'rewards',
    label: 'Séries & récompenses',
    kinds: ['event_boost', 'streak_expiring', 'referral_validated', 'referral_reward_granted'],
  },
  {
    key: 'system',
    label: 'Système & résumés',
    kinds: ['inactive_profile_views', 'night_mode_activated', 'at_risk_reactivation', 'weekly_digest'],
  },
];

const SettingsScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useContext(UserContext);
  const { mode: themeMode, colors } = useTheme();
  const { isMoon } = useVibe();
  const isDark = themeMode === 'dark';
  const [saving, setSaving] = useState(false);
  const [displayNameMode, setDisplayNameMode] = useState('full');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [referralSubmitting, setReferralSubmitting] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [manageSubLoading, setManageSubLoading] = useState(false);

  // Onglets Profil / Paramètres
  const [activeTab, setActiveTab] = useState('settings');

  // Profil tab state
  const [profileFirstName, setProfileFirstName] = useState(user?.firstName || '');
  const [profileLastName, setProfileLastName] = useState(user?.lastName || '');
  const [profileCustomName, setProfileCustomName] = useState(user?.customName || '');
  const [profileBio, setProfileBio] = useState(user?.bio || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoOptionsVisible, setPhotoOptionsVisible] = useState(false);
  const [photoActionLoading, setPhotoActionLoading] = useState(null);

  // Notifications tab state
  const [notifPrefs, setNotifPrefs] = useState(user?.notificationPreferences || {});
  const [notifSavingKind, setNotifSavingKind] = useState(null);
  const [expandedNotifCategories, setExpandedNotifCategories] = useState({});
  const toggleNotifCategory = (key) =>
    setExpandedNotifCategories((prev) => ({ ...prev, [key]: !prev[key] }));

  // Mode invisible
  const [invisibleMode, setInvisibleMode] = useState(!!user?.invisibleMode);
  const [invisibleSaving, setInvisibleSaving] = useState(false);

  // GDPR state
  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyText, setPolicyText] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(!!user?.consent?.accepted);
  const [consentVersion, setConsentVersion] = useState(user?.consent?.version || 'v1');
  const [analytics, setAnalytics] = useState(!!user?.privacyPreferences?.analytics);
  const [marketing, setMarketing] = useState(!!user?.privacyPreferences?.marketing);
  const [doNotSell, setDoNotSell] = useState(user?.privacyPreferences?.doNotSell ?? true);
  const [bluetoothProximity, setBluetoothProximity] = useState(!!user?.privacyPreferences?.bluetoothProximity);
  const [bluetoothSaving, setBluetoothSaving] = useState(false);
  const [shareCurrentLocation, setShareCurrentLocation] = useState(!!user?.privacyPreferences?.shareCurrentLocation);
  const [shareCurrentLocationSaving, setShareCurrentLocationSaving] = useState(false);

  // Comptes bloqués (pas d'écran dédié existant : liste minimale réutilisant
  // getBlockedUsers/unblockUser directement dans Paramètres)
  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedList, setBlockedList] = useState([]);

  // Revocation (delete account) modal state
  const [revokeVisible, setRevokeVisible] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeWorking, setRevokeWorking] = useState(false);

  // Changement de mot de passe (modal in-app)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Changement d'email (modal in-app)
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailCurrentPasswordInput, setEmailCurrentPasswordInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    // Hydrate GDPR toggles from user when context changes
    try {
      setConsentAccepted(!!user?.consent?.accepted);
      setConsentVersion(user?.consent?.version || 'v1');
      setAnalytics(!!user?.privacyPreferences?.analytics);
      setMarketing(!!user?.privacyPreferences?.marketing);
      setDoNotSell(user?.privacyPreferences?.doNotSell ?? true);
      setBluetoothProximity(!!user?.privacyPreferences?.bluetoothProximity);
      setShareCurrentLocation(!!user?.privacyPreferences?.shareCurrentLocation);
      setInvisibleMode(!!user?.invisibleMode);
      setNotifPrefs(user?.notificationPreferences || {});
      setProfileFirstName(user?.firstName || '');
      setProfileLastName(user?.lastName || '');
      setProfileCustomName(user?.customName || '');
      setProfileBio(user?.bio || '');
    } catch (_) {}
  }, [user]);

  // Statut d'abonnement (plan, renouvellement) pour la section ABONNEMENT —
  // lu directement depuis RevenueCat (source de vérité du store), pas depuis
  // notre backend qui ne connaît que le booléen isPremium.
  useEffect(() => {
    if (!user?.isPremium) {
      setSubscriptionInfo(null);
      return;
    }
    // 'idle' tant que le fetch n'a pas résolu (affiche "chargement…"), puis
    // soit un objet plan/renouvellement (abonnement RevenueCat réel), soit
    // 'none' — cas d'un Premium accordé sans abonnement store (essai
    // gratuit maison, ou bascule manuelle depuis DebugScreen) : il n'y a
    // alors tout simplement aucun abonnement à afficher/gérer, et ce n'est
    // pas une erreur ni un chargement qui traîne.
    setSubscriptionInfo('idle');
    let cancelled = false;
    IAPStore.getCustomerInfo().then((info) => {
      if (cancelled) return;
      const entitlement = info?.entitlements?.active?.['LoocateMe Premium'];
      if (entitlement) {
        setSubscriptionInfo({
          productIdentifier: entitlement.productIdentifier,
          isMonthly: /month/i.test(entitlement.productIdentifier || ''),
          willRenew: entitlement.willRenew,
          expirationDate: entitlement.expirationDate,
        });
      } else {
        setSubscriptionInfo('none');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.isPremium]);

  const handleManageSubscription = async () => {
    if (manageSubLoading) return;
    setManageSubLoading(true);
    try {
      await IAPStore.openManageSubscriptions(subscriptionInfo?.productIdentifier);
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir la gestion de l'abonnement.");
    } finally {
      setManageSubLoading(false);
    }
  };

  // Charger préférence d'affichage du nom
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISPLAY_NAME_PREF_KEY);
        if (v === 'custom' || v === 'full') setDisplayNameMode(v);
      } catch (_) {}
    })();
  }, []);

  const toggleDisplayNameMode = async () => {
    try {
      const next = displayNameMode === 'full' ? 'custom' : 'full';
      setDisplayNameMode(next);
      await AsyncStorage.setItem(DISPLAY_NAME_PREF_KEY, next);
    } catch (_) {}
  };

  const handleRedeemReferralCode = async () => {
    const code = referralCodeInput.trim();
    if (!code) return;
    setReferralSubmitting(true);
    try {
      await redeemReferralCode(code);
      const freshUser = await getMyUser();
      if (freshUser) updateUser(freshUser);
      setReferralCodeInput('');
      Alert.alert('Parrainage', 'Code de parrainage enregistré !');
    } catch (e) {
      const message =
        e?.code === 'SELF_REFERRAL'
          ? 'Vous ne pouvez pas utiliser votre propre code.'
          : e?.code === 'ALREADY_REFERRED'
          ? 'Vous avez déjà utilisé un code de parrainage.'
          : e?.code === 'INVALID_CODE'
          ? 'Ce code de parrainage est invalide.'
          : e?.message || 'Impossible de valider ce code.';
      Alert.alert('Parrainage', message);
    } finally {
      setReferralSubmitting(false);
    }
  };

  const saveAndReturn = () => {
    navigation.goBack();
  };

  const openTerms = () => {
    Linking.openURL('https://loocateme.com/terms');
  };

  const openPolicy = async () => {
    try {
      setPolicyLoading(true);
      setPolicyModalVisible(true);
      const res = await getPrivacyPolicy();
      const text = typeof res === 'string' ? res : res?.policy || res?.text || JSON.stringify(res, null, 2);
      setPolicyText(text);
    } catch (e) {
      setPolicyText('Impossible de charger la politique de confidentialité.');
    } finally {
      setPolicyLoading(false);
    }
  };

  const persistConsentQuietly = async ({
    accepted,
    analytics: analyticsValue,
    marketing: marketingValue,
    doNotSell: doNotSellValue,
  }) => {
    try {
      const res = await updateConsent({
        accepted,
        version: consentVersion,
        analytics: analyticsValue,
        marketing: marketingValue,
        doNotSell: doNotSellValue,
      });
      const updatedUser = res?.user
        ? res.user
        : {
            ...user,
            consent: {
              accepted,
              version: consentVersion,
              consentAt: accepted ? new Date().toISOString() : user?.consent?.consentAt || null,
            },
            privacyPreferences: { analytics: analyticsValue, marketing: marketingValue, doNotSell: doNotSellValue },
          };
      if (updateUser) {
        updateUser({
          ...user,
          username: user?.username || updatedUser.name || '',
          bio: user?.bio ?? updatedUser.bio ?? '',
          photo: user?.photo ?? updatedUser.profileImageUrl ?? null,
          socialMedia:
            user?.socialMedia ??
            (Array.isArray(updatedUser.socialNetworks)
              ? updatedUser.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
              : []),
          consent: updatedUser.consent || { accepted, version: consentVersion },
          privacyPreferences: updatedUser.privacyPreferences || {
            analytics: analyticsValue,
            marketing: marketingValue,
            doNotSell: doNotSellValue,
          },
        });
      }
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'enregistrer vos préférences de confidentialité");
    }
  };

  const handleToggleConsent = async (v) => {
    // If user tries to uncheck consent, trigger the revoke (account deletion) flow instead
    if (v === false) {
      // Immediately revert the UI toggle; actual deletion flow will log the user out if confirmed
      setConsentAccepted(true);
      handleRevokePress();
      return;
    }
    // If checking consent on, just persist quietly
    setConsentAccepted(true);
    await persistConsentQuietly({ accepted: true, analytics, marketing, doNotSell });
  };

  const handleToggleAnalytics = async (v) => {
    setAnalytics(v);
    await persistConsentQuietly({ accepted: consentAccepted, analytics: v, marketing, doNotSell });
  };

  const handleToggleMarketing = async (v) => {
    setMarketing(v);
    await persistConsentQuietly({ accepted: consentAccepted, analytics, marketing: v, doNotSell });
  };

  // Consentement distinct de celui de la localisation GPS (finalité RGPD
  // séparée) : géré par son propre endpoint, indépendamment de saveConsent/
  // persistConsentQuietly ci-dessus qui portent sur la politique globale.
  const handleToggleBluetooth = async (v) => {
    setBluetoothProximity(v);
    setBluetoothSaving(true);
    try {
      const res = await updateBluetoothConsent(v);
      if (updateUser) {
        updateUser({
          ...user,
          privacyPreferences: {
            ...(user?.privacyPreferences || {}),
            ...(res?.user?.privacyPreferences || {}),
            bluetoothProximity: v,
          },
        });
      }
      if (v) {
        const started = await BluetoothProximityService.start();
        if (!started) {
          // Permissions Bluetooth refusées côté OS : le réglage est accepté côté
          // compte mais la détection ne tourne pas réellement tant qu'elles ne
          // sont pas accordées (Réglages système de l'appareil).
          Alert.alert(
            'Bluetooth indisponible',
            "L'autorisation Bluetooth n'a pas été accordée. Active-la dans les réglages de ton téléphone pour que la détection de proximité fonctionne.",
          );
        }
      } else {
        await BluetoothProximityService.stop();
      }
    } catch (e) {
      setBluetoothProximity(!v);
      Alert.alert('Erreur', e?.message || "Impossible de mettre à jour la proximité Bluetooth");
    } finally {
      setBluetoothSaving(false);
    }
  };

  // Partage du lieu précis actuel (au-delà de la ville) sur le profil public.
  // Défaut désactivé (RGPD, risque de stalking) : opt-in explicite requis.
  const handleToggleShareCurrentLocation = async (v) => {
    setShareCurrentLocation(v);
    setShareCurrentLocationSaving(true);
    try {
      const res = await apiUpdateShareCurrentLocation(v);
      if (updateUser) {
        updateUser({
          ...user,
          privacyPreferences: {
            ...(user?.privacyPreferences || {}),
            ...(res?.user?.privacyPreferences || {}),
            shareCurrentLocation: v,
          },
        });
      }
    } catch (e) {
      setShareCurrentLocation(!v);
      Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le partage du lieu actuel');
    } finally {
      setShareCurrentLocationSaving(false);
    }
  };

  // Mode invisible : accessible en free tier (pas de gate premium). Masque
  // l'utilisateur des autres utilisateurs des lieux, mais le prive en retour
  // de la carte / liste des lieux tant qu'il est actif.
  const handleToggleInvisible = async (v) => {
    setInvisibleMode(v);
    setInvisibleSaving(true);
    try {
      const res = await apiUpdateInvisibleMode(v);
      if (updateUser) {
        updateUser({
          ...user,
          invisibleMode: typeof res?.user?.invisibleMode === 'boolean' ? res.user.invisibleMode : v,
        });
      }
    } catch (e) {
      setInvisibleMode(!v);
      Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le mode invisible');
    } finally {
      setInvisibleSaving(false);
    }
  };

  const handleToggleNotifKind = async (kind, v) => {
    setNotifPrefs((prev) => ({ ...prev, [kind]: v }));
    setNotifSavingKind(kind);
    try {
      const res = await apiUpdateNotificationPreferences(kind, v);
      if (updateUser) {
        updateUser({
          ...user,
          notificationPreferences: res?.user?.notificationPreferences || { ...(user?.notificationPreferences || {}), [kind]: v },
        });
      }
    } catch (e) {
      setNotifPrefs((prev) => ({ ...prev, [kind]: !v }));
      Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour cette préférence de notification');
    } finally {
      setNotifSavingKind(null);
    }
  };

  const saveConsent = async (accepted) => {
    try {
      const res = await updateConsent({ accepted, version: consentVersion, analytics, marketing, doNotSell });
      const updatedUser = res?.user
        ? res.user
        : {
            ...user,
            consent: {
              accepted,
              version: consentVersion,
              consentAt: accepted ? new Date().toISOString() : user?.consent?.consentAt || null,
            },
            privacyPreferences: { analytics, marketing, doNotSell },
          };
      if (updateUser) {
        updateUser({
          ...user,
          username: user?.username || updatedUser.name || '',
          bio: user?.bio ?? updatedUser.bio ?? '',
          photo: user?.photo ?? updatedUser.profileImageUrl ?? null,
          socialMedia:
            user?.socialMedia ??
            (Array.isArray(updatedUser.socialNetworks)
              ? updatedUser.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
              : []),
          consent: updatedUser.consent || { accepted, version: consentVersion },
          privacyPreferences: updatedUser.privacyPreferences || { analytics, marketing, doNotSell },
        });
      }
      setConsentAccepted(accepted);
      Alert.alert('Succès', accepted ? 'Consentement enregistré.' : 'Consentement révoqué.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'enregistrer le consentement");
    }
  };

  const handleRevokePress = () => {
    Alert.alert(
      'Révocation du consentement',
      'Révoquer votre consentement entraînera la suppression définitive de votre compte et de toutes vos données. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', style: 'destructive', onPress: () => setRevokeVisible(true) },
      ],
    );
  };

  const performRevokeDelete = async () => {
    if (!revokePassword || revokePassword.length < 6) {
      Alert.alert('Mot de passe requis', 'Merci de saisir votre mot de passe.');
      return;
    }
    try {
      setRevokeWorking(true);
      await deleteMyAccount({ password: revokePassword });
      setRevokeVisible(false);
      setRevokePassword('');
      try {
        clearApiCache();
      } catch (_) {}
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Suppression impossible. Mot de passe invalide ou problème serveur.');
    } finally {
      setRevokeWorking(false);
    }
  };

  const openPasswordModal = () => {
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setPasswordError('');
    setPasswordModalVisible(true);
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPasswordInput) {
      setPasswordError('Merci de saisir votre mot de passe actuel.');
      return;
    }
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPasswordError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    try {
      setPasswordSaving(true);
      await apiChangePassword(currentPasswordInput, newPasswordInput);
      setPasswordModalVisible(false);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      Alert.alert('Mot de passe modifié', 'Votre mot de passe a bien été mis à jour.');
    } catch (e) {
      setPasswordError(e?.message || 'Mot de passe actuel invalide ou erreur serveur.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const openEmailModal = () => {
    setNewEmailInput('');
    setEmailCurrentPasswordInput('');
    setEmailError('');
    setEmailModalVisible(true);
  };

  const handleRequestEmailChange = async () => {
    setEmailError('');
    const email = (newEmailInput || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Merci de saisir une adresse email valide.');
      return;
    }
    if (!emailCurrentPasswordInput) {
      setEmailError('Merci de saisir votre mot de passe pour confirmer.');
      return;
    }
    try {
      setEmailSaving(true);
      await apiRequestEmailChange(email, emailCurrentPasswordInput);
      setEmailModalVisible(false);
      setNewEmailInput('');
      setEmailCurrentPasswordInput('');
      Alert.alert(
        'Vérifie ta boîte mail',
        `Un email de confirmation a été envoyé à ${email}. Clique sur le lien pour valider le changement.`,
      );
    } catch (e) {
      setEmailError(e?.message || 'Impossible de démarrer le changement. Mot de passe invalide ou erreur serveur.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportMyData();
      // For simplicity, just show a success and a snippet length; in a real app, save to file/share
      const size = JSON.stringify(data)?.length || 0;
      Alert.alert('Export prêt', `Vos données ont été exportées (${size} caractères).`);
    } catch (e) {
      Alert.alert('Erreur', e?.message || "Impossible d'exporter vos données");
    }
  };

  const handleDelete = async () => {
    try {
      Alert.alert(
        'Supprimer le compte',
        'La suppression est définitive. Confirmez-vous la suppression de votre compte ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => {
              // Open the revoke modal to let user enter their password, then perform delete
              setRevokePassword('');
              setRevokeVisible(true);
            },
          },
        ],
      );
    } catch (_) {}
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (_) {}
    try {
      clearApiCache();
    } catch (_) {}
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  // --- Photo de profil (migré depuis EditProfileScreen) ---
  const refreshMyProfile = async () => {
    try {
      const res = await getMyUser();
      const me = res?.user;
      if (!me || !updateUser) return;
      updateUser({
        ...user,
        firstName: typeof me.firstName === 'string' ? me.firstName : user?.firstName || '',
        lastName: typeof me.lastName === 'string' ? me.lastName : user?.lastName || '',
        customName: typeof me.customName === 'string' ? me.customName : user?.customName || '',
        bio: typeof me.bio === 'string' ? me.bio : user?.bio || '',
        photo: me.profileImageUrl ?? user?.photo ?? null,
        socialMedia: Array.isArray(me.socialNetworks)
          ? me.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
          : user?.socialMedia || [],
      });
    } catch (_) {}
  };

  const handleCamera = async () => {
    if (photoActionLoading) return;
    if (Platform.OS === 'web') {
      Alert.alert('Non supporté', "La caméra n'est pas disponible sur le web.");
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Autorisation requise', "L'application a besoin de l'accès à la caméra pour prendre une photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
      const canceled = result?.canceled ?? result?.cancelled;
      const uri = result?.assets?.[0]?.uri ?? result?.uri;
      if (canceled || !uri) return;

      setPhotoActionLoading('camera');
      try {
        const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
        const file = { uri, name, type: 'image/jpeg' };
        const res = await apiUploadProfilePhoto(file);
        const updated = res?.user || {};
        updateUser({ ...user, photo: updated.profileImageUrl || uri });
        await refreshMyProfile();
        setPhotoOptionsVisible(false);
      } catch (e2) {
        Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
      } finally {
        setPhotoActionLoading(null);
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir la caméra.");
    }
  };

  const handleGallery = async () => {
    if (photoActionLoading) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Autorisation requise',
            "L'application a besoin de l'accès à vos photos pour sélectionner une image.",
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
      const canceled = result?.canceled ?? result?.cancelled;
      const uri = result?.assets?.[0]?.uri ?? result?.uri;
      if (canceled || !uri) return;

      setPhotoActionLoading('gallery');
      try {
        const name = uri.split('/').pop() || `photo_${Date.now()}.jpg`;
        const file = { uri, name, type: 'image/jpeg' };
        const res = await apiUploadProfilePhoto(file);
        const updated = res?.user || {};
        updateUser({ ...user, photo: updated.profileImageUrl || uri });
        await refreshMyProfile();
        setPhotoOptionsVisible(false);
      } catch (e2) {
        Alert.alert('Erreur', e2?.message || "Impossible de téléverser l'image");
      } finally {
        setPhotoActionLoading(null);
      }
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const handleDeletePhoto = async () => {
    if (photoActionLoading) return;
    setPhotoActionLoading('delete');
    try {
      const res = await apiDeleteProfilePhoto();
      const updated = res?.user || {};
      updateUser({ ...user, photo: updated.profileImageUrl || null });
      await refreshMyProfile();
      setPhotoOptionsVisible(false);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de supprimer la photo de profil');
    } finally {
      setPhotoActionLoading(null);
    }
  };

  const confirmDeletePhoto = () => {
    if (photoActionLoading) return;
    Alert.alert('Supprimer la photo de profil ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: handleDeletePhoto },
    ]);
  };

  // --- Enregistrement du profil (Prénom/Nom/Custom/Bio) ---
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      const candidateFirst = profileFirstName.trim();
      const candidateLast = profileLastName.trim();
      const candidateCustom = profileCustomName.trim();
      const hasCustom = candidateCustom.length > 0;
      const hasFirst = candidateFirst.length > 0;
      const hasLast = candidateLast.length > 0;
      if (!hasCustom && !(hasFirst && hasLast)) {
        Alert.alert('Identité incomplète', 'Renseigne un Nom personnalisé OU un Prénom ET un Nom.');
        setProfileSaving(false);
        return;
      }
      const res = await apiUpdateProfile({
        firstName: candidateFirst,
        lastName: candidateLast,
        customName: candidateCustom,
        bio: profileBio,
      });
      const updated = res?.user || {};
      updateUser({
        ...user,
        firstName: updated.firstName ?? candidateFirst,
        lastName: updated.lastName ?? candidateLast,
        customName: updated.customName ?? candidateCustom,
        bio: updated.bio ?? profileBio,
        username: updated.username ?? updated.name ?? user.username,
        photo: updated.profileImageUrl ?? user.photo,
      });
      await refreshMyProfile();
      Alert.alert('Profil', 'Votre profil a été mis à jour.');
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le profil');
    } finally {
      setProfileSaving(false);
    }
  };

  // --- Comptes bloqués ---
  const openBlockedUsers = async () => {
    setBlockedModalVisible(true);
    setBlockedLoading(true);
    try {
      const res = await getBlockedUsers();
      const list = Array.isArray(res?.blocks) ? res.blocks : Array.isArray(res) ? res : [];
      setBlockedList(list);
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger les comptes bloqués');
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleUnblock = async (blockId) => {
    try {
      await apiUnblockUser(blockId);
      setBlockedList((prev) => prev.filter((b) => (b?._id || b?.id) !== blockId));
    } catch (e) {
      Alert.alert('Erreur', e?.message || 'Impossible de débloquer cet utilisateur');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      {isMoon ? (
        <NightSkyBackground style={StyleSheet.absoluteFill} />
      ) : (
        <DaySkyBackground style={StyleSheet.absoluteFill} />
      )}
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(0,194,203,0.2)' : 'rgba(0,194,203,0.1)' }]}
          onPress={saveAndReturn}
          hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
        >
          <Image source={require('../assets/appIcons/backArrow.png')} style={styles.backButtonImage} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Paramètres</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Double tab Profil / Paramètres */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('profile')}
          style={[styles.tabPill, activeTab === 'profile' && { backgroundColor: '#00c2cb' }]}
        >
          <Text style={[styles.tabPillText, { color: activeTab === 'profile' ? '#fff' : colors.textSecondary }]}>
            Profil
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('settings')}
          style={[styles.tabPill, activeTab === 'settings' && { backgroundColor: '#00c2cb' }]}
        >
          <Text style={[styles.tabPillText, { color: activeTab === 'settings' ? '#fff' : colors.textSecondary }]}>
            Paramètres
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, activeTab === 'profile' && { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'profile' ? (
          <>
            <TouchableOpacity
              style={styles.avatarWrapper}
              activeOpacity={0.8}
              onPress={() => setPhotoOptionsVisible(true)}
              disabled={!!photoActionLoading}
            >
              {user?.photo ? (
                <ImageWithPlaceholder uri={user.photo} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarImage, styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
                  <Text style={styles.avatarPlaceholderText}>📷</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditBadgeText}>✏️</Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>IDENTITÉ</Text>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Prénom</Text>
              <TextInput
                style={[
                  styles.textField,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#f7f9fa' },
                ]}
                value={profileFirstName}
                onChangeText={setProfileFirstName}
                placeholder="Votre prénom"
                placeholderTextColor={isDark ? '#999' : '#666'}
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nom</Text>
              <TextInput
                style={[
                  styles.textField,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#f7f9fa' },
                ]}
                value={profileLastName}
                onChangeText={setProfileLastName}
                placeholder="Votre nom"
                placeholderTextColor={isDark ? '#999' : '#666'}
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nom personnalisé</Text>
              <TextInput
                style={[
                  styles.textField,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#f7f9fa' },
                ]}
                value={profileCustomName}
                onChangeText={setProfileCustomName}
                placeholder="Votre nom personnalisé"
                placeholderTextColor={isDark ? '#999' : '#666'}
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
              <TextInput
                style={[
                  styles.textField,
                  styles.textFieldMultiline,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#f7f9fa' },
                ]}
                value={profileBio}
                onChangeText={setProfileBio}
                placeholder="Parle un peu de toi..."
                placeholderTextColor={isDark ? '#999' : '#666'}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

          </>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>ABONNEMENT</Text>
              {user?.isPremium ? (
                <>
                  <View style={[styles.optionContainer, { borderBottomColor: colors.border, borderBottomWidth: subscriptionInfo && typeof subscriptionInfo === 'object' ? 1 : 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                        👑 Premium{' '}
                        {subscriptionInfo && typeof subscriptionInfo === 'object' ? (subscriptionInfo.isMonthly ? '· Mensuel' : '· Annuel') : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {subscriptionInfo === 'idle'
                          ? 'Statut en cours de chargement…'
                          : subscriptionInfo === 'none'
                            ? 'Accordé hors abonnement App Store/Play Store (essai gratuit ou offre spéciale)'
                            : subscriptionInfo?.expirationDate
                              ? `${subscriptionInfo.willRenew ? 'Renouvellement' : 'Expire'} le ${new Date(subscriptionInfo.expirationDate).toLocaleDateString('fr-FR')}`
                              : ''}
                      </Text>
                    </View>
                  </View>
                  {subscriptionInfo && typeof subscriptionInfo === 'object' && (
                    <TouchableOpacity
                      style={[styles.linkRow, { borderBottomWidth: 0 }]}
                      onPress={handleManageSubscription}
                      disabled={manageSubLoading}
                    >
                      <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>
                        {manageSubLoading ? 'Ouverture…' : 'Gérer mon abonnement'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomWidth: 0 }]}
                  onPress={() => navigation.navigate('PremiumPaywall', { source: 'settings' })}
                >
                  <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>👑 Passer au Premium</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>GÉNÉRAL</Text>

              <View style={[styles.optionContainer, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Mode d'affichage</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {displayNameMode === 'full' ? 'Prénom Nom' : 'Nom personnalisé'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={toggleDisplayNameMode}
                  style={[styles.smallPill, { backgroundColor: colors.background }]}
                >
                  <Text style={[styles.smallPillText, { color: colors.textPrimary }]}>
                    {displayNameMode === 'full' ? 'Classique' : 'Custom'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>PARRAINAGE</Text>
              {user?.referredBy ? (
                <Text style={{ fontSize: 14, color: colors.textSecondary, paddingVertical: 10 }}>
                  Vous avez déjà été parrainé.
                </Text>
              ) : (
                <View style={{ paddingVertical: 10 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                    Un ami vous a partagé un code ? Entrez-le ici.
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={[
                        styles.revokeInput,
                        {
                          flex: 1,
                          marginBottom: 0,
                          borderColor: colors.border,
                          color: isDark ? '#fff' : colors.textPrimary,
                          backgroundColor: isDark ? '#0f1115' : '#ffffff',
                        },
                      ]}
                      placeholder="Code de parrainage"
                      placeholderTextColor={isDark ? '#999' : '#666'}
                      autoCapitalize="characters"
                      value={referralCodeInput}
                      onChangeText={setReferralCodeInput}
                    />
                    <TouchableOpacity
                      onPress={handleRedeemReferralCode}
                      disabled={referralSubmitting || !referralCodeInput.trim()}
                      style={[styles.smallPill, { backgroundColor: '#00c2cb', marginLeft: 10, opacity: referralSubmitting ? 0.6 : 1 }]}
                    >
                      {referralSubmitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.smallPillText, { color: '#fff' }]}>Valider</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
              {NOTIFICATION_CATEGORIES.map((category, catIdx) => {
                const items = NOTIFICATION_KINDS.filter((item) => category.kinds.includes(item.kind));
                const expanded = !!expandedNotifCategories[category.key];
                return (
                  <View key={category.key}>
                    <TouchableOpacity
                      style={[
                        styles.optionContainer,
                        {
                          borderBottomColor: colors.border,
                          borderBottomWidth: expanded || catIdx < NOTIFICATION_CATEGORIES.length - 1 ? 1 : 0,
                        },
                      ]}
                      onPress={() => toggleNotifCategory(category.key)}
                    >
                      <Text style={[styles.optionText, { color: colors.textPrimary, flex: 1, fontWeight: '600' }]}>
                        {category.label}
                      </Text>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {expanded &&
                      items.map((item, idx) => {
                        const enabled = notifPrefs?.[item.kind] !== false; // opt-out : activé par défaut
                        return (
                          <View
                            key={item.kind}
                            style={[
                              styles.optionContainer,
                              styles.optionContainerNested,
                              {
                                borderBottomColor: colors.border,
                                borderBottomWidth:
                                  idx < items.length - 1 || catIdx < NOTIFICATION_CATEGORIES.length - 1 ? 1 : 0,
                              },
                            ]}
                          >
                            <Text style={[styles.optionText, { color: colors.textPrimary, flex: 1, fontSize: 14 }]}>
                              {item.label}
                            </Text>
                            {notifSavingKind === item.kind ? (
                              <ActivityIndicator size="small" color="#00c2cb" />
                            ) : (
                              <Switch
                                value={enabled}
                                onValueChange={(v) => handleToggleNotifKind(item.kind, v)}
                                trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                                thumbColor={enabled ? '#fff' : '#f4f3f4'}
                              />
                            )}
                          </View>
                        );
                      })}
                  </View>
                );
              })}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>CONFIDENTIALITÉ & RGPD</Text>
              <TouchableOpacity style={[styles.linkRow, { borderBottomColor: colors.border }]} onPress={openPolicy}>
                <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Politique de confidentialité</Text>
              </TouchableOpacity>

              <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Consentement</Text>
                <Switch
                  value={consentAccepted}
                  onValueChange={handleToggleConsent}
                  trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                  thumbColor={consentAccepted ? '#fff' : '#f4f3f4'}
                />
              </View>
              <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Analytics</Text>
                <Switch
                  value={analytics}
                  onValueChange={handleToggleAnalytics}
                  trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                  thumbColor={analytics ? '#fff' : '#f4f3f4'}
                />
              </View>
              <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Marketing</Text>
                <Switch
                  value={marketing}
                  onValueChange={handleToggleMarketing}
                  trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                  thumbColor={marketing ? '#fff' : '#f4f3f4'}
                />
              </View>
              <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Vente de données (CCPA)</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    Nous ne vendons ni ne partageons vos données personnelles avec des tiers à des fins
                    publicitaires.
                  </Text>
                </View>
              </View>

              <View style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Mode invisible</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
                    Vous serez invisible pour les autres utilisateurs des lieux, mais vous ne pourrez plus consulter
                    la carte ni la liste des lieux tant que ce mode est actif.
                  </Text>
                </View>
                {invisibleSaving ? (
                  <ActivityIndicator size="small" color="#00c2cb" />
                ) : (
                  <Switch
                    value={invisibleMode}
                    onValueChange={handleToggleInvisible}
                    trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                    thumbColor={invisibleMode ? '#fff' : '#f4f3f4'}
                  />
                )}
              </View>

              <View style={[styles.optionContainer, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Partager mon lieu actuel</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
                    Affiche aux autres utilisateurs l'endroit précis où vous vous trouvez actuellement (ex :
                    "Actuellement à ..."), en plus de votre ville. Désactivé par défaut pour protéger votre vie
                    privée et éviter tout risque de traque.
                  </Text>
                </View>
                {shareCurrentLocationSaving ? (
                  <ActivityIndicator size="small" color="#00c2cb" />
                ) : (
                  <Switch
                    value={shareCurrentLocation}
                    onValueChange={handleToggleShareCurrentLocation}
                    trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                    thumbColor={shareCurrentLocation ? '#fff' : '#f4f3f4'}
                  />
                )}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>PROXIMITÉ BLUETOOTH</Text>
              <View style={[styles.optionContainer, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Détection Bluetooth à proximité</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
                    Détecte les autres utilisateurs très proches de vous (quelques mètres) pour continuer à fonctionner
                    sans réseau et affiner votre position dans un lieu. Désactivé par défaut, distinct du consentement de
                    localisation GPS. Un identifiant temporaire et anonyme est utilisé, jamais votre identité.
                  </Text>
                </View>
                {bluetoothSaving ? (
                  <ActivityIndicator size="small" color="#00c2cb" />
                ) : (
                  <Switch
                    value={bluetoothProximity}
                    onValueChange={handleToggleBluetooth}
                    trackColor={{ false: isDark ? '#333' : '#ccc', true: '#00c2cb' }}
                    thumbColor={bluetoothProximity ? '#fff' : '#f4f3f4'}
                  />
                )}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={styles.sectionTitle}>COMPTE</Text>
              <TouchableOpacity
                style={[styles.optionContainer, { borderBottomColor: colors.border }]}
                onPress={openEmailModal}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>Email</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>{user?.email || 'Non renseigné'}</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#00c2cb', fontWeight: '700' }}>Changer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionContainer, { borderBottomColor: colors.border }]}
                onPress={openPasswordModal}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Mot de passe</Text>
                <Text style={{ fontSize: 12, color: '#00c2cb', fontWeight: '700' }}>Changer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.linkRow, { borderBottomColor: colors.border }]}
                onPress={openBlockedUsers}
              >
                <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Comptes bloqués</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.linkRow, { borderBottomColor: colors.border }]} onPress={openPolicy}>
                <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Aide et confidentialité</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.linkRow, { borderBottomWidth: 0 }]} onPress={openTerms}>
                <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Conditions générales d'utilisation</Text>
              </TouchableOpacity>
            </View>

            {['admin', 'moderator'].includes(user?.role) && (
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={styles.sectionTitle}>MODÉRATION</Text>
                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomColor: colors.border }]}
                  onPress={() => navigation.navigate('Moderator')}
                >
                  <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Espace modérateur</Text>
                </TouchableOpacity>
                {user?.role === 'admin' && (
                  <TouchableOpacity
                    style={[styles.linkRow, { borderBottomWidth: 0 }]}
                    onPress={() => navigation.navigate('Debug')}
                  >
                    <Text style={[styles.linkRowText, { color: '#00c2cb' }]}>Debug Console</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.surface }]} onPress={handleExport}>
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Exporter mes données</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: isDark ? 'rgba(255,77,77,0.1)' : '#ffe6e6' }]}
                onPress={handleDelete}
              >
                <Text style={[styles.actionButtonText, { color: '#ff4d4d' }]}>Supprimer mon compte</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#ff4d4d' }]} onPress={handleLogout}>
                <Text style={styles.logoutText}>Déconnexion</Text>
              </TouchableOpacity>
            </View>

            <Text
              style={{ textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginTop: 30, marginBottom: 20 }}
            >
              LoocateMe v1.0.0 (39)
            </Text>
          </>
        )}
      </ScrollView>

      {activeTab === 'profile' && (
        <View style={[styles.stickySaveBar, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: '#00c2cb', opacity: profileSaving ? 0.7 : 1, marginBottom: 0 }]}
            onPress={handleSaveProfile}
            disabled={profileSaving}
          >
            {profileSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={policyModalVisible} animationType="slide" onRequestClose={() => setPolicyModalVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setPolicyModalVisible(false)}>
              <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Fermer</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confidentialité</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalContent}>
            {policyLoading ? (
              <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.policyText, { color: colors.textSecondary }]}>{policyText}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Revocation (Delete Account) Modal */}
      <Modal transparent visible={revokeVisible} animationType="fade" onRequestClose={() => setRevokeVisible(false)}>
        <View style={[styles.revokeBackdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)' }]}>
          <View style={[styles.revokeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.revokeTitle, { color: colors.textPrimary }]}>Suppression du compte</Text>
            <Text style={[styles.revokeDesc, { color: isDark ? '#fff' : colors.textSecondary }]}>
              Pour confirmer, entrez votre mot de passe. Cette action est irréversible.
            </Text>
            <TextInput
              style={[
                styles.revokeInput,
                {
                  borderColor: colors.border,
                  color: isDark ? '#fff' : colors.textPrimary,
                  backgroundColor: isDark ? '#0f1115' : '#ffffff',
                },
              ]}
              placeholder="Mot de passe"
              placeholderTextColor={isDark ? '#999' : '#666'}
              secureTextEntry
              value={revokePassword}
              onChangeText={setRevokePassword}
            />
            <View style={styles.revokeButtons}>
              <TouchableOpacity
                style={[styles.primaryButton, styles.secondaryButton]}
                onPress={() => setRevokeVisible(false)}
                disabled={revokeWorking}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.dangerButton]}
                onPress={performRevokeDelete}
                disabled={revokeWorking}
              >
                <Text style={styles.dangerButtonText}>{revokeWorking ? 'Suppression...' : 'Supprimer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Changement de mot de passe */}
      <Modal
        transparent
        visible={passwordModalVisible}
        animationType="fade"
        onRequestClose={() => !passwordSaving && setPasswordModalVisible(false)}
      >
        <View style={styles.blurModalContainer}>
          <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !passwordSaving && setPasswordModalVisible(false)}
          />
          <View style={styles.blurModalCenter} pointerEvents="box-none">
            <View style={[styles.blurModalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                Changer le mot de passe
              </Text>
              <TextInput
                style={[
                  styles.revokeInput,
                  { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                ]}
                placeholder="Mot de passe actuel"
                placeholderTextColor={isDark ? '#999' : '#666'}
                secureTextEntry
                value={currentPasswordInput}
                onChangeText={setCurrentPasswordInput}
                editable={!passwordSaving}
              />
              <TextInput
                style={[
                  styles.revokeInput,
                  { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                ]}
                placeholder="Nouveau mot de passe (6 caractères min.)"
                placeholderTextColor={isDark ? '#999' : '#666'}
                secureTextEntry
                value={newPasswordInput}
                onChangeText={setNewPasswordInput}
                editable={!passwordSaving}
              />
              <TextInput
                style={[
                  styles.revokeInput,
                  { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                ]}
                placeholder="Confirmer le nouveau mot de passe"
                placeholderTextColor={isDark ? '#999' : '#666'}
                secureTextEntry
                value={confirmNewPasswordInput}
                onChangeText={setConfirmNewPasswordInput}
                editable={!passwordSaving}
              />
              {!!passwordError && (
                <Text style={{ color: '#ff4d4d', fontSize: 12, marginBottom: 8 }}>{passwordError}</Text>
              )}
              <View style={styles.revokeButtons}>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.secondaryButton]}
                  onPress={() => setPasswordModalVisible(false)}
                  disabled={passwordSaving}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#00c2cb' }]}
                  onPress={handleChangePassword}
                  disabled={passwordSaving}
                >
                  {passwordSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Valider</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Changement d'email */}
      <Modal
        transparent
        visible={emailModalVisible}
        animationType="fade"
        onRequestClose={() => !emailSaving && setEmailModalVisible(false)}
      >
        <View style={styles.blurModalContainer}>
          <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !emailSaving && setEmailModalVisible(false)} />
          <View style={styles.blurModalCenter} pointerEvents="box-none">
            <View style={[styles.blurModalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                Changer d'email
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                Email actuel : {user?.email || 'Non renseigné'}
              </Text>
              <TextInput
                style={[
                  styles.revokeInput,
                  { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                ]}
                placeholder="Nouvel email"
                placeholderTextColor={isDark ? '#999' : '#666'}
                autoCapitalize="none"
                keyboardType="email-address"
                value={newEmailInput}
                onChangeText={setNewEmailInput}
                editable={!emailSaving}
              />
              <TextInput
                style={[
                  styles.revokeInput,
                  { borderColor: colors.border, color: isDark ? '#fff' : colors.textPrimary, backgroundColor: isDark ? '#0f1115' : '#ffffff' },
                ]}
                placeholder="Mot de passe actuel"
                placeholderTextColor={isDark ? '#999' : '#666'}
                secureTextEntry
                value={emailCurrentPasswordInput}
                onChangeText={setEmailCurrentPasswordInput}
                editable={!emailSaving}
              />
              {!!emailError && <Text style={{ color: '#ff4d4d', fontSize: 12, marginBottom: 8 }}>{emailError}</Text>}
              <View style={styles.revokeButtons}>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.secondaryButton]}
                  onPress={() => setEmailModalVisible(false)}
                  disabled={emailSaving}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#00c2cb' }]}
                  onPress={handleRequestEmailChange}
                  disabled={emailSaving}
                >
                  {emailSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Valider</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo options modal (migré depuis EditProfileScreen) */}
      <Modal visible={photoOptionsVisible} transparent animationType="fade">
        <View style={styles.blurModalContainer}>
          <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !photoActionLoading && setPhotoOptionsVisible(false)}
          />
          <View style={styles.blurModalCenter} pointerEvents="box-none">
            <View style={[styles.blurModalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 16 }]}>Photo de profil</Text>
              <TouchableOpacity
                style={[styles.photoOptionButton, { borderColor: colors.border }]}
                onPress={handleCamera}
                disabled={!!photoActionLoading}
              >
                <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>
                  {photoActionLoading === 'camera' ? 'Envoi...' : '📸 Prendre une photo'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoOptionButton, { borderColor: colors.border }]}
                onPress={handleGallery}
                disabled={!!photoActionLoading}
              >
                <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>
                  {photoActionLoading === 'gallery' ? 'Envoi...' : '🖼️ Choisir dans la galerie'}
                </Text>
              </TouchableOpacity>
              {!!user?.photo && (
                <TouchableOpacity
                  style={[styles.photoOptionButton, { borderColor: colors.border }]}
                  onPress={confirmDeletePhoto}
                  disabled={!!photoActionLoading}
                >
                  <Text style={styles.photoOptionDeleteText}>
                    {photoActionLoading === 'delete' ? 'Suppression...' : '🗑️ Supprimer la photo'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setPhotoOptionsVisible(false)}
                style={[styles.photoOptionButton, { borderColor: colors.border, marginBottom: 0 }]}
                disabled={!!photoActionLoading}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Comptes bloqués */}
      <Modal
        visible={blockedModalVisible}
        animationType="slide"
        onRequestClose={() => setBlockedModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setBlockedModalVisible(false)}>
              <Text style={{ color: '#00c2cb', fontWeight: 'bold' }}>Fermer</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Comptes bloqués</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.modalContent}>
            {blockedLoading ? (
              <ActivityIndicator size="large" color="#00c2cb" style={{ marginTop: 50 }} />
            ) : blockedList.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 30 }}>
                Aucun compte bloqué.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {blockedList.map((b) => {
                  const id = b?._id || b?.id;
                  const name = b?.targetUser?.username || b?.targetUser?.name || b?.username || 'Utilisateur';
                  return (
                    <View key={id} style={[styles.optionContainer, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.optionText, { color: colors.textPrimary }]}>{name}</Text>
                      <TouchableOpacity
                        style={[styles.smallPill, { backgroundColor: '#00c2cb' }]}
                        onPress={() => handleUnblock(id)}
                      >
                        <Text style={[styles.smallPillText, { color: '#fff' }]}>Débloquer</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 4,
    borderRadius: 16,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,194,203,0.05)',
  },
  tabPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingBottom: height * 0.1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonImage: {
    width: 24,
    height: 24,
    tintColor: '#00c2cb',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00c2cb',
    marginBottom: 15,
    letterSpacing: 1.5,
  },
  optionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionContainerNested: {
    paddingLeft: 12,
  },
  smallPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  smallPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  linkRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  linkRowText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  actionButtonText: {
    fontWeight: '700',
    fontSize: 16,
  },
  logoutButton: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#ff4d4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  logoutText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  modalCloseButton: {
    width: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  policyText: {
    fontSize: 15,
    lineHeight: 24,
  },
  revokeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  revokeCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  revokeTitle: {
    fontSize: width * 0.06,
    fontWeight: '700',
    color: '#ff4d4d',
    textAlign: 'center',
    marginBottom: 8,
  },
  revokeDesc: {
    fontSize: width * 0.04,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.8,
  },
  revokeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: '#f8f9fa',
  },
  revokeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#ff4d4d',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Profil tab
  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 34,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#00c2cb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarEditBadgeText: {
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 10,
  },
  textField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textFieldMultiline: {
    height: 100,
    paddingTop: 12,
  },
  socialIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginRight: 10,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  stickySaveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  blurModalContainer: {
    flex: 1,
  },
  blurModalCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  blurModalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  photoOptionButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 10,
  },
  photoOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoOptionDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0245e',
  },
  platformPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  platformPillIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    borderRadius: 4,
  },
});

export default SettingsScreen;
