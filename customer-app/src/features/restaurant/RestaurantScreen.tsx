import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useCatalogDetail } from '@/core/api/generated/catalog/catalog';
import type { MenuItem } from '@/core/api/generated/model';
import { CartBar } from '@/features/cart/CartBar';
import { quantityOf, useCart } from '@/features/cart/cart-store';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { formatDistance, formatPaise } from '@/lib/format';
import { Badge, Card, Chip, ErrorState, Icon, Loading, RatingBadge, Row, spacing, Text, useTheme, type IconName } from '@/ui';
import { ItemOptionsSheet, type ChosenOptions } from './ItemOptionsSheet';
import { MenuItemRow } from './MenuItemRow';

const CLOSED_COPY: Record<string, string> = {
  OUTSIDE_HOURS: 'Closed right now — check back during opening hours.',
  BUSY: 'Very busy right now and not accepting orders.',
  PAUSED: 'Temporarily not accepting orders.',
  INACTIVE: 'This restaurant is unavailable.',
};

export function RestaurantScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useDeliveryLocation((s) => s.location);
  const detail = useCatalogDetail(id, location ? { lat: location.lat, lng: location.lng } : {});
  const cart = useCart();
  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellers, setBestsellers] = useState(false);
  const [customising, setCustomising] = useState<MenuItem | null>(null);

  if (detail.isLoading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const r = detail.data;
  const orderable = r.isOpen && r.deliversToLocation !== false;

  const addLine = (item: MenuItem, options: ChosenOptions) => {
    const restaurant = { id: r.id, name: r.name };
    const line = { menuItemId: item.id, name: item.name, isVeg: item.isVeg, ...options };
    if (cart.add(restaurant, line)) return;
    Alert.alert('Replace cart?', `Your cart has items from ${cart.restaurantName}. Start a new cart from ${r.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => cart.replaceWith(restaurant, line) },
    ]);
  };

  const onAdd = (item: MenuItem) => {
    if (item.variants.length || item.addonGroups.length) return setCustomising(item);
    addLine(item, { variantId: null, variantName: null, addonIds: [], addonNames: [], unitPricePaise: item.pricePaise });
  };

  const onRemove = (item: MenuItem) => {
    // remove from the most recently added line of this item
    const line = [...cart.lines].reverse().find((l) => l.menuItemId === item.id);
    if (line) cart.setQuantity(line.key, line.quantity - 1);
  };

  const sections = r.menu
    .map((c) => ({ title: c.name, data: c.items.filter((i) => (!vegOnly || i.isVeg) && (!bestsellers || i.isBestseller)) }))
    .filter((s) => s.data.length);

  const notice = !r.isOpen && r.closedReason ? CLOSED_COPY[r.closedReason] : r.deliversToLocation === false ? "This restaurant doesn't deliver to your selected location." : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: '' }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 140 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, paddingTop: spacing.xs }}>
            <Card style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Row justify="space-between" gap={spacing.md}>
                  <Text variant="title" style={{ flex: 1 }}>{r.name}</Text>
                  {r.ratingCount > 0 ? (
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <RatingBadge value={r.ratingAvg} />
                      <Text variant="caption" subtle style={{ fontSize: 10 }}>{r.ratingCount} ratings</Text>
                    </View>
                  ) : (
                    <Badge label="New" tone="brand" />
                  )}
                </Row>
                <Text muted>{r.cuisines.join(' · ')}</Text>
              </View>
              <View style={[styles.dashed, { borderColor: t.border }]} />
              <View style={{ gap: spacing.sm }}>
                {r.etaMinutes ? <Fact icon="time" color={t.success} text={`${r.etaMinutes} min delivery`} /> : null}
                <Fact icon="location" color={t.brandText} text={[r.distanceM !== null && r.distanceM !== undefined ? formatDistance(r.distanceM) : null, r.addressLine].filter(Boolean).join(' · ')} />
                {r.minOrderPaise > 0 ? <Fact icon="bag-handle" color={t.textMuted} text={`Minimum order ${formatPaise(r.minOrderPaise)}`} /> : null}
                {r.isVegOnly ? <Fact icon="leaf" color={t.veg} text="Pure vegetarian kitchen" /> : null}
              </View>
            </Card>

            {notice ? (
              <View style={[styles.notice, { backgroundColor: t.dangerSoft }]}>
                <Icon name="alert-circle" size={20} color={t.danger} />
                <Text color={t.danger} style={{ flex: 1 }}>{notice}</Text>
              </View>
            ) : null}

            <View style={{ alignItems: 'center', gap: spacing.md }}>
              <Row gap={spacing.sm}>
                <Icon name="restaurant-outline" size={14} color={t.textSubtle} />
                <Text variant="overline" subtle>Menu</Text>
                <Icon name="restaurant-outline" size={14} color={t.textSubtle} />
              </Row>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {!r.isVegOnly ? <Chip label="Veg only" icon="leaf" active={vegOnly} onPress={() => setVegOnly((v) => !v)} /> : null}
              <Chip label="Bestseller" icon="star" active={bestsellers} onPress={() => setBestsellers((v) => !v)} />
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { borderTopColor: t.surface }]}>
            <Text variant="heading" style={{ fontSize: 18 }}>{section.title}</Text>
            <Text variant="label" subtle>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <MenuItemRow item={item} quantity={cart.restaurantId === r.id ? quantityOf(cart.lines, item.id) : 0} disabled={!orderable} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} />
        )}
        ListEmptyComponent={<Text muted center style={{ padding: spacing.xxl }}>No dishes match these filters.</Text>}
      />
      <ItemOptionsSheet
        key={customising?.id}
        item={customising}
        onClose={() => setCustomising(null)}
        onAdd={(options) => {
          addLine(customising!, options);
          setCustomising(null);
        }}
      />
      <CartBar />
    </View>
  );
}

function Fact({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <Row gap={spacing.sm}>
      <Icon name={icon} size={16} color={color} />
      <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{text}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  dashed: { borderTopWidth: 1, borderStyle: 'dashed' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingTop: spacing.xl, marginTop: spacing.sm, borderTopWidth: 8, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
});
