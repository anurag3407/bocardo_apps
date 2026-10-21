import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getPartnerMenuQueryKey, partnerCreateItem, partnerUpdateItem, usePartnerMenu } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { Button, Input, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

/** Create or edit a dish. Variants/add-ons are managed via the API's options endpoint (admin tooling). */
export function ItemEditorScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { current } = useCurrentRestaurant();
  const rid = current?.id ?? '';
  const menu = usePartnerMenu(rid, { query: { enabled: !!rid } });
  const existing = menu.data?.categories.flatMap((c) => c.items).find((i) => i.id === id);

  const [form, setForm] = useState({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    price: existing ? String(existing.pricePaise / 100) : '',
    categoryId: existing?.categoryId ?? menu.data?.categories[0]?.id ?? '',
    isVeg: existing?.isVeg ?? true,
    isBestseller: existing?.isBestseller ?? false,
    isActive: existing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const pricePaise = Math.round(Number(form.price) * 100);
    if (!form.name.trim() || !Number.isFinite(pricePaise) || pricePaise < 0 || !form.categoryId) {
      return Alert.alert('Check the details', 'Name, category and a valid price are required.');
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), description: form.description || null, pricePaise, categoryId: form.categoryId, isVeg: form.isVeg, isBestseller: form.isBestseller };
      const updated = existing
        ? await partnerUpdateItem(rid, existing.id, { ...body, isActive: form.isActive })
        : await partnerCreateItem(rid, { ...body, maxPerOrder: 10, sortOrder: 0 });
      qc.setQueryData(getPartnerMenuQueryKey(rid), updated);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'isVeg' | 'isBestseller' | 'isActive', label: string) => (
    <Row justify="space-between">
      <Text>{label}</Text>
      <Switch value={form[key]} onValueChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
    </Row>
  );

  return (
    <Screen scroll edges={['bottom']} footer={<Button title="Save" size="lg" loading={saving} onPress={save} />}>
      <Stack.Screen options={{ title: existing ? 'Edit item' : 'New item' }} />
      <Input label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
      <Input label="Description" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
      <Input label="Price (₹)" keyboardType="decimal-pad" value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v }))} />
      <Text variant="label">Category</Text>
      <Row gap={spacing.sm}>
        {menu.data?.categories.map((c) => (
          <Pressable key={c.id} onPress={() => setForm((f) => ({ ...f, categoryId: c.id }))} style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderColor: form.categoryId === c.id ? t.brand : t.border }}>
            <Text variant="caption">{c.name}</Text>
          </Pressable>
        ))}
      </Row>
      {toggle('isVeg', 'Vegetarian')}
      {toggle('isBestseller', 'Bestseller')}
      {existing ? toggle('isActive', 'Visible on menu') : null}
    </Screen>
  );
}
