import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Fond animé du mode jour, version sobre/atmosphérique :
 * - Ciel : dégradé doux, légèrement désaturé, avec une nuance chaude diffuse.
 * - Soleil : disque lumineux discret + halo qui respire lentement (pas de rayons cartoon).
 * - Nuages : bandes wispy horizontales en parallaxe lente (pas de bulles rondes).
 * - Brume atmosphérique très légère en bas.
 *
 * Drop-in replacement d'un LinearGradient :
 *   <DaySkyBackground style={skyFillStyle} />
 */
export default function DaySkyBackground({ style, pointerEvents = 'none' }) {
  return (
    <View style={[styles.fill, style]} pointerEvents={pointerEvents}>
      {/* Ciel : dégradé doux, du bleu pâle haut vers un bleu plus dense bas */}
      <LinearGradient
        colors={['#C9E3F2', '#A7CFE6', '#8FBDD9']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Voile chaud diffus côté soleil (vers le haut-droit) */}
      <LinearGradient
        colors={['rgba(255, 224, 178, 0.35)', 'rgba(255, 224, 178, 0)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.7 }}
        pointerEvents="none"
      />

      {/* Soleil : halo doux + disque diffus, sans rayons */}
      <SunGlow />
      <SunDisk />

      {/* Nuages wispy en bandes (parallaxe lente) */}
      <WispCloud topRatio={0.1} scale={1.0} duration={120000} delay={0} opacity={0.55} />
      <WispCloud topRatio={0.22} scale={0.75} duration={150000} delay={-40000} opacity={0.4} />
      <WispCloud topRatio={0.36} scale={1.25} duration={180000} delay={-80000} opacity={0.5} />
      <WispCloud topRatio={0.52} scale={0.9} duration={160000} delay={-30000} opacity={0.35} />
      <WispCloud topRatio={0.66} scale={1.1} duration={200000} delay={-120000} opacity={0.3} />

      {/* Brume atmosphérique très subtile en bas */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)']}
        style={styles.haze}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
    </View>
  );
}

function SunGlow() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 6500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.45, 0.7]),
    transform: [{ scale: interpolate(t.value, [0, 1], [1, 1.06]) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.glowWrap, style]}>
      <LinearGradient
        colors={['rgba(255, 240, 210, 0.85)', 'rgba(255, 220, 170, 0.35)', 'rgba(255, 220, 170, 0)']}
        style={styles.glow}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
}

function SunDisk() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.85, 1]),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sunDisk, style]}>
      <LinearGradient
        colors={['#FFF6DC', '#FFE3A8']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.35, y: 0.25 }}
        end={{ x: 0.85, y: 1 }}
      />
    </Animated.View>
  );
}

/**
 * Nuage wispy : un ensemble de bandes horizontales floues qui se chevauchent
 * et qui dérivent lentement vers la droite.
 */
function WispCloud({ topRatio = 0.2, scale = 1, duration = 150000, delay = 0, opacity = 0.5 }) {
  const cloudW = 320 * scale;
  const cloudH = 38 * scale;
  const travel = SCREEN_W + cloudW;

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

  // Bandes : largeurs/offsets variés pour casser la régularité
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
      style={[styles.cloudWrap, { top: SCREEN_H * topRatio, width: cloudW, height: cloudH * 2.4 }, animStyle]}
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

const SUN_SIZE = 96;
const SUN_TOP = 60;
const SUN_RIGHT = 36;

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  glowWrap: {
    position: 'absolute',
    top: SUN_TOP - SUN_SIZE * 1.4,
    right: SUN_RIGHT - SUN_SIZE * 1.4,
    width: SUN_SIZE * 3.8,
    height: SUN_SIZE * 3.8,
  },
  glow: {
    flex: 1,
    borderRadius: SUN_SIZE * 1.9,
  },
  sunDisk: {
    position: 'absolute',
    top: SUN_TOP,
    right: SUN_RIGHT,
    width: SUN_SIZE,
    height: SUN_SIZE,
    borderRadius: SUN_SIZE / 2,
    overflow: 'hidden',
    shadowColor: '#FFD58A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 8,
  },
  cloudWrap: {
    position: 'absolute',
    left: 0,
  },
  haze: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H * 0.28,
  },
});
