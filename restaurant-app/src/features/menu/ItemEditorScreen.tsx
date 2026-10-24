import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getPartnerMenuQueryKey, partnerCreateItem, partnerUpdateItem, usePartnerMenu } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { Button, Card, Chip, Divider, Input, ListItem, Row, Screen, Segmented, spacing, Text, Toggle, type IconName } from '@/ui';

/** Create or edit a dish. Variants/add-ons are managed via the API's options endpoint (admin tooling). */
export function ItemEditorScreen() {
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

  const toggle = (key: 'isBestseller' | 'isActive', icon: IconName, label: string, subtitle: string) => (
    <ListItem icon={icon} title={label} subtitle={subtitle} chevron={false} right={<Toggle value={form[key]} onValueChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />} />
  );

  return (
    <Screen scroll tone="surface" edges={['bottom']} footer={<Button title={existing ? 'Save changes' : 'Create item'} icon="checkmark" size="lg" loading={saving} onPress={save} />}>
      <Stack.Screen options={{ title: existing ? 'Edit item' : 'New item' }} />
      <Card style={{ gap: spacing.lg }}>
        <Input label="Name" placeholder="e.g. Paneer Butter Masala" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Input label="Description" placeholder="What makes it special?" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
        <Input label="Price" prefix="₹" keyboardType="decimal-pad" placeholder="0" value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v }))} />
      </Card>
      <Card style={{ gap: spacing.md }}>
        <Text variant="heading">Food type</Text>
        <Segmented
          value={form.isVeg ? 'veg' : 'nonveg'}
          onChange={(k) => setForm((f) => ({ ...f, isVeg: k === 'veg' }))}
          options={[{ key: 'veg', label: 'Vegetarian' }, { key: 'nonveg', label: 'Non-veg' }]}
        />
        <Text variant="heading" style={{ marginTop: spacing.sm }}>Category</Text>
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          {menu.data?.categories.map((c) => (
            <Chip key={c.id} label={c.name} icon={form.categoryId === c.id ? 'checkmark' : undefined} active={form.categoryId === c.id} onPress={() => setForm((f) => ({ ...f, categoryId: c.id }))} />
          ))}
        </Row>
      </Card>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {toggle('isBestseller', 'star-outline', 'Bestseller', 'Highlight this dish on your menu')}
        {existing ? (
          <>
            <Divider inset={48} />
            {toggle('isActive', 'eye-outline', 'Visible on menu', 'Hide without deleting it')}
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
