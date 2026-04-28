import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_MODE_KEY = 'loocateme_theme_mode'; // 'light' | 'dark' | 'system'

const lightPalette = {
  background: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f5f5f5',
  border: '#e6e6e6',
  textPrimary: '#222',
  textSecondary: '#555',
  textMuted: '#777',
  accent: '#00c2cb',
  accentSoft: '#e6fbfc',
  danger: '#f44336',
  white: '#ffffff',
  inputBackground: '#f8f9fa',
  placeholder: '#999999',
};

const darkPalette = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#222',
  border: '#2c2c2c',
  textPrimary: '#f2f2f2',
  textSecondary: '#d0d0d0',
  textMuted: '#aaaaaa',
  accent: '#00c2cb',
  accentSoft: '#083638',
  danger: '#ef5350',
  white: '#ffffff',
  inputBackground: '#222',
  placeholder: '#888888',
};

const NavigationLightTheme = {
  dark: false,
  colors: {
    primary: lightPalette.accent,
    background: lightPalette.background,
    card: lightPalette.surface,
    text: lightPalette.textPrimary,
    border: lightPalette.border,
    notification: lightPalette.danger,
  },
};

const NavigationDarkTheme = {
  dark: true,
  colors: {
    primary: darkPalette.accent,
    background: darkPalette.background,
    card: darkPalette.surface,
    text: darkPalette.textPrimary,
    border: darkPalette.border,
    notification: darkPalette.danger,
  },
};

const ThemeContext = createContext({
  mode: 'system',
  setMode: () => {},
  colors: lightPalette,
  navTheme: NavigationLightTheme,
});

export function ThemeProvider({ children }) {
  // Default to system to honor device preference out of the box
  const [mode, setModeState] = useState('system');
  const systemScheme = useColorScheme() || 'light';
  const [internalSystemScheme, setInternalSystemScheme] = useState(systemScheme);

  useEffect(() => {
    // Debug log for Android theme detection
    console.log(`[ThemeContext] Initial system scheme: ${systemScheme}`);
    setInternalSystemScheme(systemScheme);
  }, [systemScheme]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      console.log(`[ThemeContext] Appearance changed: ${colorScheme}`);
      if (colorScheme) {
        setInternalSystemScheme(colorScheme);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') {
          setModeState(saved);
        } else {
          // If nothing saved, ensure we start in 'system'
          setModeState('system');
        }
      } catch (_) {
        setModeState('system');
      }
    })();
  }, []);

  const setMode = async (next) => {
    const value = (next === 'dark' || next === 'system') ? next : 'light';
    setModeState(value);
    try { await AsyncStorage.setItem(THEME_MODE_KEY, value); } catch (_) {}
  };

  const isDark = (mode === 'system' ? internalSystemScheme === 'dark' : mode === 'dark');
  const colors = isDark ? darkPalette : lightPalette;
  const navTheme = isDark ? NavigationDarkTheme : NavigationLightTheme;

  const value = useMemo(() => ({ mode, setMode, colors, isDark, navTheme }), [mode, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook to create dynamic styles based on the current theme.
 * @param {(theme: {colors: any, isDark: boolean}) => any} creator
 */
export function useStyles(creator) {
  const theme = useTheme();
  return useMemo(() => creator(theme), [theme, creator]);
}

export { THEME_MODE_KEY };
