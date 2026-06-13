import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Dimensions, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { markOnboardingDone } from '../utils/onboarding';

const { width: W, height: H } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'welcome',
    emoji: '🌍',
    title: 'Bienvenue sur LoocateMe',
    desc: 'Découvre en temps réel les lieux animés autour de toi et les personnes qui s\'y trouvent.',
    gradient: ['#0A0617', '#1B1030'],
    accent: '#FF3DAD',
    accentAlt: '#8A4BFF',
  },
  {
    key: 'vibe',
    emoji: '☀️🌙',
    title: 'Jour & Nuit',
    desc: 'Bascule entre le mode Jour (cafés, parcs, sport…) et le mode Nuit (bars, restos, boîtes…). L\'app s\'adapte à ton envie du moment.',
    gradient: ['#0A1628', '#0D2340'],
    accent: '#3DA9FF',
    accentAlt: '#00C2CB',
  },
  {
    key: 'checkin',
    emoji: '📍',
    title: 'Check-in automatique',
    desc: 'Dès que tu entres dans un lieu, tu y apparais automatiquement. Les autres peuvent te voir — et toi aussi tu vois qui est là.',
    gradient: ['#160A26', '#200E38'],
    accent: '#8A4BFF',
    accentAlt: '#FF3DAD',
  },
  {
    key: 'profile',
    emoji: '👤',
    title: 'Ton profil, ton identité',
    desc: 'Ajoute tes réseaux sociaux pour que les gens puissent te retrouver. Consulte les profils des personnes autour de toi.',
    gradient: ['#0A1810', '#0D2618'],
    accent: '#2ECC71',
    accentAlt: '#00C2CB',
  },
  {
    key: 'stars',
    emoji: '⭐',
    title: 'Les étoiles de popularité',
    desc: 'Chaque lieu reçoit 1 à 3 étoiles selon sa fréquentation réelle sur les 30 derniers jours. Plus c\'est animé, plus ça brille.',
    gradient: ['#1A1200', '#2A1E00'],
    accent: '#F1C40F',
    accentAlt: '#FF8C00',
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const flatRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const goNext = async () => {
    if (isLast) {
      await markOnboardingDone();
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  };

  const skip = async () => {
    await markOnboardingDone();
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => <Slide item={item} />}
      />

      {/* Bottom UI */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
            const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 22, 8], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity, backgroundColor: SLIDES[i].accent }]}
              />
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={goNext} activeOpacity={0.85}>
          <LinearGradient
            colors={[slide.accent, slide.accentAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <Text style={styles.ctaTxt}>{isLast ? 'C\'est parti 🚀' : 'Suivant'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity onPress={skip} style={styles.skipBtn}>
            <Text style={styles.skipTxt}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Slide({ item }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ width: W }}>
      <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={[styles.slide, { paddingTop: insets.top + 20 }]}>
        {/* Emoji bubble */}
        <View style={[styles.emojiBubble, { borderColor: item.accent + '55', shadowColor: item.accent }]}>
          <Text style={styles.emojiTxt}>{item.emoji}</Text>
        </View>

        {/* Accent line */}
        <View style={[styles.accentLine, { backgroundColor: item.accent }]} />

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.desc}>{item.desc}</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 160,
  },

  emojiBubble: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  emojiTxt: { fontSize: 48, textAlign: 'center' },

  accentLine: {
    width: 36,
    height: 3,
    borderRadius: 2,
    marginBottom: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  desc: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
    lineHeight: 22,
  },

  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: 'rgba(5,5,5,0.72)',
  },

  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },

  cta: {
    width: W - 48,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  skipBtn: { marginTop: 14, paddingVertical: 6 },
  skipTxt: { color: 'rgba(255,255,255,0.40)', fontSize: 14, fontWeight: '500' },
});
