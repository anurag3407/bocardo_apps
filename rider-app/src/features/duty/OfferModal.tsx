import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage, isApiError } from '@/core/api/api-error';
import type { RiderOffer } from '@/core/api/generated/model';
import { ridersAccept, ridersReject } from '@/core/api/generated/rider/rider';
import { formatDistance, formatPaise } from '@/lib/format';
import { Button, Card, Row, spacing, Text, useTheme } from '@/ui';
import { useRinger } from './use-ringer';

/** Full-screen, ringing delivery request with a hard countdown. */
export function OfferModal({ offer, onResolved }: { offer: RiderOffer; onResolved: (accepted: boolean) => void }) {
  const t = useTheme();
  const [left, setLeft] = useState(() => secondsUntil(offer.expiresAt));
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  useRinger(left > 0 && busy === null);

  useEffect(() => {
    const timer = setInterval(() => {
      const s = secondsUntil(offer.expiresAt);
      setLeft(s);
      if (s <= 0) onResolved(false);
    }, 500);
    return () => clearInterval(timer);
  }, [offer.expiresAt, onResolved]);

  const accept = async () => {
    setBusy('accept');
    try {
      await ridersAccept(offer.offerId, { headers: { 'Idempotency-Key': `accept-${offer.offerId}-${Crypto.randomUUID().slice(0, 8)}` } });
      onResolved(true);
    } catch (e) {
      Alert.alert(isApiError(e, 'OFFER_EXPIRED') || isApiError(e, 'ORDER_UNAVAILABLE') ? 'Order no longer available' : 'Could not accept', errorMessage(e));
      onResolved(false);
    }
  };

  const reject = async () => {
    setBusy('reject');
    await ridersReject(offer.offerId, {}).catch(() => undefined);
    onResolved(false);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={reject}>
      <SafeAreaView style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ gap: spacing.lg, flex: 1, justifyContent: 'center' }}>
          <Text variant="caption" muted center>NEW DELIVERY REQUEST</Text>
          <Text variant="title" center style={{ fontSize: 44 }}>{formatPaise(offer.payoutPaise)}</Text>
          <Text center muted>estimated earning</Text>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="heading">🍽️ {offer.restaurantName}</Text>
            <Text muted>{offer.restaurantAddress}</Text>
            <Row justify="space-between">
              <Text>Pickup {formatDistance(offer.pickupDistanceM)} away</Text>
              <Text>Trip {formatDistance(offer.tripDistanceM)}</Text>
            </Row>
            {offer.isCod ? <Text variant="label" color={t.warning}>💵 Collect {formatPaise(offer.collectPaise)} cash</Text> : <Text variant="label" color={t.success}>Prepaid order</Text>}
          </Card>
          <Text variant="heading" center color={left <= 10 ? t.danger : t.text}>{left}s</Text>
        </View>
        <Row>
          <Button title="Reject" kind="ghost" style={{ flex: 1 }} loading={busy === 'reject'} disabled={busy !== null} onPress={reject} />
          <Button title="Accept" size="lg" style={{ flex: 2 }} loading={busy === 'accept'} disabled={busy !== null} onPress={accept} />
        </Row>
      </SafeAreaView>
    </Modal>
  );
}

const secondsUntil = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));

const styles = StyleSheet.create({ root: { flex: 1, padding: spacing.lg } });
