import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { useOrdersList } from '@/core/api/generated/orders/orders';
import { formatDateTime, formatPaise } from '@/lib/format';
import type { OrderSummary } from '@/core/api/generated/model';
import { Badge, Card, EmptyState, ErrorState, Icon, IconBadge, Loading, Row, Screen, ScreenTitle, spacing, Text, useTheme } from '@/ui';
import { ACTIVE_STATUSES } from './status-copy';

export function OrdersScreen() {
  // the 50 most recent orders; older history is available from support
  const orders = useOrdersList({ limit: 50 });

  if (orders.isLoading) return <Loading />;
  if (orders.error) return <ErrorState error={orders.error} onRetry={() => orders.refetch()} />;
  const items = orders.data?.items ?? [];

  return (
    <Screen padded={false} tone="surface">
      <FlatList
        data={items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        ListHeaderComponent={<ScreenTitle title="Your orders" subtitle="Track live orders and revisit past ones" />}
        ListHeaderComponentStyle={{ marginBottom: spacing.sm }}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No orders yet" message="Your past orders will show up here." action={{ label: 'Order now', onPress: () => router.navigate('/') }} />}
        refreshing={orders.isRefetching}
        onRefresh={() => orders.refetch()}
        renderItem={({ item: o }) => <OrderRow order={o} />}
      />
    </Screen>
  );
}

function OrderRow({ order: o }: { order: OrderSummary }) {
  const t = useTheme();
  const live = ACTIVE_STATUSES.includes(o.status);
  const tone = live ? 'brand' : o.status === 'DELIVERED' ? 'success' : 'danger';
  return (
    <Card onPress={() => router.push(`/order/${o.id}`)} style={[{ gap: spacing.md }, live && { borderWidth: 1.5, borderColor: t.brand }]}>
      <Row gap={spacing.md}>
        <IconBadge name="restaurant" size={44} shape="square" background={live ? t.brandSoft : t.surface} color={live ? t.brandText : t.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>{o.restaurant.name}</Text>
          <Text variant="caption" muted>{formatDateTime(o.createdAt)} · #{o.shortCode}</Text>
        </View>
        <Badge label={o.status.replace('_', ' ').toLowerCase()} tone={tone} icon={live ? 'radio-button-on' : o.status === 'DELIVERED' ? 'checkmark-circle' : 'close-circle'} />
      </Row>
      <View style={[styles.dashed, { borderColor: t.border }]} />
      <Text muted numberOfLines={2}>{o.itemsPreview}</Text>
      <Row justify="space-between">
        <Text variant="subheading">{formatPaise(o.totalPaise)}</Text>
        <Row gap={4}>
          <Text variant="label" color={t.brandText}>{live ? 'Track order' : 'View details'}</Text>
          <Icon name="chevron-forward" size={16} color={t.brandText} />
        </Row>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  dashed: { borderTopWidth: 1, borderStyle: 'dashed' },
});
