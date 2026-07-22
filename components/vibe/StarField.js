import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function TwinklingStar({ size, left, top, baseOpacity, delay, duration }) {
  const opacity = useSharedValue(baseOpacity);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(Math.min(1, baseOpacity + 0.45), { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(Math.max(0.1, baseOpacity - 0.1), { duration, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [delay, duration, baseOpacity]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#ffffff',
        },
        aStyle,
      ]}
    />
  );
}

/**
 * Champ d'étoiles scintillantes, réutilisable en fond ambiant ou dans
 * l'overlay de transition (où `count` est réduit pour rester léger).
 */
export default function StarField({ count = 60, width = SCREEN_W, height = SCREEN_H, style }) {
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      arr.push({
        id: i,
        size: 1 + (Math.random() < 0.85 ? Math.random() * 1.4 : 1.5 + Math.random() * 1.2),
        left: Math.random() * width,
        top: Math.random() * height * 0.95,
        baseOpacity: 0.25 + Math.random() * 0.55,
        delay: Math.floor(Math.random() * 2500),
        duration: 1400 + Math.floor(Math.random() * 2200),
      });
    }
    return arr;
  }, [count, width, height]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {stars.map((s) => (
        <TwinklingStar
          key={`star-${s.id}`}
          size={s.size}
          left={s.left}
          top={s.top}
          baseOpacity={s.baseOpacity}
          delay={s.delay}
          duration={s.duration}
        />
      ))}
    </View>
  );
}
