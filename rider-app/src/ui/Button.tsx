import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  kind?: Kind;
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: ViewStyle;
}

export function Button({ title, kind = 'primary', loading, disabled, size = 'md', style, ...rest }: ButtonProps) {
  const t = useTheme();
  const bg = { primary: t.brand, secondary: t.brandSoft, ghost: 'transparent', danger: t.danger }[kind];
  const fg = { primary: t.textInverse, secondary: t.brand, ghost: t.brand, danger: t.textInverse }[kind];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, paddingVertical: size === 'lg' ? spacing.lg : spacing.md, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: t.border },
        style,
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={fg} /> : <Text variant="label" color={fg} style={size === 'lg' && { fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, minHeight: 44 },
});
