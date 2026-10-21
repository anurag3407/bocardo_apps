import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '@/core/api/api-error';
import { partnerSetBusy, partnerSetHours, partnerUpdate } from '@/core/api/generated/partner/partner';
import { signOut } from '@/core/auth/auth-actions';
import { Badge, Button, Card, Input, Row, Screen, spacing, Text } from '@/ui';
import { useCurrentRestaurant } from './selected-restaurant';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function OutletScreen() {
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
    <Screen scroll>
      <Text variant="title">{current.name}</Text>
      <Row>
        <Badge label={current.status} tone={current.status === 'active' ? 'success' : 'warning'} />
        <Badge label={`★ ${current.ratingAvg.toFixed(1)} (${current.ratingCount})`} />
        <Badge label={`Commission ${current.commissionBps / 100}%`} />
      </Row>
      {restaurants.length > 1 ? (
        <Row>{restaurants.map((r) => <Button key={r.id} title={r.name} kind={r.id === rid ? 'primary' : 'ghost'} onPress={() => select(r.id)} />)}</Row>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <Text variant="heading">Busy mode</Text>
        <Text muted>Pause new orders for a while without going offline.</Text>
        <Row>
          {[15, 30, 60].map((m) => <Button key={m} title={`${m} min`} kind="secondary" onPress={() => run(() => partnerSetBusy(rid, { minutes: m }))} />)}
          {current.busyUntil ? <Button title="Resume" onPress={() => run(() => partnerSetBusy(rid, { minutes: 0 }))} /> : null}
        </Row>
      </Card>

      {isManager ? (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="heading">Average preparation time</Text>
            <Row>
              <View style={{ flex: 1 }}><Input keyboardType="number-pad" value={prep ?? String(current.avgPrepMinutes)} onChangeText={setPrep} /></View>
              <Button title="Save" disabled={prep === null} onPress={() => run(() => partnerUpdate(rid, { avgPrepMinutes: Number(prep) }).then(() => setPrep(null)))} />
            </Row>
          </Card>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="heading">Opening hours (24h, HH:MM)</Text>
            <Text variant="caption" muted>Closing earlier than opening means the slot runs past midnight. Same time = open all day. Leave blank to close.</Text>
            {DAYS.map((day, d) => (
              <Row key={day}>
                <Text style={{ width: 40 }}>{day}</Text>
                <View style={{ flex: 1 }}><Input value={editedHours[d].opensAt} placeholder="10:00" onChangeText={(v) => setHours({ ...editedHours, [d]: { ...editedHours[d], opensAt: v } })} /></View>
                <View style={{ flex: 1 }}><Input value={editedHours[d].closesAt} placeholder="23:00" onChangeText={(v) => setHours({ ...editedHours, [d]: { ...editedHours[d], closesAt: v } })} /></View>
              </Row>
            ))}
            <Button title="Save hours" disabled={!hours} onPress={saveHours} />
          </Card>
        </>
      ) : null}

      <Button title="Order history" kind="ghost" onPress={() => router.push('/history')} />
      <Button title="Partner support" kind="ghost" onPress={() => router.push('/support/new')} />
      <Button title="Sign out" kind="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
