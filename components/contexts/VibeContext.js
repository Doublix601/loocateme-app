import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, LayoutAnimation, Platform, UIManager } from 'react-native';
import {
  VIBE_AMBIENT_PULSE_MS,
  VIBE_THEME_SWAP_RATIO,
  VIBE_TRANSITION_DURATION_MS,
  VIBE_TRANSITION_MIN_MS,
} from '../vibe/vibeTransition.constants';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch (_) {}
}

// Vibe: 'sun' (jour) | 'moon' (nuit)
const K_VIBE_KEY = 'lm_vibe_mode_v1';

function getAutoVibe(now = new Date()) {
  const h = now.getHours();
  // 07h–19h => soleil, 19h–07h => lune
  return h >= 7 && h < 19 ? 'sun' : 'moon';
}

const VibeContext = createContext({
  vibe: 'sun',
  isMoon: false,
  setVibe: () => {},
  setAutoVibe: () => {},
  auto: true,
  // Transition API
  transitioningTo: null, // 'sun' | 'moon' | null
  beginVibeTransition: () => {},
  skipVibeTransition: () => {},
  // Signal léger (non bloquant) émis quand le basculement automatique horaire
  // change le vibe pendant que l'app est ouverte, pour un toast de confirmation.
  ambientVibeShift: null, // { target: 'sun'|'moon', ts: number } | null
});

export function VibeProvider({ children, onVibeChanged }) {
  const [manualVibe, setManualVibe] = useState(null); // null => auto
  const [autoVibe, setAutoVibeState] = useState(getAutoVibe());
  const autoTimer = useRef(null);
  const transitionTimer = useRef(null);
  const themeSwapTimer = useRef(null);
  const ambientPulseTimer = useRef(null);
  const [transitioningTo, setTransitioningTo] = useState(null);
  const transitioningToRef = useRef(null);
  useEffect(() => {
    transitioningToRef.current = transitioningTo;
  }, [transitioningTo]);
  const [ambientVibeShift, setAmbientVibeShift] = useState(null);

  const pulseAmbientVibeShift = useCallback((target) => {
    if (ambientPulseTimer.current) {
      try {
        clearTimeout(ambientPulseTimer.current);
      } catch (_) {}
    }
    setAmbientVibeShift({ target, ts: Date.now() });
    ambientPulseTimer.current = setTimeout(() => {
      ambientPulseTimer.current = null;
      setAmbientVibeShift(null);
    }, VIBE_AMBIENT_PULSE_MS);
  }, []);

  // Load manual override from storage.
  // Nouveau format: JSON { value: 'sun'|'moon', setAtAuto: 'sun'|'moon' }.
  // Ancien format (rétro-compat): chaîne brute 'sun'|'moon'.
  // Si une frontière horaire (7h/19h) a été franchie depuis la pose de l'override,
  // on l'efface afin que le défaut horaire s'applique.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(K_VIBE_KEY).catch(() => null);
      if (!raw) return;
      let value = null;
      let setAtAuto = null;
      if (raw === 'sun' || raw === 'moon') {
        // Ancien format: pas d'info de frontière. On applique tout de même la
        // règle "le défaut reprend à 7h/19h": si la valeur diverge du défaut
        // horaire courant, on l'efface (migration douce).
        value = raw;
        setAtAuto = raw; // équivaut à dire "posé alors que le défaut était === value"
      } else {
        try {
          const obj = JSON.parse(raw);
          if (obj && (obj.value === 'sun' || obj.value === 'moon')) {
            value = obj.value;
            setAtAuto = obj.setAtAuto === 'sun' || obj.setAtAuto === 'moon' ? obj.setAtAuto : null;
          }
        } catch (_) {}
      }
      if (!value) return;
      const currentAuto = getAutoVibe();
      if (setAtAuto && setAtAuto !== currentAuto) {
        // Frontière franchie depuis le choix manuel → on efface l'override
        AsyncStorage.removeItem(K_VIBE_KEY).catch(() => {});
        return;
      }
      setManualVibe(value);
    })();
  }, []);

  // Schedule auto updates hourly to catch boundary changes
  useEffect(() => {
    const schedule = () => {
      autoTimer.current && clearTimeout(autoTimer.current);
      const next = new Date();
      next.setMinutes(0, 0, 0);
      next.setHours(new Date().getHours() + 1);
      const delay = Math.max(1000, next.getTime() - Date.now());
      autoTimer.current = setTimeout(() => {
        const prev = getAutoVibe(new Date(Date.now() - 60 * 1000));
        const curr = getAutoVibe();
        setAutoVibeState(curr);
        // Au franchissement d'une frontière horaire (7h ou 19h),
        // le mode jour/nuit redevient le défaut: on efface l'override manuel
        // afin que le défaut horaire s'applique.
        if (prev !== curr) {
          setManualVibe(null);
          AsyncStorage.removeItem(K_VIBE_KEY).catch(() => {});
          pulseAmbientVibeShift(curr);
        }
        schedule();
      }, delay);
    };
    schedule();

    // Re-vérifier au retour d'arrière-plan: si l'app était suspendue lors du
    // franchissement d'une frontière (7h/19h), le timer n'a pas pu se déclencher.
    const onAppState = (state) => {
      if (state !== 'active') return;
      // L'app peut avoir été suspendue pendant une transition de vibe en
      // cours (overlay plein écran qui capte les touches) : le setTimeout
      // JS ne se déclenche pas de façon fiable en arrière-plan, ce qui
      // laissait l'overlay bloqué et gelait l'app au retour au premier
      // plan. On force la résolution immédiate de la transition.
      // On se base sur `transitioningToRef` (l'état réel affiché par
      // l'overlay) plutôt que sur les refs de timer : ces dernières ne sont
      // qu'une implémentation de la façon dont la transition se termine
      // normalement, et rien ne garantit qu'elles restent synchronisées
      // avec `transitioningTo` dans tous les cas (ex: futur changement,
      // course avec le déclenchement d'un timer pile au retour au premier
      // plan). Se fier à elles pour décider s'il faut réparer l'état
      // laissait ce filet de sécurité potentiellement no-op alors même que
      // l'overlay bloquant reste affiché.
      if (transitioningToRef.current) {
        try {
          clearTimeout(transitionTimer.current);
        } catch (_) {}
        transitionTimer.current = null;
        if (themeSwapTimer.current) {
          try {
            clearTimeout(themeSwapTimer.current);
          } catch (_) {}
          themeSwapTimer.current = null;
        }
        const target = transitioningToRef.current;
        setTransitioningTo(null);
        if (target) setVibe(target);
      }
      const curr = getAutoVibe();
      setAutoVibeState((prev) => {
        if (prev !== curr) {
          // Frontière franchie pendant le sommeil de l'app → on efface l'override.
          setManualVibe(null);
          AsyncStorage.removeItem(K_VIBE_KEY).catch(() => {});
          pulseAmbientVibeShift(curr);
        }
        return curr;
      });
      // Replanifier le prochain tick horaire à partir de maintenant.
      schedule();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      autoTimer.current && clearTimeout(autoTimer.current);
      ambientPulseTimer.current && clearTimeout(ambientPulseTimer.current);
      transitionTimer.current && clearTimeout(transitionTimer.current);
      themeSwapTimer.current && clearTimeout(themeSwapTimer.current);
      try {
        sub && sub.remove && sub.remove();
      } catch (_) {}
    };
  }, []);

  const setVibe = useCallback(
    async (next) => {
      const val = next === 'moon' ? 'moon' : 'sun';
      setManualVibe(val);
      try {
        const payload = JSON.stringify({ value: val, setAtAuto: getAutoVibe() });
        await AsyncStorage.setItem(K_VIBE_KEY, payload);
      } catch {}
      // Pas de LayoutAnimation ici : la transition visuelle est déjà gérée
      // par VibeTransitOverlay (pendant que l'overlay est opaque). Une
      // LayoutAnimation.configureNext() déclenchée ici s'applique au PROCHAIN
      // rendu affectant le layout, pas forcément à celui du changement de
      // vibe (surtout après l'await AsyncStorage, qui introduit un vrai délai
      // avant cet appel) — elle peut donc s'accrocher à un rendu ultérieur
      // sans rapport et faire apparaître un changement de thème animé bien
      // après la fin de l'overlay, ce qui est exactement le bug qu'on évite
      // en laissant ce changement se faire instantanément.
      if (typeof onVibeChanged === 'function') {
        try {
          onVibeChanged(val);
        } catch {}
      }
    },
    [onVibeChanged],
  );

  const beginVibeTransition = useCallback(
    (next, durationMs = VIBE_TRANSITION_DURATION_MS) => {
      const target = next === 'moon' ? 'moon' : 'sun';
      // If already in the same vibe and not transitioning, do nothing
      const current = manualVibe || autoVibe;
      if (current === target && !transitioningTo) return;
      // Cancel previous if any
      if (transitionTimer.current) {
        try {
          clearTimeout(transitionTimer.current);
        } catch (_) {}
        transitionTimer.current = null;
      }
      if (themeSwapTimer.current) {
        try {
          clearTimeout(themeSwapTimer.current);
        } catch (_) {}
        themeSwapTimer.current = null;
      }
      setTransitioningTo(target);
      const effectiveDuration = Math.max(VIBE_TRANSITION_MIN_MS, durationMs);
      themeSwapTimer.current = setTimeout(
        async () => {
          themeSwapTimer.current = null;
          await setVibe(target);
        },
        Math.round(effectiveDuration * VIBE_THEME_SWAP_RATIO),
      );
      transitionTimer.current = setTimeout(() => {
        transitionTimer.current = null;
        setTransitioningTo(null);
      }, effectiveDuration);
    },
    [autoVibe, manualVibe, setVibe, transitioningTo],
  );

  // Résout immédiatement une transition en cours (affordance "Passer" de
  // l'overlay) : applique le vibe cible tout de suite sans attendre le timer.
  const skipVibeTransition = useCallback(() => {
    if (!transitioningTo) return;
    if (transitionTimer.current) {
      try {
        clearTimeout(transitionTimer.current);
      } catch (_) {}
      transitionTimer.current = null;
    }
    if (themeSwapTimer.current) {
      try {
        clearTimeout(themeSwapTimer.current);
      } catch (_) {}
      themeSwapTimer.current = null;
    }
    const target = transitioningTo;
    setTransitioningTo(null);
    setVibe(target);
  }, [transitioningTo, setVibe]);

  const setAutoVibe = useCallback(async () => {
    setManualVibe(null);
    try {
      await AsyncStorage.removeItem(K_VIBE_KEY);
    } catch {}
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {}
  }, []);

  const vibe = manualVibe || autoVibe;
  const isMoon = vibe === 'moon';
  const auto = manualVibe == null;

  const value = useMemo(
    () => ({
      vibe,
      isMoon,
      setVibe,
      setAutoVibe,
      auto,
      transitioningTo,
      beginVibeTransition,
      skipVibeTransition,
      ambientVibeShift,
    }),
    [
      vibe,
      isMoon,
      setVibe,
      setAutoVibe,
      auto,
      transitioningTo,
      beginVibeTransition,
      skipVibeTransition,
      ambientVibeShift,
    ],
  );
  return <VibeContext.Provider value={value}>{children}</VibeContext.Provider>;
}

export function useVibe() {
  const ctx = useContext(VibeContext);
  if (!ctx) throw new Error('useVibe must be used within a VibeProvider');
  return ctx;
}
