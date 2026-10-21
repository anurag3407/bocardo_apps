import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { errorMessage } from '@/core/api/api-error';
import { getRidersActiveQueryKey, getRidersCurrentOfferQueryKey, getRidersMeQueryKey, ridersOffline, ridersOnline, useRidersActive, useRidersCurrentOffer, useRidersMe } from '@/core/api/generated/rider/rider';
import { currentPosition, setTrackingMode, startTracking, stopTracking } from '@/core/location/background-tracking';
import { isBatteryRestricted, requestUnrestrictedBattery } from '@/core/power/battery-optimization';
import { PowerSetupCard } from '@/features/power/PowerSetupCard';
import { DeliveryMap } from '@/core/maps/delivery-map';
import { useRealtime } from '@/core/realtime/use-realtime';
import { TripPanel } from '@/features/trip/TripPanel';
import { formatPaise } from '@/lib/format';
import { Card, EmptyState, ErrorState, Loading, Row, Screen, spacing, Text, useTheme } from '@/ui';
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

  return (
    <Screen scroll refreshing={me.isRefetching} onRefresh={() => { void me.refetch(); refreshAll(); }}>
      <Card>
        <Row justify="space-between">
          <View>
            <Text variant="heading">{online ? 'On duty' : 'Off duty'}</Text>
            <Text variant="caption" muted>{online ? 'You will receive delivery requests' : 'Go online to start earning'}</Text>
          </View>
          <Switch value={online} disabled={toggling || hasTrip} onValueChange={toggle} trackColor={{ true: t.success }} />
        </Row>
      </Card>

      <PowerSetupCard />

      {cashNearLimit ? (
        <Card style={{ backgroundColor: t.brandSoft }}>
          <Text color={t.danger}>Cash in hand {formatPaise(rider.cashInHandPaise)} of {formatPaise(rider.cashLimitPaise)} limit — deposit at a hub to keep getting cash orders.</Text>
        </Card>
      ) : null}

      {online && hasTrip ? <TripPanel order={active.data!.order!} /> : null}
      {online && !hasTrip ? (
        <View style={{ gap: spacing.md }}>
          <Text muted center>Looking for orders near you…</Text>
          <DeliveryMap markers={[]} showUserLocation height={320} />
        </View>
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
