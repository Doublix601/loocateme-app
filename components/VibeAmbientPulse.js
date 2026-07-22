import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useVibe } from './contexts/VibeContext';
import { useVibeTheme } from '../hooks/useVibeTheme';
import { VIBE_AMBIENT_PULSE_MS } from './vibe/vibeTransition.constants';

/**
 * Toast léger et non bloquant confirmant un basculement automatique du vibe
 * (frontière horaire 7h/19h franchie pendant que l'app est ouverte). Contrairement
 * à VibeTransitOverlay (déclenché par un tap explicite sur le FAB), ce composant
 * ne doit jamais intercepter le tactile ni interrompre ce que fait l'utilisateur.
 */
export default function VibeAmbientPulse() {
  const { ambientVibeShift } = useVibe();
  const { palette } = useVibeTheme();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const shiftKeyRef = useRef(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => setReduceMotion(!!enabled))
      .catch(() => {});
  }, []);

  const translateY = useSharedValue(-40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!ambientVibeShift) return;
    const key = ambientVibeShift.ts;
    if (shiftKeyRef.current === key) return;
    shiftKeyRef.current = key;
    setVisible(true);
    if (reduceMotion) {
      translateY.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      translateY.value = -40;
      opacity.value = 0;
      translateY.value = withTiming(0, { duration: 350 });
      opacity.value = withTiming(1, { duration: 300 });
    }
    const hideTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: reduceMotion ? 150 : 300 });
      if (!reduceMotion) translateY.value = withTiming(-20, { duration: 300 });
      setTimeout(() => setVisible(false), reduceMotion ? 160 : 320);
    }, VIBE_AMBIENT_PULSE_MS - 320);
    return () => clearTimeout(hideTimer);
  }, [ambientVibeShift, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || !ambientVibeShift) return null;

  const goingToMoon = ambientVibeShift.target === 'moon';
  const label = goingToMoon ? 'Bonsoir — mode nuit activé' : 'Bonjour — mode jour activé';
  const emoji = goingToMoon ? '🌙' : '☀️';

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 8 }, style]}
    >
      <Animated.View style={[styles.pill, { backgroundColor: palette.accent }]}>
        <Text style={styles.text}>
          {emoji} {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 998,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
