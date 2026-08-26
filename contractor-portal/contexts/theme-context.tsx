import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const STORAGE_KEY = 'jobops:color-scheme';

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = ColorScheme | 'black';

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

const palettes: Record<ThemeMode, AppThemeColors> = {
  light: {
    background: '#F3F7FC', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceMuted: '#DCEAF7',
    text: '#09192D', textMuted: '#405C78', border: '#9FB8D1', primary: '#1D4ED8', primaryStrong: '#1E3A8A',
    header: '#09192D', accent: '#1D4ED8', danger: '#D9364F', success: '#168A5B', input: '#F7FAFD',
  },
  dark: {
    background: '#050B14', surface: '#0F172A', surfaceElevated: '#0F172A', surfaceMuted: '#0F172A',
    text: '#F7FAFF', textMuted: '#9FB7D5', border: '#243B5C', primary: '#1D4ED8', primaryStrong: '#2563EB',
    header: '#09192D', accent: '#1D4ED8', danger: '#FF5A5F', success: '#28D17C', input: '#0F172A',
  },
  black: {
    background: '#000000', surface: '#0A0A0A', surfaceElevated: '#111113', surfaceMuted: '#18181B',
    text: '#FAFAFA', textMuted: '#A1A1AA', border: '#2A2A2E', primary: '#FFFFFF', primaryStrong: '#E4E4E7',
    header: '#000000', accent: '#FFFFFF', danger: '#F87171', success: '#22C55E', input: '#111113',
  },
};

type ThemeContextValue = {
  colorScheme: ColorScheme;
  themeMode: ThemeMode;
  colors: AppThemeColors;
  navigationTheme: NavigationTheme;
  toggleColorScheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemeMode | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'black') setPreference(stored);
    });
  }, []);

  const themeMode: ThemeMode = preference ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const colorScheme: ColorScheme = themeMode === 'light' ? 'light' : 'dark';
  const colors = palettes[themeMode];
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
    themeMode,
    colors,
    navigationTheme,
    toggleColorScheme: () => {
      const next: ThemeMode = colorScheme === 'dark' ? 'light' : 'dark';
      setPreference(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
    },
    setThemeMode: (mode) => {
      setPreference(mode);
      void AsyncStorage.setItem(STORAGE_KEY, mode);
    },
  }), [colorScheme, colors, navigationTheme, themeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}
