import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

/** Filter / choice chip: outlined at rest, brand-tinted when selected. */
export function Chip({ label, active, onPress, icon, disabled }: { label: string; active: boolean; onPress: () => void; icon?: IconName; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : t.surfaceRaised, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}>
      {icon ? <Icon name={icon} size={15} color={active ? t.brandText : t.textMuted} /> : null}
      <Text variant="label" color={active ? t.brandText : t.text}>{label}</Text>
      {active && !icon ? <Icon name="close" size={14} color={t.brandText} /> : null}
    </Pressable>
  );
}

/** iOS-style segmented control for 2–4 mutually exclusive views. */
export function Segmented<K extends string>({ value, onChange, options }: { value: K; onChange: (k: K) => void; options: { key: K; label: string }[] }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surface }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: t.surfaceRaised, shadowColor: t.shadow, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <Text variant="label" color={active ? t.text : t.textMuted}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Brand-colored switch. */
export function Toggle({ value, onValueChange, disabled, tone = 'brand' }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; tone?: 'brand' | 'success' | 'veg' }) {
  const t = useTheme();
  const on = { brand: t.brand, success: t.success, veg: t.veg }[tone];
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: on, false: t.border }} thumbColor="#FFFFFF" ios_backgroundColor={t.border} />;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm + 1 },
});
