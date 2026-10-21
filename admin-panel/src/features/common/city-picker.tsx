'use client';

import { useSyncExternalStore } from 'react';
import { Select } from '@/components/ui';
import { useAdminPlatformCities } from '@/core/api/generated/admin/admin';

const KEY = 'bocardo.console.city';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return ''; // storage unavailable (private mode) — default to all cities
  }
}

function write(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** City scope shared by dashboards; remembered per browser. */
export function useCityScope() {
  const cities = useAdminPlatformCities();
  const cityId = useSyncExternalStore(subscribe, read, () => '');
  const select = write;
  const picker = (
    <Select
      value={cityId}
      onChange={(e) => select(e.target.value)}
      options={[{ value: '', label: 'All cities' }, ...(cities.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
    />
  );
  return { cityId: cityId || undefined, picker, cities: cities.data ?? [] };
}
