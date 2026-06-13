import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Dimensions, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');
const PAD = 10; // padding autour du spotlight

/**
 * SpotlightOverlay — met en valeur un élément de l'écran avec un halo lumineux
 * et un tooltip d'explication.
 *
 * Props:
 *  - visible          bool
 *  - rect             { x, y, width, height } — position absolue de l'élément (measureInWindow)
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
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [visible, rect]);

  if (!visible || !rect) return null;

  const sx = rect.x - PAD;
  const sy = rect.y - PAD;
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;
  const br = rect.borderRadius ?? 16;

  // Tooltip au-dessus ou en-dessous selon position verticale
  const showBelow = sy < H * 0.55;
  const tooltipTop = showBelow ? sy + sh + 14 : undefined;
  const tooltipBottom = showBelow ? undefined : H - sy + 14;

  const isLast = stepIndex === totalSteps - 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        {/* Panneau haut */}
        <View style={[styles.dark, { top: 0, left: 0, right: 0, height: Math.max(0, sy) }]} />
        {/* Panneau bas */}
        <View style={[styles.dark, { top: sy + sh, left: 0, right: 0, bottom: 0 }]} />
        {/* Panneau gauche */}
        <View style={[styles.dark, { top: sy, left: 0, width: Math.max(0, sx), height: sh }]} />
        {/* Panneau droit */}
        <View style={[styles.dark, { top: sy, left: sx + sw, right: 0, height: sh }]} />

        {/* Anneau lumineux autour du spotlight */}
        <View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              top: sy - 3,
              left: sx - 3,
              width: sw + 6,
              height: sh + 6,
              borderRadius: br + PAD + 3,
            },
          ]}
        />

        {/* Tooltip */}
        <Animated.View
          style={[
            styles.tooltip,
            {
              transform: [{ scale: scaleAnim }],
              top: tooltipTop,
              bottom: tooltipBottom,
              left: 20,
              right: 20,
            },
          ]}
        >
          {/* Indicateur de progression */}
          <View style={styles.dotsRow}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === stepIndex && styles.dotActive]}
              />
            ))}
          </View>

          <Text style={styles.tooltipTitle}>{title}</Text>
          <Text style={styles.tooltipDesc}>{description}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
              <Text style={styles.skipTxt}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} style={styles.nextBtn}>
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
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00C2CB',
    // glow effect
    shadowColor: '#00C2CB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 0,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#0E1116',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,194,203,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#00C2CB',
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  tooltipDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 20,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  skipTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
  nextBtn: {
    backgroundColor: '#00C2CB',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
  },
  nextTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
