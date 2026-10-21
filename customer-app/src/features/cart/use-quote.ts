import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ordersQuote } from '@/core/api/generated/orders/orders';
import type { QuoteRequestDto } from '@/core/api/generated/model';
import { useCart } from './cart-store';

const QUOTE_REFRESH_MS = 4 * 60_000; // server quotes live 5 minutes

/** Server-side price for the current cart; refreshes on any cart change (debounced). */
export function useQuote(addressId: string | null) {
  const { restaurantId, lines, couponCode, tipPaise } = useCart();
  const request: QuoteRequestDto | null =
    restaurantId && addressId && lines.length
      ? {
          restaurantId,
          addressId,
          couponCode: couponCode ?? undefined,
          tipPaise,
          items: lines.map((l) => ({
            menuItemId: l.menuItemId,
            variantId: l.variantId,
            addonIds: l.addonIds,
            quantity: l.quantity,
            expectedUnitPricePaise: l.unitPricePaise,
          })),
        }
      : null;

  const [debounced, setDebounced] = useState(request);
  const signature = JSON.stringify(request);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(request), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useQuery({
    queryKey: ['quote', debounced],
    queryFn: () => ordersQuote(debounced!),
    enabled: !!debounced,
    retry: false,
    staleTime: QUOTE_REFRESH_MS,
    refetchInterval: QUOTE_REFRESH_MS,
    placeholderData: (prev) => prev,
  });
}
