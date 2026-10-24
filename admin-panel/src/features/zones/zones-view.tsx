'use client';

import type { Map as MapboxMap } from 'mapbox-gl';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Select } from '@/components/ui';
import { adminPlatformCreateZone, adminPlatformUpdateZone, useAdminPlatformZones } from '@/core/api/generated/admin/admin';
import type { Zone } from '@/core/api/generated/model';
import { useCityScope } from '@/features/common/city-picker';
import { MapView } from '@/features/common/mapbox-map';
import { ask, useAction } from '@/features/common/use-action';
import { formatPaise } from '@/lib/format';

const COLORS = ['#0596d1', '#15924f', '#7c3aed', '#e08a00', '#e03a45', '#0b1b26'];

/** Serviceability polygons + live pricing levers (surge, rain mode, fees). */
export function ZonesView() {
  const { cityId, picker, cities } = useCityScope();
  const zones = useAdminPlatformZones({ cityId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = zones.data?.find((z) => z.id === selectedId) ?? null;
  const create = useAction(adminPlatformCreateZone);
  const update = useAction((a: { id: string; body: Parameters<typeof adminPlatformUpdateZone>[1] }) => adminPlatformUpdateZone(a.id, a.body));

  const polygons = useMemo(() => (zones.data ?? []).map((z, i) => ({ id: z.id, coordinates: z.boundary.coordinates, color: COLORS[i % COLORS.length] })), [zones.data]);
  const first = zones.data?.[0]?.boundary.coordinates[0]?.[0];

  const attachDraw = async (map: MapboxMap) => {
    const { default: MapboxDraw } = await import('@mapbox/mapbox-gl-draw');
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    map.addControl(draw as never, 'top-left');
    map.on('draw.create', (e: { features: { geometry: { coordinates: number[][][] } }[] }) => {
      const coordinates = e.features[0].geometry.coordinates;
      const name = ask('Name for the new zone');
      const city = cityId ?? cities[0]?.id;
      if (name && city) create.mutate({ cityId: city, name, boundary: { type: 'Polygon', coordinates } } as never);
      draw.deleteAll();
    });
  };

  return (
    <>
      <PageHeader title="Zones & pricing" subtitle="Draw a polygon (top-left tool) to add a serviceable zone" actions={picker} />
      <ErrorNote error={zones.error} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <MapView polygons={polygons} center={first ? { lng: first[0], lat: first[1] } : undefined} zoom={12} height={560} onReady={attachDraw} />
        <div className="flex flex-col gap-3">
          {zones.data?.map((z, i) => (
            <Card key={z.id} className={selectedId === z.id ? 'border-brand' : ''}>
              <button className="flex w-full items-center justify-between text-left" onClick={() => setSelectedId(z.id === selectedId ? null : z.id)}>
                <span className="font-semibold" style={{ color: COLORS[i % COLORS.length] }}>{z.name}</span>
                <span className="flex gap-1">
                  {z.surgeMultiplier > 1 ? <Badge tone="warning">surge ×{z.surgeMultiplier}</Badge> : null}
                  {z.rainMode ? <Badge tone="brand">rain</Badge> : null}
                  {!z.isActive ? <Badge tone="danger">inactive</Badge> : null}
                </span>
              </button>
              <p className="mt-1 text-xs text-muted">Delivery {formatPaise(z.deliveryBaseFeePaise)} up to {z.deliveryBaseKm} km + {formatPaise(z.deliveryPerKmPaise)}/km · platform {formatPaise(z.platformFeePaise)}</p>
              {selected?.id === z.id ? <ZoneEditor zone={z} saving={update.isPending} onSave={(body) => update.mutate({ id: z.id, body })} /> : null}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function ZoneEditor({ zone, saving, onSave }: { zone: Zone; saving: boolean; onSave: (body: Parameters<typeof adminPlatformUpdateZone>[1]) => void }) {
  const [f, setF] = useState({
    surge: String(zone.surgeMultiplier),
    base: String(zone.deliveryBaseFeePaise / 100),
    baseKm: String(zone.deliveryBaseKm),
    perKm: String(zone.deliveryPerKmPaise / 100),
    platform: String(zone.platformFeePaise / 100),
    freeAbove: zone.freeDeliveryAbovePaise ? String(zone.freeDeliveryAbovePaise / 100) : '',
    rain: zone.rainMode ? 'on' : 'off',
    active: zone.isActive ? 'on' : 'off',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const paise = (v: string) => Math.round(Number(v) * 100);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
      <Input label="Surge ×" type="number" step="0.1" min="1" max="3" value={f.surge} onChange={set('surge')} />
      <Select label="Rain mode" value={f.rain} onChange={set('rain')} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On (+₹20)' }]} />
      <Input label="Base fee ₹" type="number" value={f.base} onChange={set('base')} />
      <Input label="Base km" type="number" step="0.5" value={f.baseKm} onChange={set('baseKm')} />
      <Input label="Per km ₹" type="number" value={f.perKm} onChange={set('perKm')} />
      <Input label="Platform fee ₹" type="number" value={f.platform} onChange={set('platform')} />
      <Input label="Free delivery above ₹" type="number" value={f.freeAbove} onChange={set('freeAbove')} placeholder="none" />
      <Select label="Zone" value={f.active} onChange={set('active')} options={[{ value: 'on', label: 'Active' }, { value: 'off', label: 'Paused' }]} />
      <Button
        className="col-span-2"
        loading={saving}
        onClick={() =>
          onSave({
            surgeMultiplier: Number(f.surge),
            rainMode: f.rain === 'on',
            isActive: f.active === 'on',
            deliveryBaseFeePaise: paise(f.base),
            deliveryBaseKm: Number(f.baseKm),
            deliveryPerKmPaise: paise(f.perKm),
            platformFeePaise: paise(f.platform),
            freeDeliveryAbovePaise: f.freeAbove ? paise(f.freeAbove) : null,
          })
        }>
        Save pricing
      </Button>
    </div>
  );
}
