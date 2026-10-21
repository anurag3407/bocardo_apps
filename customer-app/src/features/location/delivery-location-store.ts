import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { jsonStorage } from '@/core/storage/kv';

export interface DeliveryLocation {
  addressId: string | null;
  label: string;
  lat: number;
  lng: number;
}

interface State {
  location: DeliveryLocation | null;
  set: (location: DeliveryLocation) => void;
}

/** Where the customer is browsing for. Drives listings, ETAs and the checkout address. */
export const useDeliveryLocation = create<State>()(
  persist((set) => ({ location: null, set: (location) => set({ location }) }), {
    name: 'bocardo-delivery-location',
    storage: createJSONStorage(() => jsonStorage),
  }),
);
