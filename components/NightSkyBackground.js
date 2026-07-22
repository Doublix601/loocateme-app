import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/**
 * Fond animé "mode nuit" : ciel sombre dégradé, étoiles scintillantes,
 * et étoiles filantes occasionnelles traversant l'écran en diagonale.
 *
 * Drop-in : accepte `style` (par défaut StyleSheet.absoluteFill) et
 * `pointerEvents` (par défaut "none").
 */
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
 * Une étoile filante : trainée orientée en diagonale, qui apparaît
 * périodiquement à un endroit aléatoire, traverse l'écran, puis disparaît
 * pour une longue pause (effet "rare").
 */
function ShootingStar({ seed = 0, screenWidth, screenHeight }) {
  // Paramètres aléatoires stables (par seed)
  const params = useMemo(() => {
    const rand = (min, max) => min + Math.random() * (max - min);
    // direction : du haut-droite vers le bas-gauche ou inverse (rare)
    const goingLeft = Math.random() < 0.7;
    const angleDeg = goingLeft ? rand(150, 200) : rand(-20, 20); // en degrés
    const angle = (angleDeg * Math.PI) / 180;
    // distance à parcourir : assez pour traverser l'écran
    const distance = Math.hypot(screenWidth, screenHeight) * 1.1;
    // point de départ : dans le tiers supérieur, côté opposé à la direction
    const startX = goingLeft
      ? rand(screenWidth * 0.5, screenWidth * 1.05)
      : rand(-screenWidth * 0.05, screenWidth * 0.5);
    const startY = rand(-screenHeight * 0.05, screenHeight * 0.45);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const length = 90 + Math.random() * 80; // longueur de la trainée
    const thickness = 1.2 + Math.random() * 0.8;
    const travelMs = 700 + Math.random() * 600; // vitesse de traversée
    // Délai initial + intervalle entre apparitions
    const initialDelay = 1500 + Math.random() * 6000 + seed * 2500;
    const gapMs = 9000 + Math.random() * 14000; // 9–23s entre étoiles filantes
    return { goingLeft, angleDeg, startX, startY, dx, dy, length, thickness, travelMs, initialDelay, gapMs };
  }, [seed, screenWidth, screenHeight]);

  const progress = useSharedValue(0); // 0 -> 1 : avancée le long du trajet
  const visible = useSharedValue(0); // 0 ou 1 : opacité globale

  useEffect(() => {
    const cycle = () => {
      progress.value = 0;
      visible.value = 0;
      // petite montée d'opacité puis fade out vers la fin
      visible.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: Math.max(0, params.travelMs - 320) }),
        withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
      );
      progress.value = withTiming(1, { duration: params.travelMs, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        // boucle naturelle via setTimeout côté JS
      });
    };
    const start = () => {
      cycle();
      const id = setInterval(cycle, params.travelMs + params.gapMs);
      return id;
    };
    const cleanupRef = { interval: null };
    const timeoutId = setTimeout(() => {
      cleanupRef.interval = start();
    }, params.initialDelay);
    return () => {
      clearTimeout(timeoutId);
      if (cleanupRef.interval) clearInterval(cleanupRef.interval);
      cancelAnimation(progress);
      cancelAnimation(visible);
    };
  }, [params]);

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
      {/* Trainée : gradient transparent -> blanc -> tête lumineuse */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(180,210,255,0.25)', 'rgba(220,230,255,0.85)', 'rgba(255,255,255,1)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: params.thickness }}
      />
      {/* Petite tête plus dense */}
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

export default function NightSkyBackground({ style, pointerEvents = 'none', starCount = 60, shootingStars = 2 }) {
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < starCount; i += 1) {
      arr.push({
        id: i,
        size: 1 + (Math.random() < 0.85 ? Math.random() * 1.4 : 1.5 + Math.random() * 1.2),
        left: Math.random() * SCREEN_W,
        top: Math.random() * SCREEN_H * 0.95,
        baseOpacity: 0.25 + Math.random() * 0.55,
        delay: Math.floor(Math.random() * 2500),
        duration: 1400 + Math.floor(Math.random() * 2200),
      });
    }
    return arr;
  }, [starCount]);

  const shooters = useMemo(() => {
    const arr = [];
    for (let i = 0; i < shootingStars; i += 1) arr.push(i);
    return arr;
  }, [shootingStars]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrapper, style]} pointerEvents={pointerEvents}>
      <LinearGradient
        colors={['#0B1026', '#1B2735']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Voile bleuté très subtil en haut pour donner de la profondeur */}
      <LinearGradient
        colors={['rgba(40,70,130,0.25)', 'rgba(0,0,0,0)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      {/* Étoiles scintillantes */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
      {/* Étoiles filantes occasionnelles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {shooters.map((i) => (
          <ShootingStar key={`shoot-${i}`} seed={i} screenWidth={SCREEN_W} screenHeight={SCREEN_H} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
});
