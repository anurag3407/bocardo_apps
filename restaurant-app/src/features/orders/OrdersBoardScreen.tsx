import { useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { SectionList, Switch, View } from 'react-native';
import { getPartnerListOrdersQueryKey, partnerHeartbeat, partnerSetOpen, usePartnerListOrders } from '@/core/api/generated/partner/partner';
import { useRealtime } from '@/core/realtime/use-realtime';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { EmptyState, ErrorState, Loading, Row, Screen, spacing, Text, useTheme } from '@/ui';
import { OrderCard } from './OrderCard';
import { useRinger } from './use-ringer';

const SECTIONS = [
  { key: 'PLACED', title: 'New orders' },
  { key: 'ACCEPTED', title: 'Preparing' },
  { key: 'READY', title: 'Ready for pickup' },
  { key: 'PICKED_UP', title: 'Out for delivery' },
] as const;

/** The tablet screen: live board with a ringing alert until every new order is handled. */
export function OrdersBoardScreen() {
  useKeepAwake();
  const t = useTheme();
  const qc = useQueryClient();
  const { current, isLoading: loadingOutlet, refetch: refetchOutlet } = useCurrentRestaurant();
  const rid = current?.id ?? '';
  const orders = usePartnerListOrders(rid, { scope: 'active', limit: 50 }, { query: { enabled: !!rid, refetchInterval: 10_000 } });

  useRealtime(rid ? `restaurant:${rid}` : null, () => void qc.invalidateQueries({ queryKey: getPartnerListOrdersQueryKey(rid) }));

  // liveness signal so ops can spot outlets whose device went offline
  useEffect(() => {
    if (!rid) return;
    const beat = () => void partnerHeartbeat(rid).catch(() => undefined);
    beat();
    const timer = setInterval(beat, 60_000);
    return () => clearInterval(timer);
  }, [rid]);

  const items = orders.data?.items ?? [];
  useRinger(items.some((o) => o.status === 'PLACED'));

  if (loadingOutlet) return <Loading />;
  if (!current) return <EmptyState title="No outlet found" />;
  if (current.status !== 'active') {
    return <Screen><EmptyState title="Under review" message="Your outlet will go live once our team verifies your details. We'll notify you." /></Screen>;
  }

  const toggleOpen = async (isOpen: boolean) => {
    await partnerSetOpen(rid, { isOpen });
    await refetchOutlet();
  };

  const sections = SECTIONS.map((s) => ({ title: s.title, data: items.filter((o) => o.status === s.key) })).filter((s) => s.data.length);

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <Row justify="space-between">
          <Text variant="heading" style={{ flex: 1 }}>{current.name}</Text>
          <Text variant="label" color={current.isOpen ? t.success : t.danger}>{current.isOpen ? 'Accepting orders' : 'Offline'}</Text>
          <Switch value={current.isOpen} onValueChange={toggleOpen} trackColor={{ true: t.success }} />
        </Row>
        {current.busyUntil ? <Text variant="caption" color={t.warning}>Busy mode until {new Date(current.busyUntil).toLocaleTimeString()}</Text> : null}
      </View>
      {orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          refreshing={orders.isRefetching}
          onRefresh={() => orders.refetch()}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text variant="label" muted style={{ marginTop: spacing.md }}>{section.title.toUpperCase()} · {section.data.length}</Text>}
          renderItem={({ item }) => <OrderCard order={item} restaurantId={rid} defaultPrep={current.avgPrepMinutes} />}
          ListEmptyComponent={orders.isLoading ? <Loading /> : <EmptyState title="No active orders" message={current.isOpen ? 'New orders will ring here.' : 'Switch on to start receiving orders.'} />}
        />
      )}
    </Screen>
  );
}
