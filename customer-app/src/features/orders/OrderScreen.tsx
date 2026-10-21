import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Alert, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getOrdersDetailQueryKey, ordersCancel, ordersPaymentSession, useOrdersDetail } from '@/core/api/generated/orders/orders';
import { paymentsVerify } from '@/core/api/generated/payments/payments';
import { DeliveryMap } from '@/core/maps/delivery-map';
import type { MapMarker } from '@/core/maps/map-types';
import { CheckoutCancelled, openCheckout } from '@/core/payments/checkout';
import { startCall } from '@/core/calls/start-call';
import { useRealtime } from '@/core/realtime/use-realtime';
import * as Crypto from 'expo-crypto';
import { formatPaise, formatTime, minutesUntil } from '@/lib/format';
import { Badge, Button, Card, Divider, ErrorState, Loading, Row, Screen, spacing, Text, useTheme, VegMark } from '@/ui';
import { RateOrder } from './RateOrder';
import { ACTIVE_STATUSES, statusHeadline } from './status-copy';

const CANCEL_REASONS = ['Ordered by mistake', 'Want to change items', 'Taking too long', 'Other'];

export function OrderScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [riderLive, setRiderLive] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const order = useOrdersDetail(id, {
    query: {
      // polling is the fallback when realtime drops; it stops once the order is finished
      refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.includes(q.state.data.status) ? 15_000 : false),
    },
  });

  useRealtime(`order:${id}`, (event, payload) => {
    if (event === 'rider_location') setRiderLive({ lat: Number(payload.lat), lng: Number(payload.lng) });
    if (event === 'order_updated') void qc.invalidateQueries({ queryKey: getOrdersDetailQueryKey(id) });
  });

  if (order.isLoading) return <Loading />;
  if (order.error || !order.data) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;
  const headline = statusHeadline(o);
  const active = ACTIVE_STATUSES.includes(o.status);
  const eta = minutesUntil(o.estimatedDeliveryAt);
  const riderPos = riderLive ?? (o.rider?.lat && o.rider?.lng ? { lat: o.rider.lat, lng: o.rider.lng } : null);

  const markers: MapMarker[] = [
    { id: 'restaurant', kind: 'restaurant', lat: o.restaurant.lat, lng: o.restaurant.lng },
    { id: 'home', kind: 'home', lat: o.deliveryAddress.lat, lng: o.deliveryAddress.lng },
    ...(riderPos && o.dispatchStatus !== 'DONE' ? [{ id: 'rider', kind: 'rider' as const, ...riderPos }] : []),
  ];

  const refresh = () => qc.invalidateQueries({ queryKey: getOrdersDetailQueryKey(id) });

  const pay = async () => {
    setBusy(true);
    try {
      const session = await ordersPaymentSession(id);
      const paid = await openCheckout(session, { description: `Order #${o.shortCode}` });
      await paymentsVerify({ orderId: id, ...paid });
      await refresh();
    } catch (e) {
      if (!(e instanceof CheckoutCancelled)) Alert.alert('Payment not completed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    Alert.alert('Cancel order?', 'Why do you want to cancel?', [
      ...CANCEL_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await ordersCancel(id, { reason }, { headers: { 'Idempotency-Key': Crypto.randomUUID() } });
            await refresh();
          } catch (e) {
            Alert.alert("Couldn't cancel", errorMessage(e));
          }
        },
      })),
      { text: 'Keep order', style: 'cancel' as const },
    ]);

  return (
    <Screen scroll edges={['bottom']} refreshing={order.isRefetching} onRefresh={() => order.refetch()}>
      <Stack.Screen options={{ title: `Order #${o.shortCode}` }} />
      <View style={{ gap: spacing.xs }}>
        <Text variant="title">{headline.title}</Text>
        <Text muted>{headline.subtitle}</Text>
        {active && eta !== null && o.status !== 'PAYMENT_PENDING' ? <Text variant="heading" color={t.brand}>Arriving in ~{eta} min</Text> : null}
      </View>

      {active ? <DeliveryMap markers={markers} fitToMarkers height={240} /> : null}

      {o.status === 'PAYMENT_PENDING' ? <Button title={`Complete payment · ${formatPaise(o.pricing.totalPaise)}`} loading={busy} onPress={pay} /> : null}

      {o.deliveryOtp ? (
        <Card style={{ backgroundColor: t.brandSoft }}>
          <Row justify="space-between">
            <Text variant="label">Delivery OTP — share only at hand-off</Text>
            <Text variant="title" style={{ letterSpacing: 6 }}>{o.deliveryOtp}</Text>
          </Row>
        </Card>
      ) : null}

      {o.rider ? (
        <Card>
          <Row justify="space-between">
            <View style={{ gap: 2 }}>
              <Text variant="heading">🛵 {o.rider.name ?? 'Delivery partner'}</Text>
              <Text variant="caption" muted>{o.rider.vehicleNumber} · ★ {o.rider.ratingAvg.toFixed(1)}</Text>
            </View>
            {active ? <Button title="Call" kind="secondary" onPress={() => void startCall(id, 'rider')} /> : null}
          </Row>
        </Card>
      ) : null}

      {o.deliveryProofUrl ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="label">{o.status === 'DELIVERED' ? 'Delivered here' : 'Delivery partner reached your door'}</Text>
          <Image source={o.deliveryProofUrl} style={{ width: '100%', height: 220, borderRadius: 12 }} contentFit="cover" accessibilityLabel="Photo of the delivered package" />
        </Card>
      ) : null}

      {o.canRate ? <RateOrder orderId={id} hasRider={!!o.rider} onDone={refresh} /> : null}

      <Card style={{ gap: spacing.sm }}>
        <Text variant="heading">{o.restaurant.name}</Text>
        {o.items.map((i, idx) => (
          <Row key={idx} justify="space-between">
            <Row><VegMark veg={i.isVeg} /><Text>{i.quantity} × {i.name}{i.variantName ? ` (${i.variantName})` : ''}</Text></Row>
            <Text>{formatPaise(i.lineTotalPaise)}</Text>
          </Row>
        ))}
        <Divider />
        <Row justify="space-between">
          <Text variant="label">Total {o.paymentMethod === 'cod' ? '(cash on delivery)' : '(paid online)'}</Text>
          <Text variant="label">{formatPaise(o.pricing.totalPaise)}</Text>
        </Row>
        {o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded' ? <Badge label={o.paymentStatus.replace('_', ' ')} tone="success" /> : null}
      </Card>

      <Card style={{ gap: spacing.xs }}>
        <Text variant="label">Timeline</Text>
        {o.timeline.map((e, i) => (
          <Row key={i} justify="space-between">
            <Text muted>{e.event.replace('STATUS_', '').replace('DISPATCH_', 'Rider ').replace('_', ' ').toLowerCase()}</Text>
            <Text variant="caption" muted>{formatTime(e.at)}</Text>
          </Row>
        ))}
        {o.cancelReason ? <Text variant="caption" color={t.danger}>{o.cancelReason}</Text> : null}
      </Card>

      {o.canCancel ? <Button title="Cancel order" kind="ghost" onPress={cancel} /> : null}
      <Button title="Need help with this order?" kind="ghost" onPress={() => router.push({ pathname: '/support/new', params: { orderId: id } })} />
    </Screen>
  );
}
