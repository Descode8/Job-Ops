import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ImageBackground } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/contexts/theme-context';
import { AppText as Text } from '@/components/app-typography';

const ACTIVE_YELLOW = '#FFF200';
const CAROUSEL_OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const CONTRACTOR_ROUTES = new Set(['index', 'explore', 'completed']);
const wrapIndex = (index: number, length: number) => ((index % length) + length) % length;

export function CarouselTabBar({ state, descriptors, navigation, isAdmin }: BottomTabBarProps & { isAdmin: boolean }) {
  const insets = useSafeAreaInsets();
  const { colorScheme, colors } = useAppTheme();
  const capsuleShadow = colorScheme === 'dark'
    ? { shadowColor: '#5CB7F5', shadowOpacity: 0.32, shadowRadius: 9, shadowOffset: { width: 0, height: -4 }, elevation: 11 }
    : { shadowColor: '#001A33', shadowOpacity: 0.38, shadowRadius: 8, shadowOffset: { width: 0, height: -4 }, elevation: 10 };
  const { width } = useWindowDimensions();
  const [isGridOpen, setIsGridOpen] = useState(false);
  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => (isAdmin || CONTRACTOR_ROUTES.has(route.name)) && (descriptors[route.key].options as typeof descriptors[string]['options'] & { href?: string | null }).href !== null),
    [descriptors, isAdmin, state.routes]
  );
  const visibleCount = Math.min(3, Math.max(visibleRoutes.length, 1));
  const centerSlot = Math.floor(visibleCount / 2);
  const restingStep = 5 - centerSlot;
  const itemWidth = (width - 20) / visibleCount;
  const restingOffset = restingStep * itemWidth;
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(restingOffset)).current;
  const activeRoute = state.routes[state.index];
  const selectedVisibleIndex = visibleRoutes.findIndex((route) => route.key === activeRoute.key);
  const activeIndex = selectedVisibleIndex >= 0 ? selectedVisibleIndex : 0;
  const carouselRoutes = CAROUSEL_OFFSETS.map((offset) => ({
    offset,
    route: visibleRoutes[wrapIndex(activeIndex + offset, visibleRoutes.length)],
  }));
  const handlePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => isAdmin && Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponder: (_, gesture) => isAdmin && Math.abs(gesture.dy) > 8,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -18) setIsGridOpen(true);
      if (gesture.dy > 18) setIsGridOpen(false);
    },
  }), [isAdmin]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: restingOffset, animated: false });
  }, [activeRoute.key, restingOffset, restingStep]);

  useEffect(() => {
    if (selectedVisibleIndex < 0 && visibleRoutes[0]) {
      navigation.navigate(visibleRoutes[0].name, visibleRoutes[0].params);
    }
  }, [navigation, selectedVisibleIndex, visibleRoutes]);

  const selectOffset = (offset: number) => {
    if (offset === 0) return;
    const route = visibleRoutes[wrapIndex(activeIndex + offset, visibleRoutes.length)];
    const tabEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!tabEvent.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const finishScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.round((event.nativeEvent.contentOffset.x - restingOffset) / itemWidth);
    if (offset === 0) return;
    const route = visibleRoutes[wrapIndex(activeIndex + offset, visibleRoutes.length)];
    const tabEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!tabEvent.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const selectRoute = (route: (typeof visibleRoutes)[number]) => {
    const tabEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!tabEvent.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  if (!isAdmin) {
    return (
      <View style={[styles.background, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>
        <View style={[styles.capsuleShadow, capsuleShadow]}><ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.capsule} contentFit="cover">
          <View style={styles.fixedContent}>
            {visibleRoutes.map((route) => {
              const { options } = descriptors[route.key];
              const focused = route.key === activeRoute.key;
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name;
              const color = focused ? ACTIVE_YELLOW : '#9BADC2';
              return <View key={route.key} style={styles.fixedItemFrame}><Pressable accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} accessibilityLabel={options.tabBarAccessibilityLabel} testID={options.tabBarButtonTestID} onPress={() => selectRoute(route)} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} style={({ pressed }) => [styles.fixedItem, pressed && styles.pressedItem]}><View style={[styles.iconWell, focused && styles.activeIconWell]}>{options.tabBarIcon?.({ focused, color, size: 35 })}</View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.fixedLabel, focused && styles.fixedActiveLabel, { color }]}>{label}</Text></Pressable></View>;
            })}
          </View>
        </ImageBackground></View>
      </View>
    );
  }

  return (
    <View {...(!isGridOpen ? handlePanResponder.panHandlers : {})} style={[styles.background, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>
    {isGridOpen && <><View style={styles.capsulePlaceholder} /><Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setIsGridOpen(false)}><Pressable style={[styles.gridBackdrop, { paddingBottom: Math.max(insets.bottom + 16, 24) }]} onPress={() => setIsGridOpen(false)}><Pressable {...handlePanResponder.panHandlers} onPress={(event) => event.stopPropagation()} style={[styles.gridPanel, capsuleShadow]}><View style={styles.gridHeader}><Text style={styles.gridTitle}>ALL TABS</Text></View><View style={styles.gridContent}>{visibleRoutes.map((route) => { const { options } = descriptors[route.key]; const focused = route.key === activeRoute.key; const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name; const color = focused ? ACTIVE_YELLOW : '#9BADC2'; return <Pressable key={`grid-${route.key}`} onPress={() => { setIsGridOpen(false); selectRoute(route); }} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} style={({ pressed }) => [styles.gridItem, focused && styles.gridItemActive, pressed && styles.pressedItem]}><View style={styles.gridIcon}>{options.tabBarIcon?.({ focused, color, size: 27 })}</View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.gridLabel, { color: focused ? ACTIVE_YELLOW : '#C2CEDA' }]}>{label}</Text></Pressable>; })}</View></Pressable></Pressable></Modal></>}
    {!isGridOpen && <View style={[styles.capsuleShadow, capsuleShadow]}><ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.capsule} contentFit="cover">
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        decelerationRate="fast"
        contentOffset={{ x: restingOffset, y: 0 }}
        contentContainerStyle={styles.carouselContent}
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth}
        scrollEventThrottle={16}
        onMomentumScrollEnd={finishScroll}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}>
        {carouselRoutes.map(({ offset, route }, index) => {
          const { options } = descriptors[route.key];
          const focused = offset === 0;
          const centeredAt = (index - centerSlot) * itemWidth;
          const scale = scrollX.interpolate({
            inputRange: [centeredAt - itemWidth * 2, centeredAt - itemWidth, centeredAt, centeredAt + itemWidth, centeredAt + itemWidth * 2],
            outputRange: [1, 1, 1, 1, 1],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange: [centeredAt - itemWidth * 2, centeredAt - itemWidth, centeredAt, centeredAt + itemWidth, centeredAt + itemWidth * 2],
            outputRange: [0.42, 0.72, 1, 0.72, 0.42],
            extrapolate: 'clamp',
          });
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name;
          const color = focused ? ACTIVE_YELLOW : '#9BADC2';
          const iconColor = color;
          const activeClearance = offset === -1 ? -12 : offset === 1 ? 12 : 0;

          return (
            <Animated.View key={`${route.key}-${offset}`} style={[styles.itemFrame, focused && styles.activeItemFrame, { width: itemWidth, opacity, transform: [{ translateX: activeClearance }, { scale }] }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={() => selectOffset(offset)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.item, pressed && styles.pressedItem]}>
                {focused ? <>
                  <View style={styles.activeGroup}>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.activeLabel, { color }]}>{label}</Text>
                    <View style={[styles.iconWell, styles.activeIconWell]}>{options.tabBarIcon?.({ focused, color: iconColor, size: 35 })}</View>
                  </View>
                </> : <>
                  <View style={styles.iconWell}>{options.tabBarIcon?.({ focused, color: iconColor, size: 35 })}</View>
                  <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
                </>}
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </ImageBackground></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  background: { paddingHorizontal: 10, paddingTop: 18, backgroundColor: '#07111F', overflow: 'visible' },
  capsulePlaceholder: { height: 116 },
  gridBackdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 10, backgroundColor: 'rgba(0, 0, 0, 0.08)' },
  gridPanel: { width: '100%', borderWidth: 1, borderColor: '#2B4057', borderRadius: 18, padding: 14, backgroundColor: '#07111F' },
  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, marginBottom: 10 },
  gridTitle: { color: '#F4F7FB', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  gridContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '23%', minHeight: 72, borderWidth: 1, borderColor: '#2B4057', borderRadius: 11, backgroundColor: '#172A40', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8 },
  gridItemActive: { borderColor: ACTIVE_YELLOW, backgroundColor: '#0A1728' },
  gridIcon: { height: 31, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { width: '100%', fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  capsuleShadow: { height: 116, borderRadius: 29, transform: [{ translateY: 10 }], backgroundColor: '#07111F' },
  capsule: { flex: 1, borderRadius: 29, overflow: 'hidden' },
  carouselContent: { alignItems: 'center' },
  fixedContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fixedItemFrame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fixedItem: { width: '100%', minHeight: 112, alignItems: 'center', justifyContent: 'center' },
  fixedLabel: { width: '100%', paddingHorizontal: 4, marginTop: 3, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  fixedActiveLabel: { fontSize: 12, fontWeight: '900' },
  itemFrame: { alignItems: 'center', justifyContent: 'center' },
  activeItemFrame: { zIndex: 10 },
  item: { alignItems: 'center', justifyContent: 'center', minHeight: 112, width: '100%' },
  pressedItem: { opacity: 0.65 },
  iconWell: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  activeIconWell: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: ACTIVE_YELLOW, backgroundColor: '#0A1728' },
  label: { fontSize: 10, fontWeight: '700', textAlign: 'center', width: 82, marginTop: 3 },
  activeGroup: { alignItems: 'center', justifyContent: 'center' },
  activeLabel: { fontSize: 14, fontWeight: '900', width: 144, paddingHorizontal: 4, marginBottom: 5, textAlign: 'center' },
});
