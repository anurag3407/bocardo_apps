import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import type { RiderOrder } from '@/core/api/generated/model';
import {
  getRidersActiveQueryKey,
  ridersArrivedDrop,
  ridersArrivedRestaurant,
  ridersDeliver,
  ridersPickedUp,
  ridersSos,
  ridersUndeliverable,
} from '@/core/api/generated/rider/rider';
import { currentPosition, navigationUrl } from '@/core/location/background-tracking';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { formatPaise } from '@/lib/format';
import { Badge, Button, Card, Input, Row, spacing, Text, useTheme } from '@/ui';

const idem = () => ({ headers: { 'Idempotency-Key': Crypto.randomUUID() } });

/** Step-by-step trip: restaurant → pickup → customer → OTP hand-off. */
export function TripPanel({ order: o }: { order: RiderOrder }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const toRestaurant = o.dispatchStatus === 'ASSIGNED' || o.dispatchStatus === 'AT_RESTAURANT';
  const target = toRestaurant ? o.restaurant : o.dropAddress;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: getRidersActiveQueryKey() });
    } catch (e) {
      Alert.alert('Not done', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPickup = () => {
    if (o.status === 'READY') return run(() => ridersPickedUp(o.id, idem()));
    Alert.alert('Food not marked ready', 'Only confirm once the restaurant has handed you the sealed package.', [
      { text: 'Wait', style: 'cancel' },
      { text: 'I have the package', onPress: () => run(() => ridersPickedUp(o.id, idem())) },
    ]);
  };

  const unreachable = () =>
    Alert.alert('Customer unreachable?', 'Call the customer first. You can mark undeliverable after waiting 10 minutes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark undeliverable', style: 'destructive', onPress: () => run(() => ridersUndeliverable(o.id, { reason: 'Customer unreachable at doorstep' }, idem())) },
    ]);

  const sos = () =>
    Alert.alert('Send SOS?', 'Bocardo safety team will be alerted with your live location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send SOS',
        style: 'destructive',
        onPress: async () => {
          const pos = await currentPosition().catch(() => ({ lat: 0, lng: 0 }));
          await ridersSos({ ...pos, orderId: o.id }).catch(() => undefined);
          Alert.alert('Help is on the way', 'Our safety team has been notified.');
        },
      },
    ]);

  return (
    <View style={{ gap: spacing.md }}>
      <Row justify="space-between">
        <Text variant="heading">#{o.shortCode}</Text>
        <Badge label={o.paymentMethod === 'cod' ? `Collect ${formatPaise(o.collectPaise)}` : 'Prepaid'} tone={o.paymentMethod === 'cod' ? 'warning' : 'success'} />
      </Row>
      <DeliveryMap
        markers={[
          { id: 'restaurant', kind: 'restaurant', lat: o.restaurant.lat, lng: o.restaurant.lng },
          { id: 'home', kind: 'home', lat: o.dropAddress.lat, lng: o.dropAddress.lng },
        ]}
        fitToMarkers
        showUserLocation
        height={200}
      />
      <Card style={{ gap: spacing.xs }}>
        <Text variant="label" muted>{toRestaurant ? 'PICKUP' : 'DROP'}</Text>
        <Text variant="heading">{toRestaurant ? o.restaurant.name : o.customer.name ?? 'Customer'}</Text>
        <Text muted>{toRestaurant ? o.restaurant.addressLine : [o.dropAddress.line1, o.dropAddress.line2, o.dropAddress.landmark].filter(Boolean).join(', ')}</Text>
        {!toRestaurant && o.customerNote ? <Text color={t.warning}>📝 {o.customerNote}</Text> : null}
        <Row>
          <Button title="Navigate" kind="secondary" onPress={() => Linking.openURL(navigationUrl(target.lat, target.lng))} style={{ flex: 1 }} />
          {(toRestaurant ? o.restaurant.phone : o.customer.phone) ? (
            <Button title="Call" kind="ghost" onPress={() => Linking.openURL(`tel:${toRestaurant ? o.restaurant.phone : o.customer.phone}`)} style={{ flex: 1 }} />
          ) : null}
        </Row>
      </Card>

      {o.dispatchStatus === 'ASSIGNED' ? <Button title="Arrived at restaurant" size="lg" loading={busy} onPress={() => run(() => ridersArrivedRestaurant(o.id, idem()))} /> : null}

      {o.dispatchStatus === 'AT_RESTAURANT' ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text variant="label">Check the package has {o.items.reduce((n, i) => n + i.quantity, 0)} item(s):</Text>
            {o.items.map((i, idx) => <Text key={idx}>• {i.quantity} × {i.name}{i.variantName ? ` (${i.variantName})` : ''}</Text>)}
            <Text variant="caption" muted>{o.status === 'READY' ? 'Restaurant marked the order ready' : 'Food is still being prepared'}</Text>
          </Card>
          <Button title="Picked up" size="lg" loading={busy} onPress={confirmPickup} />
        </>
      ) : null}

      {o.dispatchStatus === 'PICKED' ? <Button title="Arrived at customer" size="lg" loading={busy} onPress={() => run(() => ridersArrivedDrop(o.id, idem()))} /> : null}

      {o.dispatchStatus === 'AT_DROP' ? (
        <Card style={{ gap: spacing.md }}>
          {o.paymentMethod === 'cod' ? <Text variant="heading" color={t.warning}>Collect {formatPaise(o.collectPaise)} in cash</Text> : null}
          <Input label="Delivery OTP from customer" keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }} />
          <Button title="Complete delivery" size="lg" disabled={otp.length !== 4} loading={busy} onPress={() => run(() => ridersDeliver(o.id, { otp }, idem()).then(() => setOtp('')))} />
          <Button title="Customer unreachable" kind="ghost" onPress={unreachable} />
        </Card>
      ) : null}

      <Row>
        <Text variant="caption" muted style={{ flex: 1 }}>You earn {formatPaise(o.payoutPaise)} on this trip</Text>
        <Button title="SOS" kind="danger" onPress={sos} />
      </Row>
    </View>
  );
}
