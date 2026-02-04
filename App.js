import { useState, useEffect, useRef, useContext } from 'react';
import { ActivityIndicator, Animated, Easing, Dimensions, Alert, AppState, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
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
import { UserProvider, UserContext } from './components/contexts/UserContext';
import { ThemeProvider, useTheme } from './components/contexts/ThemeContext';
import { FeatureFlagsProvider, useFeatureFlags } from './components/contexts/FeatureFlagsContext';
import { initApiFromStorage, getAccessToken, getMyUser, clearApiCache } from './components/ApiRequest';
import { subscribe, publish } from './components/EventBus';
import { initInactivityTracking } from './components/NotificationScheduler';
import { registerPushToken } from './components/ApiRequest';

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
  moderation: u.moderation || { warningsCount: 0, lastWarningAt: null, lastWarningReason: '', warningsHistory: [], bannedUntil: null, bannedPermanent: false },
});

function AppInner() {
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [selectedUser, setSelectedUser] = useState(null);
  const [profileReturnTo, setProfileReturnTo] = useState('UserList'); // 'UserList' | 'Statistics'
  const [userListScrollOffset, setUserListScrollOffset] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const appState = useRef(AppState.currentState);
  // IMPORTANT: useTheme and UserContext must be called unconditionally
  const { colors } = useTheme();
  const { user: appUser, updateUser } = useContext(UserContext);

  // Transition animation state
  const transitionX = useRef(new Animated.Value(0)).current;
  const { width } = Dimensions.get('window');
  const prevScreenRef = useRef('Login');

  const [userInfo, setUserInfo] = useState({
    username: 'Arnaud',
    bio: "Développeur full stack, j'ai une bio plutôt longue comme tu peux le voir, afin de voir comment ça se comporte en responsive", // Exemple de bio
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

  // Preload all local icons/images to avoid UI flicker when screens mount
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
      } catch (e) {
        // noop: even if preloading fails, we still allow app to render
      } finally {
        setAssetsReady(true);
      }
    };
    preload();
  }, []);

  // Initialize auth from stored token for auto-login
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
              // Trigger refresh for initial cold start only if needed.
              // UserListScreen now handles its own initial load from cache.
              // We only publish if we want to FORCE a refresh (e.g. cold start).
              // Initial opening of the app is one of the cases where refresh is allowed.
              setTimeout(() => publish('userlist:refresh'), 1000);
            }
          } catch (_e) {
            // If fetching me fails, fallback to UserList; global auth handler will handle errors
            setCurrentScreen('UserList');
            setTimeout(() => publish('userlist:refresh'), 1000);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setAuthReady(true);
      }
    };
    initAuth();
  }, []);

  // Notifications: inactivity reminder scheduling and push token registration
  useEffect(() => {
    // Start inactivity tracking (schedules reminder on background)
    const stopTracking = initInactivityTracking({
      // Tip: shorten in dev by setting e.g. 30 for 30s
      devShortDelaySeconds: __DEV__ ? 0 : undefined,
    });

    // Register Expo push token with backend
    (async () => {
      try {
        const mod = await import('expo-notifications');
        const Notifications = mod?.default ?? mod;
        // Ask permission (idempotent)
        const perm = await Notifications.getPermissionsAsync();
        if (perm?.status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
          if (!projectId) {
            console.warn('[Notifications] No projectId found. Push tokens might fail in production.');
          }
          const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
          const token = res?.data || res?.token || (typeof res === 'string' ? res : null);
          if (token) {
            console.log('[Notifications] Token retrieved:', token);
            try { await registerPushToken({ token, platform: Platform.OS }); } catch (err) {
              console.warn('[Notifications] Failed to register token with backend:', err.message);
            }
          }
        }
      } catch (_e) {
        // ignore if expo-notifications not available in current env
      }
    })();

    return () => { try { stopTracking && stopTracking(); } catch (_) {} };
  }, []);

    // Invalidate API cache when app returns to foreground (freshness on reopen)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;
      if (wasBackground && nextState === 'active') {
        try {
          clearApiCache();
          publish('userlist:refresh');
        } catch (_) {}
      }
    });

    // Handle push notification responses (deep links to Statistics)
    let notifSub;
    (async () => {
      try {
        const mod = await import('expo-notifications');
        const Notifications = mod?.default ?? mod;
        notifSub = Notifications.addNotificationResponseReceivedListener(response => {
          const data = response?.notification?.request?.content?.data;
          if (data?.url === 'loocateme://nearby' || data?.reason === 'inactivity_reminder') {
            setCurrentScreen('UserList');
            // Déclenche un rafraîchissement forcé de la liste
            setTimeout(() => publish('userlist:refresh'), 100);
          } else if (data?.kind === 'profile_view') {
            // Logique Premium : ouvrir le profil ou le paywall
            // Admin and moderator roles have premium access
            const hasPremiumAccess = appUser?.isPremium || appUser?.role === 'admin' || appUser?.role === 'moderator';
            if (hasPremiumAccess) {
              if (data?.actorId) {
                setSelectedUser({ _id: data.actorId, id: data.actorId }); // Objet minimal
                setProfileReturnTo('Statistics');
                setCurrentScreen('UserProfile');
              } else {
                setCurrentScreen('Statistics');
              }
            } else {
              setCurrentScreen('PremiumPaywall');
            }
          } else if (data?.kind === 'social_click' || data?.kind === 'weekly_digest' || data?.url === 'loocateme://statistics') {
            setCurrentScreen('Statistics');
          } else if (data?.kind === 'new_neighbor' && data?.neighborId) {
            // On va voir le profil du nouveau voisin
            setSelectedUser({ _id: data.neighborId, id: data.neighborId });
            setProfileReturnTo('UserList');
            setCurrentScreen('UserProfile');
          }
        });
      } catch (_) {}
    })();

    return () => {
      try { subscription.remove(); } catch (_) {}
      try { notifSub && notifSub.remove(); } catch (_) {}
    };
  }, []);

  // Handle email verification redirect: detect emailVerified=1 in URL
  useEffect(() => {
    const handleUrl = (url) => {
      try {
        if (!url) return;
        const parsed = Linking.parse(url);
        // Support both query param and fragment style
        const params = { ...(parsed?.queryParams || {}) };
        // Some redirects may append as fragment ?a=b#emailVerified=1
        if (parsed?.fragment) {
          const fragParams = Object.fromEntries(new URLSearchParams(parsed.fragment));
          Object.assign(params, fragParams);
        }
        if (String(params.emailVerified) === '1') {
          Alert.alert('Email vérifié', 'Votre adresse email a été confirmée. Vous pouvez vous connecter.');
          // Retourner à l’écran de connexion si on n’est pas déjà authentifié
          setCurrentScreen('Login');
        }
      } catch (_e) {
        // ignore parsing errors
      }
    };

    // Check initial URL when app starts (web or deep link)
    Linking.getInitialURL().then(url => {
      if (url === 'loocateme://nearby') {
        setCurrentScreen('UserList');
        setTimeout(() => publish('userlist:refresh'), 500);
      } else {
        handleUrl(url);
      }
    }).catch(() => {});
    // Subscribe to future URL events while app is running
    const sub = Linking.addEventListener('url', (evt) => {
      if (evt?.url === 'loocateme://nearby') {
        setCurrentScreen('UserList');
        setTimeout(() => publish('userlist:refresh'), 100);
      } else {
        handleUrl(evt?.url);
      }
    });
    return () => {
      try { sub && sub.remove && sub.remove(); } catch {}
    };
  }, []);

  // Force logout and redirect to Login when auth errors occur
  useEffect(() => {
    const unsub = subscribe('auth:logout', () => {
      setSelectedUser(null);
      setUserListScrollOffset(0);
      setCurrentScreen('Login');
    });
    const unsubPremium = subscribe('ui:open_premium', () => {
      setCurrentScreen('PremiumPaywall');
    });
    return () => { unsub(); unsubPremium(); };
  }, []);

  const users = [
    {
      id: 1,
      username: 'Arnaud',
      bio: "Développeur full stack, j'ai une bio plutôt longue comme tu peux le voir, afin de voir comment ça se comporte en responsive", // Exemple de bio
      photo: '',
      distance: '20 m',
      socialMedias: [
        {
          socialMedia: 'instagram',
          link: 'arnaud.theret'
        },
        {
          socialMedia: 'facebook',
          identifier: '100081250702076'
        }
      ]
    },
    {
      id: 2,
      username: 'Florian',
      bio: "C'est la bio de Florian",
      photo: '',
      distance: '50 m',
    },
    {
      id: 3,
      username: 'Mattéo',
      bio: "C'est la bio de Mat",
      photo: '',
      distance: '100 m',
    },
    {
      id: 5,
      username: 'Léna',
      bio: "C'est la bio de Léna",
      photo: '',
      distance: '110 m',
    },
    {
      id: 5,
      username: 'Kilian',
      bio: "C'est la bio de Kiki",
      photo: '',
      distance: '120 m',
    },
    {
      id: 6,
      username: 'Miracle',
      bio: "Eh oui les chats peuvent aussi s'inscrire y'a quoi",
      photo: '',
      distance: '150 m',
    },
    {
      id: 7,
      username: 'Trooper',
      bio: "Eh oui les chiens peuvent aussi s'inscrire y'a quoi",
      photo: '',
      distance: '200 m',
    },
  ];

  // Fonctions de navigation
  const handleLogin = async () => {
    try {
      const res = await getMyUser();
      const me = res?.user;
      const consentAccepted = !!(me?.consent?.accepted);

      // Re-register push token on login to ensure it's linked to the correct user
      try {
        const mod = await import('expo-notifications');
        const Notifications = mod?.default ?? mod;
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        if (!projectId) {
          console.warn('[Notifications] No projectId found during login. Push token registration might fail.');
        }
        const tokRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const token = tokRes?.data || tokRes?.token || (typeof tokRes === 'string' ? tokRes : null);
        if (token) {
          console.log('[Notifications] Token retrieved during login:', token);
          await registerPushToken({ token, platform: Platform.OS });
        }
      } catch (_) {}

      setCurrentScreen(consentAccepted ? 'UserList' : 'Consent');
      // Trigger refresh for login (considered as first opening/session start)
      if (consentAccepted) {
        setTimeout(() => publish('userlist:refresh'), 100);
      }
    } catch (_e) {
      // If fetching me fails, default to UserList; auth guard will handle errors elsewhere
      setCurrentScreen('UserList');
      setTimeout(() => publish('userlist:refresh'), 100);
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
  const handleReturnToList = () => setCurrentScreen('UserList');
  const handleReturnToAccount = () => setCurrentScreen('MyAccount');
  const onReturnToSettings = () => setCurrentScreen('Settings');
  const handleOpenDebug = () => setCurrentScreen('Debug');
  const handleLogout = () => setCurrentScreen('Login');

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setProfileReturnTo('UserList');
    setCurrentScreen('UserProfile');
  };

  // Animate on screen change for list/detail and account/settings flows
  useEffect(() => {
    const prev = prevScreenRef.current;

    const isForward =
      (prev === 'UserList' && (currentScreen === 'UserProfile' || currentScreen === 'MyAccount')) ||
      (prev === 'MyAccount' && currentScreen === 'Settings');

    const isBack =
      (currentScreen === 'UserList' && (prev === 'UserProfile' || prev === 'MyAccount')) ||
      (currentScreen === 'MyAccount' && prev === 'Settings');

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

  // Fonction pour mettre à jour les informations de l'utilisateur
  const handleUpdateUser = (type, value) => {
    setUserInfo((prevState) => ({
      ...prevState,
      [type]: value,
    }));
  };

  if (!assetsReady) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00c2cb" />
      </SafeAreaView>
    );
  }

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
        <SignupScreen onSignup={handleSignupSuccess} onLogin={handleLogout} />
      );
      break;
    case 'ForgotPassword':
      screenToShow = <ForgotPasswordScreen onResetPassword={handleLogin} onBack={() => setCurrentScreen('Login')} />;
      break;
    case 'MyAccount':
      screenToShow = (
        <MyAccountScreen
          user={userInfo} // Passez les informations utilisateur ici
          onUpdateUser={handleUpdateUser} // Passez la fonction de mise à jour
          onReturnToList={handleReturnToList}
          socialMediaIcons={socialMediaIcons}
          onReturnToSettings={onReturnToSettings}
          onOpenStatistics={() => setCurrentScreen('Statistics')}
          onOpenPremiumPaywall={() => setCurrentScreen('PremiumPaywall')}
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
            else handleReturnToList();
          }}
          onReturnToAccount={handleReturnToAccount}
          socialMediaIcons={socialMediaIcons}
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
          onReturnToAccount={handleLogin}
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
      <FeatureFlagsProvider>
        <UserProvider>
          <AppInner />
        </UserProvider>
      </FeatureFlagsProvider>
    </ThemeProvider>
  );
}
