import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Dimensions, Animated,
} from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const PAD = 12;
const DARK = 'rgba(0,0,0,0.82)';

/**
 * SpotlightOverlay — met en valeur un élément avec un halo lumineux animé.
 *
 * Props:
 *  - visible          bool
 *  - rect             { x, y, width, height, borderRadius? }
 *  - title            string
 *  - description      string
 *  - stepIndex        number (0-based)
 *  - totalSteps       number
 *  - onNext           () => void
 *  - onSkip           () => void
 */
export default function SpotlightOverlay({
  visible,
  rect,
  title,
  description,
  stepIndex = 0,
  totalSteps = 1,
  onNext,
  onSkip,
}) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipTranslateY = useRef(new Animated.Value(16)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const pulseLoop = useRef(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      pulseLoop.current?.stop();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !rect) return;
    tooltipOpacity.setValue(0);
    tooltipTranslateY.setValue(18);
    Animated.parallel([
      Animated.timing(tooltipOpacity, { toValue: 1, duration: 260, delay: 100, useNativeDriver: true }),
      Animated.spring(tooltipTranslateY, { toValue: 0, friction: 8, tension: 65, delay: 100, useNativeDriver: true }),
    ]).start();

    pulseLoop.current?.stop();
    pulse.setValue(1);
    pulseOpacity.setValue(0.6);
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.07, duration: 750, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.15, duration: 750, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 750, useNativeDriver: true }),
        ]),
      ])
    );
    pulseLoop.current = loop;
    loop.start();
    return () => loop.stop();
  }, [stepIndex, rect, visible]);

  if (!rect) return null;

  const sx = Math.max(0, rect.x - PAD);
  const sy = Math.max(0, rect.y - PAD);
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;
  const br = (rect.borderRadius ?? 14) + PAD;

  const showBelow = sy + sh < H * 0.58;
  const tooltipTop  = showBelow ? Math.min(sy + sh + 16, H - 220) : undefined;
  const tooltipBottom = !showBelow ? Math.max(H - sy + 16, 16) : undefined;

  const isLast = stepIndex === totalSteps - 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>

        {/* ── Overlay 4 panneaux ── */}
        <View style={[s.dark, { top: 0, left: 0, right: 0, height: sy }]} />
        <View style={[s.dark, { top: sy + sh, left: 0, right: 0, bottom: 0 }]} />
        <View style={[s.dark, { top: sy, left: 0, width: sx, height: sh }]} />
        <View style={[s.dark, { top: sy, left: sx + sw, right: 0, height: sh }]} />

        {/* ── 4 coins arrondis : taille = br, borderRadius sur le coin intérieur ── */}
        <View style={[s.dark, { top: sy,           left: sx,           width: br, height: br, borderBottomRightRadius: br }]} />
        <View style={[s.dark, { top: sy,           left: sx + sw - br, width: br, height: br, borderBottomLeftRadius:  br }]} />
        <View style={[s.dark, { top: sy + sh - br, left: sx,           width: br, height: br, borderTopRightRadius:    br }]} />
        <View style={[s.dark, { top: sy + sh - br, left: sx + sw - br, width: br, height: br, borderTopLeftRadius:     br }]} />

        {/* ── Anneau fixe ── */}
        <View
          pointerEvents="none"
          style={[s.ring, { top: sy - 2, left: sx - 2, width: sw + 4, height: sh + 4, borderRadius: br + 2 }]}
        />

        {/* ── Anneau pulsant ── */}
        <Animated.View
          pointerEvents="none"
          style={[s.ringPulse, {
            top: sy - 2, left: sx - 2, width: sw + 4, height: sh + 4,
            borderRadius: br + 2,
            transform: [{ scale: pulse }],
            opacity: pulseOpacity,
          }]}
        />

        {/* ── Tooltip ── */}
        <Animated.View
          style={[s.tooltip, {
            opacity: tooltipOpacity,
            transform: [{ translateY: tooltipTranslateY }],
            top: tooltipTop,
            bottom: tooltipBottom,
            left: 20, right: 20,
          }]}
        >
          <View style={s.progressBar}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={s.segBg}>
                <View style={[s.segFill, { opacity: i <= stepIndex ? 1 : 0 }]} />
              </View>
            ))}
          </View>

          <Text style={s.stepLabel}>{stepIndex + 1} / {totalSteps}</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.desc}>{description}</Text>

          <View style={s.btnRow}>
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.skipTxt}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} activeOpacity={0.82} style={s.nextBtn}>
              <Text style={s.nextTxt}>{isLast ? 'Terminé ✓' : 'Suivant →'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dark: { position: 'absolute', backgroundColor: DARK },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00C2CB',
    shadowColor: '#00C2CB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  ringPulse: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#00C2CB',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#0A0F14',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 14,
  },
  progressBar: { flexDirection: 'row', gap: 5, marginBottom: 16 },
  segBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  segFill: { flex: 1, backgroundColor: '#00C2CB' },
  stepLabel: { fontSize: 11, fontWeight: '700', color: '#00C2CB', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 10, letterSpacing: -0.4 },
  desc: { fontSize: 14, color: 'rgba(255,255,255,0.68)', lineHeight: 21, marginBottom: 22 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipTxt: { color: 'rgba(255,255,255,0.32)', fontSize: 14 },
  nextBtn: {
    backgroundColor: '#00C2CB',
    paddingVertical: 11, paddingHorizontal: 26, borderRadius: 24,
    shadowColor: '#00C2CB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10,
  },
  nextTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
