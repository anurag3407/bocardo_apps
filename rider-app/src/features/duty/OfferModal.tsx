import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage, isApiError } from '@/core/api/api-error';
import type { RiderOffer } from '@/core/api/generated/model';
import { ridersAccept, ridersReject } from '@/core/api/generated/rider/rider';
import { formatDistance, formatPaise } from '@/lib/format';
import { Badge, Button, Card, Icon, IconBadge, radius, Row, spacing, Text, useTheme } from '@/ui';
import { useRinger } from './use-ringer';

/** Full-screen, ringing delivery request with a hard countdown. */
export function OfferModal({ offer, onResolved }: { offer: RiderOffer; onResolved: (accepted: boolean) => void }) {
  const t = useTheme();
  const [left, setLeft] = useState(() => secondsUntil(offer.expiresAt));
  const [total] = useState(() => Math.max(1, secondsUntil(offer.expiresAt)));
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

  const urgent = left <= 10;

  return (
    <Modal visible animationType="slide" onRequestClose={reject}>
      <View style={{ flex: 1, backgroundColor: t.surface }}>
        <SafeAreaView edges={['top']} style={[styles.hero, { backgroundColor: t.sky }]}>
          <Row justify="space-between">
            <Badge label="New delivery request" tone="lime" icon="flash" />
            <View style={[styles.timer, { backgroundColor: urgent ? t.danger : t.ink }]}>
              <Icon name="timer-outline" size={14} color={t.textInverse} />
              <Text variant="label" color={t.textInverse}>{left}s</Text>
            </View>
          </Row>
          <View style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg }}>
            <Text variant="label" color={t.ink} style={{ opacity: 0.7 }}>You earn</Text>
            <Text color={t.ink} style={{ fontSize: 56, fontWeight: '900', letterSpacing: -1.5, lineHeight: 64 }}>{formatPaise(offer.payoutPaise)}</Text>
            <Text variant="caption" color={t.ink} style={{ opacity: 0.7 }}>Estimated payout for this trip</Text>
          </View>
          <View style={[styles.track, { backgroundColor: 'rgba(11,27,38,0.15)' }]}>
            <View style={[styles.fill, { width: `${Math.round((left / total) * 100)}%`, backgroundColor: urgent ? t.danger : t.ink }]} />
          </View>
        </SafeAreaView>

        <View style={styles.body}>
          <Card style={{ gap: spacing.lg }}>
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center', paddingTop: 2 }}>
                <IconBadge name="restaurant" size={36} />
                <View style={[styles.route, { borderColor: t.border }]} />
                <IconBadge name="home" size={36} background={t.limeSoft} color={t.ink} />
              </View>
              <View style={{ flex: 1, gap: spacing.xl }}>
                <View style={{ gap: 2 }}>
                  <Text variant="overline" muted>Pickup · {formatDistance(offer.pickupDistanceM)} away</Text>
                  <Text variant="heading">{offer.restaurantName}</Text>
                  <Text variant="caption" muted numberOfLines={2}>{offer.restaurantAddress}</Text>
                </View>
                <View style={{ gap: 2 }}>
                  <Text variant="overline" muted>Drop</Text>
                  <Text variant="subheading">Trip distance {formatDistance(offer.tripDistanceM)}</Text>
                </View>
              </View>
            </Row>
          </Card>
          {offer.isCod ? (
            <Row gap={spacing.sm} style={[styles.payment, { backgroundColor: t.sunSoft }]}>
              <Icon name="cash" size={20} color={t.warning} />
              <Text variant="subheading" style={{ flex: 1 }}>Collect {formatPaise(offer.collectPaise)} in cash</Text>
            </Row>
          ) : (
            <Row gap={spacing.sm} style={[styles.payment, { backgroundColor: t.successSoft }]}>
              <Icon name="checkmark-circle" size={20} color={t.success} />
              <Text variant="subheading" color={t.success} style={{ flex: 1 }}>Prepaid order — no cash to collect</Text>
            </Row>
          )}
        </View>

        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: t.surfaceRaised }]}>
          <Row>
            <Button title="Reject" kind="outline" style={{ flex: 1, borderColor: t.danger }} loading={busy === 'reject'} disabled={busy !== null} onPress={reject} />
            <Button title="Accept order" icon="checkmark-circle" size="lg" style={{ flex: 2 }} loading={busy === 'accept'} disabled={busy !== null} onPress={accept} />
          </Row>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const secondsUntil = (iso: string) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.md },
  route: { width: 0, flex: 1, minHeight: 36, borderLeftWidth: 2, borderStyle: 'dashed', marginVertical: 4 },
  payment: { borderRadius: radius.md, padding: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
