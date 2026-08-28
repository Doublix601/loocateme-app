import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useRef, useContext } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LogBox,
} from 'react-native';

import * as Location from 'expo-location';
import { getCurrentPositionSmart } from './utils/locationHelper';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import Purchases from 'react-native-purchases';
import { IS_EXPO_GO } from './services/DebugConfig';

import ConsumablesShopSheet from './components/ConsumablesShopSheet';
import LocationPermissionModal from './components/LocationPermissionModal';
import PremiumExpiredModal from './components/PremiumExpiredModal';
import ChurnSurveyModal from './components/ChurnSurveyModal';
import RateLimitModal from './components/RateLimitModal';
import { reportPermissionStatus } from './services/EngagementTrackingService';
import DevLocationOverride from './components/DevLocationOverride';
import PolicyUpdateBanner from './components/PolicyUpdateBanner';
import PremiumNudgeBanner from './components/PremiumNudgeBanner';
import { UserProvider, UserContext } from './components/contexts/UserContext';
import { ThemeProvider, useTheme } from './components/contexts/ThemeContext';
import { VibeProvider, useVibe } from './components/contexts/VibeContext';
import VibeTransitOverlay from './components/VibeTransitOverlay';
import VibeAmbientPulse from './components/VibeAmbientPulse';
import { LocationSyncService } from './services/LocationSyncService';
import { LocationService, ScanMode } from './services/LocationService';
import { checkPendingCheckinVerification } from './components/CheckinVerificationScheduler';
import { startBackgroundLocationForSixHours, stopBackgroundLocation } from './components/BackgroundLocation';
import { FeatureFlagsProvider } from './components/contexts/FeatureFlagsContext';
import { LocalizationProvider } from './components/contexts/LocalizationContext';
import { I18nextProvider } from 'react-i18next';
import i18n, { initI18n } from './i18n';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { usePresence } from './hooks/usePresence';
import {
  initApiFromStorage,
  getMyUser,
  clearApiCache,
  getUserById,
  getAccessToken,
  logout as apiLogout,
  getPolicyStatus,
  forceCheckIn,
} from './components/ApiRequest';
import { publish, subscribe } from './components/EventBus';
import PremiumService from './services/PremiumService';
import PremiumNudgeService from './services/PremiumNudgeService';
import { mapBackendUser, mapProfileUser } from './utils/mappers';
import { hasSeenOnboarding, hasSeenLocationPrimer, ensureLocationPermissionRequested } from './utils/onboarding';
import {
  shouldPromptBackgroundPermission,
  markBackgroundPermissionPrompted,
  resetBackgroundPermissionPrompt,
} from './utils/backgroundPermissionPrompt';
import { hydrateLocationHeartbeatSuppression } from './utils/devLocationSuppression';
import { shouldShowPremiumExpired, acknowledgePremiumExpired } from './utils/premiumExpiry';
import RootNavigator from './navigation/RootNavigator';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

const navigationRef = createNavigationContainerRef();

// Au cold-start (app fermée, ouverte directement via un deep link ou un tap
// sur une notification), navigationRef.isReady() résout souvent avant que le
// NavigationContainer soit monté : navigate() est alors un no-op silencieux
// et l'app reste sur sa route par défaut au lieu d'ouvrir la bonne cible.
// Utilisé par les effets deep-link et notification-tap ci-dessous (étaient
// deux copies indépendantes de cette même attente).
async function waitForNavigationReady() {
  if (navigationRef.isReady()) return true;
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (navigationRef.isReady()) return true;
  }
  return false;
}

function AppShell({ purchasesReady }) {
  const { user: appUser, updateUser } = useContext(UserContext);
  const { colors, isDark, setMode } = useTheme();
  const { isMoon } = useVibe();
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState('Login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [forceUpdateInfo, setForceUpdateInfo] = useState(null);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const [shopSheetVisible, setShopSheetVisible] = useState(false);
  const [locationModal, setLocationModal] = useState({ visible: false });
  const [churnSurveyVisible, setChurnSurveyVisible] = useState(false);
  const [premiumExpiredVisible, setPremiumExpiredVisible] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasShownLocationModal = useRef(false);
  // Dernier statut de permission localisation connu, pour détecter une révocation
  // (granted -> denied) plutôt qu'un simple "toujours pas accordé" au premier lancement.
  const lastKnownLocationStatus = useRef(null);
  const hasShownChurnSurvey = useRef(false);
  const didInitialScanRef = useRef(false);
  // Toujours à jour pour les closures des effets ci-dessous (deps volontairement
  // courtes) : la permission "Toujours" ne concerne que le mode de check-in auto.
  const checkInModeRef = useRef(appUser?.checkInMode || 'auto');
  checkInModeRef.current = appUser?.checkInMode || 'auto';
  const currentPoiIdRef = useRef(null);

  usePresence(isAuthenticated);

  useEffect(() => {
    currentPoiIdRef.current = appUser?.currentPoiId || null;
  }, [appUser?.currentPoiId]);

  // LocationService est un module hors arbre React (appelé depuis des tâches
  // en arrière-plan) : on lui injecte updateUser pour qu'un check-in/check-out
  // automatique (dwell GPS) mette bien à jour l'utilisateur affiché,
  // au lieu de compter uniquement sur le prochain heartbeat au premier plan.
  useEffect(() => {
    LocationService.setUserUpdater((backendUser) => updateUser(mapBackendUser(backendUser)));
    return () => LocationService.setUserUpdater(null);
  }, [updateUser]);

  // Vérification "Es-tu bien ici ?" en interne à l'app (pas de notification) :
  // ~5 min après le check-in, on ouvre le modal si l'utilisateur est toujours
  // détecté dans le lieu. Une seule proposition par lieu (cf.
  // CheckinVerificationScheduler), donc un poll léger suffit.
  useEffect(() => {
    if (!authReady) return;
    const runCheck = async () => {
      const pending = await checkPendingCheckinVerification();
      if (!pending) return;
      if (String(currentPoiIdRef.current || '') !== String(pending.locationId)) return;
      if (!navigationRef.isReady()) return;
      navigationRef.navigate('Location', { locationId: pending.locationId, openVerifyModal: true });
    };
    runCheck();
    const interval = setInterval(runCheck, 20000);
    return () => clearInterval(interval);
  }, [authReady]);

  useEffect(() => {
    try {
      setMode(isMoon ? 'dark' : 'light');
    } catch (_) {}
  }, [isMoon]);

  useEffect(() => {
    const preload = async () => {
      try {
        await Asset.loadAsync([
          require('./assets/appIcons/backArrow.png'),
          require('./assets/appIcons/settings.png'),
          require('./assets/appIcons/userList.png'),
          require('./assets/appIcons/userProfile.png'),
          require('./assets/socialMediaIcons/fb_logo.png'),
          require('./assets/socialMediaIcons/x_logo.png'),
          require('./assets/socialMediaIcons/linkedin_logo.png'),
          require('./assets/socialMediaIcons/instagram_logo.png'),
          require('./assets/socialMediaIcons/tiktok_logo.png'),
          require('./assets/socialMediaIcons/snapchat_logo.png'),
          require('./assets/socialMediaIcons/yt_logo.png'),
          require('./assets/socialMediaIcons/addSocialNetwork_logo.png'),
        ]);
      } catch (_) {
        // noop
      } finally {
        setAssetsReady(true);
      }
    };
    preload();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      let resolvedRoute = 'Login';
      try {
        // Doit être hydraté avant que les heartbeats GPS (usePresence,
        // BackgroundLocation, LocationService) ne puissent démarrer : sinon
        // une suspension posée juste avant un kill de l'app (check-out
        // manuel) est perdue au redémarrage et le 1er heartbeat annule
        // aussitôt l'état forcé — cf. devLocationSuppression.js.
        await hydrateLocationHeartbeatSuppression();
        const token = await initApiFromStorage();
        if (token) {
          try {
            const res = await getMyUser();
            const me = res?.user;
            if (me && updateUser) updateUser(mapBackendUser(me));
            const consentAccepted = !!me?.consent?.accepted;
            let policyBlocking = false;
            if (consentAccepted) {
              try {
                const status = await getPolicyStatus();
                policyBlocking = !!status?.blocking;
              } catch (_) {
                /* fail-open: don't block the app on a network error */
              }
            }
            if (consentAccepted && !policyBlocking) {
              const seen = await hasSeenOnboarding();
              if (seen) {
                // Cold start with an already-persisted session (no interactive
                // login, so navigateAfterAuth() never runs): prime the location
                // permission here too before routing straight to MainTabs, for
                // the same reason navigateAfterAuth() does it — cf. plan Task 1.
                await ensureLocationPermissionRequested();
              }
              resolvedRoute = seen ? 'MainTabs' : 'Onboarding';
              setTimeout(() => publish('userlist:refresh'), 1000);
            } else {
              resolvedRoute = 'Consent';
            }
            setIsAuthenticated(true);
          } catch (err) {
            if (err?.status === 401) {
              await apiLogout();
              resolvedRoute = 'Login';
            } else {
              const seen = await hasSeenOnboarding();
              if (seen) {
                // Same reasoning as the success-path branch above: no
                // interactive login here either (getMyUser failed non-401,
                // e.g. transient network error), so navigateAfterAuth()
                // never runs. Prime the location permission before routing
                // straight to MainTabs.
                await ensureLocationPermissionRequested();
              }
              resolvedRoute = seen ? 'MainTabs' : 'Onboarding';
            }
          }
        } else {
          resolvedRoute = 'Login';
        }
      } catch (err) {
        resolvedRoute = 'Login';
      } finally {
        // Premier lancement, utilisateur non authentifié : on affiche l'écran
        // d'accroche qui demande l'autorisation de localisation (foreground)
        // avant même le Login.
        if (resolvedRoute === 'Login') {
          try {
            if (!(await hasSeenLocationPrimer())) resolvedRoute = 'LocationPrimer';
          } catch (_) {}
        }
        setInitialRoute(resolvedRoute);
        setAuthReady(true);
      }
    };
    initAuth();
  }, [updateUser]);

  useEffect(() => {
    const offLogin = subscribe('auth:login', () => setIsAuthenticated(true));
    const offLogout = subscribe('auth:logout', () => setIsAuthenticated(false));
    return () => {
      try {
        offLogin && offLogin();
      } catch (_) {}
      try {
        offLogout && offLogout();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const unsub = subscribe('force_update_required', (payload) => {
      setForceUpdateInfo(payload || { message: "Veuillez mettre à jour l'application pour continuer.", details: null });
      try {
        const url = payload?.details?.upgradeUrl || null;
        const msg = payload?.message || "Veuillez mettre à jour l'application pour continuer.";
        const min = payload?.details?.minAppVersion;
        const api = payload?.details?.apiVersion;
        const subtitle = [min ? `Version minimale: ${min}` : null, api ? `Version API: ${api}` : null]
          .filter(Boolean)
          .join('\n');
        Alert.alert(
          'Mise à jour requise',
          subtitle ? `${msg}\n\n${subtitle}` : msg,
          [
            url
              ? {
                  text: 'Mettre à jour',
                  onPress: () => {
                    try {
                      Linking.openURL(url);
                    } catch (_) {}
                  },
                }
              : undefined,
            { text: 'OK', style: 'destructive' },
          ].filter(Boolean),
          { cancelable: false },
        );
      } catch (_) {}
    });
    return () => {
      try {
        unsub && unsub();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const unsub = subscribe('location_rate_limited', (payload) => {
      setRateLimitInfo(payload || {});
    });
    return () => {
      try {
        unsub && unsub();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const off = subscribe('auth:logout', () => {
      try {
        clearApiCache();
      } catch (_) {}
      try {
        stopBackgroundLocation();
      } catch (_) {}
      try {
        LocationService.resetState();
      } catch (_) {}
      navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:open_premium', (payload) => navigationRef.navigate('PremiumPaywall', payload));
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:open_referral', (payload) => navigationRef.navigate('Referral', payload));
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:open_consumables', () => setShopSheetVisible(true));
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    PremiumService.init().catch(() => {});
    PremiumNudgeService.init().catch(() => {});
  }, []);

  // Premium expiré : prévient l utilisateur (une fois par échéance) que son
  // abonnement est repassé en Free. Non bloquant.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !appUser) return;
    let cancelled = false;
    (async () => {
      try {
        if (await shouldShowPremiumExpired(appUser)) {
          if (!cancelled) setPremiumExpiredVisible(true);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, appUser?.isPremium, appUser?.premiumTrialEnd, appUser?.premiumExpiresAt]);

  useEffect(() => {
    // Demande explicite déclenchée par l'utilisateur (activation du mode auto
    // depuis la liste des lieux) : on affiche le primer sans passer par le
    // plafond de fréquence, puisque c'est lui qui vient de le demander.
    const off = subscribe('ui:request_background_permission', async () => {
      try {
        const { status: bg } = await Location.getBackgroundPermissionsAsync();
        if (bg === 'granted') {
          resetBackgroundPermissionPrompt();
          startBackgroundLocationForSixHours();
          return;
        }
        // Toujours afficher le primer AVANT tout dialogue système : l'utilisateur
        // voit d'abord le « pourquoi », et c'est le bouton « Activer » du primer
        // qui déclenche la vraie demande de permission (foreground puis
        // background, cf. LocationPermissionModal). Un refus au dialogue système
        // iOS étant définitif, on ne le provoque jamais sans contexte préalable.
        setLocationModal({ visible: true, type: 'always' });
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const checkLocationPermissions = async () => {
      if (!getAccessToken()) return;
      if (hasShownLocationModal.current) return;

      try {
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();

        reportPermissionStatus({ locationPermissionStatus: fgStatus === 'granted' ? 'granted' : 'denied' });
        if (
          lastKnownLocationStatus.current === 'granted' &&
          fgStatus !== 'granted' &&
          !hasShownChurnSurvey.current
        ) {
          hasShownChurnSurvey.current = true;
          setChurnSurveyVisible(true);
        }
        lastKnownLocationStatus.current = fgStatus;

        if (fgStatus === 'granted') {
          const pos = await getCurrentPositionSmart();
          if (pos?.coords) {
            LocationSyncService.syncNearbyLocations(pos.coords.latitude, pos.coords.longitude);
          }
        }

        if (fgStatus !== 'granted') {
          return;
        }

        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          // La permission "Toujours" ne sert qu'au mode de check-in automatique
          // (entrées/sorties en arrière-plan). Inutile de la réclamer à un
          // utilisateur en mode manuel — et même en mode auto, le rappel est
          // plafonné (cf. backgroundPermissionPrompt) pour ne pas s'afficher à
          // chaque lancement.
          const isAutoMode = checkInModeRef.current !== 'manual';
          if (isAutoMode && (await shouldPromptBackgroundPermission())) {
            setLocationModal({ visible: true, type: 'always' });
            hasShownLocationModal.current = true;
            markBackgroundPermissionPrompted();
          }
        } else {
          resetBackgroundPermissionPrompt();
          setLocationModal((prev) => (prev.visible ? { ...prev, visible: false } : prev));
          // Sans ça, la permission "Toujours" est accordée mais aucune mise à jour
          // de position n'est jamais émise une fois l'écran verrouillé : le
          // heartbeat foreground (usePresence) s'arrête dès que l'app quitte l'état
          // 'active', et rien ne prenait le relai côté OS. Idempotent (cf.
          // startBackgroundLocationForSixHours) : rafraîchit juste la fenêtre de 6h
          // si déjà démarrée.
          startBackgroundLocationForSixHours();
        }
      } catch (err) {
        console.warn('[App] Error checking location permissions:', err);
      }
    };

    if (authReady) checkLocationPermissions();

    const sub = AppState.addEventListener?.('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try {
          publish('userlist:refresh');
        } catch (_) {}
        checkLocationPermissions();
        if (isAuthenticated) {
          try {
            LocationService.performCheckIn(ScanMode.BACKGROUND_STAY);
          } catch (_) {}
        }
      }
      appState.current = next;
    });
    return () => {
      try {
        sub?.remove?.();
      } catch (_) {}
    };
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (didInitialScanRef.current) return;
    didInitialScanRef.current = true;
    try {
      LocationService.performCheckIn(ScanMode.INITIAL_SCAN);
    } catch (_) {}
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      try {
        LocationService.cancelBackgroundStay();
      } catch (_) {}
    };
  }, []);


  // Deep link handling: loocateme://profile/:userId et loocateme://invite/:code
  useEffect(() => {
    const extractProfileId = (url) => {
      if (!url) return null;
      const match = String(url).match(/profile\/([^?#]+)/i);
      if (!match || !match[1]) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch (_) {
        return match[1];
      }
    };

    const extractInviteCode = (url) => {
      if (!url) return null;
      const match = String(url).match(/invite\/([^?#]+)/i);
      if (!match || !match[1]) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch (_) {
        return match[1];
      }
    };

    // QR code imprimé par un lieu partenaire (cf. checkin-qr côté backend) :
    // scanner ce lien prouve physiquement la présence, donc on check-in direct
    // sans passer par l'écran de sélection manuelle du lieu.
    const extractVenueId = (url) => {
      if (!url) return null;
      const match = String(url).match(/venue\/([^?#]+)/i);
      if (!match || !match[1]) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch (_) {
        return match[1];
      }
    };

    const handleUrl = async (url) => {
      const inviteCode = extractInviteCode(url);
      if (inviteCode) {
        if (!getAccessToken()) {
          // Pas encore connecté : on garde le code pour pré-remplissage à l'onboarding,
          // plutôt que de perdre le lien si l'utilisateur doit d'abord créer un compte.
          try {
            await AsyncStorage.setItem('@loocateme:pending_referral_code', inviteCode);
          } catch (_) {}
        } else if (await waitForNavigationReady()) {
          // Déjà connecté : pas de redeem automatique et silencieux (un utilisateur
          // existant qui rouvre un vieux lien d'ami ne doit pas être re-parrainé sans
          // confirmation), on navigue vers l'écran de parrainage avec le code prérempli.
          navigationRef.navigate('Referral', { prefillCode: inviteCode });
        }
        return;
      }

      const venueId = extractVenueId(url);
      if (venueId) {
        if (!getAccessToken()) return; // scan avant connexion : on ignore, pas de flow de rattrapage pour l'instant
        if (!(await waitForNavigationReady())) return;
        try {
          // bypassDistance: le scan du QR sur place prouve déjà la présence physique,
          // pas besoin d'attendre une confirmation GPS dans le rayon du lieu.
          let lat = 0, lon = 0;
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeout: 8000 });
            lat = pos?.coords?.latitude ?? 0;
            lon = pos?.coords?.longitude ?? 0;
          } catch (_) {
            // Pas de fix GPS dispo : on check-in quand même (bypassDistance), le
            // heartbeat suivant recalera les coordonnées réelles.
          }
          const res = await forceCheckIn({ locationId: venueId, lat, lon, bypassDistance: true });
          if (res?.user && updateUser) updateUser(mapBackendUser(res.user));
        } catch (e) {
          console.warn('[App] venue QR check-in failed', e?.message || e);
        }
        navigationRef.navigate('Location', { locationId: venueId });
        return;
      }

      const id = extractProfileId(url);
      if (!id || !getAccessToken()) return;
      if (!(await waitForNavigationReady())) return;
      try {
        const res = await getUserById(id);
        const u = res?.user;
        if (u) navigationRef.navigate('UserProfile', { user: mapProfileUser(u) });
      } catch (_) {}
    };

    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (initial) handleUrl(initial);
      } catch (_) {}
    })();

    const sub = Linking.addEventListener?.('url', ({ url }) => handleUrl(url));
    return () => {
      try {
        sub?.remove?.();
      } catch (_) {}
    };
  }, []);

  // Notification tap handling: navigate to the relevant screen based on the
  // `data` payload attached server-side (see push.service.js). Dynamic import
  // mirrors components/notifications.js / DebugScreen.js, since expo-notifications
  // isn't fully supported in Expo Go.
  useEffect(() => {
    let sub;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');

        const handleResponse = async (response) => {
          const data = response?.notification?.request?.content?.data;
          if (!data) return;
          if (!(await waitForNavigationReady())) return;
          if (data.kind === 'ultra_boost' && data.locationId) {
            navigationRef.navigate('Location', { locationId: data.locationId });
          } else if (data.kind === 'event_boost' && data.locationId) {
            navigationRef.navigate('Location', { locationId: data.locationId, scrollToEventId: data.eventId });
          } else if (data.kind === 'superlike') {
            navigationRef.navigate('MainTabs');
            publish('ui:open_superlike_history', { tab: 'received' });
          } else if (data.kind === 'superlike_accepted') {
            navigationRef.navigate('MainTabs');
            publish('ui:open_superlike_history', { tab: 'sent' });
          } else if (data.kind === 'streak_expiring') {
            navigationRef.navigate('MainTabs');
          } else if (data.kind === 'streak_lost') {
            navigationRef.navigate('MainTabs');
          } else if (data.kind === 'referral_validated' || data.kind === 'referral_reward_granted') {
            navigationRef.navigate('Referral');
          } else if (data.kind === 'profile_view' || data.kind === 'inactive_profile_views' || data.kind === 'weekly_digest') {
            navigationRef.navigate('Statistics');
          } else if (data.kind === 'at_risk_reactivation') {
            navigationRef.navigate('Settings');
          } else if (data.kind === 'night_mode_activated') {
            navigationRef.navigate('MainTabs');
          }
        };

        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) handleResponse(last);

        sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
      } catch (e) {
        console.warn('[App] notification listener setup failed', e?.message || e);
      }
    })();
    return () => {
      try {
        sub?.remove?.();
      } catch (_) {}
    };
  }, []);

  const isLoading = !assetsReady || !authReady;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer ref={navigationRef}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
        {forceUpdateInfo ? (
          <SafeAreaView
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              backgroundColor: colors.background,
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.onBackground || '#111', marginBottom: 12 }}>
              Mise à jour requise
            </Text>
            <Text style={{ fontSize: 16, color: colors.onBackground || '#111', textAlign: 'center' }}>
              {forceUpdateInfo?.message || "Veuillez mettre à jour l'application pour continuer."}
            </Text>
            {forceUpdateInfo?.details?.minAppVersion ? (
              <Text style={{ marginTop: 8, fontSize: 14, color: colors.onBackground || '#111' }}>
                Version minimale: {forceUpdateInfo.details.minAppVersion}
              </Text>
            ) : null}
            <View style={{ height: 24 }} />
            {forceUpdateInfo?.details?.upgradeUrl ? (
              <TouchableOpacity
                onPress={() => {
                  try {
                    Linking.openURL(forceUpdateInfo.details.upgradeUrl);
                  } catch (_) {}
                }}
                style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
              >
                <Text style={{ color: colors.onPrimary || '#fff', fontWeight: '600' }}>Mettre à jour</Text>
              </TouchableOpacity>
            ) : null}
          </SafeAreaView>
        ) : authReady ? (
          <RootNavigator initialRouteName={initialRoute} />
        ) : null}
        <VibeTransitOverlay />
        <VibeAmbientPulse />
      </NavigationContainer>

      <PolicyUpdateBanner />
      <PremiumNudgeBanner />

      <ConsumablesShopSheet
        visible={shopSheetVisible}
        onClose={() => setShopSheetVisible(false)}
        userId={appUser?._id || appUser?.id}
      />
      <LocationPermissionModal
        visible={locationModal.visible}
        onClose={() => setLocationModal((prev) => ({ ...prev, visible: false }))}
      />
      <ChurnSurveyModal
        visible={churnSurveyVisible}
        context="location_permission_revoked"
        onClose={() => setChurnSurveyVisible(false)}
      />
      <PremiumExpiredModal
        visible={premiumExpiredVisible}
        onClose={() => {
          acknowledgePremiumExpired(appUser);
          setPremiumExpiredVisible(false);
        }}
        onSeePremium={() => {
          acknowledgePremiumExpired(appUser);
          setPremiumExpiredVisible(false);
          publish('ui:open_premium', { source: 'expired_modal' });
        }}
      />
      <RateLimitModal
        visible={!!rateLimitInfo}
        retryAfterSeconds={rateLimitInfo?.retryAfterSeconds}
        onClose={() => setRateLimitInfo(null)}
      />

      {isLoading && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
          ]}
        >
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      )}

      <DevLocationOverride />
    </View>
  );
}

function AppRoot() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  // Si le lancement précédent s'est terminé par une exception fatale (cf.
  // errorReporting.js / GlobalErrorBoundary), on l'affiche dans la console
  // pour pouvoir enfin lire la vraie cause du crash (Xcode Console / logs
  // TestFlight) au lieu du crash log Apple non symbolisé, sans message.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@loocateme:last_fatal_error');
        if (raw) {
          console.warn('[LoocateMe] Dernière exception fatale enregistrée:', raw);
          await AsyncStorage.removeItem('@loocateme:last_fatal_error');
        }
      } catch (_) {}
    })();
  }, []);

  if (!i18nReady) {
    // Le texte n'a pas de sens tant que la langue n'est pas résolue depuis
    // la langue système ; on affiche un écran neutre le temps de l'init
    // (quasi-instantané, resources déjà bundlées).
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#00c2cb" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <ThemeProvider>
            <VibeProvider>
              <LocalizationProvider>
                <AppWithReadyStatus />
              </LocalizationProvider>
            </VibeProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <AppRoot />
    </GlobalErrorBoundary>
  );
}

function AppWithReadyStatus() {
  const [purchasesReady, setPurchasesReady] = useState(false);

  useEffect(() => {
    const initPurchases = async () => {
      try {
        const apiKey = Platform.select({
          ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
          android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
        });
        // Expo Go n'embarque pas le module natif RevenueCat : seule sa "Test
        // Store API Key" (mode Browser) y fonctionne. Un vrai build (dev
        // client, preview, production) doit toujours utiliser la vraie clé,
        // même en __DEV__ — sinon les achats en dev-client pointent vers un
        // projet RevenueCat de test sans rapport avec le vrai catalogue.
        const finalApiKey = IS_EXPO_GO ? 'test_AWcyeDQohMZcHtZhsByPolhUmrg' : apiKey;
        await Purchases.configure({ apiKey: finalApiKey });
        setPurchasesReady(true);
      } catch (e) {
        console.error('[App] RevenueCat initialization failed', e);
        setPurchasesReady(true);
      }
    };
    initPurchases();
  }, []);

  return (
    <FeatureFlagsProvider ready={purchasesReady}>
      <UserProvider>
        <AppShell purchasesReady={purchasesReady} />
      </UserProvider>
    </FeatureFlagsProvider>
  );
}
