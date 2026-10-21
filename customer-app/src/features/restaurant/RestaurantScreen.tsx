import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, SectionList, Switch, View } from 'react-native';
import { useCatalogDetail } from '@/core/api/generated/catalog/catalog';
import type { MenuItem } from '@/core/api/generated/model';
import { CartBar } from '@/features/cart/CartBar';
import { quantityOf, useCart } from '@/features/cart/cart-store';
import { useDeliveryLocation } from '@/features/location/delivery-location-store';
import { formatDistance, formatPaise } from '@/lib/format';
import { Badge, Card, ErrorState, Loading, Row, spacing, Text, useTheme } from '@/ui';
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
    .map((c) => ({ title: c.name, data: c.items.filter((i) => !vegOnly || i.isVeg) }))
    .filter((s) => s.data.length);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: r.name }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Card style={{ gap: spacing.xs }}>
              <Row justify="space-between">
                <Text variant="title" style={{ flex: 1 }}>{r.name}</Text>
                {r.ratingCount > 0 ? <Badge label={`★ ${r.ratingAvg.toFixed(1)} (${r.ratingCount})`} tone="success" /> : null}
              </Row>
              <Text muted>{r.cuisines.join(' · ')}</Text>
              <Text variant="caption" muted>{r.addressLine}</Text>
              <Row gap={spacing.md}>
                {r.etaMinutes ? <Text variant="label">⏱ {r.etaMinutes} min</Text> : null}
                {r.distanceM !== null && r.distanceM !== undefined ? <Text variant="label">{formatDistance(r.distanceM)}</Text> : null}
                {r.minOrderPaise > 0 ? <Text variant="caption" muted>Min order {formatPaise(r.minOrderPaise)}</Text> : null}
              </Row>
            </Card>
            {!r.isOpen && r.closedReason ? <Card style={{ backgroundColor: t.brandSoft }}><Text color={t.danger}>{CLOSED_COPY[r.closedReason]}</Text></Card> : null}
            {r.deliversToLocation === false ? <Card style={{ backgroundColor: t.brandSoft }}><Text color={t.danger}>{"This restaurant doesn't deliver to your selected location."}</Text></Card> : null}
            {!r.isVegOnly ? (
              <Row>
                <Switch value={vegOnly} onValueChange={setVegOnly} trackColor={{ true: t.veg }} />
                <Text variant="label">Veg only</Text>
              </Row>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text variant="heading" style={{ marginTop: spacing.xl }}>{section.title} ({section.data.length})</Text>}
        renderItem={({ item }) => (
          <MenuItemRow item={item} quantity={cart.restaurantId === r.id ? quantityOf(cart.lines, item.id) : 0} disabled={!orderable} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} />
        )}
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

