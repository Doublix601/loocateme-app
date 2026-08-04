import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useVibeTheme } from '../hooks/useVibeTheme';

/**
 * StoryUnseenBubble
 *
 * Bulle "X nouvelle(s) story", avec flèche pointant vers le bas, à afficher
 * au-dessus de l'anneau StoryRingAvatar tant que des stories n'ont pas été vues.
 */
const StoryUnseenBubble = ({ count }) => {
  const { palette, radius, spacing, shadows } = useVibeTheme();

  if (!count) return null;

  const label = count === 1 ? '1 nouvelle story' : `${count} nouvelles stories`;
  const bg = palette.accent;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: bg,
            borderRadius: radius.md,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
          },
          shadows.floating,
        ]}
      >
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={[styles.arrow, { borderTopColor: bg }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});

export default StoryUnseenBubble;
