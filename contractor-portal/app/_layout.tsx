import { ThemeProvider } from '@react-navigation/native';
import { Image, ImageBackground } from 'expo-image';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AppThemeProvider, useAppTheme } from '@/contexts/theme-context';
import { ThemedAlertHost } from '@/components/themed-alert';
import { AssignmentNotificationHost } from '@/components/assignment-notification-host';
import { AdminResponseNotificationHost } from '@/components/admin-response-notification-host';
import { ContractorOfferNotificationHost } from '@/components/contractor-offer-notification-host';
import '@/lib/typography';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Trebuchet: require('@/assets/fonts/trebuc.ttf'),
    TrebuchetItalic: require('@/assets/fonts/Trebuchet-MS-Italic.ttf'),
  });

  if (!fontsLoaded && !fontError) {
    return <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} contentFit="cover"><Image source={require('@/assets/images/Marty-Wright-Home-Sales_anderson.png')} style={{ width: 260, height: 110 }} contentFit="contain" /></ImageBackground>;
  }
  return <AppThemeProvider><ThemedRootLayout /></AppThemeProvider>;
}

function ThemedRootLayout() {
  const { colors, navigationTheme } = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={navigationTheme}>
        <Stack initialRouteName="index" screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="set-password" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="work-order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <AssignmentNotificationHost />
        <ContractorOfferNotificationHost />
        <AdminResponseNotificationHost />
        <ThemedAlertHost />
        <StatusBar style={navigationTheme.dark ? 'light' : 'dark'} />
      </ThemeProvider>
    </View>
  );
}
