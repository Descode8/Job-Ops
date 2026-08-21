import { Tabs } from 'expo-router';
import { ImageBackground } from 'expo-image';
import React, { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { void (async () => { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; const { data } = await supabase.from('contractors').select('is_admin').eq('auth_user_id', auth.user.id).eq('is_active', true).single(); setIsAdmin(Boolean(data?.is_admin)); })(); }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFF200',
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarStyle: { backgroundColor: 'transparent', borderTopColor: '#1E67B2' },
        tabBarBackground: () => <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={{ flex: 1 }} contentFit="cover" />,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="briefcase.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="service"
        options={{
          title: 'Service',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="wrench.and.screwdriver.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="work-order"
        options={{
          title: 'New WO',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="square.and.pencil" color={color} />,
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: 'Completed WO',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.seal.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: 'Admin', href: isAdmin ? undefined : null, tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} /> }}
      />
    </Tabs>
  );
}
