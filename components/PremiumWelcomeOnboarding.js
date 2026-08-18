import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Modal } from 'react-native';
import { useTheme } from './contexts/ThemeContext';
import { PREMIUM_SLIDES } from '../constants/premiumFeatures';

const { width } = Dimensions.get('window');

const STEPS = [...PREMIUM_SLIDES, { emoji: '🎉', title: "C'est parti !", desc: 'Profite de tous tes nouveaux avantages Premium dès maintenant.' }];

// Carrousel de bienvenue affiché juste après le passage au Premium (achat ou
// essai gratuit) — un slide par avantage débloqué, puis un slide de clôture.
// Reprend le pattern carousel déjà utilisé dans PremiumPaywallScreen.js
// (ScrollView horizontal pagingEnabled + dots).
const PremiumWelcomeOnboarding = ({ visible, onClose }) => {
  const { colors, isDark } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const carouselRef = useRef(null);

  const bg = isDark ? '#0f0f1a' : colors.background;
  const cardBg = isDark ? 'rgba(255,255,255,0.07)' : colors.surface;
  const text = isDark ? '#fff' : colors.textPrimary;
  const sub = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  const isLastStep = stepIdx === STEPS.length - 1;

  const goNext = () => {
    if (isLastStep) {
      onClose && onClose();
      return;
    }
    const next = stepIdx + 1;
    carouselRef.current?.scrollTo({ x: next * width, animated: true });
    setStepIdx(next);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: text }]}>👑 Bienvenue dans Premium</Text>
        </View>

        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            setStepIdx(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          style={{ flex: 1 }}
        >
          {STEPS.map((s, i) => (
            <View key={i} style={{ width, paddingHorizontal: 24, justifyContent: 'center' }}>
              <View style={[styles.slide, { backgroundColor: cardBg }]}>
                <Text style={styles.slideEmoji}>{s.emoji}</Text>
                <Text style={[styles.slideTitle, { color: text }]}>{s.title}</Text>
                <Text style={[styles.slideDesc, { color: sub }]}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: '#00c2cb', opacity: i === stepIdx ? 1 : 0.25, width: i === stepIdx ? 18 : 6 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={goNext} activeOpacity={0.85} style={styles.cta}>
          <Text style={styles.ctaText}>{isLastStep ? 'Découvrir' : 'Suivant'}</Text>
        </TouchableOpacity>

        {!isLastStep && (
          <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
            <Text style={[styles.skipTxt, { color: sub }]}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  slide: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minHeight: 220,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  slideEmoji: { fontSize: 64, marginBottom: 16 },
  slideTitle: { fontSize: 24, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  slideDesc: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginVertical: 14 },
  dot: { height: 6, borderRadius: 3 },
  cta: {
    backgroundColor: '#00c2cb',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 8,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  skipBtn: { alignItems: 'center', paddingVertical: 16, paddingBottom: 32 },
  skipTxt: { fontSize: 14, fontWeight: '600' },
});

export default PremiumWelcomeOnboarding;
