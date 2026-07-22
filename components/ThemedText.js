import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from './contexts/ThemeContext';

/**
 * A Themed Text component that automatically adapts its color based on the current theme.
 * Defaults to textPrimary.
 */
const ThemedText = ({ style, type = 'primary', ...props }) => {
  const { colors } = useTheme();

  const getTextColor = () => {
    switch (type) {
      case 'secondary':
        return colors.textSecondary;
      case 'muted':
        return colors.textMuted;
      case 'accent':
        return colors.accent;
      case 'danger':
        return colors.danger;
      case 'white':
        return colors.white;
      case 'primary':
      default:
        return colors.textPrimary;
    }
  };

  return <Text style={[{ color: getTextColor() }, style]} {...props} />;
};

export default ThemedText;
