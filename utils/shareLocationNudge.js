import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loocateme_share_location_nudge_v1';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours entre deux affichages
const MAX_SHOWN_COUNT = 2; // au plus 2 rappels sur la durée de vie du compte

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { shownCount: 0, lastShownAt: null, dismissedForever: false };
    const parsed = JSON.parse(raw);
    return {
      shownCount: parsed?.shownCount || 0,
      lastShownAt: parsed?.lastShownAt || null,
      dismissedForever: !!parsed?.dismissedForever,
    };
  } catch {
    return { shownCount: 0, lastShownAt: null, dismissedForever: false };
  }
}

async function writeState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export async function shouldShowShareLocationNudge() {
  const state = await readState();
  if (state.dismissedForever) return false;
  if (state.shownCount >= MAX_SHOWN_COUNT) return false;
  if (state.lastShownAt && Date.now() - state.lastShownAt < COOLDOWN_MS) return false;
  return true;
}

export async function recordShareLocationNudgeShown() {
  const state = await readState();
  await writeState({
    ...state,
    shownCount: state.shownCount + 1,
    lastShownAt: Date.now(),
  });
}

export async function recordShareLocationNudgeDismissedForever() {
  const state = await readState();
  await writeState({ ...state, dismissedForever: true });
}
