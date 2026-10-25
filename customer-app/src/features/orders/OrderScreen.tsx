import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Alert, StyleSheet, View } from 'react-native';
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
import { Badge, Button, Card, Divider, ErrorState, Icon, IconBadge, IconButton, ListItem, Loading, radius, RatingBadge, Row, Screen, spacing, Text, useTheme, VegMark, type IconName } from '@/ui';
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

  const failed = ['CANCELLED', 'REJECTED', 'UNDELIVERED', 'PAYMENT_FAILED'].includes(o.status);
  const heroBg = failed ? t.dangerSoft : o.status === 'DELIVERED' ? t.limeSoft : t.sky;
  const heroIcon: IconName = failed ? 'close-circle' : o.status === 'DELIVERED' ? 'checkmark-circle' : o.status === 'PICKED_UP' ? 'bicycle' : o.status === 'PAYMENT_PENDING' ? 'card' : 'restaurant';

  return (
    <Screen scroll tone="surface" edges={['bottom']} refreshing={order.isRefetching} onRefresh={() => order.refetch()} contentStyle={{ gap: spacing.md }}>
      <Stack.Screen options={{ title: `Order #${o.shortCode}` }} />
      <View style={[styles.hero, { backgroundColor: heroBg }]}>
        <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="title" color={t.ink}>{headline.title}</Text>
            <Text color={t.ink} style={{ opacity: 0.75 }}>{headline.subtitle}</Text>
          </View>
          <IconBadge name={heroIcon} size={48} background={t.surfaceRaised} color={failed ? t.dangerText : t.ink} />
        </Row>
        {active && eta !== null && o.status !== 'PAYMENT_PENDING' ? (
          <View style={[styles.eta, { backgroundColor: t.surfaceRaised }]}>
            <Icon name="time" size={18} color={t.successText} />
            <Text variant="subheading">Arriving in <Text variant="subheading" style={{ fontWeight: '800' }}>{eta} min</Text></Text>
          </View>
        ) : null}
      </View>

      {active ? (
        <View style={styles.map}>
          <DeliveryMap markers={markers} fitToMarkers height={240} />
        </View>
      ) : null}

      {o.status === 'PAYMENT_PENDING' ? <Button size="lg" title="Complete payment" trailing={formatPaise(o.pricing.totalPaise)} loading={busy} onPress={pay} /> : null}

      {o.deliveryOtp ? (
        <Card style={{ backgroundColor: t.sunSoft }}>
          <Row justify="space-between" gap={spacing.md}>
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6}>
                <Icon name="key" size={16} color={t.ink} />
                <Text variant="subheading" color={t.ink}>Delivery OTP</Text>
              </Row>
              <Text variant="caption" muted>Share only when you receive your order</Text>
            </View>
            <View style={styles.otp}>
              {o.deliveryOtp.split('').map((d, i) => (
                <View key={i} style={[styles.otpDigit, { backgroundColor: t.surfaceRaised }]}>
                  <Text variant="title" style={{ fontSize: 20 }}>{d}</Text>
                </View>
              ))}
            </View>
          </Row>
        </Card>
      ) : null}

      {o.rider ? (
        <Card>
          <Row gap={spacing.md}>
            <IconBadge name="bicycle" size={48} background={t.limeSoft} color={t.ink} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">{o.rider.name ?? 'Delivery partner'}</Text>
              <Row gap={6}>
                <RatingBadge value={o.rider.ratingAvg} size="sm" />
                {o.rider.vehicleNumber ? <Text variant="caption" muted>{o.rider.vehicleNumber}</Text> : null}
              </Row>
            </View>
            {active ? <IconButton name="call" label="Call delivery partner" onPress={() => void startCall(id, 'rider')} background={t.successSoft} color={t.successText} size={44} /> : null}
          </Row>
        </Card>
      ) : null}

      {o.deliveryProofUrl ? (
        <Card style={{ gap: spacing.sm }}>
          <Row gap={spacing.sm}>
            <Icon name="camera" size={18} color={t.brandText} />
            <Text variant="heading">{o.status === 'DELIVERED' ? 'Delivered here' : 'Delivery partner reached your door'}</Text>
          </Row>
          <Image source={o.deliveryProofUrl} style={{ width: '100%', height: 220, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Photo of the delivered package" />
        </Card>
      ) : null}

      {o.canRate ? <RateOrder orderId={id} hasRider={!!o.rider} onDone={refresh} /> : null}

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <IconBadge name="restaurant" size={40} shape="square" />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{o.restaurant.name}</Text>
            <Text variant="caption" muted>Order #{o.shortCode}</Text>
          </View>
        </Row>
        <Divider />
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
        <View style={[styles.dashed, { borderColor: t.border }]} />
        <Row justify="space-between">
          <View>
            <Text variant="heading">Total</Text>
            <Text variant="caption" muted>{o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}</Text>
          </View>
          <Text variant="heading">{formatPaise(o.pricing.totalPaise)}</Text>
        </Row>
        {o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded' ? <Badge label={o.paymentStatus.replace('_', ' ')} tone="success" icon="return-down-back" /> : null}
      </Card>

      <Card style={{ gap: 0 }}>
        <Text variant="heading" style={{ marginBottom: spacing.md }}>Order timeline</Text>
        {o.timeline.map((e, i) => {
          const last = i === o.timeline.length - 1;
          return (
            <View key={i} style={styles.step}>
              <View style={{ alignItems: 'center', width: 16 }}>
                <View style={[styles.stepDot, { backgroundColor: last ? t.brand : t.success, borderColor: last ? t.brandSoft : t.successSoft }]} />
                {!last ? <View style={[styles.stepLine, { backgroundColor: t.border }]} /> : null}
              </View>
              <Row justify="space-between" style={{ flex: 1, alignItems: 'flex-start', paddingBottom: last ? 0 : spacing.lg }}>
                <Text variant={last ? 'subheading' : 'body'} muted={!last} style={{ textTransform: 'capitalize', flex: 1 }}>
                  {e.event.replace('STATUS_', '').replace('DISPATCH_', 'Rider ').replace('_', ' ').toLowerCase()}
                </Text>
                <Text variant="caption" subtle>{formatTime(e.at)}</Text>
              </Row>
            </View>
          );
        })}
        {o.cancelReason ? (
          <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
            <Icon name="information-circle" size={16} color={t.dangerText} />
            <Text variant="caption" color={t.dangerText} style={{ flex: 1 }}>{o.cancelReason}</Text>
          </Row>
        ) : null}
      </Card>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListItem icon="chatbubble-ellipses" title="Need help with this order?" subtitle="Chat with our support team" onPress={() => router.push({ pathname: '/support/new', params: { orderId: id } })} />
        {o.canCancel ? (
          <>
            <Divider inset={48} />
            <ListItem icon="close-circle" title="Cancel order" destructive onPress={cancel} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  eta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
  otp: { flexDirection: 'row', gap: 6 },
  otpDigit: { width: 34, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed' },
  step: { flexDirection: 'row', gap: spacing.md },
  stepDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 3 },
  stepLine: { width: 2, flex: 1, marginVertical: 2 },
});
