import { useState, useEffect, useRef, useContext } from 'react';
import { ActivityIndicator, Animated, Easing, Dimensions, Alert, AppState, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import LoginScreen from './views/LoginScreen';
import ForgotPasswordScreen from './views/ForgotPasswordScreen';
import SignupScreen from './views/SignupScreen';
import MyAccountScreen from './views/MyAccountScreen';
import UserListScreen from './views/UserListScreen';
import UserProfileScreen from './views/UserProfileScreen';
import SettingsScreen from './views/SettingsScreen';
import UserSearchView from './views/UserSearchView';
import ConsentScreen from './views/ConsentScreen';
import DebugScreen from './views/DebugScreen';
import StatisticsScreen from './views/StatisticsScreen';
import PremiumPaywallScreen from './views/PremiumPaywallScreen';
import ModeratorScreen from './views/ModeratorScreen';
import WarningsScreen from './views/WarningsScreen';
// Chat screens supprimés (fonctionnalité de chat désactivée)
import { UserProvider, UserContext } from './components/contexts/UserContext';
import { ThemeProvider, useTheme } from './components/contexts/ThemeContext';
import { FeatureFlagsProvider } from './components/contexts/FeatureFlagsContext';
import { LocalizationProvider } from './components/contexts/LocalizationContext';
import { initApiFromStorage, getMyUser, clearApiCache, getUserById, getAccessToken, logout as apiLogout } from './components/ApiRequest';
import { publish, subscribe } from './components/EventBus';

const mapBackendUser = (u = {}) => ({
  username: u.username || u.name || '',
  firstName: u.firstName || '',
  lastName: u.lastName || '',
  customName: u.customName || '',
  bio: u.bio || '',
  photo: u.profileImageUrl || null,
  socialMedia: Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : [],
  isVisible: u.isVisible !== false,
  isPremium: !!u.isPremium,
  role: u.role || 'user',
  consent: u.consent || { accepted: false, version: '', consentAt: null },
  privacyPreferences: u.privacyPreferences || { analytics: false, marketing: false },
  moderation: u.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', lastWarningType: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
});

const mapProfileUser = (u = {}) => ({
  _id: u._id || u.id,
  username: u.username || u.name || '',
  firstName: u.firstName || '',
  lastName: u.lastName || '',
  customName: u.customName || '',
  bio: u.bio || '',
  photo: u.profileImageUrl || null,
  socialMedia: Array.isArray(u.socialNetworks)
    ? u.socialNetworks.map((s) => ({ platform: s.type, username: s.handle }))
    : [],
  locationCoordinates: Array.isArray(u.location?.coordinates) ? u.location.coordinates : undefined,
});

function AppInner() {
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [selectedUser, setSelectedUser] = useState(null);
  const [profileReturnTo, setProfileReturnTo] = useState('UserList');
  const [userListScrollOffset, setUserListScrollOffset] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState(null);
  // Chat désactivé
  const appState = useRef(AppState.currentState);
  const { colors } = useTheme();
  const { user: appUser, updateUser } = useContext(UserContext);

  const transitionX = useRef(new Animated.Value(0)).current;
  const { width } = Dimensions.get('window');
  const prevScreenRef = useRef('Login');

  const [userInfo, setUserInfo] = useState({
    username: 'Arnaud',
    bio: "Développeur full stack, j'ai une bio plutôt longue comme tu peux le voir, afin de voir comment ça se comporte en responsive",
    photo: '',
  });

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
            setCurrentScreen(consentAccepted ? 'UserList' : 'Consent');
            if (consentAccepted) {
              setTimeout(() => publish('userlist:refresh'), 1000);
            }
          } catch (_) {
            setCurrentScreen('UserList');
            setTimeout(() => publish('userlist:refresh'), 1000);
          }
        }
      } catch (_) {
        // ignore
      } finally {
        setAuthReady(true);
      }
    };
    initAuth();
  }, [updateUser]);

  useEffect(() => {
    const sub = AppState.addEventListener?.('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try { publish('userlist:refresh'); } catch (_) {}
      }
      appState.current = next;
    });
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, []);

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
        setProfileReturnTo('UserList');
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
    setCurrentScreen(consentAccepted ? 'UserList' : 'Consent');
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
  const handleReturnToList = () => setCurrentScreen('UserList');
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

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setProfileReturnTo('UserList');
    setCurrentScreen('UserProfile');
  };

  useEffect(() => {
    const prev = prevScreenRef.current;

    const isForward =
      (prev === 'UserList' && (currentScreen === 'UserProfile' || currentScreen === 'MyAccount')) ||
      (prev === 'MyAccount' && (currentScreen === 'Settings' || currentScreen === 'Warnings'));

    const isBack =
      (currentScreen === 'UserList' && (prev === 'UserProfile' || prev === 'MyAccount')) ||
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

  const handleUpdateUser = (type, value) => {
    setUserInfo((prevState) => ({
      ...prevState,
      [type]: value,
    }));
  };

  if (!assetsReady || !authReady) {
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
      screenToShow = <ForgotPasswordScreen onResetPassword={handleLogin} onBack={() => setCurrentScreen('Login')} />;
      break;
    case 'MyAccount':
      screenToShow = (
        <MyAccountScreen
          user={userInfo}
          onUpdateUser={handleUpdateUser}
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
    case 'UserList':
      screenToShow = (
        <UserListScreen
          users={[]}
          onSelectUser={handleSelectUser}
          onReturnToAccount={handleReturnToAccount}
          onOpenSearchView={() => setCurrentScreen('UserSearch')}
          initialScrollOffset={userListScrollOffset}
          onUpdateScrollOffset={setUserListScrollOffset}
          onOpenMessages={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
        />
      );
      break;
    case 'UserSearch':
      screenToShow = (
        <UserSearchView
          onClose={() => setCurrentScreen('UserList')}
          onSelectUser={(u) => { setSelectedUser(u); setProfileReturnTo('UserList'); setCurrentScreen('UserProfile'); }}
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
            else handleReturnToList();
          }}
          onReturnToAccount={handleReturnToAccount}
          socialMediaIcons={socialMediaIcons}
          onOpenMessages={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
          onOpenConversation={() => Alert.alert('Indisponible', 'La messagerie a été désactivée.')}
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
          onOpenUserProfile={(u) => { setSelectedUser(u); setProfileReturnTo('Statistics'); setCurrentScreen('UserProfile'); }}
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
          onOpenUserProfile={(u) => {
            if (!u) return;
            setSelectedUser({
              _id: u.id || u._id,
              username: u.username || '',
              firstName: u.firstName || '',
              lastName: u.lastName || '',
              customName: u.customName || '',
              photo: u.profileImageUrl || null,
            });
            setProfileReturnTo('Moderator');
            setCurrentScreen('UserProfile');
          }}
        />
      );
      break;
    case 'Consent':
      screenToShow = (
        <ConsentScreen
          onAccepted={() => setCurrentScreen('UserList')}
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
