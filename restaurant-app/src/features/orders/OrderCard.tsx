import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { PartnerOrder } from '@/core/api/generated/model';
import { formatPaise, formatTime } from '@/lib/format';
import { Badge, Button, Card, Chip, Icon, radius, Row, spacing, Text, useTheme, VegMark } from '@/ui';
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

  const isNew = o.status === 'PLACED';
  const urgent = secondsLeft < 60;

  return (
    <Card style={[{ gap: spacing.md }, isNew && { borderWidth: 2, borderColor: t.brand }]}>
      <Pressable onPress={() => router.push(`/order/${o.id}`)} accessibilityRole="button">
        <Row justify="space-between" gap={spacing.md}>
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={spacing.sm}>
              <Text variant="heading">#{o.shortCode}</Text>
              <Badge label={o.paymentMethod === 'cod' ? 'Cash' : 'Paid'} tone={o.paymentMethod === 'cod' ? 'warning' : 'success'} icon={o.paymentMethod === 'cod' ? 'cash' : 'checkmark-circle'} />
            </Row>
            <Text variant="caption" muted>{o.customerName} · placed {formatTime(o.placedAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="heading">{formatPaise(o.itemTotalPaise)}</Text>
            <Row gap={2}>
              <Text variant="caption" color={t.brandText}>Details</Text>
              <Icon name="chevron-forward" size={12} color={t.brandText} />
            </Row>
          </View>
        </Row>
      </Pressable>

      <View style={[styles.items, { backgroundColor: t.surface }]}>
        {o.items.map((i, idx) => (
          <Row key={idx} gap={spacing.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ paddingTop: 3 }}><VegMark veg={i.isVeg} /></View>
            <Text variant="subheading" color={t.brandText} style={{ minWidth: 26 }}>{i.quantity}×</Text>
            <Text style={{ flex: 1 }}>{i.name}{i.variantName ? ` (${i.variantName})` : ''}{i.addons.length ? ` + ${i.addons.map((a) => a.name).join(', ')}` : ''}</Text>
          </Row>
        ))}
      </View>
      {o.customerNote ? (
        <Row gap={spacing.sm} style={[styles.note, { backgroundColor: t.sunSoft }]}>
          <Icon name="document-text" size={16} color={t.warningText} />
          <Text variant="label" style={{ flex: 1 }}>{o.customerNote}</Text>
        </Row>
      ) : null}

      {isNew ? (
        <>
          <Row justify="space-between">
            <Text variant="label" muted>Preparation time</Text>
            <Row gap={4} style={[styles.timer, { backgroundColor: urgent ? t.dangerSoft : t.surface }]}>
              <Icon name="timer-outline" size={14} color={urgent ? t.dangerText : t.textMuted} />
              <Text variant="label" color={urgent ? t.dangerText : t.text}>
                Accept in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </Text>
            </Row>
          </Row>
          <Row gap={spacing.xs} style={{ flexWrap: 'wrap' }}>
            {PREP_CHOICES.map((m) => (
              <Chip key={m} label={`${m} min`} icon={prep === m ? 'checkmark' : undefined} active={prep === m} onPress={() => setPrep(m)} />
            ))}
          </Row>
          <Row>
            <Button title="Reject" kind="outline" onPress={reject} style={{ flex: 1, borderColor: t.danger }} />
            <Button title={`Accept · ${prep} min`} icon="checkmark-circle" size="lg" loading={actions.isPending} onPress={() => act({ kind: 'accept', prepMinutes: prep })} style={{ flex: 2 }} />
          </Row>
        </>
      ) : null}

      {o.status === 'ACCEPTED' ? (
        <Row>
          <Button title="+10 min" icon="time-outline" kind="secondary" onPress={() => act({ kind: 'extend', extraMinutes: 10 })} style={{ flex: 1 }} />
          <Button title="Mark ready" icon="bag-check" loading={actions.isPending} onPress={() => act({ kind: 'ready' })} style={{ flex: 2 }} />
        </Row>
      ) : null}

      {o.rider ? (
        <Row gap={spacing.sm}>
          <Icon name="bicycle" size={16} color={t.successText} />
          <Text variant="caption" muted style={{ flex: 1 }}>
            {o.rider.name ?? 'Rider'}{o.rider.vehicleNumber ? ` · ${o.rider.vehicleNumber}` : ''}{o.dispatchStatus === 'AT_RESTAURANT' ? ' · waiting at counter' : ''}
          </Text>
        </Row>
      ) : !isNew ? (
        <Row gap={spacing.sm}>
          <Icon name="search" size={14} color={t.textSubtle} />
          <Text variant="caption" subtle>Assigning a delivery partner…</Text>
        </Row>
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
  items: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  note: { borderRadius: radius.md, padding: spacing.md, alignItems: 'flex-start' },
  timer: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
});
