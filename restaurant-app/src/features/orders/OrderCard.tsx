import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { PartnerOrder } from '@/core/api/generated/model';
import { formatPaise, formatTime } from '@/lib/format';
import { Badge, Button, Card, radius, Row, spacing, Text, useTheme, VegMark } from '@/ui';
import { useOrderActions } from './use-order-actions';

const PREP_CHOICES = [10, 15, 20, 30, 45];

export function OrderCard({ order: o, restaurantId, defaultPrep }: { order: PartnerOrder; restaurantId: string; defaultPrep: number }) {
  const t = useTheme();
  const actions = useOrderActions(restaurantId);
  const [prep, setPrep] = useState(defaultPrep);
  const secondsLeft = useCountdown(o.acceptBy);
  const act = (action: Parameters<typeof actions.mutate>[0]['action']) => actions.mutate({ orderId: o.id, action });

  const reject = () =>
    Alert.alert('Reject order?', 'The customer is refunded automatically.', [
      { text: 'Items unavailable', onPress: () => act({ kind: 'reject', reason: 'ITEMS_UNAVAILABLE' }) },
      { text: 'Too busy', onPress: () => act({ kind: 'reject', reason: 'TOO_BUSY' }) },
      { text: 'Closing soon', onPress: () => act({ kind: 'reject', reason: 'CLOSING_SOON' }) },
      { text: 'Keep order', style: 'cancel' },
    ]);

  return (
    <Card style={{ gap: spacing.sm, borderColor: o.status === 'PLACED' ? t.brand : t.border, borderWidth: o.status === 'PLACED' ? 2 : StyleSheet.hairlineWidth }}>
      <Pressable onPress={() => router.push(`/order/${o.id}`)}>
        <Row justify="space-between">
          <Text variant="heading">#{o.shortCode} · {o.customerName}</Text>
          <Badge label={o.paymentMethod === 'cod' ? 'Cash' : 'Paid'} tone={o.paymentMethod === 'cod' ? 'warning' : 'success'} />
        </Row>
        <Text variant="caption" muted>Placed {formatTime(o.placedAt)} · {formatPaise(o.itemTotalPaise)}</Text>
      </Pressable>

      <View style={{ gap: 4 }}>
        {o.items.map((i, idx) => (
          <Row key={idx}>
            <VegMark veg={i.isVeg} />
            <Text variant="label">{i.quantity} ×</Text>
            <Text style={{ flex: 1 }}>{i.name}{i.variantName ? ` (${i.variantName})` : ''}{i.addons.length ? ` + ${i.addons.map((a) => a.name).join(', ')}` : ''}</Text>
          </Row>
        ))}
      </View>
      {o.customerNote ? <Text variant="caption" color={t.warning}>📝 {o.customerNote}</Text> : null}

      {o.status === 'PLACED' ? (
        <>
          <Text variant="label" color={secondsLeft < 60 ? t.danger : t.text}>Accept within {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Text>
          <Row gap={spacing.xs}>
            {PREP_CHOICES.map((m) => (
              <Pressable key={m} onPress={() => setPrep(m)} style={[styles.chip, { borderColor: prep === m ? t.brand : t.border, backgroundColor: prep === m ? t.brandSoft : 'transparent' }]}>
                <Text variant="caption">{m}m</Text>
              </Pressable>
            ))}
          </Row>
          <Row>
            <Button title="Reject" kind="ghost" onPress={reject} style={{ flex: 1 }} />
            <Button title={`Accept · ${prep} min`} loading={actions.isPending} onPress={() => act({ kind: 'accept', prepMinutes: prep })} style={{ flex: 2 }} />
          </Row>
        </>
      ) : null}

      {o.status === 'ACCEPTED' ? (
        <Row>
          <Button title="+10 min" kind="ghost" onPress={() => act({ kind: 'extend', extraMinutes: 10 })} style={{ flex: 1 }} />
          <Button title="Mark ready" loading={actions.isPending} onPress={() => act({ kind: 'ready' })} style={{ flex: 2 }} />
        </Row>
      ) : null}

      {o.rider ? (
        <Text variant="caption" muted>🛵 {o.rider.name ?? 'Rider'} {o.rider.vehicleNumber ? `· ${o.rider.vehicleNumber}` : ''} {o.dispatchStatus === 'AT_RESTAURANT' ? '· waiting at counter' : ''}</Text>
      ) : o.status !== 'PLACED' ? (
        <Text variant="caption" muted>Assigning a delivery partner…</Text>
      ) : null}
    </Card>
  );
}

function useCountdown(deadline: string | null) {
  const compute = () => (deadline ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
  return left;
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
});
