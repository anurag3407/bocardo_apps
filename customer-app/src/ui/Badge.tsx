import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }) {
  const t = useTheme();
  const color = { neutral: t.textMuted, brand: t.brand, success: t.success, warning: t.warning, danger: t.danger }[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text variant="caption" color={color} style={{ fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** The green-square / red-triangle food mark Indian users expect next to every dish. */
export function VegMark({ veg }: { veg: boolean }) {
  const t = useTheme();
  const color = veg ? t.veg : t.nonVeg;
  return (
    <View accessibilityLabel={veg ? 'Vegetarian' : 'Non-vegetarian'} style={[styles.mark, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  mark: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
