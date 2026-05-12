import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  try { UIManager.setLayoutAnimationEnabledExperimental(true); } catch (_) {}
}

// Vibe: 'sun' (jour) | 'moon' (nuit)
const K_VIBE_KEY = 'lm_vibe_mode_v1';

function getAutoVibe(now = new Date()) {
  const h = now.getHours();
  // 07h–19h => soleil, 19h–07h => lune
  return (h >= 7 && h < 19) ? 'sun' : 'moon';
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
  startVibeLoading: () => {},
});

export function VibeProvider({ children, onVibeChanged }) {
  const [manualVibe, setManualVibe] = useState(null); // null => auto
  const [autoVibe, setAutoVibeState] = useState(getAutoVibe());
  const autoTimer = useRef(null);
  const transitionTimer = useRef(null);
  const [transitioningTo, setTransitioningTo] = useState(null);

  // Load manual override from storage
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(K_VIBE_KEY).catch(() => null);
      if (saved === 'sun' || saved === 'moon') {
        setManualVibe(saved);
      }
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
        setAutoVibeState(getAutoVibe());
        schedule();
      }, delay);
    };
    schedule();
    return () => autoTimer.current && clearTimeout(autoTimer.current);
  }, []);

  const setVibe = useCallback(async (next) => {
    const val = (next === 'moon') ? 'moon' : 'sun';
    setManualVibe(val);
    try { await AsyncStorage.setItem(K_VIBE_KEY, val); } catch {}
    // Animate reorder/layout on change
    try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
    if (typeof onVibeChanged === 'function') {
      try { onVibeChanged(val); } catch {}
    }
  }, [onVibeChanged]);

  const beginVibeTransition = useCallback((next, durationMs = 8000) => {
    const target = (next === 'moon') ? 'moon' : 'sun';
    // If already in the same vibe and not transitioning, do nothing
    const current = manualVibe || autoVibe;
    if (current === target && !transitioningTo) return;
    // Cancel previous if any
    if (transitionTimer.current) {
      try { clearTimeout(transitionTimer.current); } catch (_) {}
      transitionTimer.current = null;
    }
    setTransitioningTo(target);
    transitionTimer.current = setTimeout(async () => {
      transitionTimer.current = null;
      await setVibe(target);
      setTransitioningTo(null);
    }, Math.max(500, durationMs));
  }, [autoVibe, manualVibe, setVibe, transitioningTo]);

  // Start the loading overlay for a fixed duration without changing the vibe
  // (vibe should already have been switched by the caller, e.g. VibeFAB onPress).
  const startVibeLoading = useCallback((target, durationMs = 8000) => {
    const t = (target === 'moon') ? 'moon' : 'sun';
    if (transitionTimer.current) {
      try { clearTimeout(transitionTimer.current); } catch (_) {}
      transitionTimer.current = null;
    }
    setTransitioningTo(t);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      setTransitioningTo(null);
    }, Math.max(500, durationMs));
  }, []);

  const setAutoVibe = useCallback(async () => {
    setManualVibe(null);
    try { await AsyncStorage.removeItem(K_VIBE_KEY); } catch {}
    try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
  }, []);

  const vibe = manualVibe || autoVibe;
  const isMoon = vibe === 'moon';
  const auto = manualVibe == null;

  const value = useMemo(() => ({
    vibe,
    isMoon,
    setVibe,
    setAutoVibe,
    auto,
    transitioningTo,
    beginVibeTransition,
    startVibeLoading,
  }), [vibe, isMoon, setVibe, setAutoVibe, auto, transitioningTo, beginVibeTransition, startVibeLoading]);
  return <VibeContext.Provider value={value}>{children}</VibeContext.Provider>;
}

export function useVibe() {
  const ctx = useContext(VibeContext);
  if (!ctx) throw new Error('useVibe must be used within a VibeProvider');
  return ctx;
}
