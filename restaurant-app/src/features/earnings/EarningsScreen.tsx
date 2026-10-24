import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePartnerEarnings } from '@/core/api/generated/partner/partner';
import { useCurrentRestaurant } from '@/features/outlet/selected-restaurant';
import { formatPaise } from '@/lib/format';
import { Card, DayBars, Divider, EmptyState, ErrorState, Icon, Loading, radius, Row, Screen, spacing, Text, useTheme } from '@/ui';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const lastSevenDays = () => ({ from: isoDay(new Date(Date.now() - 6 * 86_400_000)), to: isoDay(new Date()) });

export function EarningsScreen() {
  const t = useTheme();
  const { current } = useCurrentRestaurant();
  const [range] = useState(lastSevenDays);
  const earnings = usePartnerEarnings(current?.id ?? '', range, { query: { enabled: !!current && current.memberRole !== 'staff' } });

  if (current?.memberRole === 'staff') {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title="Owners and managers only" message="Ask your outlet owner for access to earnings." />
      </Screen>
    );
  }
  if (earnings.isLoading) return <Loading />;
  if (earnings.error || !earnings.data) return <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />;
  const e = earnings.data;

  return (
    <Screen scroll tone="surface" title="Earnings" subtitle="Last 7 days" refreshing={earnings.isRefetching} onRefresh={() => earnings.refetch()}>
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text variant="label" color={t.ink} style={{ opacity: 0.75 }}>Total earnings</Text>
          <Text variant="display" color={t.ink}>{formatPaise(e.totalPaise)}</Text>
        </View>
        <Row gap={spacing.sm}>
          <View style={[styles.pill, { backgroundColor: t.surfaceRaised }]}>
            <Icon name="receipt" size={14} color={t.ink} />
            <Text variant="label" color={t.ink}>{e.orders} orders</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: t.lime }]}>
            <Icon name="wallet" size={14} color={t.ink} />
            <Text variant="label" color={t.ink}>{formatPaise(e.unpaidBalancePaise)} unsettled</Text>
          </View>
        </Row>
        <Text variant="caption" color={t.ink} style={{ opacity: 0.7 }}>Settlements are paid out weekly to your bank account.</Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="heading">Daily earnings</Text>
        <DayBars data={e.days.map((d) => ({ day: d.day, value: d.amountPaise, detail: `${formatPaise(d.amountPaise)} · ${d.orders} orders` }))} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {e.days.map((d, i) => (
          <View key={d.day}>
            {i > 0 ? <Divider /> : null}
            <Row justify="space-between" style={{ paddingVertical: spacing.md }}>
              <View style={{ gap: 2 }}>
                <Text variant="subheading">{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <Text variant="caption" muted>{d.orders} orders</Text>
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
