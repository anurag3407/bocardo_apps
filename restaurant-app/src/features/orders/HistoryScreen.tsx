import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { usePartnerListOrders } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatDateTime, formatPaise } from '@/lib/format';
import { Badge, Card, EmptyState, IconBadge, Loading, Row, Screen, spacing, Text, useTheme } from '@/ui';

export function HistoryScreen() {
  const t = useTheme();
  const { current } = useCurrentRestaurant();
  const orders = usePartnerListOrders(current?.id ?? '', { scope: 'history', limit: 50 }, { query: { enabled: !!current } });
  if (orders.isLoading) return <Loading />;
  return (
    <Screen padded={false} tone="surface" edges={['bottom']}>
      <FlatList
        data={orders.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="time-outline" title="No past orders" message="Completed and cancelled orders show up here." />}
        renderItem={({ item: o }) => (
          <Card onPress={() => router.push(`/order/${o.id}`)}>
            <Row gap={spacing.md}>
              <IconBadge
                name={o.status === 'DELIVERED' ? 'checkmark-done' : 'close'}
                size={40}
                background={o.status === 'DELIVERED' ? t.successSoft : t.dangerSoft}
                color={o.status === 'DELIVERED' ? t.success : t.danger}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">#{o.shortCode} · {o.customerName}</Text>
                <Text variant="caption" muted>{formatDateTime(o.createdAt)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text variant="subheading">{formatPaise(o.itemTotalPaise)}</Text>
                <Badge label={o.status.toLowerCase()} tone={o.status === 'DELIVERED' ? 'success' : 'danger'} />
              </View>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
