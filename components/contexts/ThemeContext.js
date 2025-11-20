import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_MODE_KEY = 'loocateme_theme_mode'; // 'light' | 'dark' | 'system'

const lightPalette = {
  bg: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f5f5f5',
  border: '#e6e6e6',
  textPrimary: '#222',
  textSecondary: '#555',
  textMuted: '#777',
  accent: '#00c2cb',
  accentSoft: '#e6fbfc',
  danger: '#f44336',
};

const darkPalette = {
  bg: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#222',
  border: '#2c2c2c',
  textPrimary: '#f2f2f2',
  textSecondary: '#d0d0d0',
  textMuted: '#aaaaaa',
  accent: '#00c2cb',
  accentSoft: '#083638',
  danger: '#ef5350',
};

const ThemeContext = createContext({
  mode: 'system',
  setMode: () => {},
  colors: lightPalette,
});

export function ThemeProvider({ children }) {
  // Default to system to honor device preference out of the box
  const [mode, setModeState] = useState('system');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme?.() || 'light');

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
    const sub = Appearance.addChangeListener?.(({ colorScheme }) => {
      setSystemScheme(colorScheme || 'light');
    });
    return () => {
      try { sub && sub.remove && sub.remove(); } catch (_) {}
    };
  }, []);

  const setMode = async (next) => {
    const value = (next === 'dark' || next === 'system') ? next : 'light';
    setModeState(value);
    try { await AsyncStorage.setItem(THEME_MODE_KEY, value); } catch (_) {}
  };

  const isDark = (mode === 'system' ? systemScheme === 'dark' : mode === 'dark');
  const colors = isDark ? darkPalette : lightPalette;

  const value = useMemo(() => ({ mode, setMode, colors, isDark }), [mode, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEME_MODE_KEY };
