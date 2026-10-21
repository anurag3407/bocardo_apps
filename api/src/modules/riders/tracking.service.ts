import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { AppError } from '../../common/errors/app-error';
import { haversineMeters } from '../../common/utils/geo';
import { DB, type Db } from '../../infra/database/database';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { RealtimePublisher, topics } from '../../infra/realtime/realtime-publisher';
import { RiderPool } from '../dispatch/rider-pool.service';
import { trackingKeys, type LiveLocation } from '../tracking/tracking.keys';
import type { LocationBatchDto } from './riders.dto';

/** ~200 km/h: anything faster between two fixes is a GPS jump or spoofing. */
const MAX_PLAUSIBLE_SPEED_MPS = 55;
const PERSIST_EVERY_S = 30;
const MAX_FUTURE_SKEW_MS = 60_000;

/**
 * Live location ingestion. Redis holds the hot position (for dispatch + tracking);
 * Postgres receives a sampled breadcrumb trail for disputes and audits.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    private readonly pool: RiderPool,
    private readonly realtime: RealtimePublisher,
  ) {}

  async ingest(riderId: string, batch: LocationBatchDto) {
    const rider = await this.db
      .selectFrom('riders')
      .select(['is_online', 'city_id', 'current_order_id'])
      .where('id', '=', riderId)
      .executeTakeFirst();
    if (!rider) throw AppError.notFound('Rider');
    if (!rider.is_online || !rider.city_id)
      throw AppError.conflict('RIDER_OFFLINE', 'Go online to share your location');

    const points = [...batch.points]
      .filter((p) => new Date(p.recordedAt).getTime() <= Date.now() + MAX_FUTURE_SKEW_MS)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    let previous = await this.pool.location(riderId).catch(() => null);
    const accepted: typeof points = [];
    let mockSeen = false;

    for (const p of points) {
      if (p.isMock) {
        mockSeen = true;
        continue;
      }
      if (previous && !isPlausible(previous, p)) continue;
      if (previous && new Date(p.recordedAt) <= new Date(previous.at)) continue;
      accepted.push(p);
      previous = {
        lat: p.lat,
        lng: p.lng,
        heading: p.heading ?? null,
        speedMps: p.speedMps ?? null,
        at: p.recordedAt,
      };
    }

    if (mockSeen) {
      await this.db
        .updateTable('riders')
        .set({ flags_count: sql`flags_count + 1` })
        .where('id', '=', riderId)
        .execute();
      this.logger.warn(`rider ${riderId} reported a mock location`);
    }

    const latest = accepted.at(-1);
    if (latest) {
      const live: LiveLocation = {
        lat: latest.lat,
        lng: latest.lng,
        heading: latest.heading ?? null,
        speedMps: latest.speedMps ?? null,
        at: latest.recordedAt,
      };
      await this.pool.updateLocation(riderId, rider.city_id, live);
      if (rider.current_order_id) {
        this.realtime
          .publish({
            topic: topics.order(rider.current_order_id),
            event: 'rider_location',
            payload: { ...live },
          })
          .catch((e) => this.logger.debug(`live broadcast failed: ${e.message}`));
      }
      if (
        await this.kv
          .set(trackingKeys.riderPersistGate(riderId), 1, {
            ttlSeconds: PERSIST_EVERY_S,
            onlyIfAbsent: true,
          })
          .catch(() => true)
      ) {
        await this.persist(riderId, rider.current_order_id, accepted);
      }
    }

    if (mockSeen && !accepted.length)
      throw AppError.unprocessable('MOCK_LOCATION', 'Turn off mock location apps to continue');
    return { accepted: accepted.length, rejected: batch.points.length - accepted.length };
  }

  private async persist(
    riderId: string,
    orderId: string | null,
    points: LocationBatchDto['points'],
  ) {
    const latest = points.at(-1)!;
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('rider_location_pings')
        .values(
          points.map((p) => ({
            rider_id: riderId,
            order_id: orderId,
            lat: p.lat,
            lng: p.lng,
            speed_mps: p.speedMps ?? null,
            heading: p.heading ?? null,
            accuracy_m: p.accuracyM ?? null,
            recorded_at: p.recordedAt,
          })),
        )
        .execute();
      await tx
        .updateTable('riders')
        .set({ last_lat: latest.lat, last_lng: latest.lng, last_seen_at: new Date() })
        .where('id', '=', riderId)
        .execute();
    });
  }
}

function isPlausible(prev: LiveLocation, next: { lat: number; lng: number; recordedAt: string }) {
  const seconds = (new Date(next.recordedAt).getTime() - new Date(prev.at).getTime()) / 1000;
  if (seconds <= 0) return true;
  return haversineMeters(prev, next) / seconds <= MAX_PLAUSIBLE_SPEED_MPS;
}
