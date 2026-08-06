import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './contexts/ThemeContext';
import { useMainSwiper } from './contexts/MainSwiperContext';

const TABS = [
  { page: 0, label: 'Recherche', icon: 'search-outline', iconActive: 'search' },
  { page: 1, label: 'Lieux', icon: 'location-outline', iconActive: 'location' },
  { page: 2, label: 'Compte', icon: 'person-outline', iconActive: 'person' },
];

export default function MainTabBar() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { goToPage, currentPage } = useMainSwiper();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom + 8,
          paddingTop: 22,
          backgroundColor: colors.surface,
          borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = currentPage === tab.page;
        return (
          <TouchableOpacity
            key={tab.page}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            style={styles.tab}
            activeOpacity={0.7}
            onPress={() => goToPage(tab.page)}
          >
            <View
              style={[
                styles.iconPill,
                active && {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.accentSoft || 'rgba(0,0,0,0.06)',
                  shadowColor: colors.accent,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.35 : 0.18,
                  shadowRadius: 6,
                  elevation: active ? 3 : 0,
                },
              ]}
            >
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={22}
                color={active ? colors.accent : colors.textMuted}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    height: 92,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPill: {
    width: 52,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
