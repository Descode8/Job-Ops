import { ThemeProvider } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AppThemeProvider, useAppTheme } from '@/contexts/theme-context';
import { UploadProvider } from '@/contexts/upload-context';
import { ThemedAlertHost } from '@/components/themed-alert';
import { AssignmentNotificationHost } from '@/components/assignment-notification-host';
import { AdminResponseNotificationHost } from '@/components/admin-response-notification-host';
import '@/lib/typography';
import { preloadMapIcons } from '@/lib/map-directions';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Trebuchet: require('@/assets/fonts/trebuc.ttf'),
    TrebuchetItalic: require('@/assets/fonts/Trebuchet-MS-Italic.ttf'),
  });

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050B14' }}><Image source={require('@/assets/images/JobOps_alt.png')} style={{ width: 180, height: 180 }} contentFit="contain" /></View>;
  }
  return <AppThemeProvider><UploadProvider><ThemedRootLayout /></UploadProvider></AppThemeProvider>;
}

function ThemedRootLayout() {
  const { colors, navigationTheme, themeMode } = useAppTheme();
  useEffect(() => { void preloadMapIcons(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: themeMode === 'light' ? '#FBFEFC' : '#000000' }}>
      {themeMode === 'light' && <Image source={require('@/assets/images/light-mode-background.svg')} style={{ position: 'absolute', inset: 0 }} contentFit="fill" />}
      {themeMode === 'dark' && <LinearGradient colors={['#152331', '#000000']} style={{ position: 'absolute', inset: 0 }} />}
      <ThemeProvider value={navigationTheme}>
        <Stack initialRouteName="index" screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="set-password" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="work-order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <AssignmentNotificationHost />
        <AdminResponseNotificationHost />
        <ThemedAlertHost />
        <StatusBar style={navigationTheme.dark ? 'light' : 'dark'} />
      </ThemeProvider>
    </View>
  );
}
