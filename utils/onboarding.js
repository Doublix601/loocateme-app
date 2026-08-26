import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

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

// Demande la permission de localisation une seule fois, au point de sortie du
// flux d'auth/onboarding — jamais depuis LocationListScreen (cf. plan "demande
// de localisation pendant le chargement de LocationListScreen"). Idempotente :
// requestForegroundPermissionsAsync() ne réaffiche pas le dialogue OS si le
// statut est déjà tranché (granted/denied), donc un appel répété à chaque
// login d'un utilisateur qui a déjà répondu est un simple no-op silencieux.
export async function ensureLocationPermissionRequested() {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch (_) {
    // Best-effort : une erreur de l'API de permission ne doit jamais bloquer la navigation.
  }
}

// Navigue vers Onboarding si pas encore vu, sinon MainTabs.
export async function navigateAfterAuth(navigation) {
  const seen = await hasSeenOnboarding();
  if (seen) {
    // Utilisateur déjà onboardé : MainTabs (donc LocationListScreen) va monter
    // directement, la permission doit donc déjà être tranchée avant.
    await ensureLocationPermissionRequested();
  }
  navigation.reset({
    index: 0,
    routes: [{ name: seen ? 'MainTabs' : 'Onboarding' }],
  });
}
