import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '@/core/api/api-error';
import { partnerSetBusy, partnerSetHours, partnerUpdate } from '@/core/api/generated/partner/partner';
import { signOut } from '@/core/auth/auth-actions';
import { Badge, Button, Card, Chip, Divider, IconBadge, Input, ListItem, RatingBadge, Row, Screen, spacing, Text, useTheme } from '@/ui';
import { useCurrentRestaurant } from './selected-restaurant';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function OutletScreen() {
  const t = useTheme();
  const { current, restaurants, select, refetch } = useCurrentRestaurant();
  const [prep, setPrep] = useState<string | null>(null);
  const [hours, setHours] = useState<Record<number, { opensAt: string; closesAt: string }> | null>(null);

  if (!current) return null;
  const rid = current.id;
  const isManager = current.memberRole !== 'staff';
  const editedHours = hours ?? Object.fromEntries(DAYS.map((_, d) => [d, current.hours.find((h) => h.dayOfWeek === d) ?? { opensAt: '', closesAt: '' }]));

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refetch();
    } catch (e) {
      Alert.alert('Could not update', errorMessage(e));
    }
  };

  const saveHours = () =>
    run(() =>
      partnerSetHours(rid, {
        hours: Object.entries(editedHours)
          .filter(([, h]) => /^\d{2}:\d{2}$/.test(h.opensAt) && /^\d{2}:\d{2}$/.test(h.closesAt))
          .map(([d, h]) => ({ dayOfWeek: Number(d), opensAt: h.opensAt, closesAt: h.closesAt })),
      }).then(() => setHours(null)),
    );

  return (
    <Screen scroll tone="surface" title="Outlet">
      <Card style={{ backgroundColor: t.sky, gap: spacing.md }}>
        <Row gap={spacing.md}>
          <IconBadge name="storefront" size={52} background={t.surfaceRaised} color={t.ink} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" color={t.ink} numberOfLines={2}>{current.name}</Text>
            <Text variant="caption" color={t.ink} style={{ opacity: 0.75, textTransform: 'capitalize' }}>{current.memberRole} access</Text>
          </View>
        </Row>
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
          <Badge label={current.status} tone={current.status === 'active' ? 'success' : 'warning'} icon={current.status === 'active' ? 'checkmark-circle' : 'hourglass'} solid />
          {current.ratingCount > 0 ? <RatingBadge value={current.ratingAvg} count={current.ratingCount} /> : null}
          <Badge label={`Commission ${current.commissionBps / 100}%`} tone="neutral" />
        </Row>
      </Card>

      {restaurants.length > 1 ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" muted>Switch outlet</Text>
          <Row gap={spacing.sm} style={{ flexWrap: 'wrap' }}>
            {restaurants.map((r) => <Chip key={r.id} label={r.name} icon="storefront-outline" active={r.id === rid} onPress={() => select(r.id)} />)}
          </Row>
        </View>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <Row gap={spacing.md}>
          <IconBadge name="pause-circle" size={40} shape="square" background={t.warningSoft} color={t.warning} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">Busy mode</Text>
            <Text variant="caption" muted>
              {current.busyUntil ? `Paused until ${new Date(current.busyUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'Pause new orders without going offline'}
            </Text>
          </View>
        </Row>
        <Row>
          {[15, 30, 60].map((m) => <Button key={m} title={`${m} min`} kind="secondary" size="sm" onPress={() => run(() => partnerSetBusy(rid, { minutes: m }))} style={{ flex: 1 }} />)}
        </Row>
        {current.busyUntil ? <Button title="Resume orders now" icon="play" onPress={() => run(() => partnerSetBusy(rid, { minutes: 0 }))} /> : null}
      </Card>

      {isManager ? (
        <>
          <Card style={{ gap: spacing.md }}>
            <Row gap={spacing.md}>
              <IconBadge name="flame" size={40} shape="square" />
              <View style={{ flex: 1 }}>
                <Text variant="heading">Preparation time</Text>
                <Text variant="caption" muted>Default time you need per order</Text>
              </View>
            </Row>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Input keyboardType="number-pad" icon="timer-outline" value={prep ?? String(current.avgPrepMinutes)} onChangeText={setPrep} hint="minutes" /></View>
              <Button title="Save" disabled={prep === null} onPress={() => run(() => partnerUpdate(rid, { avgPrepMinutes: Number(prep) }).then(() => setPrep(null)))} style={{ minHeight: 52 }} />
            </Row>
          </Card>
          <Card style={{ gap: spacing.md }}>
            <Row gap={spacing.md}>
              <IconBadge name="calendar" size={40} shape="square" />
              <View style={{ flex: 1 }}>
                <Text variant="heading">Opening hours</Text>
                <Text variant="caption" muted>24h HH:MM · blank = closed · same time = open all day</Text>
              </View>
            </Row>
            <Row>
              <View style={{ width: 44 }} />
              <Text variant="overline" subtle style={{ flex: 1 }}>Opens</Text>
              <Text variant="overline" subtle style={{ flex: 1 }}>Closes</Text>
            </Row>
            {DAYS.map((day, d) => (
              <Row key={day}>
                <Text variant="subheading" style={{ width: 44 }}>{day}</Text>
                <View style={{ flex: 1 }}><Input value={editedHours[d].opensAt} placeholder="10:00" onChangeText={(v) => setHours({ ...editedHours, [d]: { ...editedHours[d], opensAt: v } })} /></View>
                <View style={{ flex: 1 }}><Input value={editedHours[d].closesAt} placeholder="23:00" onChangeText={(v) => setHours({ ...editedHours, [d]: { ...editedHours[d], closesAt: v } })} /></View>
              </Row>
            ))}
            <Text variant="caption" subtle>Closing earlier than opening means the slot runs past midnight.</Text>
            <Button title="Save hours" icon="checkmark" disabled={!hours} onPress={saveHours} />
          </Card>
        </>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListItem icon="time-outline" title="Order history" subtitle="Past and cancelled orders" onPress={() => router.push('/history')} />
        <Divider inset={48} />
        <ListItem icon="chatbubble-ellipses-outline" title="Partner support" subtitle="Payouts, menu, documents" onPress={() => router.push('/support/new')} />
        <Divider inset={48} />
        <ListItem icon="log-out-outline" title="Sign out" chevron={false} destructive onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
