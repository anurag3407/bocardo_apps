import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, spacing, useTheme, type ThemeColors } from './theme';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'lime' | 'sun';

export function toneColors(t: ThemeColors, tone: Tone): { fg: string; bg: string; fill?: string } {
  return {
    neutral: { fg: t.textMuted, bg: t.surface },
    brand: { fg: t.brandText, bg: t.brandSoft, fill: t.brand },
    success: { fg: t.successText, bg: t.successSoft, fill: t.success },
    warning: { fg: t.warningText, bg: t.warningSoft, fill: t.warning },
    danger: { fg: t.dangerText, bg: t.dangerSoft, fill: t.danger },
    lime: { fg: t.ink, bg: t.lime },
    sun: { fg: t.ink, bg: t.sun },
  }[tone];
}

/** Soft-filled status pill. */
export function Badge({ label, tone = 'neutral', icon, solid }: { label: string; tone?: Tone; icon?: IconName; solid?: boolean }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  const fg = solid ? t.textInverse : c.fg;
  return (
    <View style={[styles.badge, { backgroundColor: solid ? (c.fill ?? c.fg) : c.bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" color={fg} style={{ fontWeight: '700' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Zomato-style green rating chip. */
export function RatingBadge({ value, count, size = 'md' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  const t = useTheme();
  return (
    <View accessible style={[styles.rating, { backgroundColor: t.rating }, size === 'sm' && { paddingHorizontal: 5, paddingVertical: 1 }]} accessibilityLabel={`Rated ${value.toFixed(1)}${count !== undefined ? ` from ${count} ratings` : ''}`}>
      <Text variant="caption" color={t.textInverse} style={{ fontWeight: '800' }}>{value.toFixed(1)}</Text>
      <Icon name="star" size={size === 'sm' ? 9 : 10} color={t.textInverse} />
      {count !== undefined ? <Text variant="caption" color={t.textInverse} style={{ opacity: 0.85 }}> · {count}</Text> : null}
    </View>
  );
}

/** The green-square / red-triangle food mark Indian users expect next to every dish. */
export function VegMark({ veg }: { veg: boolean }) {
  const t = useTheme();
  const color = veg ? t.veg : t.nonVeg;
  return (
    <View accessible accessibilityLabel={veg ? 'Vegetarian' : 'Non-vegetarian'} style={[styles.mark, { borderColor: color }]}>
      {veg ? (
        <View style={[styles.dot, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.triangle, { borderBottomColor: color }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.sm - 2, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  mark: { width: 15, height: 15, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  triangle: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
