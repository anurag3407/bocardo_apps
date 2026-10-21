import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { usePartnerOrder } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise, formatTime } from '@/lib/format';
import { Button, Card, Divider, ErrorState, Loading, Row, Screen, spacing, Text, VegMark } from '@/ui';
import { useOrderActions } from './use-order-actions';

export function OrderDetailScreen() {
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

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen options={{ title: `#${o.shortCode}` }} />
      <Text variant="title">{o.status.replace('_', ' ')}</Text>
      <Text muted>{o.customerName} · placed {formatTime(o.placedAt)}{o.prepMinutes ? ` · prep ${o.prepMinutes} min` : ''}</Text>
      <Card style={{ gap: spacing.sm }}>
        {o.items.map((i, idx) => (
          <Row key={idx} justify="space-between">
            <Row><VegMark veg={i.isVeg} /><Text>{i.quantity} × {i.name}{i.variantName ? ` (${i.variantName})` : ''}</Text></Row>
            <Text>{formatPaise(i.lineTotalPaise)}</Text>
          </Row>
        ))}
        <Divider />
        <Row justify="space-between"><Text variant="label">Item total</Text><Text variant="label">{formatPaise(o.itemTotalPaise)}</Text></Row>
      </Card>
      {o.customerNote ? <Card><Text>📝 {o.customerNote}</Text></Card> : null}
      {o.rider ? (
        <Card>
          <Row justify="space-between">
            <Text>🛵 {o.rider.name} · {o.rider.vehicleNumber}</Text>
            {o.rider.phone ? <Button title="Call" kind="secondary" onPress={() => Linking.openURL(`tel:${o.rider!.phone}`)} /> : null}
          </Row>
        </Card>
      ) : null}
      {o.cancelReason ? <Text>{o.cancelReason}</Text> : null}
      {o.status === 'ACCEPTED' || o.status === 'READY' ? <Button title="Cancel order" kind="ghost" onPress={cancel} /> : null}
    </Screen>
  );
}
