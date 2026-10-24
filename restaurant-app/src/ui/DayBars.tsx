import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, spacing, useTheme } from './theme';

export interface DayBar {
  day: string;
  value: number;
  /** Shown on the readout when the bar is selected, e.g. "₹1,240 · 12 orders". */
  detail: string;
}

const HEIGHT = 120;

/** Single-series daily column chart; tap a column to read its value (defaults to the latest day). */
export function DayBars({ data }: { data: DayBar[] }) {
  const t = useTheme();
  const [selected, setSelected] = useState(data.length - 1);
  const max = Math.max(1, ...data.map((d) => d.value));
  const current = data[Math.min(selected, data.length - 1)];
  if (!data.length) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.readout, { backgroundColor: t.surface }]}>
        <Text variant="label" muted>{new Date(current.day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
        <Text variant="label">{current.detail}</Text>
      </View>
      <View style={[styles.plot, { borderBottomColor: t.border }]}>
        {data.map((d, i) => {
          const active = i === selected;
          const h = d.value ? Math.max(4, Math.round((d.value / max) * HEIGHT)) : 2;
          return (
            <Pressable
              key={d.day}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityLabel={`${d.day}: ${d.detail}`}
              accessibilityState={{ selected: active }}
              style={styles.hit}>
              <View style={[styles.bar, { height: h, backgroundColor: d.value ? t.brand : t.border, opacity: active ? 1 : 0.45 }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {data.map((d, i) => (
          <Text key={d.day} variant="caption" color={i === selected ? t.text : t.textSubtle} style={[styles.tick, i === selected && { fontWeight: '700' }]}>
            {new Date(d.day).toLocaleDateString('en-IN', { weekday: 'narrow' })}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  plot: { height: HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { flex: 1, height: HEIGHT, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '62%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', gap: 2, marginTop: -spacing.sm },
  tick: { flex: 1, textAlign: 'center' },
});
