import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { usePartnerList } from '@/core/api/generated/partner/partner';
import { jsonStorage } from '@/core/storage/kv';

const useSelected = create<{ id: string | null; select: (id: string) => void }>()(
  persist((set) => ({ id: null, select: (id) => set({ id }) }), { name: 'bocardo-selected-outlet', storage: createJSONStorage(() => jsonStorage) }),
);

/** The outlet this device operates (multi-outlet owners can switch). */
export function useCurrentRestaurant() {
  const list = usePartnerList();
  const { id, select } = useSelected();
  const restaurants = list.data ?? [];
  const current = restaurants.find((r) => r.id === id) ?? restaurants[0] ?? null;
  return { ...list, restaurants, current, select };
}
