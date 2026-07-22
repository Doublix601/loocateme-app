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
 * Disque lunaire + halo froid, miroir de SunDisk pour le mode nuit.
 */
export default function MoonDisk({ size = 84, top = 70, right = 44, style, animate = true }) {
  const glowT = useSharedValue(0);
  useEffect(() => {
    if (!animate) return undefined;
    glowT.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [animate]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: animate ? interpolate(glowT.value, [0, 1], [0.35, 0.55]) : 0.45,
    transform: [{ scale: animate ? interpolate(glowT.value, [0, 1], [1, 1.05]) : 1 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, right }, style]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 1.3,
            right: -size * 1.3,
            width: size * 3.4,
            height: size * 3.4,
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['rgba(220, 232, 255, 0.55)', 'rgba(150, 180, 255, 0.2)', 'rgba(150, 180, 255, 0)']}
          style={{ flex: 1, borderRadius: size * 1.7 }}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          shadowColor: '#B9D2FF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 22,
          elevation: 6,
        }}
      >
        <LinearGradient
          colors={['#F5F8FF', '#D6E2F5', '#B9C7DE']}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.85, y: 1 }}
        />
        {/* Cratères discrets */}
        <Animated.View
          style={{
            position: 'absolute',
            width: size * 0.18,
            height: size * 0.18,
            borderRadius: size * 0.09,
            backgroundColor: 'rgba(150,165,190,0.35)',
            top: size * 0.28,
            left: size * 0.22,
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            width: size * 0.12,
            height: size * 0.12,
            borderRadius: size * 0.06,
            backgroundColor: 'rgba(150,165,190,0.3)',
            top: size * 0.55,
            left: size * 0.55,
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}
