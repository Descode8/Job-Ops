import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/contexts/theme-context';
import { AppText as Text } from '@/components/app-typography';

const ACTIVE_BLUE = '#1D4ED8';
const PAPER = '#FFFFFF';
const CONTRACTOR_ROUTES = new Set(['index', 'explore', 'schedule', 'completed']);
const ADMIN_SHORTCUT_ORDER = ['index', 'explore', 'schedule', 'home-progress', 'work-order', 'completed-home', 'completed', 'admin'];

export function CarouselTabBar({ state, descriptors, navigation, isAdmin }: BottomTabBarProps & { isAdmin: boolean }) {
  const insets = useSafeAreaInsets();
  const { colorScheme, themeMode, colors } = useAppTheme();
  const capsuleShadow = colorScheme === 'dark'
    ? { shadowColor: '#1D4ED8', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: -1 }, elevation: 4 }
    : { shadowColor: '#001A33', shadowOpacity: 0.38, shadowRadius: 8, shadowOffset: { width: 0, height: -4 }, elevation: 10 };
  const [isHidden, setIsHidden] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => (isAdmin || CONTRACTOR_ROUTES.has(route.name)) && (descriptors[route.key].options as typeof descriptors[string]['options'] & { href?: string | null }).href !== null),
    [descriptors, isAdmin, state.routes]
  );
  const activeRoute = state.routes[state.index];
  const selectedVisibleIndex = visibleRoutes.findIndex((route) => route.key === activeRoute.key);
  const adminRoutes = ADMIN_SHORTCUT_ORDER
    .map((name) => visibleRoutes.find((route) => route.name === name))
    .filter((route): route is (typeof visibleRoutes)[number] => Boolean(route));
  const selectedAdminIndex = adminRoutes.findIndex((route) => route.key === activeRoute.key);
  const selectRoute = (route: (typeof visibleRoutes)[number]) => {
    const tabEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!tabEvent.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  const handlePanResponder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 8,
    onMoveShouldSetPanResponder: (_, gesture) => Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 8,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 18) {
        if (isGridOpen) setIsGridOpen(false);
        else setIsHidden(true);
      }
      else if (gesture.dy < -18 && isAdmin) setIsGridOpen(true);
      else if (isAdmin && Math.abs(gesture.dx) > 28 && selectedAdminIndex >= 0) {
        const direction = gesture.dx < 0 ? 1 : -1;
        const nextIndex = (selectedAdminIndex + direction + adminRoutes.length) % adminRoutes.length;
        selectRoute(adminRoutes[nextIndex]);
      }
    },
  });

  useEffect(() => {
    if (selectedVisibleIndex < 0 && visibleRoutes[0]) {
      navigation.navigate(visibleRoutes[0].name, visibleRoutes[0].params);
    }
  }, [navigation, selectedVisibleIndex, visibleRoutes]);

  if (isHidden) {
    return (
      <View style={[styles.hiddenBackground, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show navigation tabs"
          accessibilityHint="Tap to show the navigation tabs"
          onPress={() => setIsHidden(false)}
          style={({ pressed }) => [styles.tabsRestoreButton, pressed && styles.pressedItem]}>
          <View style={styles.tabsRestoreGrid}>
            {Array.from({ length: 9 }, (_, index) => (
              <View key={index} style={[styles.tabsRestoreSquare, { backgroundColor: colorScheme === 'dark' ? '#FFFFFF' : '#050B14' }]} />
            ))}
          </View>
        </Pressable>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View {...handlePanResponder.panHandlers} style={[styles.background, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>
        <View style={[styles.capsuleShadow, capsuleShadow, themeMode === 'black' && styles.blackNavSurface]}><View style={[styles.capsule, themeMode === 'black' && styles.blackNavSurface]}>
          <View style={styles.fixedContent}>
            {visibleRoutes.map((route) => {
              const { options } = descriptors[route.key];
              const focused = route.key === activeRoute.key;
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name;
              const color = focused ? (themeMode === 'black' ? PAPER : ACTIVE_BLUE) : PAPER;
              return <View key={route.key} style={styles.fixedItemFrame}><Pressable accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} accessibilityLabel={options.tabBarAccessibilityLabel} testID={options.tabBarButtonTestID} onPress={() => selectRoute(route)} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} style={({ pressed }) => [styles.fixedItem, pressed && styles.pressedItem]}><View style={[styles.iconWell, focused && styles.activeIconWell, focused && themeMode === 'black' && styles.blackActiveIcon]}>{options.tabBarIcon?.({ focused, color, size: 35 })}</View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.fixedLabel, focused && styles.fixedActiveLabel, { color }]}>{label}</Text></Pressable></View>;
            })}
          </View>
        </View></View>
      </View>
    );
  }

  const carouselRoutes = [-2, -1, 0, 1, 2].map((offset) => adminRoutes[(selectedAdminIndex + offset + adminRoutes.length) % adminRoutes.length]);
  const expandedRoutes = [activeRoute, ...adminRoutes.filter((route) => route.key !== activeRoute.key)];
  return <View {...(!isGridOpen ? handlePanResponder.panHandlers : {})} style={[styles.background, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>{!isGridOpen && <View style={[styles.adminBarShadow, capsuleShadow, themeMode === 'black' && styles.blackNavSurface]}><View style={[styles.adminBar, themeMode === 'black' && styles.blackNavSurface]}>
    {carouselRoutes.map((route, index) => { const { options } = descriptors[route.key]; const focused = index === 2; const color = focused ? (themeMode === 'black' ? PAPER : ACTIVE_BLUE) : PAPER; const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name; return <Pressable key={`${route.key}-${index}`} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} accessibilityLabel={label} onPress={() => selectRoute(route)} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} style={({ pressed }) => [styles.adminBarItem, focused && styles.adminCreateItem, pressed && styles.pressedItem]}><View style={focused ? [styles.adminCreateButton, styles.adminCreateButtonFocused, themeMode === 'black' && styles.blackActiveIcon] : styles.adminIcon}>{options.tabBarIcon?.({ focused, color, size: focused ? 38 : 24 })}</View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.adminBarLabel, focused && styles.adminActiveLabel, { color }]}>{label}</Text></Pressable>; })}
  </View></View>}<Modal visible={isGridOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setIsGridOpen(false)}><Pressable style={[styles.gridBackdrop, { paddingBottom: Math.max(insets.bottom + 20, 28) }]} onPress={() => setIsGridOpen(false)}><BlurView pointerEvents="none" intensity={100} tint="systemThickMaterialDark" experimentalBlurMethod="dimezisBlurView" blurReductionFactor={1} style={StyleSheet.absoluteFill} /><View pointerEvents="none" style={styles.blurScrim} /><Pressable {...handlePanResponder.panHandlers} style={styles.expandedGrid} onPress={(event) => event.stopPropagation()}><Text style={styles.gridTitle}>ALL TABS</Text><View style={styles.gridContent}>{expandedRoutes.map((route, index) => { const { options } = descriptors[route.key]; const focused = index === 0; const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name; return <Pressable key={`expanded-${route.key}`} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} accessibilityLabel={label} onPress={() => { setIsGridOpen(false); selectRoute(route); }} style={({ pressed }) => [styles.expandedItem, pressed && styles.expandedItemPressed]}><View style={focused ? [styles.adminCreateButton, styles.adminCreateButtonFocused] : styles.expandedIcon}>{options.tabBarIcon?.({ focused, color: focused ? ACTIVE_BLUE : PAPER, size: focused ? 38 : 32 })}</View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.expandedLabel, { color: focused ? ACTIVE_BLUE : PAPER }]}>{label}</Text></Pressable>; })}</View></Pressable></Pressable></Modal></View>;
}

const styles = StyleSheet.create({
  background: { paddingHorizontal: 10, paddingTop: 18, backgroundColor: '#050B14', overflow: 'visible' },
  hiddenBackground: { paddingHorizontal: 10, paddingTop: 6, alignItems: 'center', backgroundColor: '#050B14' },
  tabsRestoreButton: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  tabsRestoreGrid: { width: 38, height: 38, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', justifyContent: 'space-between' },
  tabsRestoreSquare: { width: 10, height: 10, borderRadius: 2 },
  capsulePlaceholder: { height: 116 },
  gridBackdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, backgroundColor: 'transparent' },
  blurScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 11, 20, 0.3)' },
  expandedGrid: { width: '100%', paddingTop: 22, paddingBottom: 18 },
  gridPanel: { width: '100%', borderWidth: 0.5, borderColor: '#243B5C', borderRadius: 18, padding: 14, backgroundColor: '#050B14' },
  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, marginBottom: 10 },
  gridTitle: { color: '#F4F7FB', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 18, textAlign: 'center' },
  gridContent: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 22 },
  expandedItem: { width: '25%', minHeight: 92, alignItems: 'center', justifyContent: 'flex-start' },
  expandedItemPressed: { opacity: 0.7 },
  expandedIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  expandedLabel: { width: '100%', paddingHorizontal: 3, marginTop: 7, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  gridItem: { width: '23%', minHeight: 72, borderWidth: 0.5, borderColor: '#243B5C', borderRadius: 11, backgroundColor: '#243B5C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8 },
  gridItemActive: { borderColor: ACTIVE_BLUE, backgroundColor: '#0E1F35' },
  gridIcon: { height: 31, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { width: '100%', fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  capsuleShadow: { height: 116, borderRadius: 29, transform: [{ translateY: 10 }], backgroundColor: '#0F172A' },
  capsule: { flex: 1, borderRadius: 29, overflow: 'hidden', backgroundColor: '#0F172A' },
  adminBarShadow: { height: 82, borderRadius: 20, transform: [{ translateY: 4 }], backgroundColor: '#0F172A' },
  adminBar: { flex: 1, borderWidth: 0.5, borderColor: '#243B5C', borderRadius: 20, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, overflow: 'visible' },
  adminBarItem: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  adminCreateItem: { transform: [{ translateY: -14 }] },
  adminIcon: { height: 30, alignItems: 'center', justifyContent: 'center' },
  adminBarLabel: { fontSize: 8, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  adminActiveLabel: { width: 92, color: ACTIVE_BLUE, fontSize: 13, lineHeight: 15, fontWeight: '900', marginTop: 8 },
  adminCreateButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#243B5C', borderWidth: 1, borderColor: '#243B5C', alignItems: 'center', justifyContent: 'center' },
  adminCreateButtonFocused: { backgroundColor: '#0E1F35', borderWidth: 2, borderColor: PAPER },
  carouselContent: { alignItems: 'center' },
  fixedContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fixedItemFrame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fixedItem: { width: '100%', minHeight: 112, alignItems: 'center', justifyContent: 'center' },
  fixedLabel: { width: '100%', paddingHorizontal: 4, marginTop: 3, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  fixedActiveLabel: { fontSize: 12, fontWeight: '900' },
  itemFrame: { width: 96, alignItems: 'center', justifyContent: 'center' },
  activeItemFrame: { zIndex: 10 },
  item: { alignItems: 'center', justifyContent: 'center', minHeight: 112, width: 96 },
  pressedItem: { opacity: 0.82, backgroundColor: '#0E1F35' },
  iconWell: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  activeIconWell: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: ACTIVE_BLUE, backgroundColor: '#0F172A' },
  blackNavSurface: { backgroundColor: '#0A0A0A' },
  blackActiveIcon: { backgroundColor: '#18181B', borderColor: '#FFFFFF' },
  label: { fontSize: 10, fontWeight: '700', textAlign: 'center', width: 82, marginTop: 3 },
  activeGroup: { alignItems: 'center', justifyContent: 'center' },
  activeLabel: { fontSize: 14, fontWeight: '900', width: 144, paddingHorizontal: 4, marginBottom: 5, textAlign: 'center' },
});
