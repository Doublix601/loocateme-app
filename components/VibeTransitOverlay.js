import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useVibe } from './contexts/VibeContext';

const { width, height } = Dimensions.get('window');

function useStars(count = 36) {
  return useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i += 1) {
      arr.push({
        id: i,
        left: Math.random() * width,
        top: Math.random() * height,
        size: 1 + Math.random() * 2,
        delay: Math.floor(Math.random() * 1200),
        duration: 1200 + Math.floor(Math.random() * 1800),
      });
    }
    return arr;
  }, [count]);
}

function Star({ size = 2, left = 0, top = 0, delay = 0, duration = 1600 }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.25, { duration, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      )
    );
  }, [delay, duration]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.star, style, { width: size, height: size, left, top, borderRadius: size / 2 }]} />
  );
}

export default function VibeTransitOverlay() {
  const { transitioningTo } = useVibe();
  const goingToMoon = transitioningTo === 'moon';

  // Fade control for crossfading gradients and content
  const prog = useSharedValue(0);
  useEffect(() => {
    if (transitioningTo) {
      prog.value = 0;
      // Transition stretched to 5s for immersive interstitial
      prog.value = withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.cubic) });
    } else {
      prog.value = 0;
    }
  }, [transitioningTo]);

  const dayFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? 1 - prog.value : prog.value }));
  const nightFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? prog.value : 1 - prog.value }));
  const contentFade = useAnimatedStyle(() => ({ opacity: prog.value }));

  const stars = useStars(goingToMoon ? 42 : 24);

  if (!transitioningTo) return null;

  const label = goingToMoon ? 'Le soleil se couche…' : 'Le monde s’éveille…';
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
        {/* Dawn tilt: emphasize cooler sky blues over warm yellows */}
        <LinearGradient colors={["#A8D8FF", "#87CEEB"]} style={styles.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View style={[styles.absoluteFill, nightFade]}>
        <LinearGradient colors={["#0B1026", "#1B2735"]} style={styles.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        {/* Stars for night */}
        {goingToMoon && stars.map((s) => (
          <Star key={s.id} size={s.size} left={s.left} top={s.top} delay={s.delay} duration={s.duration} />
        ))}
      </Animated.View>

      {/* Center content */}
      <Animated.View style={[styles.centerContent, contentFade]} pointerEvents="none">
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle}>{sub}</Text>
        <View style={styles.pillsRow}>
          {items.map((it, idx) => (
            <StaggeredPill key={idx} index={idx} icon={it.icon} label={it.label} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function StaggeredPill({ index = 0, icon, label }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  useEffect(() => {
    const d = 200 + index * 120;
    opacity.value = withDelay(d, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(d, withTiming(0, { duration: 600 }));
  }, [index]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return (
    <Animated.View style={[styles.pill, style]}>
      <Text style={styles.pillText}>{icon} {label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    zIndex: 999,
  },
  absoluteFill: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  centerContent: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
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
  star: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
});
