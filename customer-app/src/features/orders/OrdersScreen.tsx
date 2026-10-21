import { router } from 'expo-router';
import { FlatList } from 'react-native';
import { useOrdersList } from '@/core/api/generated/orders/orders';
import { formatDateTime, formatPaise } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, Loading, Row, Screen, spacing, Text } from '@/ui';
import { ACTIVE_STATUSES } from './status-copy';

export function OrdersScreen() {
  // the 50 most recent orders; older history is available from support
  const orders = useOrdersList({ limit: 50 });

  if (orders.isLoading) return <Loading />;
  if (orders.error) return <ErrorState error={orders.error} onRetry={() => orders.refetch()} />;
  const items = orders.data?.items ?? [];

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={<Text variant="title">Your orders</Text>}
        ListEmptyComponent={<EmptyState title="No orders yet" message="Your past orders will show up here." />}
        refreshing={orders.isRefetching}
        onRefresh={() => orders.refetch()}
        renderItem={({ item: o }) => (
          <Card onPress={() => router.push(`/order/${o.id}`)} style={{ gap: spacing.xs }}>
            <Row justify="space-between">
              <Text variant="heading">{o.restaurant.name}</Text>
              <Badge
                label={o.status.replace('_', ' ').toLowerCase()}
                tone={ACTIVE_STATUSES.includes(o.status) ? 'brand' : o.status === 'DELIVERED' ? 'success' : 'danger'}
              />
            </Row>
            <Text muted numberOfLines={2}>{o.itemsPreview}</Text>
            <Row justify="space-between">
              <Text variant="caption" muted>{formatDateTime(o.createdAt)} · #{o.shortCode}</Text>
              <Text variant="label">{formatPaise(o.totalPaise)}</Text>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
