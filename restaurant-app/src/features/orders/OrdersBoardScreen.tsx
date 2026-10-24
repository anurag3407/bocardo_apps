import { useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { getPartnerListOrdersQueryKey, partnerHeartbeat, partnerSetOpen, usePartnerListOrders } from '@/core/api/generated/partner/partner';
import { useRealtime } from '@/core/realtime/use-realtime';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { EmptyState, ErrorState, Icon, Loading, radius, Row, Screen, spacing, Text, Toggle, toneColors, useTheme } from '@/ui';
import { OrderCard } from './OrderCard';
import { useRinger } from './use-ringer';

const SECTIONS = [
  { key: 'PLACED', title: 'New orders', short: 'New', tone: 'danger' },
  { key: 'ACCEPTED', title: 'Preparing', short: 'Preparing', tone: 'warning' },
  { key: 'READY', title: 'Ready for pickup', short: 'Ready', tone: 'success' },
  { key: 'PICKED_UP', title: 'Out for delivery', short: 'Out', tone: 'brand' },
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
  if (!current) return <EmptyState icon="storefront-outline" title="No outlet found" />;
  if (current.status !== 'active') {
    return (
      <Screen>
        <EmptyState icon="hourglass-outline" title="Under review" message="Your outlet will go live once our team verifies your details. We'll notify you." />
      </Screen>
    );
  }

  const toggleOpen = async (isOpen: boolean) => {
    await partnerSetOpen(rid, { isOpen });
    await refetchOutlet();
  };

  const sections = SECTIONS.map((s) => ({ ...s, data: items.filter((o) => o.status === s.key) })).filter((s) => s.data.length);

  return (
    <Screen padded={false} tone="surface">
      <View style={[styles.header, { backgroundColor: t.background }]}>
        <Row justify="space-between" gap={spacing.md}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" muted>Live orders</Text>
            <Text variant="title" numberOfLines={1}>{current.name}</Text>
          </View>
          <View style={[styles.status, { backgroundColor: current.isOpen ? t.successSoft : t.surface }]}>
            <View style={[styles.dot, { backgroundColor: current.isOpen ? t.success : t.textSubtle }]} />
            <Text variant="label" color={current.isOpen ? t.success : t.textMuted}>{current.isOpen ? 'Online' : 'Offline'}</Text>
            <Toggle value={current.isOpen} onValueChange={toggleOpen} tone="success" />
          </View>
        </Row>
        {current.busyUntil ? (
          <Row gap={spacing.sm} style={[styles.banner, { backgroundColor: t.warningSoft }]}>
            <Icon name="pause-circle" size={18} color={t.warning} />
            <Text variant="label" style={{ flex: 1 }}>Busy mode until {new Date(current.busyUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>
          </Row>
        ) : null}
        <Row gap={spacing.sm}>
          {SECTIONS.map((s) => {
            const n = items.filter((o) => o.status === s.key).length;
            const c = toneColors(t, n ? s.tone : 'neutral');
            return (
              <View key={s.key} style={[styles.count, { backgroundColor: c.bg }]}>
                <Text variant="title" color={n ? c.fg : t.textSubtle} style={{ fontSize: 22 }}>{n}</Text>
                <Text variant="caption" color={n ? c.fg : t.textMuted} style={{ fontWeight: '700' }}>{s.short}</Text>
              </View>
            );
          })}
        </Row>
      </View>
      {orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          refreshing={orders.isRefetching}
          onRefresh={() => orders.refetch()}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
              <View style={[styles.dot, { backgroundColor: toneColors(t, section.tone).fg }]} />
              <Text variant="overline" muted>{section.title} · {section.data.length}</Text>
            </Row>
          )}
          renderItem={({ item }) => <OrderCard order={item} restaurantId={rid} defaultPrep={current.avgPrepMinutes} />}
          ListEmptyComponent={
            orders.isLoading ? (
              <Loading />
            ) : (
              <EmptyState
                icon={current.isOpen ? 'notifications-outline' : 'moon-outline'}
                title={current.isOpen ? 'No active orders' : "You're offline"}
                message={current.isOpen ? 'New orders will ring here. Keep this screen open.' : 'Switch online to start receiving orders.'}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, gap: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  banner: { borderRadius: radius.md, padding: spacing.md },
  count: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
});
