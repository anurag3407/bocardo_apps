'use client';

import { ErrorNote, PageHeader, Stat } from '@/components/ui';
import { useAdminOpsOverview } from '@/core/api/generated/admin/admin';
import { useCityScope } from '@/features/common/city-picker';
import { formatPaise, humanize } from '@/lib/format';

export function OverviewView() {
  const { cityId, picker } = useCityScope();
  const overview = useAdminOpsOverview({ cityId }, { query: { refetchInterval: 15_000 } });
  const o = overview.data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Today, refreshed every 15 seconds" actions={picker} />
      <ErrorNote error={overview.error} />
      {o ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="GMV today" value={formatPaise(o.gmvTodayPaise)} />
            <Stat label="Orders today" value={o.ordersToday} hint={`${o.deliveredToday} delivered · ${o.cancelledToday} cancelled`} />
            <Stat label="Avg delivery time" value={o.avgDeliveryMinutesToday ? `${o.avgDeliveryMinutesToday} min` : '—'} />
            <Stat label="Dispatch failures" value={o.dispatchFailed} tone={o.dispatchFailed ? 'danger' : undefined} hint="Orders with no rider found" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Riders online" value={o.ridersOnline} hint={`${o.ridersBusy} on a delivery`} />
            <Stat label="Restaurants open" value={o.restaurantsOpen} />
            <Stat label="Pending approvals" value={o.pendingRestaurants + o.pendingRiders} hint={`${o.pendingRestaurants} restaurants · ${o.pendingRiders} riders`} />
            <Stat label="Open tickets" value={o.openTickets} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="OTP SMS sent (1h)" value={o.otpSentLastHour} hint="Billed SMS" />
            <Stat
              label="OTP requests blocked (1h)"
              value={o.otpBlockedLastHour}
              tone={o.otpBlockedLastHour > 50 ? 'danger' : undefined}
              hint="No verified ticket — likely bots / SMS pumping"
            />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Active orders by stage</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {['PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'READY', 'PICKED_UP'].map((s) => (
                <Stat key={s} label={humanize(s)} value={o.activeByStatus[s] ?? 0} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
