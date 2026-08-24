import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/contexts/theme-context';

export function ThemeToggle() {
  const { colorScheme, colors, toggleColorScheme } = useAppTheme();
  const nextMode = colorScheme === 'dark' ? 'light' : 'dark';

  return (
    <Pressable
      accessibilityLabel={`Switch to ${nextMode} mode`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={toggleColorScheme}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={colorScheme === 'dark' ? 'sunny' : 'moon'} size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
  },
});
