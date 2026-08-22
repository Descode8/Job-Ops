import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAudioPlayer } from 'expo-audio';
import { ImageBackground } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/contexts/theme-context';

const ACTIVE_BLUE = '#29acf3';
const CENTER_SLOT = 2;
const RESTING_STEP = 3;
const CAROUSEL_OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const POP_SOUND = 'data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YeABAAAAAGgaiS28NHcuohz/A+7qxNcyzyLTSuKV+DgQNyPjLAMrVh5PCif0geH81g3XceFL8+4HFRo8Jbwmbx6oDo37Bepw3pfb/uHP72IBMhIHHgIiUx1aEUoBR/Fa5W3glOPS7Wj8jwtwFyEdWBu0Eo0FT/eX60vl4eUJ7c74HQaREVMYyhj+EosIL/wU8f/poegv7WH2yAF4DMMT5hV3EnUKAADK9WTum+sI7u30dP4mCI8P4BJaEX4L3wK6+WHypO5e70X0A/yVBMsL3Q/WD9IL6gTv/Or1mvEF8Tv0Vfq4AYAI+wwVDpsLQwZ3//b4Y/TZ8qn0SvmA/7IFTgo2DP4KCAdkAYj78Pa89G31xPja/VwD5QdUChoKVgfIAqP9NfmY9mr2qPiy/HoBxQWCCAoJRwe5A1D/Lftc+Ij33Pj1+wAA8wPPBuMH8wZIBJkA2fz7+bP4SvmO++T+bQJEBbcGbwaKBIsBOv5w+9354Plu+xn+MAHnA5IFywWNBDECVv+2/Pv6jvqD+5T9NQC5An4EFgVjBJgCMQDM/QT8R/vA+0j9dv+7AYEDWwQXBMwC1QCz/vP8AfwY/Cr97f7qAKECowO1A9cCRwFu/8X9tfyB/DD9kP5EAN0B9QJHA8MCkAE=';

export function CarouselTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const itemWidth = (width - 20) / 5;
  const restingOffset = RESTING_STEP * itemWidth;
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(restingOffset)).current;
  const lastSoundStep = useRef(RESTING_STEP);
  const suppressSound = useRef(false);
  const player = useAudioPlayer({ uri: POP_SOUND });
  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => (descriptors[route.key].options as typeof descriptors[string]['options'] & { href?: string | null }).href !== null),
    [descriptors, state.routes]
  );
  const activeRoute = state.routes[state.index];
  const activeIndex = visibleRoutes.findIndex((route) => route.key === activeRoute.key);
  const carouselRoutes = CAROUSEL_OFFSETS.map((offset) => ({
    offset,
    route: visibleRoutes[(activeIndex + offset + visibleRoutes.length) % visibleRoutes.length],
  }));

  useEffect(() => {
    suppressSound.current = true;
    lastSoundStep.current = RESTING_STEP;
    scrollRef.current?.scrollTo({ x: restingOffset, animated: false });
    const frame = requestAnimationFrame(() => { suppressSound.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [activeRoute.key, restingOffset]);

  const playPop = () => {
    void player.seekTo(0);
    player.play();
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const step = Math.round(event.nativeEvent.contentOffset.x / itemWidth);
    if (!suppressSound.current && step !== lastSoundStep.current) {
      lastSoundStep.current = step;
      playPop();
    }
  };

  const selectOffset = (offset: number) => {
    if (offset !== 0) scrollRef.current?.scrollTo({ x: restingOffset + offset * itemWidth, animated: true });
  };

  const finishScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = Math.round((event.nativeEvent.contentOffset.x - restingOffset) / itemWidth);
    if (offset === 0) return;
    const route = visibleRoutes[(activeIndex + offset + visibleRoutes.length) % visibleRoutes.length];
    const tabEvent = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!tabEvent.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  return (
    <View style={[styles.background, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom - 8, 2) }]}>
    <ImageBackground source={require('@/assets/images/dark-blue-particle-texture-background.jpg')} style={styles.capsule} contentFit="cover">
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
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: handleScroll })}>
        {carouselRoutes.map(({ offset, route }, index) => {
          const { options } = descriptors[route.key];
          const focused = offset === 0;
          const centeredAt = (index - CENTER_SLOT) * itemWidth;
          const scale = scrollX.interpolate({
            inputRange: [centeredAt - itemWidth * 2, centeredAt - itemWidth, centeredAt, centeredAt + itemWidth, centeredAt + itemWidth * 2],
            outputRange: [0.88, 0.95, 1, 0.95, 0.88],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange: [centeredAt - itemWidth * 2, centeredAt - itemWidth, centeredAt, centeredAt + itemWidth, centeredAt + itemWidth * 2],
            outputRange: [0.42, 0.72, 1, 0.72, 0.42],
            extrapolate: 'clamp',
          });
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : typeof options.title === 'string' ? options.title : route.name;
          const color = focused ? ACTIVE_BLUE : '#9BADC2';

          return (
            <Animated.View key={`${route.key}-${offset}`} style={[styles.itemFrame, focused && styles.activeItemFrame, { width: itemWidth, opacity, transform: [{ scale }] }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={() => selectOffset(offset)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.item, pressed && styles.pressedItem]}>
                <View style={[styles.iconWell, focused && styles.activeIconWell]}>
                  {options.tabBarIcon?.({ focused, color, size: focused ? 35 : 30 })}
                </View>
                <Text numberOfLines={1} style={[styles.label, { color }, focused && styles.activeLabel]}>{label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { paddingHorizontal: 10, paddingTop: 8 },
  capsule: { height: 112, borderRadius: 28, borderWidth: 1, borderColor: '#294866', overflow: 'hidden', transform: [{ translateY: 10 }] },
  carouselContent: { alignItems: 'center' },
  itemFrame: { alignItems: 'center', justifyContent: 'center' },
  activeItemFrame: { zIndex: 10 },
  item: { alignItems: 'center', justifyContent: 'center', minHeight: 110, width: '100%' },
  pressedItem: { opacity: 0.65 },
  iconWell: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  activeIconWell: { width: 66, height: 66, borderRadius: 33, borderColor: ACTIVE_BLUE, backgroundColor: '#07111F' },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center', width: 66, marginTop: 2 },
  activeLabel: { fontSize: 13, fontWeight: '900', width: 108, marginTop: 1 },
});
