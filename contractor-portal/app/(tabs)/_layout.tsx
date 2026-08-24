import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';

import { CarouselTabBar } from '@/components/carousel-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { void (async () => { const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return; const { data } = await supabase.from('contractors').select('is_admin').eq('auth_user_id', auth.user.id).eq('is_active', true).single(); setIsAdmin(Boolean(data?.is_admin)); })(); }, []);

  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <CarouselTabBar {...props} isAdmin={isAdmin} />}
      screenOptions={{
        headerShown: false,
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
          title: isAdmin ? 'Services' : 'Work Orders',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons size={28} name="tools" color={color} />,
        }}
      />
      <Tabs.Screen
        name="home-progress"
        options={{
          title: 'Home Progress',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet.clipboard.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="completed-home"
        options={{
          title: 'Complete Home',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <MaterialIcons size={28} name="home-work" color={color} />,
        }}
      />
      <Tabs.Screen
        name="work-order"
        options={{
          title: 'Create WO',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <MaterialCommunityIcons size={28} name="text-box-plus" color={color} />,
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: isAdmin ? 'Complete WO' : 'Complete Work Orders',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons size={28} name="clipboard-check" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: 'Admin', href: isAdmin ? undefined : null, tabBarIcon: ({ color }) => <MaterialIcons size={28} name="manage-accounts" color={color} /> }}
      />
    </Tabs>
  );
}
