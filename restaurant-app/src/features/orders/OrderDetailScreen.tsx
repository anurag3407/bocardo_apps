import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { startCall } from '@/core/calls/start-call';
import { usePartnerOrder } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise, formatTime } from '@/lib/format';
import { Card, Divider, ErrorState, Icon, IconButton, ListItem, Loading, Row, Screen, spacing, Text, useTheme, VegMark } from '@/ui';
import { useOrderActions } from './use-order-actions';

export function OrderDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { current } = useCurrentRestaurant();
  const rid = current?.id ?? '';
  const order = usePartnerOrder(rid, id, { query: { enabled: !!rid, refetchInterval: 15_000 } });
  const actions = useOrderActions(rid);

  if (order.isLoading) return <Loading />;
  if (order.error || !order.data) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;

  const cancel = () =>
    Alert.alert('Cancel this order?', 'Only cancel if you truly cannot prepare it. The customer is refunded and this affects your outlet rating.', [
      { text: 'Item ran out', onPress: () => actions.mutate({ orderId: id, action: { kind: 'cancel', reason: 'An item ran out' } }) },
      { text: 'Kitchen issue', onPress: () => actions.mutate({ orderId: id, action: { kind: 'cancel', reason: 'Kitchen issue' } }) },
      { text: 'Keep order', style: 'cancel' },
    ]);

  const live = ['PLACED', 'ACCEPTED', 'READY'].includes(o.status);

  return (
    <Screen scroll tone="surface" edges={['bottom']} contentStyle={{ gap: spacing.md }}>
      <Stack.Screen options={{ title: `Order #${o.shortCode}` }} />
      <Card style={{ backgroundColor: t.sky, gap: spacing.xs }}>
        <Text variant="overline" color={t.ink} style={{ opacity: 0.7 }}>Status</Text>
        <Text variant="title" color={t.ink} style={{ textTransform: 'capitalize' }}>{o.status.replace('_', ' ').toLowerCase()}</Text>
        <Text color={t.ink} style={{ opacity: 0.75 }}>
          {o.customerName} · placed {formatTime(o.placedAt)}{o.prepMinutes ? ` · prep ${o.prepMinutes} min` : ''}
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="heading">Items</Text>
        {o.items.map((i, idx) => (
          <Row key={idx} justify="space-between" gap={spacing.md}>
            <Row gap={spacing.sm} style={{ flex: 1 }}>
              <VegMark veg={i.isVeg} />
              <Text style={{ flex: 1 }}>
                <Text variant="subheading" color={t.brandText}>{i.quantity} × </Text>
                {i.name}{i.variantName ? ` (${i.variantName})` : ''}
              </Text>
            </Row>
            <Text>{formatPaise(i.lineTotalPaise)}</Text>
          </Row>
        ))}
        <Divider />
        <Row justify="space-between">
          <Text variant="heading">Item total</Text>
          <Text variant="heading">{formatPaise(o.itemTotalPaise)}</Text>
        </Row>
      </Card>

      {o.customerNote ? (
        <Card style={{ backgroundColor: t.sunSoft }}>
          <Row gap={spacing.sm} style={{ alignItems: 'flex-start' }}>
            <Icon name="document-text" size={18} color={t.warning} />
            <Text style={{ flex: 1 }}>{o.customerNote}</Text>
          </Row>
        </Card>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {live ? <ListItem icon="call-outline" title={`Call ${o.customerName}`} subtitle="Masked number — your phone stays private" onPress={() => void startCall(id, 'customer')} /> : null}
        {o.rider ? (
          <>
            {live ? <Divider inset={48} /> : null}
            <ListItem
              icon="bicycle-outline"
              title={o.rider.name ?? 'Delivery partner'}
              subtitle={o.rider.vehicleNumber ?? undefined}
              right={o.status !== 'DELIVERED' ? <IconButton name="call" label="Call rider" onPress={() => void startCall(id, 'rider')} size={36} background={t.successSoft} color={t.success} /> : undefined}
            />
          </>
        ) : null}
        {o.status === 'ACCEPTED' || o.status === 'READY' ? (
          <>
            <Divider inset={48} />
            <ListItem icon="close-circle-outline" title="Cancel order" destructive onPress={cancel} />
          </>
        ) : null}
      </Card>

      {o.cancelReason ? (
        <Row gap={spacing.sm}>
          <Icon name="information-circle" size={16} color={t.danger} />
          <Text color={t.danger} style={{ flex: 1 }}>{o.cancelReason}</Text>
        </Row>
      ) : null}
    </Screen>
  );
}
