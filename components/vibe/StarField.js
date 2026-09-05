import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Canvas, Circle } from '@shopify/react-native-skia';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TWO_PI = Math.PI * 2;

/**
 * Champ d'étoiles scintillantes.
 *
 * IMPORTANT — pourquoi Skia et pas 60 `<Animated.View>` :
 * Avec la New Architecture (Fabric) + Reanimated 4, CHAQUE `useAnimatedStyle`
 * qui change à chaque frame déclenche un clone + commit + layout Yoga de tout
 * l'arbre d'ombre. 60 étoiles = 60 commits/frame → le thread principal sature
 * et l'app se fige (plus aucun toucher délivré). On dessine donc tout le champ
 * dans UN SEUL `<Canvas>` Skia : une seule horloge Reanimated partagée pilote
 * l'opacité de chaque étoile via `useDerivedValue` (worklet, render thread),
 * et Skia repeint sa scène sans jamais toucher l'arbre d'ombre RN.
 */
function StarCircle({ star, clock }) {
  const opacity = useDerivedValue(() => {
    'worklet';
    const wave = Math.sin(clock.value * star.speed + star.phase);
    const o = star.baseOpacity + wave * star.amp;
    return o < 0.06 ? 0.06 : o > 1 ? 1 : o;
  }, [star]);

  return <Circle cx={star.left} cy={star.top} r={star.size / 2} color="#ffffff" opacity={opacity} />;
}

export default function StarField({ count = 60, width = SCREEN_W, height = SCREEN_H, style }) {
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      const baseOpacity = 0.25 + Math.random() * 0.55;
      arr.push({
        id: i,
        size: 1 + (Math.random() < 0.85 ? Math.random() * 1.4 : 1.5 + Math.random() * 1.2),
        left: Math.random() * width,
        top: Math.random() * height * 0.95,
        baseOpacity,
        amp: 0.1 + Math.random() * 0.28,
        // Vitesse de scintillement (≈ ancienne durée 1400–3600 ms par demi-cycle).
        speed: 0.55 + Math.random() * 0.9,
        phase: Math.random() * TWO_PI,
      });
    }
    return arr;
  }, [count, width, height]);

  // Une seule horloge partagée : avance linéairement de 0 → 2π en boucle.
  // `useDerivedValue` de chaque étoile lit `clock.value` sans re-render React.
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(TWO_PI, { duration: 6000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, []);

  if (count <= 0) return null;

  return (
    <Canvas
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width, height }, style]}
    >
      {stars.map((s) => (
        <StarCircle key={`star-${s.id}`} star={s} clock={clock} />
      ))}
    </Canvas>
  );
}
