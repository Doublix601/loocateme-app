import AsyncStorage from '@react-native-async-storage/async-storage';

// Permet de contourner l'API Location en dev quand le fused location provider
// de l'émulateur ne renvoie jamais de fix (bug connu de certains AVD Google Play).
// N'a aucun effet en production : voir isDevOverrideActive().

const STORAGE_KEY = 'dev:locationOverride';

let cachedOverride = null;
let loaded = false;
const listeners = new Set();

export function isDevOverrideActive() {
  return __DEV__;
}

export async function loadDevLocationOverride() {
  if (!__DEV__) return null;
  if (loaded) return cachedOverride;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cachedOverride = raw ? JSON.parse(raw) : null;
  } catch (_) {
    cachedOverride = null;
  }
  loaded = true;
  return cachedOverride;
}

export function getDevLocationOverride() {
  return cachedOverride;
}

export async function setDevLocationOverride(coords) {
  if (!__DEV__) return;
  cachedOverride = coords;
  loaded = true;
  try {
    if (coords) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch (_) {}
  listeners.forEach((cb) => cb(cachedOverride));
}

export function subscribeDevLocationOverride(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
