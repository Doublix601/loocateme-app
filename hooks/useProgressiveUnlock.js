import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePremiumAccess } from './usePremiumAccess';
import { hasSeenOnboarding } from '../utils/onboarding';

const CHECKIN_KEY = 'lm_progressive_checkin_count';
const SUPERLIKE_KEY = 'lm_progressive_superlike_sent_count';
const MIGRATED_KEY = 'lm_progressive_migrated_v1';

async function getCount(key) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function setCount(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

/**
 * À appeler juste après un check-in réussi. Idempotent au-delà du premier check-in
 * (le compteur ne sert qu'à déclencher les paliers de déblocage, pas de statistique précise).
 */
export async function incrementCheckinCount() {
  const current = await getCount(CHECKIN_KEY);
  if (current < 2) await setCount(CHECKIN_KEY, current + 1);
}

/**
 * À appeler juste après l'envoi réussi d'un superlike.
 */
export async function incrementSuperlikeSentCount() {
  const current = await getCount(SUPERLIKE_KEY);
  if (current < 1) await setCount(SUPERLIKE_KEY, current + 1);
}

/**
 * Traite les utilisateurs ayant déjà terminé l'onboarding avant l'introduction du
 * déblocage progressif comme déjà débloqués, pour ne jamais leur retirer une
 * fonctionnalité qu'ils utilisaient déjà.
 */
async function runMigrationIfNeeded() {
  try {
    const migrated = await AsyncStorage.getItem(MIGRATED_KEY);
    if (migrated === 'true') return;

    const alreadyOnboarded = await hasSeenOnboarding();
    if (alreadyOnboarded) {
      await setCount(CHECKIN_KEY, 2);
      await setCount(SUPERLIKE_KEY, 1);
    }
    await AsyncStorage.setItem(MIGRATED_KEY, 'true');
  } catch {}
}

/**
 * useProgressiveUnlock
 *
 * Révèle progressivement stories/boost/superlike aux nouveaux utilisateurs en
 * fonction d'actions réelles (check-in, superlike envoyé), plutôt que de tout
 * exposer dès la sortie de l'onboarding. Les utilisateurs Premium ou déjà
 * existants avant cette fonctionnalité voient tout débloqué d'office.
 */
export function useProgressiveUnlock() {
  const { isPremium } = usePremiumAccess();
  const [checkinCount, setCheckinCount] = useState(0);
  const [superlikeSentCount, setSuperlikeSentCount] = useState(0);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    await runMigrationIfNeeded();
    const [c, s] = await Promise.all([getCount(CHECKIN_KEY), getCount(SUPERLIKE_KEY)]);
    setCheckinCount(c);
    setSuperlikeSentCount(s);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Les comptes Premium ne sont jamais soumis au déblocage progressif.
  const isNewUser = !isPremium;

  const storiesUnlocked = !isNewUser || checkinCount >= 1;
  const superlikeUnlocked = !isNewUser || checkinCount >= 1;
  const boostUnlocked = !isNewUser || checkinCount >= 2 || superlikeSentCount >= 1;

  return {
    ready,
    isNewUser,
    checkinCount,
    superlikeSentCount,
    storiesUnlocked,
    superlikeUnlocked,
    boostUnlocked,
    refresh,
  };
}
