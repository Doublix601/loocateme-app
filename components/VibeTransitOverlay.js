import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolate,
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
  VIBE_FADE_IN_RATIO,
  VIBE_FADE_OUT_RATIO,
  VIBE_REDUCED_MOTION_DURATION_MS,
  VIBE_TRANSITION_DURATION_MS,
} from './vibe/vibeTransition.constants';

const { width, height } = Dimensions.get('window');

// Doit rester identique au dégradé de base de <DaySkyBackground/> (voir
// components/DaySkyBackground.js) : sinon, même si le thème a déjà basculé
// sous l'overlay pendant qu'il est opaque, la dernière image de l'overlay
// (juste avant qu'il ne devienne transparent) ne raccorde pas visuellement
// avec le vrai fond révélé en dessous, ce qui se perçoit comme un "flip" de
// couleur à la fin de la transition.
const DAY_GRADIENT = ['#4C97D9', '#7DBBE8', '#B7DCEF', '#F3E3C4'];
const DAY_GRADIENT_LOCATIONS = [0, 0.32, 0.68, 1];
// Doit rester identique au dégradé de base de <NightSkyBackground/> (voir
// components/NightSkyBackground.js), même raison que ci-dessus.
const NIGHT_GRADIENT = ['#0B1026', '#1B2735'];

// Easing locale (ease-in-out cubique) appliquée à la progression 0-1 de
// chaque disque individuellement — départ en douceur, vitesse de croisière,
// arrivée en douceur, indépendamment de la fenêtre de `prog` qu'il occupe.
function easeInOutCubic(t) {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

  // `prog` avance de façon strictement LINÉAIRE dans le temps (pas d'easing
  // globale) : les sous-animations (arcs des disques, fondus) découpent des
  // FENÊTRES de valeurs de `prog` (ex. [0, 0.32] pour la sortie), et si `prog`
  // lui-même était eased (lent au début/à la fin, rapide au milieu), chaque
  // fenêtre hériterait d'une vitesse réelle arbitraire selon l'endroit où elle
  // tombe sur cette courbe globale — c'est ce qui rendait la sortie lente au
  // départ (fenêtre placée sur la portion lente de la courbe) et l'entrée
  // hyper rapide (fenêtre placée sur la portion la plus rapide, au milieu).
  // Avec `prog` linéaire, chaque fenêtre dure une fraction prévisible et
  // proportionnelle du temps réel ; l'easing "naturelle" (accélération/
  // décélération) est appliquée localement à chaque disque via `easeInOutCubic`.
  const prog = useSharedValue(0);
  useEffect(() => {
    if (transitioningTo) {
      prog.value = 0;
      prog.value = withTiming(1, { duration, easing: Easing.linear });
    } else {
      prog.value = 0;
    }
  }, [transitioningTo, duration]);

  // Fade the whole overlay in/out at the very start/end of the transition so it
  // doesn't pop in/out abruptly. `prog` spans the full transition duration and
  // `transitioningTo` only clears once `prog` has finished animating (see
  // VibeContext's beginVibeTransition timer), so deriving the fade envelope
  // from `prog` itself is enough — no separate mount-timing state needed.
  const overlayFade = useAnimatedStyle(() => ({
    opacity: interpolate(
      prog.value,
      [0, VIBE_FADE_IN_RATIO, 1 - VIBE_FADE_OUT_RATIO, 1],
      [0, 1, 1, 0],
    ),
  }));

  const dayFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? 1 - prog.value : prog.value }));
  const nightFade = useAnimatedStyle(() => ({ opacity: goingToMoon ? prog.value : 1 - prog.value }));
  const contentFade = useAnimatedStyle(() => ({ opacity: prog.value }));

  // Le disque qui "part" arque vers la droite jusqu'à sortir de l'écran, PUIS
  // (une fois totalement sorti) celui qui "arrive" arque depuis la gauche
  // (hors écran) jusqu'au centre — les deux plages de `prog` ne se
  // chevauchent pas, pour ne jamais voir le soleil et la lune à l'écran en
  // même temps. Les deux séquences se terminent avant le début du fondu de
  // sortie de l'overlay (1 - VIBE_FADE_OUT_RATIO), pour que l'arrivée du
  // second disque soit bien visible avant que l'overlay ne commence à
  // dévoiler le contenu en dessous.
  const ARC_OFFSCREEN_X = width / 2 + 100;
  const ARC_AMPLITUDE_Y = 70;
  const EXIT_PROG_END = 0.32;
  const ENTER_PROG_START = 0.4;
  const ENTER_PROG_END = 0.68;
  // `prog` étant linéaire, on applique ici une accélération/décélération
  // naturelle (ease-in-out cubique) à la progression LOCALE de chaque disque,
  // indépendamment l'un de l'autre — c'est ce qui donne un mouvement fluide
  // (départ en douceur, vitesse de croisière, arrivée en douceur) plutôt
  // qu'une vitesse subie/héritée d'une courbe globale partagée.
  const exitStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, prog.value / EXIT_PROG_END));
    const eased = easeInOutCubic(t);
    const arcY = -Math.sin(eased * Math.PI) * ARC_AMPLITUDE_Y;
    return {
      opacity: interpolate(eased, [0, 0.7, 1], [1, 0.35, 0], Extrapolate.CLAMP),
      transform: [
        { translateX: eased * ARC_OFFSCREEN_X },
        { translateY: arcY },
      ],
    };
  });
  const enterStyle = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (prog.value - ENTER_PROG_START) / (ENTER_PROG_END - ENTER_PROG_START)));
    const eased = easeInOutCubic(t);
    const arcY = -Math.sin(eased * Math.PI) * ARC_AMPLITUDE_Y;
    return {
      opacity: interpolate(eased, [0, 0.35, 1], [0, 0.55, 1], Extrapolate.CLAMP),
      transform: [
        { translateX: -ARC_OFFSCREEN_X + eased * ARC_OFFSCREEN_X },
        { translateY: arcY },
      ],
    };
  });
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
        { icon: '🪩', label: 'Clubs' },
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
    <Animated.View pointerEvents="auto" style={[styles.overlay, overlayFade]} onStartShouldSetResponder={() => true}>
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

      {/* Disques soleil/lune : arc horizontal piloté par prog. Le disque qui
          "part" sort par la droite, celui qui "arrive" entre par la gauche. */}
      {!reduceMotion && (
        <>
          <Animated.View style={goingToMoon ? exitStyle : enterStyle} pointerEvents="none">
            <SunDisk size={84} top={height * 0.16} right={width * 0.14} animate={false} />
          </Animated.View>
          <Animated.View style={goingToMoon ? enterStyle : exitStyle} pointerEvents="none">
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
    </Animated.View>
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
