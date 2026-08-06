import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Disque solaire + halo qui respire lentement. Prop-driven pour être
 * réutilisable à la fois en fond d'écran ambiant et dans l'overlay de
 * transition (où size/top/right/style sont pilotés par l'animation de scène).
 */
export default function SunDisk({ size = 96, top = 60, right = 36, style, animate = true }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!animate) return undefined;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [animate]);
  const breathe = useAnimatedStyle(() => ({
    opacity: animate ? interpolate(t.value, [0, 1], [0.85, 1]) : 1,
  }));

  const glowT = useSharedValue(0);
  useEffect(() => {
    if (!animate) return undefined;
    glowT.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 6500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [animate]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: animate ? interpolate(glowT.value, [0, 1], [0.45, 0.7]) : 0.55,
    transform: [{ scale: animate ? interpolate(glowT.value, [0, 1], [1, 1.06]) : 1 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, right }, style]}>
      {/* Halo externe : très large et très doux, pose l'ambiance lumineuse
          autour du soleil sans dessiner de contour visible */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 2.2,
            right: -size * 2.2,
            width: size * 5.4,
            height: size * 5.4,
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 245, 220, 0.4)', 'rgba(255, 226, 175, 0.14)', 'rgba(255, 226, 175, 0)']}
          style={{ flex: 1, borderRadius: size * 2.7 }}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      {/* Halo interne : plus resserré et plus lumineux, fait le pont entre
          le disque et le halo externe */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 1.1,
            right: -size * 1.1,
            width: size * 3.2,
            height: size * 3.2,
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 248, 225, 0.85)', 'rgba(255, 224, 170, 0.4)', 'rgba(255, 224, 170, 0)']}
          style={{ flex: 1, borderRadius: size * 1.6 }}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
            shadowColor: '#FFD58A',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55,
            shadowRadius: 32,
            elevation: 8,
          },
          breathe,
        ]}
      >
        <LinearGradient
          colors={['#FFFDF6', '#FFF2CE', '#FFDD96']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
        />
      </Animated.View>
    </Animated.View>
  );
}
