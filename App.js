import { useState, useEffect, useRef, useContext } from 'react';
import { ActivityIndicator, Animated, Easing, Dimensions, Alert, AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import LoginScreen from './views/LoginScreen';
import ForgotPasswordScreen from './views/ForgotPasswordScreen';
import SignupScreen from './views/SignupScreen';
import MyAccountScreen from './views/MyAccountScreen';
import LocationListScreen from './views/LocationListScreen';
import LocationScreen from './views/LocationScreen';
import UserProfileScreen from './views/UserProfileScreen';
import SettingsScreen from './views/SettingsScreen';
import SearchView from './views/SearchView';
import ConsentScreen from './views/ConsentScreen';
import DebugScreen from './views/DebugScreen';
import StatisticsScreen from './views/StatisticsScreen';
import PremiumPaywallScreen from './views/PremiumPaywallScreen';
import ModeratorScreen from './views/ModeratorScreen';
import WarningsScreen from './views/WarningsScreen';
import Purchases from 'react-native-purchases';
import LocationPermissionModal from './components/LocationPermissionModal';
// Chat screens supprimés (fonctionnalité de chat désactivée)
import { UserProvider, UserContext } from './components/contexts/UserContext';
import { ThemeProvider, useTheme } from './components/contexts/ThemeContext';
import { LocationSyncService } from './services/LocationSyncService';
import { FeatureFlagsProvider } from './components/contexts/FeatureFlagsContext';
import { LocalizationProvider } from './components/contexts/LocalizationContext';
import { usePresence } from './hooks/usePresence';
import { initApiFromStorage, getMyUser, clearApiCache, getUserById, getAccessToken, logout as apiLogout } from './components/ApiRequest';
import { publish, subscribe } from './components/EventBus';

const mapBackendUser = (u = {}) => {
  const socialMedias = Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : (Array.isArray(u.socialMedias) ? u.socialMedias : (Array.isArray(u.socialMedia) ? u.socialMedia : []));
  return {
    ...u,
    _id: u._id || u.id,
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || u.photo || null,
    socialMedias,
    socialMedia: socialMedias,
    isPremium: !!u.isPremium,
    role: u.role || 'user',
    status: u.status || 'green',
    consent: u.consent || { accepted: false, version: '', consentAt: null },
    privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
    moderation: u.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', lastWarningType: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
    updatedAt: u.updatedAt,
  };
};

const mapProfileUser = (u = {}) => {
  const socialMedias = Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : (Array.isArray(u.socialMedias) ? u.socialMedias : (Array.isArray(u.socialMedia) ? u.socialMedia : []));
  return {
    ...u,
    _id: u._id || u.id,
    username: u.username || u.name || '',
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    customName: u.customName || '',
    bio: u.bio || '',
    photo: u.profileImageUrl || u.photo || null,
    status: u.status || 'green',
    socialMedias,
    socialMedia: socialMedias,
    locationCoordinates: Array.isArray(u.location?.coordinates)
      ? u.location.coordinates
      : (Array.isArray(u.locationCoordinates) ? u.locationCoordinates : undefined),
    updatedAt: u.updatedAt,
  };
};

function AppInner() {
  const [currentScreen, setCurrentScreen] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [selectedLocationTertiles, setSelectedLocationTertiles] = useState(null);
  const [profileReturnTo, setProfileReturnTo] = useState('LocationList');
  const [locationListScrollOffset, setLocationListScrollOffset] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState(null);
  const [locationModal, setLocationModal] = useState({ visible: false, type: 'required' });
  const hasShownLocationModal = useRef(false);
  // Chat désactivé
  const appState = useRef(AppState.currentState);
  const { colors } = useTheme();
  const { user: appUser, updateUser } = useContext(UserContext);

  usePresence(!!appUser);

  const transitionX = useRef(new Animated.Value(0)).current;
  const { width } = Dimensions.get('window');
  const prevScreenRef = useRef('Login');

  const socialMediaIcons = {
    facebook: require('./assets/socialMediaIcons/fb_logo.png'),
    x: require('./assets/socialMediaIcons/x_logo.png'),
    linkedin: require('./assets/socialMediaIcons/linkedin_logo.png'),
    instagram: require('./assets/socialMediaIcons/instagram_logo.png'),
    tiktok: require('./assets/socialMediaIcons/tiktok_logo.png'),
    snapchat: require('./assets/socialMediaIcons/snapchat_logo.png'),
    youtube: require('./assets/socialMediaIcons/yt_logo.png'),
  };

  useEffect(() => {
    const initPurchases = async () => {
      try {
        if (Platform.OS === 'ios') {
          await Purchases.configure({ apiKey: 'goog_EXAMPLE_REVENUECAT_API_KEY' }); // TO BE UPDATED WITH REAL KEY
        } else {
          await Purchases.configure({ apiKey: 'goog_EXAMPLE_REVENUECAT_API_KEY' }); // TO BE UPDATED WITH REAL KEY
        }
        console.log('[App] RevenueCat initialized');
      } catch (e) {
        console.error('[App] RevenueCat initialization failed', e);
      }
    };
    initPurchases();
  }, []);

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
            if (me && updateUser) {
              updateUser(mapBackendUser(me));
            }
            const consentAccepted = !!(me?.consent?.accepted);
            setCurrentScreen(consentAccepted ? 'LocationList' : 'Consent');
            if (consentAccepted) {
              setTimeout(() => publish('userlist:refresh'), 1000);
            }
          } catch (err) {
            console.error('[App] Auth init getMyUser error:', err);
            // If it's a 401, logout, otherwise maybe network error, retry or let current screen be Login
            if (err?.status === 401) {
              await apiLogout();
              setCurrentScreen('Login');
            } else {
              // Network error? Try to proceed to UserList if we have user info, or just stay on Login
              setCurrentScreen('LocationList');
            }
          }
        } else {
          setCurrentScreen('Login');
        }
      } catch (err) {
        console.error('[App] Auth init error:', err);
        setCurrentScreen('Login');
      } finally {
        setAuthReady(true);
      }
    };
    initAuth();
  }, [updateUser]);

  useEffect(() => {
    const checkLocationPermissions = async (force = false) => {
      // Don't check if user is not logged in or is on Consent/Login/Signup screens
      if (!getAccessToken() || ['Login', 'Signup', 'ForgotPassword', 'Consent', 'Activity'].includes(currentScreen)) {
        return;
      }

      // If we've already shown the modal this session, skip unless forced
      if (hasShownLocationModal.current && !force) {
        return;
      }

      try {
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();

        if (fgStatus === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (pos?.coords) {
            LocationSyncService.syncNearbyLocations(pos.coords.latitude, pos.coords.longitude);
          }
        }

        if (fgStatus !== 'granted') {
          setLocationModal({ visible: true, type: 'required' });
          hasShownLocationModal.current = true;
          return;
        }

        // If foreground is granted, check background
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          setLocationModal({ visible: true, type: 'always' });
          hasShownLocationModal.current = true;
        } else {
          // Both granted, hide modal if it was visible
          setLocationModal(prev => prev.visible ? { ...prev, visible: false } : prev);
        }
      } catch (err) {
        console.warn('[App] Error checking location permissions:', err);
      }
    };

    checkLocationPermissions();

    const sub = AppState.addEventListener?.('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try { publish('userlist:refresh'); } catch (_) {}
        // Re-check permissions when coming back to app
        checkLocationPermissions();
      }
      appState.current = next;
    });
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, [currentScreen]);

  useEffect(() => {
    const off = subscribe('auth:logout', () => {
      try { clearApiCache(); } catch (_) {}
      setCurrentScreen('Login');
    });
    return () => { try { off && off(); } catch (_) {} };
  }, []);

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

    const handleUrl = (url) => {
      const id = extractProfileId(url);
      if (id) setPendingProfileId(id);
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

  useEffect(() => {
    const openProfileFromLink = async () => {
      if (!pendingProfileId || !authReady) return;
      if (!getAccessToken()) return;
      try {
        const res = await getUserById(pendingProfileId);
        const u = res?.user;
        if (!u) return;
        setSelectedUser(mapProfileUser(u));
        setProfileReturnTo('LocationList');
        setCurrentScreen('UserProfile');
        setPendingProfileId(null);
      } catch (e) {
        if (e?.status === 401) return;
        setPendingProfileId(null);
      }
    };
    openProfileFromLink();
  }, [pendingProfileId, authReady, appUser]);

  const handleLogin = (user) => {
    const consentAccepted = !!(user?.consent?.accepted);
    setCurrentScreen(consentAccepted ? 'LocationList' : 'Consent');
    if (consentAccepted) {
      setTimeout(() => publish('userlist:refresh'), 1000);
    }
  };
  const handleForgotPassword = () => setCurrentScreen('ForgotPassword');
  const handleSignup = () => setCurrentScreen('Signup');
  const handleSignupSuccess = () => {
    try {
      Alert.alert('Vérifiez vos emails', "Un email de vérification vient de vous être envoyé. Cliquez sur le lien pour confirmer votre adresse, puis connectez-vous.");
    } catch {}
    setCurrentScreen('Login');
  };
  const handleGoToLogin = () => setCurrentScreen('Login');
  const handleReturnToList = (offset = null) => {
    if (offset !== null) setLocationListScrollOffset(offset);
    setCurrentScreen('LocationList');
  };
  const handleReturnToAccount = () => setCurrentScreen('MyAccount');
  const onReturnToSettings = () => setCurrentScreen('Settings');
  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (_) {
      // ignore
    } finally {
      setCurrentScreen('Login');
    }
  };

  const handleSelectUser = (user, returnTo = 'Location') => {
    const userId = user._id || user.id;
    const myId = appUser?._id;
    if (userId && myId && String(userId) === String(myId)) {
      setCurrentScreen('MyAccount');
      return;
    }
    setSelectedUser(mapProfileUser(user));
    setProfileReturnTo(returnTo);
    setCurrentScreen('UserProfile');
  };

  const handleSelectLocation = (loc) => {
    setSelectedLocationId(loc._id || loc.id);
    setSelectedLocationTertiles(loc.tertiles || null);
    setCurrentScreen('Location');
  };

  useEffect(() => {
    const prev = prevScreenRef.current;

    const isForward =
      (prev === 'LocationList' && (currentScreen === 'UserProfile' || currentScreen === 'MyAccount' || currentScreen === 'Location')) ||
      (prev === 'Location' && currentScreen === 'UserProfile') ||
      (prev === 'MyAccount' && (currentScreen === 'Settings' || currentScreen === 'Warnings'));

    const isBack =
      (currentScreen === 'LocationList' && (prev === 'UserProfile' || prev === 'MyAccount' || prev === 'Location')) ||
      (currentScreen === 'Location' && prev === 'UserProfile') ||
      (currentScreen === 'MyAccount' && (prev === 'Settings' || prev === 'Warnings'));

    if (isForward || isBack) {
      const from = isForward ? width : -width;
      transitionX.setValue(from);
      Animated.timing(transitionX, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      transitionX.setValue(0);
    }

    prevScreenRef.current = currentScreen;
  }, [currentScreen, transitionX, width]);

  if (!assetsReady || !authReady || !currentScreen) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00c2cb" />
      </SafeAreaView>
    );
  }

  // Chat désactivé: aucune navigation de chat

  let screenToShow;
  switch (currentScreen) {
    case 'Login':
      screenToShow = (
        <LoginScreen
          onLogin={handleLogin}
          onForgotPassword={handleForgotPassword}
          onSignup={handleSignup}
        />
      );
      break;
    case 'Signup':
      screenToShow = (
        <SignupScreen onSignup={handleSignupSuccess} onLogin={handleGoToLogin} />
      );
      break;
    case 'ForgotPassword':
      screenToShow = <ForgotPasswordScreen onResetPassword={() => setCurrentScreen('Login')} onBack={() => setCurrentScreen('Login')} />;
      break;
    case 'MyAccount':
      screenToShow = (
        <MyAccountScreen
          user={appUser}
          onReturnToList={handleReturnToList}
          socialMediaIcons={socialMediaIcons}
          onReturnToSettings={onReturnToSettings}
          onOpenStatistics={() => setCurrentScreen('Statistics')}
          onOpenPremiumPaywall={() => setCurrentScreen('PremiumPaywall')}
          onOpenWarnings={() => setCurrentScreen('Warnings')}
          onOpenMessages={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
        />
      );
      break;
    case 'LocationList':
      screenToShow = (
        <LocationListScreen
          onSelectLocation={handleSelectLocation}
          onReturnToAccount={handleReturnToAccount}
          onSearchPeople={() => setCurrentScreen('UserSearch')}
          initialScrollOffset={locationListScrollOffset}
          onScroll={(offset) => setLocationListScrollOffset(offset)}
        />
      );
      break;
    case 'Location':
      screenToShow = (
        <LocationScreen
          locationId={selectedLocationId}
          tertiles={selectedLocationTertiles}
          onReturnToList={handleReturnToList}
          onSelectUser={handleSelectUser}
          socialMediaIcons={socialMediaIcons}
        />
      );
      break;
    case 'UserSearch':
      screenToShow = (
        <SearchView
          onClose={() => setCurrentScreen('LocationList')}
          onSelectUser={(u) => handleSelectUser(u, 'LocationList')}
          onSelectLocation={handleSelectLocation}
          userLocation={appUser?.location?.coordinates ? { latitude: appUser.location.coordinates[1], longitude: appUser.location.coordinates[0] } : null}
        />
      );
      break;
    case 'UserProfile':
      screenToShow = (
        <UserProfileScreen
          user={selectedUser}
          onReturnToList={() => {
            if (profileReturnTo === 'Statistics') setCurrentScreen('Statistics');
            else if (profileReturnTo === 'Moderator') setCurrentScreen('Moderator');
            else if (profileReturnTo === 'Location') setCurrentScreen('Location');
            else handleReturnToList();
          }}
          onReturnToAccount={handleReturnToAccount}
          socialMediaIcons={socialMediaIcons}
          onOpenMessages={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
          onOpenConversation={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
          onOpenPremium={() => setCurrentScreen('PremiumPaywall')}
        />
      );
      break;
    case 'Warnings':
      screenToShow = (
        <WarningsScreen
          onBack={() => setCurrentScreen('MyAccount')}
        />
      );
      break;
    case 'Debug':
      screenToShow = (
        <DebugScreen
          onBack={() => setCurrentScreen('Settings')}
        />
      );
      break;
    case 'Statistics':
      screenToShow = (
        <StatisticsScreen
          onBack={() => setCurrentScreen('MyAccount')}
          onOpenUserProfile={(u) => handleSelectUser(u, 'Statistics')}
        />
      );
      break;
    case 'PremiumPaywall':
      screenToShow = (
        <PremiumPaywallScreen
          onBack={() => setCurrentScreen('MyAccount')}
          onAlreadyPremium={() => setCurrentScreen('Statistics')}
        />
      );
      break;
    case 'Settings':
      screenToShow = (
        <SettingsScreen
          onReturnToAccount={handleReturnToAccount}
          onLogout={handleLogout}
          onOpenDebug={() => setCurrentScreen('Debug')}
          onOpenModerator={() => setCurrentScreen('Moderator')}
        />
      );
      break;
    // Chat désactivé: aucun écran de chat
    case 'Moderator':
      screenToShow = (
        <ModeratorScreen
          onBack={() => setCurrentScreen('Settings')}
          onOpenUserProfile={(u) => handleSelectUser(u, 'Moderator')}
        />
      );
      break;
    case 'Consent':
      screenToShow = (
        <ConsentScreen
          onAccepted={() => setCurrentScreen('LocationList')}
          onDeclined={() => setCurrentScreen('Login')}
        />
      );
      break;
    default:
      screenToShow = (
        <LoginScreen
          onLogin={handleLogin}
          onForgotPassword={handleForgotPassword}
          onSignup={handleSignup}
        />
      );
      break;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: transitionX }], backgroundColor: colors.bg }}>
        {screenToShow}
      </Animated.View>
      <LocationPermissionModal
        visible={locationModal.visible}
        type={locationModal.type}
        onClose={() => setLocationModal(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LocalizationProvider>
        <FeatureFlagsProvider>
          <UserProvider>
            <AppInner />
          </UserProvider>
        </FeatureFlagsProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
