import { useState } from 'react';
import { usePartnerEarnings } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise } from '@/lib/format';
import { Card, ErrorState, Loading, Row, Screen, spacing, Text } from '@/ui';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const lastSevenDays = () => ({ from: isoDay(new Date(Date.now() - 6 * 86_400_000)), to: isoDay(new Date()) });

export function EarningsScreen() {
  const { current } = useCurrentRestaurant();
  const [range] = useState(lastSevenDays);
  const earnings = usePartnerEarnings(current?.id ?? '', range, { query: { enabled: !!current && current.memberRole !== 'staff' } });

  if (current?.memberRole === 'staff') return <Screen><Text muted>Only owners and managers can view earnings.</Text></Screen>;
  if (earnings.isLoading) return <Loading />;
  if (earnings.error || !earnings.data) return <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />;
  const e = earnings.data;

  return (
    <Screen scroll refreshing={earnings.isRefetching} onRefresh={() => earnings.refetch()}>
      <Text variant="title">Earnings</Text>
      <Card style={{ gap: spacing.xs }}>
        <Text muted>Last 7 days · {e.orders} orders</Text>
        <Text variant="title">{formatPaise(e.totalPaise)}</Text>
        <Text variant="caption" muted>Unsettled balance: {formatPaise(e.unpaidBalancePaise)} · paid out weekly</Text>
      </Card>
      {e.days.map((d) => (
        <Row key={d.day} justify="space-between">
          <Text>{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          <Text muted>{d.orders} orders</Text>
          <Text variant="label">{formatPaise(d.amountPaise)}</Text>
        </Row>
      ))}
    </Screen>
  );
}
