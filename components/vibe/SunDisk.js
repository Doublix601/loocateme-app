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
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 1.4,
            right: -size * 1.4,
            width: size * 3.8,
            height: size * 3.8,
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 240, 210, 0.85)', 'rgba(255, 220, 170, 0.35)', 'rgba(255, 220, 170, 0)']}
          style={{ flex: 1, borderRadius: size * 1.9 }}
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
            shadowOpacity: 0.5,
            shadowRadius: 28,
            elevation: 8,
          },
          breathe,
        ]}
      >
        <LinearGradient
          colors={['#FFF6DC', '#FFE3A8']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.35, y: 0.25 }}
          end={{ x: 0.85, y: 1 }}
        />
      </Animated.View>
    </Animated.View>
  );
}
