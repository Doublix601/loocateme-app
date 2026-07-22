import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/**
 * Une étoile filante : trainée diagonale qui traverse l'écran.
 * - Mode par défaut (`once=false`) : apparitions périodiques aléatoires
 *   (utilisé par les fonds ambiants, boucle infinie).
 * - Mode `once=true` : une seule apparition scriptée après `initialDelayMs`,
 *   sans boucle (utilisé par l'overlay de transition comme moment "wow").
 */
export default function ShootingStar({ seed = 0, screenWidth, screenHeight, once = false, initialDelayMs }) {
  const params = useMemo(() => {
    const rand = (min, max) => min + Math.random() * (max - min);
    const goingLeft = Math.random() < 0.7;
    const angleDeg = goingLeft ? rand(150, 200) : rand(-20, 20);
    const angle = (angleDeg * Math.PI) / 180;
    const distance = Math.hypot(screenWidth, screenHeight) * 1.1;
    const startX = goingLeft
      ? rand(screenWidth * 0.5, screenWidth * 1.05)
      : rand(-screenWidth * 0.05, screenWidth * 0.5);
    const startY = rand(-screenHeight * 0.05, screenHeight * 0.45);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const length = 90 + Math.random() * 80;
    const thickness = 1.2 + Math.random() * 0.8;
    const travelMs = 700 + Math.random() * 600;
    const initialDelay = initialDelayMs != null ? initialDelayMs : 1500 + Math.random() * 6000 + seed * 2500;
    const gapMs = 9000 + Math.random() * 14000;
    return { goingLeft, angleDeg, startX, startY, dx, dy, length, thickness, travelMs, initialDelay, gapMs };
  }, [seed, screenWidth, screenHeight, once, initialDelayMs]);

  const progress = useSharedValue(0);
  const visible = useSharedValue(0);

  useEffect(() => {
    const cycle = () => {
      progress.value = 0;
      visible.value = 0;
      visible.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: Math.max(0, params.travelMs - 320) }),
        withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
      );
      progress.value = withTiming(1, { duration: params.travelMs, easing: Easing.out(Easing.cubic) });
    };
    const cleanupRef = { interval: null };
    const timeoutId = setTimeout(() => {
      cycle();
      if (!once) {
        cleanupRef.interval = setInterval(cycle, params.travelMs + params.gapMs);
      }
    }, params.initialDelay);
    return () => {
      clearTimeout(timeoutId);
      if (cleanupRef.interval) clearInterval(cleanupRef.interval);
      cancelAnimation(progress);
      cancelAnimation(visible);
    };
  }, [params, once]);

  const containerStyle = useAnimatedStyle(() => {
    const tx = params.startX + params.dx * progress.value;
    const ty = params.startY + params.dy * progress.value;
    return {
      opacity: visible.value,
      transform: [{ translateX: tx }, { translateY: ty }, { rotate: `${params.angleDeg}deg` }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: params.length,
          height: params.thickness,
        },
        containerStyle,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(180,210,255,0.25)', 'rgba(220,230,255,0.85)', 'rgba(255,255,255,1)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: params.thickness }}
      />
      <View
        style={{
          position: 'absolute',
          right: -2,
          top: -(params.thickness * 1.5),
          width: params.thickness * 4,
          height: params.thickness * 4,
          borderRadius: params.thickness * 2,
          backgroundColor: 'rgba(255,255,255,0.9)',
          shadowColor: '#ffffff',
          shadowOpacity: 0.9,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </Animated.View>
  );
}
