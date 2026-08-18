import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, LayoutAnimation, Platform, StyleSheet, TouchableOpacity, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './contexts/ThemeContext';
import { useMainSwiper } from './contexts/MainSwiperContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TABS = [
  { page: 0, label: 'Recherche', icon: 'search-outline', iconActive: 'search' },
  { page: 1, label: 'Lieux à proximité', icon: 'location-outline', iconActive: 'location' },
  { page: 2, label: 'Compte', icon: 'person-outline', iconActive: 'person' },
];

const BAR_MARGIN = 16;
const BAR_PADDING = 6;

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_BOTTOM_OFFSET = -12;

const EXPAND_ANIM = {
  duration: 320,
  create: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.opacity, springDamping: 0.75 },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.75 },
};

// Turquoise "maison" uniquement (pas de violet) : dégradé de deux nuances de
// la même teinte, indépendant de colors.accentGradient qui est utilisé
// ailleurs dans l'app (boutons, cartes) et ne doit pas changer ici.
const TAB_PILL_GRADIENT = ['#00c2cb', '#00e0c6'];

// Ressort utilisé pour le fond turquoise qui glisse d'une icône à l'autre.
// Piloté par les mesures réelles (onLayout) de l'onglet actif plutôt que par
// une supposition de largeur : garantit qu'en position finale le fond est
// toujours exactement en face de l'icône active, y compris pendant/après
// l'animation d'agrandissement de la pastille active (cf. bug précédent où le
// fond restait décalé par rapport à l'icône après le changement de page).
const PILL_SPRING = { useNativeDriver: false, speed: 16, bounciness: 6 };

// Effet "aimant" : plus le fond glissant s'approche du centre d'une icône,
// plus celle-ci est aspirée (grossit + se soulève légèrement) vers lui.
// MAX_MAGNET_DIST doit rester nettement sous l'écart typique entre deux
// icônes voisines au repos, sinon le voisin de l'onglet actif resterait
// perpétuellement "tiré" même une fois l'animation terminée.
const MAX_MAGNET_DIST = 55;
const MAGNET_SCALE_BOOST = 0.28;
const MAGNET_LIFT = 3;

function TabItem({ tab, active, colors, onPress, onLayout, magnet }) {
  const scale = useRef(new Animated.Value(1)).current;
  const labelFade = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(labelFade, {
      toValue: active ? 1 : 0,
      duration: active ? 260 : 120,
      delay: active ? 90 : 0,
      useNativeDriver: true,
    }).start();
  }, [active, labelFade]);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      style={[styles.tab, { flex: active ? 2.15 : 1 }]}
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLayout={onLayout}
    >
      <Animated.View style={{ transform: [{ scale }], width: '100%', alignItems: 'center' }}>
        {active ? (
          <View style={styles.pill}>
            <Animated.View
              style={{
                transform: [
                  { scale: magnet },
                  { translateY: magnet.interpolate({ inputRange: [1, 1 + MAGNET_SCALE_BOOST], outputRange: [0, -MAGNET_LIFT] }) },
                ],
              }}
            >
              <Ionicons name={tab.iconActive} size={19} color="#ffffff" />
            </Animated.View>
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  opacity: labelFade,
                  transform: [
                    { translateX: labelFade.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
                  ],
                },
              ]}
            >
              {tab.label}
            </Animated.Text>
          </View>
        ) : (
          <View style={styles.iconPill}>
            <Animated.View
              style={{
                transform: [
                  { scale: magnet },
                  { translateY: magnet.interpolate({ inputRange: [1, 1 + MAGNET_SCALE_BOOST], outputRange: [0, -MAGNET_LIFT] }) },
                ],
              }}
            >
              <Ionicons name={tab.icon} size={22} color={colors.textMuted} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function MainTabBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { goToPage, currentPage } = useMainSwiper();

  useEffect(() => {
    LayoutAnimation.configureNext(EXPAND_ANIM);
  }, [currentPage]);

  // Fond turquoise glissant : sa position/largeur suit les mesures RÉELLES
  // (onLayout) de l'onglet actif, jamais une valeur supposée. C'est ce qui
  // garantit qu'il finit toujours exactement en face de l'icône active, même
  // si l'agrandissement de l'onglet (flex + LayoutAnimation ci-dessus) prend
  // un peu plus ou moins de temps à se stabiliser.
  const pillX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const pillReadyRef = useRef(false);
  const tabLayoutsRef = useRef({});
  // Une valeur "aimant" par onglet, pilotée en direct par la position du fond
  // glissant (cf. updateMagnet ci-dessous) plutôt que par le currentPage :
  // c'est ce qui permet à une icône d'être aspirée progressivement PENDANT le
  // trajet du fond, pas seulement une fois qu'il est arrivé.
  const magnetValuesRef = useRef(TABS.map(() => new Animated.Value(1))).current;

  const updateMagnet = useCallback(() => {
    const pillCenter = pillX.__getValue() + pillWidth.__getValue() / 2;
    TABS.forEach((tab, i) => {
      const box = tabLayoutsRef.current[tab.page];
      if (!box) return;
      const tabCenter = box.x + box.width / 2;
      const dist = Math.abs(pillCenter - tabCenter);
      const pull = Math.max(0, 1 - dist / MAX_MAGNET_DIST);
      magnetValuesRef[i].setValue(1 + pull * MAGNET_SCALE_BOOST);
    });
  }, [pillX, pillWidth, magnetValuesRef]);

  useEffect(() => {
    const xId = pillX.addListener(updateMagnet);
    const wId = pillWidth.addListener(updateMagnet);
    return () => {
      pillX.removeListener(xId);
      pillWidth.removeListener(wId);
    };
  }, [pillX, pillWidth, updateMagnet]);

  const movePillTo = useCallback((x, width, animate) => {
    if (!animate) {
      pillX.setValue(x);
      pillWidth.setValue(width);
      return;
    }
    Animated.parallel([
      Animated.spring(pillX, { ...PILL_SPRING, toValue: x }),
      Animated.spring(pillWidth, { ...PILL_SPRING, toValue: width }),
    ]).start();
  }, [pillX, pillWidth]);

  const handleTabLayout = useCallback(
    (page) => (e) => {
      const { x, width } = e.nativeEvent.layout;
      tabLayoutsRef.current[page] = { x, width };
      if (page === currentPage) {
        movePillTo(x, width, pillReadyRef.current);
        pillReadyRef.current = true;
      }
    },
    [currentPage, movePillTo],
  );

  useEffect(() => {
    const box = tabLayoutsRef.current[currentPage];
    if (box) movePillTo(box.x, box.width, pillReadyRef.current);
  }, [currentPage, movePillTo]);

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + TAB_BAR_BOTTOM_OFFSET, marginHorizontal: BAR_MARGIN }]} pointerEvents="box-none">
      <View
        style={[
          styles.shadowWrap,
          {
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.5 : 0.22,
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 55 : 80}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.container,
            {
              backgroundColor: isDark ? 'rgba(24,24,26,0.55)' : 'rgba(255,255,255,0.72)',
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingPill,
              {
                left: pillX,
                width: pillWidth,
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: isDark ? 0.55 : 0.4,
                shadowRadius: 10,
                elevation: 8,
              },
            ]}
          >
            <LinearGradient
              colors={TAB_PILL_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {TABS.map((tab, i) => (
            <TabItem
              key={tab.page}
              tab={tab}
              active={currentPage === tab.page}
              colors={colors}
              onPress={() => goToPage(tab.page)}
              onLayout={handleTabLayout(tab.page)}
              magnet={magnetValuesRef[i]}
            />
          ))}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'stretch',
  },
  shadowWrap: {
    borderRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 12,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: BAR_PADDING,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  iconPill: {
    width: 44,
    height: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    minWidth: 0,
    paddingHorizontal: 14,
    borderRadius: 18,
    gap: 6,
  },
  slidingPill: {
    position: 'absolute',
    top: (TAB_BAR_HEIGHT - 44) / 2,
    height: 44,
    borderRadius: 18,
    overflow: 'hidden',
  },
  label: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
