import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Dimensions, Animated,
} from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const PAD = 12;

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
  // Overlay fade in/out
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  // Tooltip slide+fade per step
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipTranslateY = useRef(new Animated.Value(16)).current;
  // Ring pulse loop
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;
  const pulseLoop = useRef(null);

  // Fade overlay in on first show
  useEffect(() => {
    if (visible) {
      Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      pulse.setValue(1);
      pulseOpacity.setValue(0.7);
      pulseLoop.current?.stop();
    }
  }, [visible]);

  // Tooltip animate in on each step change
  useEffect(() => {
    if (!visible || !rect) return;
    tooltipOpacity.setValue(0);
    tooltipTranslateY.setValue(16);
    Animated.parallel([
      Animated.timing(tooltipOpacity, { toValue: 1, duration: 260, delay: 80, useNativeDriver: true }),
      Animated.spring(tooltipTranslateY, { toValue: 0, friction: 7, tension: 70, delay: 80, useNativeDriver: true }),
    ]).start();

    // Pulse ring
    pulseLoop.current?.stop();
    pulse.setValue(1);
    pulseOpacity.setValue(0.7);
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    pulseLoop.current = loop;
    loop.start();

    return () => loop.stop();
  }, [stepIndex, rect, visible]);

  if (!rect) return null;

  const sx = rect.x - PAD;
  const sy = rect.y - PAD;
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;
  const br = (rect.borderRadius ?? 14) + PAD;

  const showBelow = sy < H * 0.52;
  const tooltipTop = showBelow ? Math.min(sy + sh + 16, H - 200) : undefined;
  const tooltipBottom = showBelow ? undefined : H - Math.max(sy - 16, 10);

  const isLast = stepIndex === totalSteps - 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>

        {/* ── Overlay sombre en 4 panneaux ── */}
        <View style={[styles.dark, { top: 0, left: 0, right: 0, height: Math.max(0, sy) }]} />
        <View style={[styles.dark, { top: sy + sh, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.dark, { top: sy, left: 0, width: Math.max(0, sx), height: sh }]} />
        <View style={[styles.dark, { top: sy, left: sx + sw, right: 0, height: sh }]} />

        {/* ── Anneau fixe ── */}
        <View
          pointerEvents="none"
          style={[styles.ring, { top: sy - 2, left: sx - 2, width: sw + 4, height: sh + 4, borderRadius: br + 2 }]}
        />

        {/* ── Anneau pulsant ── */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringPulse,
            {
              top: sy - 2,
              left: sx - 2,
              width: sw + 4,
              height: sh + 4,
              borderRadius: br + 2,
              transform: [{ scale: pulse }],
              opacity: pulseOpacity,
            },
          ]}
        />

        {/* ── Tooltip ── */}
        <Animated.View
          style={[
            styles.tooltip,
            {
              opacity: tooltipOpacity,
              transform: [{ translateY: tooltipTranslateY }],
              top: tooltipTop,
              bottom: tooltipBottom,
              left: 20,
              right: 20,
            },
          ]}
        >
          {/* Barre de progression */}
          <View style={styles.progressBar}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={styles.progressSegmentBg}>
                <Animated.View
                  style={[
                    styles.progressSegmentFill,
                    { opacity: i <= stepIndex ? 1 : 0 },
                  ]}
                />
              </View>
            ))}
          </View>

          <Text style={styles.stepLabel}>{stepIndex + 1} / {totalSteps}</Text>
          <Text style={styles.tooltipTitle}>{title}</Text>
          <Text style={styles.tooltipDesc}>{description}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.skipTxt}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} activeOpacity={0.82} style={styles.nextBtn}>
              <Text style={styles.nextTxt}>{isLast ? 'Terminé ✓' : 'Suivant →'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dark: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.80)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00C2CB',
    shadowColor: '#00C2CB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 0,
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
  progressBar: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 16,
  },
  progressSegmentBg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressSegmentFill: {
    flex: 1,
    backgroundColor: '#00C2CB',
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00C2CB',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  tooltipDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 21,
    marginBottom: 22,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: { paddingVertical: 6 },
  skipTxt: { color: 'rgba(255,255,255,0.32)', fontSize: 14 },
  nextBtn: {
    backgroundColor: '#00C2CB',
    paddingVertical: 11,
    paddingHorizontal: 26,
    borderRadius: 24,
    shadowColor: '#00C2CB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  nextTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
