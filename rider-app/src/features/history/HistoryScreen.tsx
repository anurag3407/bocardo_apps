import { FlatList, View } from 'react-native';
import { useRidersHistory } from '@/core/api/generated/rider/rider';
import { formatDateTime, formatPaise } from '@/lib/format';
import { Badge, Card, EmptyState, IconBadge, Loading, Row, Screen, ScreenTitle, spacing, Text, useTheme } from '@/ui';

export function HistoryScreen() {
  const t = useTheme();
  const history = useRidersHistory({ limit: 50 });
  if (history.isLoading) return <Loading />;
  return (
    <Screen padded={false} tone="surface">
      <FlatList
        data={history.data?.items ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        refreshing={history.isRefetching}
        onRefresh={() => history.refetch()}
        ListHeaderComponent={<ScreenTitle title="Trips" subtitle="Your recent deliveries" />}
        ListHeaderComponentStyle={{ marginBottom: spacing.md }}
        ListEmptyComponent={<EmptyState icon="bicycle-outline" title="No trips yet" message="Completed deliveries will show up here." />}
        renderItem={({ item: o }) => {
          const done = o.status === 'DELIVERED';
          return (
            <Card>
              <Row gap={spacing.md}>
                <IconBadge name={done ? 'checkmark-done' : 'close'} size={40} background={done ? t.successSoft : t.surface} color={done ? t.success : t.textMuted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subheading" numberOfLines={1}>{o.restaurant.name}</Text>
                  <Text variant="caption" muted>{formatDateTime(o.createdAt)} · #{o.shortCode}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="subheading" color={done ? t.success : t.text}>{formatPaise(o.payoutPaise)}</Text>
                  <Badge label={o.status.toLowerCase().replace('_', ' ')} tone={done ? 'success' : 'neutral'} />
                </View>
              </Row>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
