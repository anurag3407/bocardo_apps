import { router } from 'expo-router';
import { FlatList } from 'react-native';
import { usePartnerListOrders } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatDateTime, formatPaise } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, Row, Screen, spacing, Text } from '@/ui';

export function HistoryScreen() {
  const { current } = useCurrentRestaurant();
  const orders = usePartnerListOrders(current?.id ?? '', { scope: 'history', limit: 50 }, { query: { enabled: !!current } });
  if (orders.isLoading) return <Loading />;
  return (
    <Screen padded={false} edges={['bottom']}>
      <FlatList
        data={orders.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<EmptyState title="No past orders" />}
        renderItem={({ item: o }) => (
          <Card onPress={() => router.push(`/order/${o.id}`)}>
            <Row justify="space-between">
              <Text variant="label">#{o.shortCode} · {o.customerName}</Text>
              <Badge label={o.status.toLowerCase()} tone={o.status === 'DELIVERED' ? 'success' : 'danger'} />
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>{formatDateTime(o.createdAt)}</Text>
              <Text>{formatPaise(o.itemTotalPaise)}</Text>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
