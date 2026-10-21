import { FlatList } from 'react-native';
import { useRidersHistory } from '@/core/api/generated/rider/rider';
import { formatDateTime, formatPaise } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, Row, Screen, spacing, Text } from '@/ui';

export function HistoryScreen() {
  const history = useRidersHistory({ limit: 50 });
  if (history.isLoading) return <Loading />;
  return (
    <Screen padded={false}>
      <FlatList
        data={history.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        refreshing={history.isRefetching}
        onRefresh={() => history.refetch()}
        ListHeaderComponent={<Text variant="title">Trips</Text>}
        ListEmptyComponent={<EmptyState title="No trips yet" />}
        renderItem={({ item: o }) => (
          <Card style={{ gap: 2 }}>
            <Row justify="space-between">
              <Text variant="label">{o.restaurant.name}</Text>
              <Badge label={o.status.toLowerCase().replace('_', ' ')} tone={o.status === 'DELIVERED' ? 'success' : 'neutral'} />
            </Row>
            <Row justify="space-between">
              <Text variant="caption" muted>{formatDateTime(o.createdAt)} · #{o.shortCode}</Text>
              <Text variant="label">{formatPaise(o.payoutPaise)}</Text>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
