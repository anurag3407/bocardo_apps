import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

type Kind = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  kind?: Kind;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  /** Small text on the right of a large CTA, e.g. the total on "Place order". */
  trailing?: string;
  style?: ViewStyle;
}

export function Button({ title, kind = 'primary', loading, disabled, size = 'md', icon, trailing, style, ...rest }: ButtonProps) {
  const t = useTheme();
  const bg = { primary: t.brand, secondary: t.brandSoft, outline: 'transparent', ghost: 'transparent', danger: t.danger, dark: t.ink }[kind];
  const fg = { primary: t.textInverse, secondary: t.brandText, outline: t.brandText, ghost: t.brandText, danger: t.textInverse, dark: t.textInverse }[kind];
  const inactive = disabled || loading;
  const height = { sm: 36, md: 48, lg: 56 }[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      // the small variant is 36pt tall; the slop brings the touch target to 44pt
      hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: height, paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg, borderRadius: size === 'sm' ? radius.sm : radius.md },
        kind === 'outline' && { borderWidth: 1.5, borderColor: t.brand },
        { opacity: inactive ? 0.45 : pressed ? 0.82 : 1, transform: [{ scale: pressed && !inactive ? 0.985 : 1 }] },
        trailing ? styles.split : null,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <View style={styles.content}>
            {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
            <Text variant="label" color={fg} style={[size !== 'sm' && { fontSize: 15 }, size === 'lg' && { fontSize: 16, fontWeight: '700' }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {trailing ? (
            <View style={styles.content}>
              <Text variant="label" color={fg} style={{ fontSize: 16, fontWeight: '800' }}>{trailing}</Text>
              <Icon name="chevron-forward" size={18} color={fg} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  split: { justifyContent: 'space-between' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
