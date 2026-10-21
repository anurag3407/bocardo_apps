import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
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
import { useSession } from '@/core/auth/session-store';
import { startCall } from '@/core/calls/start-call';
import { currentPosition, navigationUrl } from '@/core/location/background-tracking';
import { captureDoorstepPhoto, uploadDoorstepPhoto } from '@/core/proof/delivery-photo';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { formatPaise } from '@/lib/format';
import { Badge, Button, Card, Input, Row, spacing, Text, useTheme } from '@/ui';

const idem = () => ({ headers: { 'Idempotency-Key': Crypto.randomUUID() } });

/** Step-by-step trip: restaurant → pickup → customer → OTP hand-off. */
export function TripPanel({ order: o }: { order: RiderOrder }) {
  const t = useTheme();
  const qc = useQueryClient();
  const riderId = useSession((s) => s.session?.user.id);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; path: string | null; lat?: number; lng?: number } | null>(null);
  const [uploading, setUploading] = useState(false);
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

  /** Doorstep photo: the rider's evidence against "food not delivered" claims. */
  const takePhoto = async () => {
    try {
      const uri = await captureDoorstepPhoto();
      if (!uri || !riderId) return;
      const pos = await currentPosition().catch(() => null);
      setPhoto({ uri, path: null, ...(pos ?? {}) });
      setUploading(true);
      const path = await uploadDoorstepPhoto(riderId, o.id, uri);
      setPhoto((p) => (p ? { ...p, path } : p));
    } catch (e) {
      Alert.alert('Photo not saved', errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const proof = photo?.path ? { path: photo.path, lat: photo.lat, lng: photo.lng } : undefined;
  const photoMissing = o.proofPhotoRequired && !proof;

  const unreachable = () => {
    if (photoMissing) return Alert.alert('Photo needed', 'Take a photo of the door first as proof that you reached the address.');
    Alert.alert('Customer unreachable?', 'Call the customer first. You can mark undeliverable after waiting 10 minutes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark undeliverable', style: 'destructive', onPress: () => run(() => ridersUndeliverable(o.id, { reason: 'Customer unreachable at doorstep', proof }, idem())) },
    ]);
  };

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
          {/* masked call: the customer's number is never shown to the rider */}
          <Button title="Call" kind="ghost" onPress={() => void startCall(o.id, toRestaurant ? 'restaurant' : 'customer')} style={{ flex: 1 }} />
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
          <Row>
            {photo ? <Image source={photo.uri} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" /> : null}
            <Button
              title={photo ? (uploading ? 'Uploading…' : photo.path ? 'Retake photo' : 'Retry photo') : `Photo of package at door${o.proofPhotoRequired ? ' *' : ''}`}
              kind="secondary"
              loading={uploading}
              onPress={takePhoto}
              style={{ flex: 1 }}
            />
          </Row>
          <Button
            title={photoMissing ? 'Add doorstep photo to finish' : 'Complete delivery'}
            size="lg"
            disabled={otp.length !== 4 || photoMissing || uploading}
            loading={busy}
            onPress={() => run(() => ridersDeliver(o.id, { otp, proof }, idem()).then(() => setOtp('')))}
          />
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
