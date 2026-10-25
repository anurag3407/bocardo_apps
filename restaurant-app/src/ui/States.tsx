import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { Icon, IconBadge, type IconName } from './Icon';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.brand} size="large" />
      {label ? <Text muted>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, message, action, icon = 'fast-food-outline' }: { title: string; message?: string; action?: { label: string; onPress: () => void }; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.halo, { backgroundColor: t.skySoft }]}>
        <IconBadge name={icon} size={72} background={t.brandSoft} />
      </View>
      <View style={{ gap: spacing.xs, alignItems: 'center' }}>
        <Text variant="heading" center>{title}</Text>
        {message ? <Text muted center style={{ maxWidth: 300 }}>{message}</Text> : null}
      </View>
      {action ? <Button title={action.label} onPress={action.onPress} kind="outline" style={{ minWidth: 180 }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return <EmptyState icon="cloud-offline-outline" title="Couldn't load this" message={message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
}

export function Divider({ inset = 0, spaced }: { inset?: number; spaced?: boolean }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: inset, marginVertical: spaced ? spacing.sm : 0 }} />;
}

/** Thick grey band between page sections (Swiggy menu / checkout rhythm). */
export function SectionGap() {
  const t = useTheme();
  return <View style={{ height: spacing.sm, backgroundColor: t.surface, marginHorizontal: -spacing.lg }} />;
}

export function Row({ children, gap = spacing.sm, justify = 'flex-start' as const, style }: { children: ReactNode; gap?: number; justify?: 'flex-start' | 'space-between' | 'center' | 'flex-end'; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, justifyContent: justify }, style]}>{children}</View>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption" muted>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <Text variant="label" color={t.brandText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Settings-style row: leading icon, title/subtitle, trailing value or chevron. */
export function ListItem({
  icon,
  title,
  subtitle,
  value,
  right,
  onPress,
  destructive,
  chevron = !!onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
}) {
  const t = useTheme();
  const tint = destructive ? t.dangerText : t.text;
  const body = (
    <>
      {icon ? <IconBadge name={icon} size={36} shape="square" background={destructive ? t.dangerSoft : t.surface} color={destructive ? t.dangerText : t.text} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="subheading" color={tint}>{title}</Text>
        {subtitle ? <Text variant="caption" muted numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text variant="label" muted>{value}</Text> : null}
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={t.textSubtle} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listItem}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  );
}

/** Pulsing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 16, radius: r = radius.sm, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: t.surface, opacity: pulse }, style]} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  halo: { padding: spacing.md, borderRadius: 999 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
});
