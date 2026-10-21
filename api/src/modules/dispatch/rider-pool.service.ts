import { Inject, Injectable } from '@nestjs/common';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import { trackingKeys, type LiveLocation } from '../tracking/tracking.keys';

const LOCATION_TTL_S = 10 * 60;

/** Live rider availability in Redis: who is online, where, and who is free. */
@Injectable()
export class RiderPool {
  constructor(@Inject(KV_STORE) private readonly kv: KvStore) {}

  async goOnline(riderId: string, cityId: string, location: LiveLocation, busy: boolean) {
    await this.updateLocation(riderId, cityId, location);
    if (!busy) await this.markIdle(riderId, cityId);
  }

  async goOffline(riderId: string, cityId: string) {
    await Promise.all([
      this.kv.geoRemove(trackingKeys.ridersGeo(cityId), riderId),
      this.kv.srem(trackingKeys.idleRiders(cityId), riderId),
    ]);
  }

  async markBusy(riderId: string, cityId: string) {
    await this.kv.srem(trackingKeys.idleRiders(cityId), riderId);
  }

  async markIdle(riderId: string, cityId: string) {
    await Promise.all([
      this.kv.sadd(trackingKeys.idleRiders(cityId), riderId),
      this.kv.set(trackingKeys.riderIdleSince(riderId), Date.now(), { ttlSeconds: 12 * 60 * 60 }),
    ]);
  }

  async updateLocation(riderId: string, cityId: string, location: LiveLocation) {
    await Promise.all([
      this.kv.set(trackingKeys.riderLocation(riderId), location, { ttlSeconds: LOCATION_TTL_S }),
      this.kv.geoAdd(trackingKeys.ridersGeo(cityId), riderId, location.lng, location.lat),
    ]);
  }

  location(riderId: string) {
    return this.kv.get<LiveLocation>(trackingKeys.riderLocation(riderId));
  }

  async idleSeconds(riderId: string): Promise<number> {
    const since = await this.kv.get<number>(trackingKeys.riderIdleSince(riderId));
    return since ? Math.max(0, (Date.now() - since) / 1000) : 0;
  }
}
