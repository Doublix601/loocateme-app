import React, { useRef } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useVibe } from './contexts/VibeContext';
import { useTheme } from './contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

// Total duration of the 360° pre-loading micro-animation (ms).
// Kept in the 400–600ms range to feel snappy yet perceptible.
const SPIN_DURATION_MS = 500;
const LOADING_DURATION_MS = 8000;

export default function VibeFAB() {
  const { isMoon, beginVibeTransition } = useVibe();
  const { colors } = useTheme();

  // Optional dependency: expo-haptics. Fallback to no-op when not installed.
  const Haptics = React.useMemo(() => {
    try {
      // eslint-disable-next-line global-require
      return require('expo-haptics');
    } catch (_) {
      return {
        selectionAsync: async () => {},
        impactAsync: async () => {},
        notificationAsync: async () => {},
        ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
      };
    }
  }, []);

  // Native-thread shared values: rotation + per-icon opacity (cross-fade).
  const rotation = useSharedValue(0);
  const sunOpacity = useSharedValue(isMoon ? 0 : 1);
  const moonOpacity = useSharedValue(isMoon ? 1 : 0);

  // Guard against repeated taps during the rotation.
  const animatingRef = useRef(false);

  const triggerLoading = (target) => {
    animatingRef.current = false;
    // Lance l'overlay de chargement ET diffère le changement de thème jusqu'à la fin
    // de cet overlay (cf. beginVibeTransition dans VibeContext).
    // Ordre désiré : 1) rotation 360°, 2) écran de chargement, 3) thème changé.
    try { beginVibeTransition(target, LOADING_DURATION_MS); } catch (_) {}
  };

  const fireEndOfSpinHaptic = () => {
    // Feedback haptique léger déclenché exactement à la fin du tour complet (360°),
    // juste avant l'apparition de l'overlay de chargement.
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Light ?? 'light').catch(() => {});
    } catch (_) {}
  };

  const onSpinComplete = (target) => {
    // 1) Haptique de fin de rotation, AVANT l'overlay → l'utilisateur ressent
    //    la fin propre du geste, puis le chargement s'affiche.
    fireEndOfSpinHaptic();
    // 2) Lance l'interstitiel de chargement (8s) une fois la rotation terminée.
    triggerLoading(target);
  };

  const onPress = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const wasMoon = isMoon;
    const target = wasMoon ? 'sun' : 'moon';

    // NB: on NE change PAS le thème ici. Le changement est déclenché après
    // l'écran de chargement via beginVibeTransition() (voir triggerLoading).
    // Ordre voulu : rotation 360° → overlay de chargement → thème changé.

    // 1) Reset starting state of the icons to match the *previous* vibe.
    sunOpacity.value = wasMoon ? 0 : 1;
    moonOpacity.value = wasMoon ? 1 : 0;
    rotation.value = 0;

    // 3) Spin 0 → 360° on the native thread, then fire the haptic and trigger
    //    the 8s loading overlay — strictly AFTER the rotation completes.
    rotation.value = withTiming(
      360,
      { duration: SPIN_DURATION_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onSpinComplete)(target);
      }
    );

    // 4) Cross-fade icons around the 180° mark (mid-spin) — purement visuel,
    //    aucun haptique ici (l'haptique est réservé à la fin du 360°).
    const half = Math.round(SPIN_DURATION_MS / 2);
    const fadeDur = Math.round(SPIN_DURATION_MS / 6); // short, snappy crossfade
    const delay = Math.max(0, half - Math.round(fadeDur / 2));
    sunOpacity.value = withDelay(delay, withTiming(wasMoon ? 1 : 0, { duration: fadeDur }));
    moonOpacity.value = withDelay(delay, withTiming(wasMoon ? 0 : 1, { duration: fadeDur }));
  };

  const animatedRotation = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const sunStyle = useAnimatedStyle(() => ({ opacity: sunOpacity.value, position: 'absolute' }));
  const moonStyle = useAnimatedStyle(() => ({ opacity: moonOpacity.value, position: 'absolute' }));

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isMoon ? 'Passer en mode jour' : 'Passer en mode nuit'}
        onPress={onPress}
        activeOpacity={0.85}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.fab, { backgroundColor: colors.surface, shadowColor: isMoon ? '#ff2da8' : '#000' }]}
      >
        <Animated.View style={animatedRotation}>
          <View style={styles.iconBox}>
            <Animated.View style={sunStyle}>
              <Ionicons name={'sunny'} size={28} color={'#FFC107'} />
            </Animated.View>
            <Animated.View style={moonStyle}>
              <Ionicons name={'moon'} size={28} color={'#7cc5ff'} />
            </Animated.View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const FAB_SIZE = 56; // ≥ 44x44 ergonomic minimum
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0, right: 0, bottom: 24,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE, height: FAB_SIZE,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: FAB_SIZE / 2,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.6,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  iconBox: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
});
