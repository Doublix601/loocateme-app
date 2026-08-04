import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './contexts/ThemeContext';
import IconButton from './IconButton';

const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// variant="bar": in-flow header row with a centered title (PremiumPaywallScreen pattern).
// variant="floating": buttons absolutely positioned over immersive content
// (MyAccountScreen/UserProfileScreen pattern). `right` items stack vertically
// 46px apart, matching the app's existing offsets.
export default function ScreenHeader({ title, subtitle, left, right, variant = 'bar', style, titleColor, noPadding }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const leftBtn = left === undefined ? { icon: 'chevron-back', onPress: () => navigation.goBack() } : left;
  const leftItems = toArray(leftBtn);
  const rightItems = toArray(right);
  const floatingBg = isDark ? 'rgba(0,194,203,0.15)' : 'rgba(0,194,203,0.10)';

  if (variant === 'floating') {
    return (
      <>
        {leftItems.map((item, idx) => (
          <IconButton
            key={`left-${idx}`}
            icon={item.icon}
            onPress={item.onPress}
            accessibilityLabel={item.accessibilityLabel}
            style={[
              styles.floatingLeft,
              { top: insets.top + 10 + idx * 46, backgroundColor: item.backgroundColor || floatingBg },
            ]}
          />
        ))}
        {rightItems.map((item, idx) => (
          <IconButton
            key={`right-${idx}`}
            icon={item.icon}
            onPress={item.onPress}
            accessibilityLabel={item.accessibilityLabel}
            style={[
              styles.floatingRight,
              { top: insets.top + 10 + idx * 46, backgroundColor: item.backgroundColor || floatingBg },
            ]}
          />
        ))}
      </>
    );
  }

  return (
    <View style={style}>
      <View style={[styles.barRow, { paddingTop: noPadding ? 0 : insets.top + 12 }]}>
        {leftItems[0] ? (
          <IconButton icon={leftItems[0].icon} onPress={leftItems[0].onPress} accessibilityLabel={leftItems[0].accessibilityLabel} />
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.titleWrap}>
          {!!title && <Text style={[styles.title, { color: titleColor || colors.textPrimary }]}>{title}</Text>}
        </View>
        {rightItems.length > 0 ? (
          <View style={styles.rightCluster}>
            {rightItems.map((item, idx) =>
              item.render ? (
                <View key={idx} style={idx > 0 ? styles.rightSpacing : undefined}>
                  {item.render()}
                </View>
              ) : (
                <IconButton
                  key={idx}
                  icon={item.icon}
                  onPress={item.onPress}
                  accessibilityLabel={item.accessibilityLabel}
                  style={idx > 0 ? styles.rightSpacing : undefined}
                />
              ),
            )}
          </View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      {!!subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  spacer: { width: 40 },
  rightCluster: { flexDirection: 'row', alignItems: 'center' },
  rightSpacing: { marginLeft: 8 },
  floatingLeft: { position: 'absolute', left: 16, zIndex: 5 },
  floatingRight: { position: 'absolute', right: 16, zIndex: 5 },
});
