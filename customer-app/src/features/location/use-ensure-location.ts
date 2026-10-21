import { useEffect, useState } from 'react';
import { useAddressesList } from '@/core/api/generated/addresses/addresses';
import { currentLocation } from '@/core/location/current-location';
import { useDeliveryLocation } from './delivery-location-store';

/**
 * First launch: default address, else GPS. Afterwards the persisted choice wins.
 */
export function useEnsureDeliveryLocation() {
  const { location, set } = useDeliveryLocation();
  const addresses = useAddressesList({ query: { enabled: !location } });
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    if (location || addresses.isLoading) return;
    const preferred = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
    if (preferred) {
      set({ addressId: preferred.id, label: preferred.label === 'other' ? preferred.line1 : capitalize(preferred.label), lat: preferred.lat, lng: preferred.lng });
      return;
    }
    currentLocation()
      .then((c) => set({ addressId: null, label: 'Current location', ...c }))
      .catch((e: Error) => setGpsError(e.message));
  }, [location, addresses.isLoading, addresses.data, set]);

  return { location, gpsError };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
