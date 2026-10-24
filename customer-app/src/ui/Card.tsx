import { Pressable, StyleSheet, useColorScheme, View, type ViewProps } from 'react-native';
import { elevation, radius, spacing, useTheme } from './theme';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  /** elevated: floating white card · outlined: hairline border, flat · tinted: brand-soft fill */
  variant?: 'elevated' | 'outlined' | 'tinted';
}

export function Card({ onPress, padded = true, variant = 'elevated', style, children, ...rest }: CardProps) {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  const look =
    variant === 'tinted'
      ? { backgroundColor: t.brandSoft }
      : variant === 'outlined' || dark
        ? { backgroundColor: t.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }
        : { backgroundColor: t.surfaceRaised, ...elevation(1, t) };
  const body = [styles.card, look, padded && styles.padded, style];
  if (!onPress) return <View style={body} {...rest}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...body, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]} {...rest}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  padded: { padding: spacing.lg },
});
