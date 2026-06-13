import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loocateme_onboarding_done';

export async function hasSeenOnboarding() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingDone() {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {}
}

export async function resetOnboarding() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

const PROFILE_KEY = 'loocateme_profile_onboarding_done';

export async function hasSeenProfileOnboarding() {
  try {
    return (await AsyncStorage.getItem(PROFILE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function markProfileOnboardingDone() {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, 'true');
  } catch {}
}

export async function resetProfileOnboarding() {
  try {
    await AsyncStorage.removeItem(PROFILE_KEY);
  } catch {}
}

// Navigue vers Onboarding si pas encore vu, sinon MainTabs.
export async function navigateAfterAuth(navigation) {
  const seen = await hasSeenOnboarding();
  navigation.reset({
    index: 0,
    routes: [{ name: seen ? 'MainTabs' : 'Onboarding' }],
  });
}
