import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './contexts/ThemeContext';
import { useMainSwiper } from './contexts/MainSwiperContext';

const TABS = [
  { page: 0, label: 'Recherche', icon: 'search-outline', iconActive: 'search' },
  { page: 1, label: 'Lieux', icon: 'location-outline', iconActive: 'location' },
  { page: 2, label: 'Compte', icon: 'person-outline', iconActive: 'person' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_MARGIN = 16;
const BAR_PADDING = 8;
const BAR_WIDTH = SCREEN_WIDTH - BAR_MARGIN * 2;
const TAB_WIDTH = (BAR_WIDTH - BAR_PADDING * 2) / TABS.length;

function TabItem({ tab, active, colors, isDark, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      tension: 220,
      friction: 16,
    }).start();
  }, [active, lift]);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      style={styles.tab}
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
        <View
          style={[
            styles.iconPill,
            active && {
              backgroundColor: colors.accent,
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.5 : 0.35,
              shadowRadius: 8,
              elevation: 6,
            },
          ]}
        >
          <Ionicons
            name={active ? tab.iconActive : tab.icon}
            size={23}
            color={active ? '#ffffff' : colors.textMuted}
          />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function MainTabBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { goToPage, currentPage } = useMainSwiper();
  const indicatorX = useRef(new Animated.Value(currentPage * TAB_WIDTH)).current;

  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: currentPage * TAB_WIDTH,
      useNativeDriver: true,
      tension: 220,
      friction: 22,
    }).start();
  }, [currentPage, indicatorX]);

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.98)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.45 : 0.22,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: TAB_WIDTH,
              left: BAR_PADDING,
              backgroundColor: colors.accentSoft,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
        {TABS.map((tab) => (
          <TabItem
            key={tab.page}
            tab={tab}
            active={currentPage === tab.page}
            colors={colors}
            isDark={isDark}
            onPress={() => goToPage(tab.page)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    width: BAR_WIDTH,
    height: 68,
    paddingHorizontal: BAR_PADDING,
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    borderRadius: 26,
  },
  tab: {
    width: TAB_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPill: {
    width: 48,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
