import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRidersEarnings, useRidersMe } from '@/core/api/generated/rider/rider';
import { formatPaise } from '@/lib/format';
import { Card, DayBars, Divider, ErrorState, Icon, ListItem, Loading, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const lastSevenDays = () => ({ from: isoDay(new Date(Date.now() - 6 * 86_400_000)), to: isoDay(new Date()) });

export function EarningsScreen() {
  const t = useTheme();
  const [range] = useState(lastSevenDays);
  const earnings = useRidersEarnings(range);
  const me = useRidersMe();

  if (earnings.isLoading) return <Loading />;
  if (earnings.error || !earnings.data) return <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />;
  const e = earnings.data;

  const payout = e.unpaidBalancePaise >= 0;

  return (
    <Screen scroll tone="surface" title="Earnings" subtitle="Last 7 days" refreshing={earnings.isRefetching} onRefresh={() => earnings.refetch()}>
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text variant="label" color={t.ink} style={{ opacity: 0.75 }}>Total earned</Text>
          <Text variant="display" color={t.ink}>{formatPaise(e.totalPaise)}</Text>
        </View>
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          <View style={[styles.pill, { backgroundColor: t.surfaceRaised }]}>
            <Icon name="bicycle" size={14} color={t.ink} />
            <Text variant="label" color={t.ink}>{e.orders} deliveries</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: payout ? t.lime : t.sun }]}>
            <Icon name={payout ? 'arrow-down-circle' : 'arrow-up-circle'} size={14} color={t.ink} />
            <Text variant="label" color={t.ink}>{payout ? `Next payout ${formatPaise(e.unpaidBalancePaise)}` : `Deposit ${formatPaise(-e.unpaidBalancePaise)}`}</Text>
          </View>
        </Row>
      </Card>

      {me.data ? (
        <Card>
          <ListItem icon="cash-outline" title="Cash in hand" subtitle={`Limit ${formatPaise(me.data.cashLimitPaise)}`} value={formatPaise(me.data.cashInHandPaise)} />
        </Card>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <Text variant="heading">Daily earnings</Text>
        <DayBars data={e.days.map((d) => ({ day: d.day, value: d.amountPaise, detail: `${formatPaise(d.amountPaise)} · ${d.orders} trips` }))} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {e.days.map((d, i) => (
          <View key={d.day}>
            {i > 0 ? <Divider /> : null}
            <Row justify="space-between" style={{ paddingVertical: spacing.md }}>
              <View style={{ gap: 2 }}>
                <Text variant="subheading">{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <Text variant="caption" muted>{d.orders} trips</Text>
              </View>
              <Text variant="subheading">{formatPaise(d.amountPaise)}</Text>
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
});
