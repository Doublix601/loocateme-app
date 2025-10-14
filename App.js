import { useState, useEffect, useRef } from 'react';
import { SafeAreaView, ActivityIndicator, Animated, Easing, Dimensions } from 'react-native';
import { Asset } from 'expo-asset';
import LoginScreen from './views/LoginScreen';
import ForgotPasswordScreen from './views/ForgotPasswordScreen';
import SignupScreen from './views/SignupScreen';
import MyAccountScreen from './views/MyAccountScreen';
import UserListScreen from './views/UserListScreen';
import UserProfileScreen from './views/UserProfileScreen';
import SettingsScreen from './views/SettingsScreen';
import { UserProvider } from './components/contexts/UserContext';
import { initApiFromStorage, getAccessToken } from './components/ApiRequest';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userListScrollOffset, setUserListScrollOffset] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);

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
          // Navigate to main screen if a token exists
          setCurrentScreen('UserList');
        }
      } catch (e) {
        // ignore
      } finally {
        setAuthReady(true);
      }
    };
    initAuth();
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
  const handleLogin = () => setCurrentScreen('UserList');
  const handleForgotPassword = () => setCurrentScreen('ForgotPassword');
  const handleSignup = () => setCurrentScreen('Signup');
  const handleSignupSuccess = () => setCurrentScreen('Login');
  const handleReturnToList = () => setCurrentScreen('UserList');
  const handleReturnToAccount = () => setCurrentScreen('MyAccount');
  const onReturnToSettings = () => setCurrentScreen('Settings');
  const handleLogout = () => setCurrentScreen('Login');

  const handleSelectUser = (user) => {
    setSelectedUser(user);
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
      screenToShow = <ForgotPasswordScreen onResetPassword={handleLogin} />;
      break;
    case 'MyAccount':
      screenToShow = (
        <MyAccountScreen
          user={userInfo} // Passez les informations utilisateur ici
          onUpdateUser={handleUpdateUser} // Passez la fonction de mise à jour
          onReturnToList={handleReturnToList}
          socialMediaIcons={socialMediaIcons}
          onReturnToSettings={onReturnToSettings}
        />
      );
      break;
    case 'UserList':
      screenToShow = (
        <UserListScreen
          users={[]}
          onSelectUser={handleSelectUser}
          onReturnToAccount={handleReturnToAccount}
          initialScrollOffset={userListScrollOffset}
          onUpdateScrollOffset={setUserListScrollOffset}
        />
      );
      break;
    case 'UserProfile':
      screenToShow = (
        <UserProfileScreen
          user={selectedUser}
          onReturnToList={handleReturnToList}
          onReturnToAccount={handleReturnToAccount}
          socialMediaIcons={socialMediaIcons}
        />
      );
      break;
    case 'Settings':
      screenToShow = (
        <SettingsScreen
          onReturnToAccount={handleReturnToAccount}
          onLogout={handleLogout}
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
    <UserProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, transform: [{ translateX: transitionX }] }}>
          {screenToShow}
        </Animated.View>
      </SafeAreaView>
    </UserProvider>
  );
}
