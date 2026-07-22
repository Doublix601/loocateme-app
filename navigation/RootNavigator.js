import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../views/LoginScreen';
import SignupScreen from '../views/SignupScreen';
import ForgotPasswordScreen from '../views/ForgotPasswordScreen';
import ConsentScreen from '../views/ConsentScreen';
import MainSwiper from './MainSwiper';
import LocationScreen from '../views/LocationScreen';
import UserProfileScreen from '../views/UserProfileScreen';
import SettingsScreen from '../views/SettingsScreen';
import DebugScreen from '../views/DebugScreen';
import ModeratorScreen from '../views/ModeratorScreen';
import StatisticsScreen from '../views/StatisticsScreen';
import WarningsScreen from '../views/WarningsScreen';
import DataManagementScreen from '../views/DataManagementScreen';
import EditProfileScreen from '../views/EditProfileScreen';
import PremiumPaywallScreen from '../views/PremiumPaywallScreen';
import OnboardingScreen from '../views/OnboardingScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: 'slide_from_right',
        fullScreenGestureEnabled: true,
      }}
    >
      {/* Auth */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Consent" component={ConsentScreen} />

      {/* Onboarding */}
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />

      {/* App */}
      <Stack.Screen name="MainTabs" component={MainSwiper} />
      <Stack.Screen name="Location" component={LocationScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Debug" component={DebugScreen} />
      <Stack.Screen name="Moderator" component={ModeratorScreen} />
      <Stack.Screen name="Statistics" component={StatisticsScreen} />
      <Stack.Screen name="Warnings" component={WarningsScreen} />
      <Stack.Screen name="DataManagement" component={DataManagementScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />

      {/* Modals */}
      <Stack.Screen name="PremiumPaywall" component={PremiumPaywallScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
