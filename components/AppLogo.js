import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { useTheme } from './contexts/ThemeContext';

const AppLogo = ({ width = 150, height = 150, style }) => {
  const { isDark, colors } = useTheme();

  // If the PNG has a white background, tintColor can help "recolor" it.
  // However, tintColor fills all non-transparent pixels with the color.
  // If the background IS white and NOT transparent, tintColor will color the WHOLE rectangle.
  // If the logo itself is black/colored on a white background, we have a problem.

  // BEST PRACTICE: Use a transparent PNG or an SVG.

  return (
    <Image
      source={require('../assets/appIcons/SquareBanner.png')}
      style={[
        {
          width: width,
          height: height,
          backgroundColor: 'transparent',
        },
        // Only apply tintColor if you want to force the logo to a specific theme color
        // and if the logo has a transparent background.
        // isDark ? { tintColor: colors.textPrimary } : null,
        style,
      ]}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
};

export default AppLogo;
