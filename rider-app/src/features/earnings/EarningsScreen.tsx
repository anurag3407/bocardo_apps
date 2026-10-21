import { useState } from 'react';
import { useRidersEarnings, useRidersMe } from '@/core/api/generated/rider/rider';
import { formatPaise } from '@/lib/format';
import { Card, ErrorState, Loading, Row, Screen, spacing, Text } from '@/ui';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const lastSevenDays = () => ({ from: isoDay(new Date(Date.now() - 6 * 86_400_000)), to: isoDay(new Date()) });

export function EarningsScreen() {
  const [range] = useState(lastSevenDays);
  const earnings = useRidersEarnings(range);
  const me = useRidersMe();

  if (earnings.isLoading) return <Loading />;
  if (earnings.error || !earnings.data) return <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />;
  const e = earnings.data;

  return (
    <Screen scroll refreshing={earnings.isRefetching} onRefresh={() => earnings.refetch()}>
      <Text variant="title">Earnings</Text>
      <Card style={{ gap: spacing.xs }}>
        <Text muted>Last 7 days · {e.orders} deliveries</Text>
        <Text variant="title">{formatPaise(e.totalPaise)}</Text>
        <Text variant="caption" muted>
          {e.unpaidBalancePaise >= 0 ? `Next payout: ${formatPaise(e.unpaidBalancePaise)}` : `Cash to deposit: ${formatPaise(-e.unpaidBalancePaise)}`}
        </Text>
      </Card>
      {me.data ? <Text variant="caption" muted>Cash in hand: {formatPaise(me.data.cashInHandPaise)} · limit {formatPaise(me.data.cashLimitPaise)}</Text> : null}
      {e.days.map((d) => (
        <Row key={d.day} justify="space-between">
          <Text>{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          <Text muted>{d.orders} trips</Text>
          <Text variant="label">{formatPaise(d.amountPaise)}</Text>
        </Row>
      ))}
    </Screen>
  );
}
