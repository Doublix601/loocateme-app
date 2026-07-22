import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useVibe } from './contexts/VibeContext';
import SunDisk from './vibe/SunDisk';
import MoonDisk from './vibe/MoonDisk';
import StarField from './vibe/StarField';
import ShootingStar from './vibe/ShootingStar';
import CloudBand from './vibe/CloudBand';
import {
  VIBE_CONTENT_STAGGER_MS,
  VIBE_EASING,
  VIBE_REDUCED_MOTION_DURATION_MS,
  VIBE_TRANSITION_DURATION_MS,
} from './vibe/vibeTransition.constants';

const { width, height } = Dimensions.get('window');

const DAY_GRADIENT = ['#C9E3F2', '#A7CFE6', '#8FBDD9'];
const DAY_GRADIENT_LOCATIONS = [0, 0.55, 1];
const NIGHT_GRADIENT = ['#0B1026', '#1B2735'];

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(!!enabled))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => setReduceMotion(!!enabled));
    return () => {
      mounted = false;
      try {
        sub && sub.remove && sub.remove();
      } catch (_) {}
    };
  }, []);
  return reduceMotion;
}

export default function VibeTransitOverlay() {
  const { transitioningTo, skipVibeTransition } = useVibe();
  const goingToMoon = transitioningTo === 'moon';
  const reduceMotion = useReduceMotion();
  const duration = reduceMotion ? VIBE_REDUCED_MOTION_DURATION_MS : VIBE_TRANSITION_DURATION_MS;

  const prog = useSharedValue(0);
  useEffect(() => {
    if (transitioningTo) {
      prog.value = 0;
      prog.value = withTiming(1, { duration, easing: VIBE_EASING });
    } else {
      prog.value = 0;
    }
  }, [transitioningTo, duration]);

  const dayFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? 1 - prog.value : prog.value }));
  const nightFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? prog.value : 1 - prog.value }));
  const contentFade = useAnimatedStyle(() => ({ opacity: prog.value }));

  // Le disque qui "part" glisse et s'estompe sous l'horizon ; celui qui
  // "arrive" glisse et apparaît depuis le bas — un vrai coucher/lever.
  const settingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.6, 1], [1, 0.15, 0]),
    transform: [{ translateY: interpolate(prog.value, [0, 1], [0, 140]) }],
  }));
  const risingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.4, 1], [0, 0.3, 1]),
    transform: [{ translateY: interpolate(prog.value, [0, 1], [140, 0]) }],
  }));
  const cloudFade = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.65, 1], [goingToMoon ? 0.5 : 0, goingToMoon ? 0.15 : 0.5, goingToMoon ? 0 : 0.5]),
  }));

  const starCount = goingToMoon ? 22 : 0;

  if (!transitioningTo) return null;

  const label = goingToMoon ? 'Le soleil se couche…' : "Le monde s'éveille…";
  const sub = 'Recherchez dans ces lieux';
  const items = goingToMoon
    ? [
        { icon: '🍸', label: 'Bars' },
        { icon: '💃', label: 'Clubs' },
        { icon: '🍕', label: 'Restos' },
        { icon: '🍻', label: 'Pubs' },
      ]
    : [
        { icon: '🏋️', label: 'Gyms' },
        { icon: '☕️', label: 'Cafés' },
        { icon: '🏢', label: 'Coworking' },
        { icon: '📚', label: 'Bibliothèques' },
      ];

  return (
    <View pointerEvents="auto" style={styles.overlay} onStartShouldSetResponder={() => true}>
      {/* Base gradients crossfading */}
      <Animated.View style={[styles.absoluteFill, dayFade]}>
        <LinearGradient
          colors={DAY_GRADIENT}
          locations={DAY_GRADIENT_LOCATIONS}
          style={styles.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        {!reduceMotion && (
          <Animated.View style={[styles.absoluteFill, cloudFade]} pointerEvents="none">
            <CloudBand topRatio={0.14} scale={0.9} duration={26000} opacity={0.55} screenWidth={width} screenHeight={height} />
            <CloudBand topRatio={0.32} scale={0.7} duration={32000} delay={-8000} opacity={0.4} screenWidth={width} screenHeight={height} />
          </Animated.View>
        )}
      </Animated.View>
      <Animated.View style={[styles.absoluteFill, nightFade]}>
        <LinearGradient
          colors={NIGHT_GRADIENT}
          style={styles.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        {!reduceMotion && starCount > 0 && <StarField count={starCount} width={width} height={height} />}
        {!reduceMotion && goingToMoon && (
          <ShootingStar seed={1} screenWidth={width} screenHeight={height} once initialDelayMs={Math.round(duration * 0.65)} />
        )}
      </Animated.View>

      {/* Disques soleil/lune : coucher/lever réel piloté par prog */}
      {!reduceMotion && (
        <>
          <Animated.View style={goingToMoon ? settingStyle : risingStyle} pointerEvents="none">
            <SunDisk size={84} top={height * 0.16} right={width * 0.14} animate={false} />
          </Animated.View>
          <Animated.View style={goingToMoon ? risingStyle : settingStyle} pointerEvents="none">
            <MoonDisk size={72} top={height * 0.16} right={width * 0.14} animate={false} />
          </Animated.View>
        </>
      )}

      {/* Center content */}
      <Animated.View style={[styles.centerContent, contentFade]} pointerEvents="none">
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle}>{sub}</Text>
        <View style={styles.pillsRow}>
          {items.map((it, idx) => (
            <StaggeredPill key={idx} index={idx} icon={it.icon} label={it.label} reduceMotion={reduceMotion} />
          ))}
        </View>
      </Animated.View>

      <SkipButton onPress={skipVibeTransition} />
    </View>
  );
}

function SkipButton({ onPress }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(400, withTiming(1, { duration: 300 }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.skipWrap, style]}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Passer la transition"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.skipButton}
      >
        <Text style={styles.skipText}>Passer</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StaggeredPill({ index = 0, icon, label, reduceMotion }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduceMotion ? 0 : 10);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: 200 });
      return;
    }
    const d = 650 + index * VIBE_CONTENT_STAGGER_MS;
    opacity.value = withDelay(d, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(d, withTiming(0, { duration: 400 }));
  }, [index, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return (
    <Animated.View style={[styles.pill, style]}>
      <Text style={styles.pillText}>
        {icon} {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 999,
  },
  absoluteFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  centerContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#e8f6ff',
  },
  pillsRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillText: {
    color: '#fff',
    fontWeight: '600',
  },
  skipWrap: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  skipButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  skipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
