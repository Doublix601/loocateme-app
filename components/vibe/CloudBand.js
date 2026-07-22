import React, { useEffect, useMemo } from 'react';
import { Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Nuage wispy : bandes horizontales floues qui se chevauchent et dérivent
 * lentement vers la droite. Extrait de DaySkyBackground pour être partagé
 * avec l'overlay de transition.
 */
export default function CloudBand({ topRatio = 0.2, scale = 1, duration = 150000, delay = 0, opacity = 0.5, screenWidth = SCREEN_W, screenHeight = SCREEN_H }) {
  const cloudW = 320 * scale;
  const cloudH = 38 * scale;
  const travel = screenWidth + cloudW;

  const initialPhase = delay < 0 ? (-delay % duration) / duration : 0;
  const x = useSharedValue(initialPhase);

  useEffect(() => {
    const loop = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    if (delay > 0) {
      x.value = withDelay(delay, loop);
    } else {
      x.value = loop;
    }
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [0, 1], [-cloudW, travel]) }],
    opacity,
  }));

  const bands = useMemo(
    () => [
      { w: 0.95, h: 0.45, x: 0.02, y: 0.05 },
      { w: 0.7, h: 0.3, x: 0.18, y: 0.4 },
      { w: 0.55, h: 0.22, x: 0.35, y: 0.72 },
      { w: 0.45, h: 0.28, x: 0.55, y: 0.1 },
    ],
    [],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, top: screenHeight * topRatio, width: cloudW, height: cloudH * 2.4 },
        animStyle,
      ]}
    >
      {bands.map((b, i) => (
        <LinearGradient
          key={i}
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: 'absolute',
            left: cloudW * b.x,
            top: cloudH * 2.4 * b.y,
            width: cloudW * b.w,
            height: cloudH * b.h,
            borderRadius: cloudH * b.h,
          }}
        />
      ))}
    </Animated.View>
  );
}
