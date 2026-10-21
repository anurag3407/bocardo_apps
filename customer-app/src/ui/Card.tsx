import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { radius, spacing, useTheme } from './theme';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
}

export function Card({ onPress, padded = true, style, children, ...rest }: CardProps) {
  const t = useTheme();
  const body = [styles.card, { backgroundColor: t.surfaceRaised, borderColor: t.border }, padded && styles.padded, style];
  if (!onPress) return <View style={body} {...rest}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...body, pressed && { opacity: 0.9 }]} {...rest}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  padded: { padding: spacing.lg },
});
