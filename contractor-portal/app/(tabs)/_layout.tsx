import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFF200',
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarStyle: { backgroundColor: '#062C5B', borderTopColor: '#1E67B2' },
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
          title: 'Assigned jobs',
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
          title: 'New order',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="square.and.pencil" color={color} />,
        }}
      />
    </Tabs>
  );
}
