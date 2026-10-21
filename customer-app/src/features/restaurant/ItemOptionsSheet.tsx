import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MenuItem } from '@/core/api/generated/model';
import { formatPaise } from '@/lib/format';
import { Button, Divider, radius, Row, spacing, Text, useTheme, VegMark } from '@/ui';

export interface ChosenOptions {
  variantId: string | null;
  variantName: string | null;
  addonIds: string[];
  addonNames: string[];
  unitPricePaise: number;
}

/** Variant + add-on picker that enforces each group's min/max before "Add". */
export function ItemOptionsSheet({ item, onClose, onAdd }: { item: MenuItem | null; onClose: () => void; onAdd: (o: ChosenOptions) => void }) {
  const t = useTheme();
  const defaultVariant = item?.variants.find((v) => v.isDefault && v.inStock) ?? item?.variants.find((v) => v.inStock);
  const [variantId, setVariantId] = useState<string | null>(defaultVariant?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const state = useMemo(() => {
    if (!item) return null;
    const variant = item.variants.find((v) => v.id === variantId);
    const chosen = item.addonGroups.flatMap((g) => g.addons.filter((a) => addonIds.includes(a.id)));
    const invalid = item.addonGroups.find((g) => {
      const n = g.addons.filter((a) => addonIds.includes(a.id)).length;
      return n < g.minSelect || n > g.maxSelect;
    });
    const unitPricePaise = (variant?.pricePaise ?? item.pricePaise) + chosen.reduce((a, x) => a + x.pricePaise, 0);
    return { variant, chosen, invalid, unitPricePaise };
  }, [item, variantId, addonIds]);

  if (!item || !state) return null;

  const toggleAddon = (groupId: string, addonId: string) => {
    const group = item.addonGroups.find((g) => g.id === groupId)!;
    const inGroup = group.addons.map((a) => a.id);
    setAddonIds((ids) => {
      if (ids.includes(addonId)) return ids.filter((id) => id !== addonId);
      const selectedInGroup = ids.filter((id) => inGroup.includes(id));
      // single-choice groups behave like radio buttons
      if (group.maxSelect === 1) return [...ids.filter((id) => !inGroup.includes(id)), addonId];
      if (selectedInGroup.length >= group.maxSelect) return ids;
      return [...ids, addonId];
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <Row>
            <VegMark veg={item.isVeg} />
            <Text variant="heading">{item.name}</Text>
          </Row>
          {item.variants.length ? (
            <Section title="Choose an option">
              {item.variants.map((v) => (
                <Option key={v.id} label={v.name} price={formatPaise(v.pricePaise)} selected={variantId === v.id} disabled={!v.inStock} onPress={() => setVariantId(v.id)} />
              ))}
            </Section>
          ) : null}
          {item.addonGroups.map((g) => (
            <Section key={g.id} title={g.name} hint={g.minSelect > 0 ? `Required · choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}-${g.maxSelect}`}` : `Optional · up to ${g.maxSelect}`}>
              {g.addons.map((a) => (
                <Option key={a.id} label={a.name} price={a.pricePaise ? `+${formatPaise(a.pricePaise)}` : 'Free'} selected={addonIds.includes(a.id)} disabled={!a.inStock} onPress={() => toggleAddon(g.id, a.id)} />
              ))}
            </Section>
          ))}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: t.border }]}>
          <Button title="Cancel" kind="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={state.invalid ? `Complete "${state.invalid.name}"` : `Add · ${formatPaise(state.unitPricePaise)}`}
            disabled={!!state.invalid}
            style={{ flex: 2 }}
            onPress={() =>
              onAdd({
                variantId: state.variant?.id ?? null,
                variantName: state.variant?.name ?? null,
                addonIds: state.chosen.map((a) => a.id),
                addonNames: state.chosen.map((a) => a.name),
                unitPricePaise: state.unitPricePaise,
              })
            }
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label">{title}</Text>
      {hint ? <Text variant="caption" muted>{hint}</Text> : null}
      <Divider />
      {children}
    </View>
  );
}

function Option({ label, price, selected, disabled, onPress }: { label: string; price: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityState={{ selected, disabled }} style={[styles.option, disabled && { opacity: 0.4 }]}>
      <View style={[styles.radio, { borderColor: selected ? t.brand : t.border, backgroundColor: selected ? t.brand : 'transparent' }]} />
      <Text style={{ flex: 1 }}>{label}{disabled ? ' (sold out)' : ''}</Text>
      <Text muted>{price}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  radio: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2 },
  footer: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
