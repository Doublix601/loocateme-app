import 'react-native-gesture-handler';
import { useState, useEffect, useRef, useContext } from 'react';
import {
  ActivityIndicator, Alert, AppState, Linking, Platform,
  StatusBar, View, Text, TouchableOpacity, StyleSheet, LogBox,
} from 'react-native';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

import * as Location from 'expo-location';
import { getCurrentPositionSmart } from './utils/locationHelper';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import Purchases from 'react-native-purchases';

import ConsumablesShopSheet from './components/ConsumablesShopSheet';
import LocationPermissionModal from './components/LocationPermissionModal';
import DevLocationOverride from './components/DevLocationOverride';
import PolicyUpdateBanner from './components/PolicyUpdateBanner';
import PremiumNudgeBanner from './components/PremiumNudgeBanner';
import { UserProvider, UserContext } from './components/contexts/UserContext';
import { ThemeProvider, useTheme } from './components/contexts/ThemeContext';
import { VibeProvider, useVibe } from './components/contexts/VibeContext';
import VibeTransitOverlay from './components/VibeTransitOverlay';
import { LocationSyncService } from './services/LocationSyncService';
import { LocationService, ScanMode } from './services/LocationService';
import { FeatureFlagsProvider } from './components/contexts/FeatureFlagsContext';
import { LocalizationProvider } from './components/contexts/LocalizationContext';
import { usePresence } from './hooks/usePresence';
import {
  initApiFromStorage, getMyUser, clearApiCache, getUserById,
  getAccessToken, logout as apiLogout, getPolicyStatus,
} from './components/ApiRequest';
import { publish, subscribe } from './components/EventBus';
import PremiumService from './services/PremiumService';
import PremiumNudgeService from './services/PremiumNudgeService';
import { mapBackendUser, mapProfileUser } from './utils/mappers';
import { hasSeenOnboarding } from './utils/onboarding';
import RootNavigator from './navigation/RootNavigator';

const navigationRef = createNavigationContainerRef();

function AppShell({ purchasesReady }) {
  const { user: appUser, updateUser } = useContext(UserContext);
  const { colors, isDark, setMode } = useTheme();
  const { isMoon } = useVibe();
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [forceUpdateInfo, setForceUpdateInfo] = useState(null);
  const [shopSheetVisible, setShopSheetVisible] = useState(false);
  const [locationModal, setLocationModal] = useState({ visible: false, type: 'required' });
  const appState = useRef(AppState.currentState);
  const hasShownLocationModal = useRef(false);
  const didInitialScanRef = useRef(false);

  usePresence(authReady);

  useEffect(() => {
    try { setMode(isMoon ? 'dark' : 'light'); } catch (_) {}
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
      try {
        const token = await initApiFromStorage();
        if (token) {
          try {
            const res = await getMyUser();
            const me = res?.user;
            if (me && updateUser) updateUser(mapBackendUser(me));
            const consentAccepted = !!(me?.consent?.accepted);
            let policyBlocking = false;
            if (consentAccepted) {
              try {
                const status = await getPolicyStatus();
                policyBlocking = !!status?.blocking;
              } catch (_) { /* fail-open: don't block the app on a network error */ }
            }
            if (consentAccepted && !policyBlocking) {
              const seen = await hasSeenOnboarding();
              navigationRef.reset({ index: 0, routes: [{ name: seen ? 'MainTabs' : 'Onboarding' }] });
              setTimeout(() => publish('userlist:refresh'), 1000);
            } else {
              navigationRef.reset({ index: 0, routes: [{ name: 'Consent' }] });
            }
          } catch (err) {
            if (err?.status === 401) {
              await apiLogout();
              navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
            } else {
              const seen = await hasSeenOnboarding();
              navigationRef.reset({ index: 0, routes: [{ name: seen ? 'MainTabs' : 'Onboarding' }] });
            }
          }
        } else {
          navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      } catch (err) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      } finally {
        setAuthReady(true);
      }
    };
    initAuth();
  }, [updateUser]);

  useEffect(() => {
    const unsub = subscribe('force_update_required', (payload) => {
      setForceUpdateInfo(payload || { message: "Veuillez mettre à jour l'application pour continuer.", details: null });
      try {
        const url = payload?.details?.upgradeUrl || null;
        const msg = payload?.message || "Veuillez mettre à jour l'application pour continuer.";
        const min = payload?.details?.minAppVersion;
        const api = payload?.details?.apiVersion;
        const subtitle = [min ? `Version minimale: ${min}` : null, api ? `Version API: ${api}` : null].filter(Boolean).join('\n');
        Alert.alert(
          'Mise à jour requise',
          subtitle ? `${msg}\n\n${subtitle}` : msg,
          [
            url ? { text: 'Mettre à jour', onPress: () => { try { Linking.openURL(url); } catch (_) {} } } : undefined,
            { text: 'OK', style: 'destructive' },
          ].filter(Boolean),
          { cancelable: false }
        );
      } catch (_) {}
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  useEffect(() => {
    const off = subscribe('auth:logout', () => {
      try { clearApiCache(); } catch (_) {}
      navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
    return () => { try { off && off(); } catch (_) {} };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:open_premium', (payload) => navigationRef.navigate('PremiumPaywall', payload));
    return () => { try { off && off(); } catch (_) {} };
  }, []);

  useEffect(() => {
    const off = subscribe('ui:open_consumables', () => setShopSheetVisible(true));
    return () => { try { off && off(); } catch (_) {} };
  }, []);

  useEffect(() => {
    PremiumService.init().catch(() => {});
    PremiumNudgeService.init().catch(() => {});
  }, []);

  useEffect(() => {
    const checkLocationPermissions = async () => {
      if (!getAccessToken()) return;
      if (hasShownLocationModal.current) return;

      try {
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();

        if (fgStatus === 'granted') {
          const pos = await getCurrentPositionSmart();
          if (pos?.coords) {
            LocationSyncService.syncNearbyLocations(pos.coords.latitude, pos.coords.longitude);
          }
        }

        if (fgStatus !== 'granted') {
          setLocationModal({ visible: true, type: 'required' });
          hasShownLocationModal.current = true;
          return;
        }

        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          setLocationModal({ visible: true, type: 'always' });
          hasShownLocationModal.current = true;
        } else {
          setLocationModal(prev => prev.visible ? { ...prev, visible: false } : prev);
        }
      } catch (err) {
        console.warn('[App] Error checking location permissions:', err);
      }
    };

    if (authReady) checkLocationPermissions();

    const sub = AppState.addEventListener?.('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try { publish('userlist:refresh'); } catch (_) {}
        checkLocationPermissions();
        try { LocationService.performCheckIn(ScanMode.BACKGROUND_STAY); } catch (_) {}
      }
      appState.current = next;
    });
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (didInitialScanRef.current) return;
    didInitialScanRef.current = true;
    try { LocationService.performCheckIn(ScanMode.INITIAL_SCAN); } catch (_) {}
  }, [authReady]);

  useEffect(() => {
    return () => {
      try { LocationService.cancelBackgroundStay(); } catch (_) {}
    };
  }, []);

  // Deep link handling: loocateme://profile/:userId
  useEffect(() => {
    const extractProfileId = (url) => {
      if (!url) return null;
      const match = String(url).match(/profile\/([^?#]+)/i);
      if (!match || !match[1]) return null;
      try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
    };

    const handleUrl = async (url) => {
      const id = extractProfileId(url);
      if (!id || !getAccessToken()) return;
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
    return () => { try { sub?.remove?.(); } catch (_) {} };
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

        const handleResponse = (response) => {
          const data = response?.notification?.request?.content?.data;
          if (!data || !navigationRef.isReady()) return;
          if (data.kind === 'ultra_boost' && data.locationId) {
            navigationRef.navigate('Location', { locationId: data.locationId });
          } else if (data.kind === 'event_boost' && data.locationId) {
            navigationRef.navigate('Location', { locationId: data.locationId, scrollToEventId: data.eventId });
          } else if (data.kind === 'superlike') {
            navigationRef.navigate('MainTabs');
            publish('ui:open_superlike_history');
          } else if (data.kind === 'cote_expiring') {
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
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, []);

  const isLoading = !assetsReady || !authReady;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer ref={navigationRef}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
        {forceUpdateInfo ? (
          <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.onBackground || '#111', marginBottom: 12 }}>Mise à jour requise</Text>
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
                onPress={() => { try { Linking.openURL(forceUpdateInfo.details.upgradeUrl); } catch (_) {} }}
                style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
              >
                <Text style={{ color: colors.onPrimary || '#fff', fontWeight: '600' }}>Mettre à jour</Text>
              </TouchableOpacity>
            ) : null}
          </SafeAreaView>
        ) : (
          <RootNavigator />
        )}
        <VibeTransitOverlay />
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
        type={locationModal.type}
        onClose={() => setLocationModal(prev => ({ ...prev, visible: false }))}
      />

      {isLoading && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color="#00c2cb" />
        </View>
      )}

      <DevLocationOverride />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <VibeProvider>
          <LocalizationProvider>
            <AppWithReadyStatus />
          </LocalizationProvider>
        </VibeProvider>
      </ThemeProvider>
    </SafeAreaProvider>
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
        const finalApiKey = __DEV__ ? 'test_AWcyeDQohMZcHtZhsByPolhUmrg' : apiKey;
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
