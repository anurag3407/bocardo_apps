import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, SectionList, Switch, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getPartnerMenuQueryKey, partnerCreateCategory, partnerSetStock, usePartnerMenu } from '@/core/api/generated/partner/partner';
import type { SetStockDtoType } from '@/core/api/generated/model';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise } from '@/lib/format';
import { Button, ErrorState, Input, Loading, Row, Screen, spacing, Text, useTheme, VegMark } from '@/ui';

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

  return (
    <Screen padded={false}>
      <SectionList
        sections={menu.data.categories.map((c) => ({ title: c.name, category: c, data: c.items }))}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Text variant="title">Menu</Text>
            {canEdit ? <Button title="+ Add item" onPress={() => router.push('/menu/item')} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="heading" style={{ marginTop: spacing.lg }}>{section.title}{section.category.isActive ? '' : ' (hidden)'}</Text>
        )}
        renderItem={({ item }) => (
          <View style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.border, opacity: item.isActive ? 1 : 0.5 }}>
            <Row justify="space-between">
              <Row>
                <VegMark veg={item.isVeg} />
                <Text onPress={canEdit ? () => router.push({ pathname: '/menu/item', params: { id: item.id } }) : undefined}>{item.name}</Text>
              </Row>
              <Row>
                <Text muted>{formatPaise(item.pricePaise)}</Text>
                <Switch value={item.inStock} onValueChange={(v) => setStock('item', item.id, v)} trackColor={{ true: t.success }} />
              </Row>
            </Row>
            {item.variants.map((v) => (
              <Row key={v.id} justify="space-between">
                <Text variant="caption" muted>   {v.name} · {formatPaise(v.pricePaise)}</Text>
                <Switch value={v.inStock} onValueChange={(val) => setStock('variant', v.id, val)} />
              </Row>
            ))}
            {item.addonGroups.flatMap((g) => g.addons).map((a) => (
              <Row key={a.id} justify="space-between">
                <Text variant="caption" muted>   + {a.name}</Text>
                <Switch value={a.inStock} onValueChange={(val) => setStock('addon', a.id, val)} />
              </Row>
            ))}
          </View>
        )}
        ListFooterComponent={
          canEdit ? (
            <Row>
              <View style={{ flex: 1 }}><Input placeholder="New category name" value={newCategory} onChangeText={setNewCategory} /></View>
              <Button title="Add" kind="secondary" onPress={addCategory} />
            </Row>
          ) : undefined
        }
      />
    </Screen>
  );
}
