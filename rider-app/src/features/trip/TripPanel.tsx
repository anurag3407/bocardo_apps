import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
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
import { Badge, Button, Card, Icon, IconBadge, IconButton, Input, radius, Row, spacing, Text, useTheme } from '@/ui';

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

  const step = { ASSIGNED: 0, AT_RESTAURANT: 1, PICKED: 2, AT_DROP: 3 }[o.dispatchStatus as string] ?? 0;
  const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.md }}>
        <Row justify="space-between">
          <View>
            <Text variant="overline" muted>Current trip</Text>
            <Text variant="heading">Order #{o.shortCode}</Text>
          </View>
          <Badge label={o.paymentMethod === 'cod' ? `Collect ${formatPaise(o.collectPaise)}` : 'Prepaid'} tone={o.paymentMethod === 'cod' ? 'warning' : 'success'} icon={o.paymentMethod === 'cod' ? 'cash' : 'checkmark-circle'} />
        </Row>
        <View style={styles.steps}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1, gap: 6 }}>
              <View style={[styles.stepBar, { backgroundColor: i <= step ? t.brand : t.border }]} />
              <Text variant="caption" color={i === step ? t.text : t.textSubtle} style={{ fontWeight: i === step ? '700' : '400', fontSize: 11 }} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        <DeliveryMap
          markers={[
            { id: 'restaurant', kind: 'restaurant', lat: o.restaurant.lat, lng: o.restaurant.lng },
            { id: 'home', kind: 'home', lat: o.dropAddress.lat, lng: o.dropAddress.lng },
          ]}
          fitToMarkers
          showUserLocation
          height={220}
        />
      </View>

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
          <IconBadge name={toRestaurant ? 'restaurant' : 'home'} size={44} background={toRestaurant ? t.brandSoft : t.limeSoft} color={toRestaurant ? t.brandText : t.ink} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" muted>{toRestaurant ? 'Pickup from' : 'Deliver to'}</Text>
            <Text variant="heading">{toRestaurant ? o.restaurant.name : o.customer.name ?? 'Customer'}</Text>
            <Text variant="caption" muted>{toRestaurant ? o.restaurant.addressLine : [o.dropAddress.line1, o.dropAddress.line2, o.dropAddress.landmark].filter(Boolean).join(', ')}</Text>
          </View>
          {/* masked call: the customer's number is never shown to the rider */}
          <IconButton name="call" label={toRestaurant ? 'Call restaurant' : 'Call customer'} onPress={() => void startCall(o.id, toRestaurant ? 'restaurant' : 'customer')} size={44} background={t.successSoft} color={t.success} />
        </Row>
        {!toRestaurant && o.customerNote ? (
          <Row gap={spacing.sm} style={[styles.note, { backgroundColor: t.sunSoft }]}>
            <Icon name="document-text" size={16} color={t.warning} />
            <Text variant="label" style={{ flex: 1 }}>{o.customerNote}</Text>
          </Row>
        ) : null}
        <Button title="Navigate" icon="navigate" kind="secondary" onPress={() => Linking.openURL(navigationUrl(target.lat, target.lng))} />
      </Card>

      {o.dispatchStatus === 'ASSIGNED' ? <Button title="Arrived at restaurant" icon="flag" size="lg" loading={busy} onPress={() => run(() => ridersArrivedRestaurant(o.id, idem()))} /> : null}

      {o.dispatchStatus === 'AT_RESTAURANT' ? (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Row justify="space-between">
              <Text variant="heading">Check the package</Text>
              <Badge label={`${itemCount} item${itemCount === 1 ? '' : 's'}`} tone="brand" />
            </Row>
            {o.items.map((i, idx) => (
              <Row key={idx} gap={spacing.sm}>
                <Text variant="subheading" color={t.brandText} style={{ minWidth: 28 }}>{i.quantity}×</Text>
                <Text style={{ flex: 1 }}>{i.name}{i.variantName ? ` (${i.variantName})` : ''}</Text>
              </Row>
            ))}
            <Row gap={spacing.sm} style={{ marginTop: spacing.xs }}>
              <Icon name={o.status === 'READY' ? 'checkmark-circle' : 'flame'} size={16} color={o.status === 'READY' ? t.success : t.warning} />
              <Text variant="caption" color={o.status === 'READY' ? t.success : t.warning}>{o.status === 'READY' ? 'Restaurant marked the order ready' : 'Food is still being prepared'}</Text>
            </Row>
          </Card>
          <Button title="Picked up" icon="bag-check" size="lg" loading={busy} onPress={confirmPickup} />
        </>
      ) : null}

      {o.dispatchStatus === 'PICKED' ? <Button title="Arrived at customer" icon="flag" size="lg" loading={busy} onPress={() => run(() => ridersArrivedDrop(o.id, idem()))} /> : null}

      {o.dispatchStatus === 'AT_DROP' ? (
        <Card style={{ gap: spacing.lg }}>
          {o.paymentMethod === 'cod' ? (
            <Row gap={spacing.sm} style={[styles.note, { backgroundColor: t.sunSoft }]}>
              <Icon name="cash" size={20} color={t.warning} />
              <Text variant="heading" style={{ flex: 1 }}>Collect {formatPaise(o.collectPaise)} in cash</Text>
            </Row>
          ) : null}
          <Input
            label="Delivery OTP from customer"
            keyboardType="number-pad"
            maxLength={4}
            value={otp}
            onChangeText={setOtp}
            placeholder="••••"
            style={{ fontSize: 26, fontWeight: '800', letterSpacing: 14, textAlign: 'center' }}
          />
          <Row>
            {photo ? <Image source={photo.uri} style={styles.photo} contentFit="cover" /> : null}
            <Button
              title={photo ? (uploading ? 'Uploading…' : photo.path ? 'Retake photo' : 'Retry photo') : `Photo of package at door${o.proofPhotoRequired ? ' *' : ''}`}
              icon="camera"
              kind="secondary"
              loading={uploading}
              onPress={takePhoto}
              style={{ flex: 1 }}
            />
          </Row>
          <Button
            title={photoMissing ? 'Add doorstep photo to finish' : 'Complete delivery'}
            icon="checkmark-done"
            size="lg"
            disabled={otp.length !== 4 || photoMissing || uploading}
            loading={busy}
            onPress={() => run(() => ridersDeliver(o.id, { otp, proof }, idem()).then(() => setOtp('')))}
          />
          <Button title="Customer unreachable" kind="ghost" icon="person-remove-outline" onPress={unreachable} />
        </Card>
      ) : null}

      <Row gap={spacing.md}>
        <Row gap={spacing.sm} style={[styles.earn, { backgroundColor: t.limeSoft }]}>
          <Icon name="wallet" size={18} color={t.success} />
          <Text variant="label">You earn {formatPaise(o.payoutPaise)} on this trip</Text>
        </Row>
        <Button title="SOS" icon="warning" kind="danger" onPress={sos} />
      </Row>
    </View>
  );
}

const STEPS = ['To restaurant', 'Pickup', 'To customer', 'Hand over'];

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: spacing.xs },
  stepBar: { height: 4, borderRadius: 2 },
  note: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  photo: { width: 52, height: 52, borderRadius: radius.sm },
  earn: { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
});
