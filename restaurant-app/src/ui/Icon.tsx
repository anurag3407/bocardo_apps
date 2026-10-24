import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

/** Icon inside a tinted circle/rounded square — list leading icons, empty states, stat tiles. */
export function IconBadge({ name, size = 40, color, background, shape = 'circle' }: { name: IconName; size?: number; color?: string; background?: string; shape?: 'circle' | 'square' }) {
  const t = useTheme();
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: shape === 'circle' ? size / 2 : radius.md, backgroundColor: background ?? t.brandSoft }]}>
      <Ionicons name={name} size={Math.round(size * 0.5)} color={color ?? t.brandText} />
    </View>
  );
}

export function IconButton({ name, onPress, label, size = 40, color, background, style }: { name: IconName; onPress: () => void; label: string; size?: number; color?: string; background?: string; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? t.surface, opacity: pressed ? 0.7 : 1 }, style]}>
      <Ionicons name={name} size={Math.round(size * 0.5)} color={color ?? t.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
