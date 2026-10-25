import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getRidersActiveQueryKey, getRidersCurrentOfferQueryKey, getRidersMeQueryKey, ridersOffline, ridersOnline, useRidersActive, useRidersCurrentOffer, useRidersMe } from '@/core/api/generated/rider/rider';
import { currentPosition, setTrackingMode, startTracking, stopTracking } from '@/core/location/background-tracking';
import { isBatteryRestricted, requestUnrestrictedBattery } from '@/core/power/battery-optimization';
import { PowerSetupCard } from '@/features/power/PowerSetupCard';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { useRealtime } from '@/core/realtime/use-realtime';
import { TripPanel } from '@/features/trip/TripPanel';
import { formatPaise } from '@/lib/format';
import { Card, elevation, EmptyState, ErrorState, Icon, Loading, Logo, radius, Row, Screen, spacing, Text, Toggle, useTheme } from '@/ui';
import { OfferModal } from './OfferModal';

export function DutyScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useRidersMe();
  const online = !!me.data?.isOnline;
  const active = useRidersActive({ query: { enabled: online, refetchInterval: 20_000 } });
  const hasTrip = !!active.data?.order;
  // offers arrive by push + realtime; polling recovers ones missed while the app was killed
  const offer = useRidersCurrentOffer({ query: { enabled: online && !hasTrip, refetchInterval: 5_000 } });
  const [toggling, setToggling] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getRidersCurrentOfferQueryKey() });
    void qc.invalidateQueries({ queryKey: getRidersActiveQueryKey() });
  }, [qc]);

  useRealtime(me.data ? `rider:${me.data.id}` : null, refreshAll);

  // high-frequency GPS only while a customer is watching the trip
  useEffect(() => {
    if (online) void setTrackingMode(hasTrip ? 'active' : 'idle').catch(() => undefined);
  }, [online, hasTrip]);

  if (me.isLoading) return <Loading />;
  if (me.error || !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  const rider = me.data;

  if (rider.kycStatus !== 'approved') {
    return (
      <Screen>
        <EmptyState
          icon={rider.kycStatus === 'pending' ? 'hourglass-outline' : 'alert-circle-outline'}
          title={rider.kycStatus === 'pending' ? 'Verification in progress' : `Account ${rider.kycStatus}`}
          message={rider.kycStatus === 'pending' ? 'We are verifying your documents. You can go online once approved.' : 'Contact rider support for help.'}
        />
      </Screen>
    );
  }

  const toggle = async (next: boolean) => {
    if (next && (await isBatteryRestricted())) {
      const proceed = await new Promise<boolean>((resolve) =>
        Alert.alert('Battery saver may stop tracking', 'Allow Bocardo to run in the background so you do not miss orders.', [
          { text: 'Allow', onPress: () => void requestUnrestrictedBattery().finally(() => resolve(false)) },
          { text: 'Go online anyway', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
      if (!proceed) return;
    }
    setToggling(true);
    try {
      if (next) {
        await startTracking(hasTrip ? 'active' : 'idle');
        await ridersOnline(await currentPosition());
      } else {
        await ridersOffline();
        await stopTracking();
      }
      await qc.invalidateQueries({ queryKey: getRidersMeQueryKey() });
    } catch (e) {
      Alert.alert(next ? 'Could not go online' : 'Could not go offline', errorMessage(e));
    } finally {
      setToggling(false);
    }
  };

  const pendingOffer = offer.data?.offer && offer.data.offer.offerId !== dismissed ? offer.data.offer : null;
  const cashNearLimit = rider.cashInHandPaise >= rider.cashLimitPaise * 0.8;

  const cashShare = rider.cashLimitPaise ? Math.min(1, rider.cashInHandPaise / rider.cashLimitPaise) : 0;
  const firstName = rider.fullName?.split(' ')[0];

  return (
    <Screen scroll tone="surface" refreshing={me.isRefetching} onRefresh={() => { void me.refetch(); refreshAll(); }}>
      <Row justify="space-between">
        <View style={{ gap: 2 }}>
          <Text variant="caption" muted>{firstName ? `Hi ${firstName} 👋` : 'Welcome back'}</Text>
          <Text variant="title">{hasTrip ? 'On a trip' : online ? 'Ready for orders' : 'Start your shift'}</Text>
        </View>
        <Logo size={36} />
      </Row>

      <View style={[styles.duty, { backgroundColor: online ? t.success : t.ink }]}>
        <View style={[styles.dutyIcon, { backgroundColor: online ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)' }]}>
          <Icon name={online ? 'radio' : 'power'} size={26} color={t.textInverse} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" color={t.textInverse}>{online ? "You're online" : "You're offline"}</Text>
          <Text variant="caption" color={t.textInverse} style={{ opacity: 0.8 }}>
            {hasTrip ? 'Finish the trip to go offline' : online ? 'You will receive delivery requests' : 'Go online to start earning'}
          </Text>
        </View>
        <Toggle value={online} disabled={toggling || hasTrip} onValueChange={toggle} tone="success" accessibilityLabel="Available for delivery orders" />
      </View>

      <PowerSetupCard />

      <Card style={{ gap: spacing.sm }}>
        <Row justify="space-between">
          <Row gap={spacing.sm}>
            <Icon name="cash" size={18} color={cashNearLimit ? t.dangerText : t.successText} />
            <Text variant="subheading">Cash in hand</Text>
          </Row>
          <Text variant="subheading">{formatPaise(rider.cashInHandPaise)} <Text variant="caption" muted>/ {formatPaise(rider.cashLimitPaise)}</Text></Text>
        </Row>
        <View style={[styles.track, { backgroundColor: t.surface }]}>
          <View style={[styles.fill, { width: `${Math.round(cashShare * 100)}%`, backgroundColor: cashNearLimit ? t.danger : t.success }]} />
        </View>
        {cashNearLimit ? <Text variant="caption" color={t.dangerText}>Deposit at a hub to keep getting cash orders.</Text> : null}
      </Card>

      {online && hasTrip ? <TripPanel order={active.data!.order!} /> : null}
      {online && !hasTrip ? (
        <View style={styles.mapWrap}>
          <DeliveryMap markers={[]} showUserLocation height={340} />
          <View style={[styles.searching, { backgroundColor: t.surfaceRaised }, elevation(2, t)]}>
            <ActivityIndicator color={t.brand} size="small" />
            <Text variant="label">Looking for orders near you…</Text>
          </View>
        </View>
      ) : null}
      {!online ? (
        <Card variant="tinted" style={{ gap: spacing.sm }}>
          <Row gap={spacing.sm}>
            <Icon name="bulb" size={18} color={t.brandText} />
            <Text variant="subheading" color={t.brandText}>Tip</Text>
          </Row>
          <Text muted>Keep location on and your phone charged while online so you never miss a delivery request.</Text>
        </Card>
      ) : null}

      {pendingOffer ? (
        <OfferModal
          key={pendingOffer.offerId}
          offer={pendingOffer}
          onResolved={() => {
            setDismissed(pendingOffer.offerId);
            refreshAll();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  duty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  dutyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  mapWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  searching: { position: 'absolute', top: spacing.md, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
