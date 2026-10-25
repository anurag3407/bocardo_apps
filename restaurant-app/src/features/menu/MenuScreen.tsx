import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getPartnerMenuQueryKey, partnerCreateCategory, partnerSetStock, usePartnerMenu } from '@/core/api/generated/partner/partner';
import type { SetStockDtoType } from '@/core/api/generated/model';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise } from '@/lib/format';
import { Badge, Button, Card, ErrorState, Icon, Input, Loading, radius, Row, Screen, ScreenTitle, spacing, Text, Toggle, toneColors, useTheme, VegMark, type IconName, type Tone } from '@/ui';

/** Fast stock toggles during service, plus entry points to edit the menu. */
export function MenuScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { current } = useCurrentRestaurant();
  const rid = current?.id ?? '';
  const menu = usePartnerMenu(rid, { query: { enabled: !!rid } });
  const [newCategory, setNewCategory] = useState('');
  const canEdit = current?.memberRole !== 'staff';

  if (menu.isLoading) return <Loading />;
  if (menu.error || !menu.data) return <ErrorState error={menu.error} onRetry={() => menu.refetch()} />;

  const setStock = async (type: SetStockDtoType, id: string, inStock: boolean) => {
    try {
      const updated = await partnerSetStock(rid, { type, id, inStock });
      qc.setQueryData(getPartnerMenuQueryKey(rid), updated);
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const updated = await partnerCreateCategory(rid, { name: newCategory.trim(), sortOrder: menu.data.categories.length });
    qc.setQueryData(getPartnerMenuQueryKey(rid), updated);
    setNewCategory('');
  };

  const allItems = menu.data.categories.flatMap((c) => c.items);
  const outOfStock = allItems.filter((i) => !i.inStock).length;

  return (
    <Screen padded={false} tone="surface">
      <SectionList
        sections={menu.data.categories.map((c) => ({ title: c.name, category: c, data: c.items }))}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg }}>
            <ScreenTitle
              title="Menu"
              subtitle="Toggle stock instantly during service"
              right={canEdit ? <Button title="Add item" icon="add" size="sm" onPress={() => router.push('/menu/item')} /> : undefined}
            />
            <Row>
              <Stat label="Dishes" value={allItems.length} icon="restaurant" tone="brand" />
              <Stat label="In stock" value={allItems.length - outOfStock} icon="checkmark-circle" tone="success" />
              <Stat label="Sold out" value={outOfStock} icon="close-circle" tone={outOfStock ? 'danger' : 'neutral'} />
            </Row>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Row gap={spacing.sm} style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}>
            <Text variant="heading" style={{ flex: 1 }}>{section.title}</Text>
            {section.category.isActive ? <Text variant="label" subtle>{section.data.length} items</Text> : <Badge label="Hidden" icon="eye-off" />}
          </Row>
        )}
        renderItem={({ item }) => (
          <Card style={{ gap: spacing.sm, opacity: item.isActive ? 1 : 0.55 }} onPress={canEdit ? () => router.push({ pathname: '/menu/item', params: { id: item.id } }) : undefined}>
            <Row gap={spacing.md}>
              <VegMark veg={item.isVeg} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading" numberOfLines={1}>{item.name}</Text>
                <Row gap={spacing.sm}>
                  <Text variant="label" muted>{formatPaise(item.pricePaise)}</Text>
                  {item.isBestseller ? <Badge label="Bestseller" tone="sun" icon="star" /> : null}
                  {!item.isActive ? <Badge label="Hidden" /> : null}
                </Row>
              </View>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Toggle value={item.inStock} onValueChange={(v) => setStock('item', item.id, v)} tone="success" accessibilityLabel={`${item.name} in stock`} />
                <Text variant="caption" color={item.inStock ? t.successText : t.dangerText} style={{ fontSize: 10, fontWeight: '700' }}>{item.inStock ? 'IN STOCK' : 'SOLD OUT'}</Text>
              </View>
            </Row>
            {item.variants.length || item.addonGroups.length ? (
              <View style={[styles.options, { borderColor: t.border }]}>
                {item.variants.map((v) => (
                  <Row key={v.id} justify="space-between">
                    <Text variant="label" muted style={{ flex: 1 }}>{v.name} · {formatPaise(v.pricePaise)}</Text>
                    <Toggle value={v.inStock} onValueChange={(val) => setStock('variant', v.id, val)} tone="success" accessibilityLabel={`${v.name} in stock`} />
                  </Row>
                ))}
                {item.addonGroups.flatMap((g) => g.addons).map((a) => (
                  <Row key={a.id} justify="space-between">
                    <Text variant="label" muted style={{ flex: 1 }}>+ {a.name}</Text>
                    <Toggle value={a.inStock} onValueChange={(val) => setStock('addon', a.id, val)} tone="success" accessibilityLabel={`${a.name} in stock`} />
                  </Row>
                ))}
              </View>
            ) : null}
          </Card>
        )}
        ListFooterComponent={
          canEdit ? (
            <Card style={{ gap: spacing.md, marginTop: spacing.xl }}>
              <Text variant="heading">New category</Text>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Input placeholder="e.g. Starters, Desserts" icon="folder-open-outline" accessibilityLabel="New category name" value={newCategory} onChangeText={setNewCategory} /></View>
                <Button title="Add" kind="secondary" onPress={addCategory} style={{ minHeight: 52 }} />
              </Row>
            </Card>
          ) : undefined
        }
      />
    </Screen>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: IconName; tone: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View style={[styles.stat, { backgroundColor: t.surfaceRaised }]}>
      <Icon name={icon} size={18} color={c.fg} />
      <Text variant="title" style={{ fontSize: 22 }}>{value}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, marginLeft: 27, gap: spacing.xs },
  stat: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
