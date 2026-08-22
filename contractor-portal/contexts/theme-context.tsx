import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const STORAGE_KEY = 'contractor-portal:color-scheme';

export type ColorScheme = 'light' | 'dark';

export type AppThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryStrong: string;
  header: string;
  accent: string;
  danger: string;
  success: string;
  input: string;
};

const palettes: Record<ColorScheme, AppThemeColors> = {
  light: {
    background: '#F4F7FA', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceMuted: '#EAF1F8',
    text: '#172033', textMuted: '#566273', border: '#D7E1EC', primary: '#1E67B2', primaryStrong: '#003366',
    header: '#003366', accent: '#F3EC35', danger: '#B3261E', success: '#2E8B57', input: '#F8FAFC',
  },
  dark: {
    background: '#07111F', surface: '#0E1B2B', surfaceElevated: '#142438', surfaceMuted: '#172A40',
    text: '#F4F7FB', textMuted: '#A9B8C9', border: '#2B4057', primary: '#5CB7F5', primaryStrong: '#86CCFA',
    header: '#061B32', accent: '#F3EC35', danger: '#FF817A', success: '#63D69A', input: '#101F31',
  },
};

type ThemeContextValue = {
  colorScheme: ColorScheme;
  colors: AppThemeColors;
  navigationTheme: NavigationTheme;
  toggleColorScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ColorScheme | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setPreference(stored);
    });
  }, []);

  const colorScheme: ColorScheme = preference ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const colors = palettes[colorScheme];
  const navigationTheme = useMemo<NavigationTheme>(() => ({
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  }), [colorScheme, colors]);

  const value = useMemo<ThemeContextValue>(() => ({
    colorScheme,
    colors,
    navigationTheme,
    toggleColorScheme: () => {
      const next = colorScheme === 'dark' ? 'light' : 'dark';
      setPreference(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
    },
  }), [colorScheme, colors, navigationTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}
