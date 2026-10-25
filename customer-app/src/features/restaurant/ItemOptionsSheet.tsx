import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MenuItem } from '@/core/api/generated/model';
import { formatPaise } from '@/lib/format';
import { Button, Card, Divider, Icon, IconButton, Row, spacing, Text, useTheme, VegMark } from '@/ui';

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
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.surface }}>
        <View style={[styles.header, { backgroundColor: t.background, borderBottomColor: t.border }]}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Row gap={6}>
              <VegMark veg={item.isVeg} />
              {item.isBestseller ? <Text variant="caption" color={t.warningText} style={{ fontWeight: '700' }}>Bestseller</Text> : null}
            </Row>
            <Text variant="title" style={{ fontSize: 20 }}>{item.name}</Text>
            {item.description ? <Text variant="caption" muted numberOfLines={2}>{item.description}</Text> : null}
          </View>
          <IconButton name="close" label="Close" onPress={onClose} size={36} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {item.variants.length ? (
            <Section title="Choose an option" hint="Required · select 1">
              {item.variants.map((v) => (
                <Option key={v.id} kind="radio" label={v.name} price={formatPaise(v.pricePaise)} selected={variantId === v.id} disabled={!v.inStock} onPress={() => setVariantId(v.id)} />
              ))}
            </Section>
          ) : null}
          {item.addonGroups.map((g) => (
            <Section key={g.id} title={g.name} hint={g.minSelect > 0 ? `Required · choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}-${g.maxSelect}`}` : `Optional · up to ${g.maxSelect}`}>
              {g.addons.map((a) => (
                <Option
                  key={a.id}
                  kind={g.maxSelect === 1 ? 'radio' : 'check'}
                  label={a.name}
                  price={a.pricePaise ? `+${formatPaise(a.pricePaise)}` : 'Free'}
                  selected={addonIds.includes(a.id)}
                  disabled={!a.inStock}
                  onPress={() => toggleAddon(g.id, a.id)}
                />
              ))}
            </Section>
          ))}
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: t.background }]}>
          <Button
            size="lg"
            title={state.invalid ? `Choose ${state.invalid.name}` : 'Add item'}
            trailing={state.invalid ? undefined : formatPaise(state.unitPricePaise)}
            disabled={!!state.invalid}
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
    <Card style={{ gap: spacing.xs }}>
      <Text variant="heading">{title}</Text>
      {hint ? <Text variant="caption" muted style={{ marginBottom: spacing.xs }}>{hint}</Text> : null}
      <Divider />
      {children}
    </Card>
  );
}

function Option({ kind, label, price, selected, disabled, onPress }: { kind: 'radio' | 'check'; label: string; price: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  const icon = kind === 'radio' ? (selected ? 'radio-button-on' : 'radio-button-off') : selected ? 'checkbox' : 'square-outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled }}
      style={[styles.option, disabled && { opacity: 0.4 }]}>
      <Text style={{ flex: 1 }}>{label}{disabled ? ' (sold out)' : ''}</Text>
      <Text variant="label" muted>{price}</Text>
      <Icon name={icon} size={22} color={selected ? t.brand : t.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, paddingTop: spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  footer: { padding: spacing.lg, paddingBottom: spacing.md },
});
