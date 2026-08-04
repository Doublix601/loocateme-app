import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './contexts/ThemeContext';
import { useMainSwiper } from './contexts/MainSwiperContext';

const TABS = [
  { page: 0, label: 'Recherche', icon: 'search-outline', iconActive: 'search' },
  { page: 1, label: 'Lieux', icon: 'list-outline', iconActive: 'list' },
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
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
          borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
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
            <Ionicons
              name={active ? tab.iconActive : tab.icon}
              size={24}
              color={active ? colors.accent : colors.textMuted}
            />
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
    height: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
