import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { jsonStorage } from '@/core/storage/kv';

export interface CartLine {
  /** Same item + options merge into one line. */
  key: string;
  menuItemId: string;
  name: string;
  isVeg: boolean;
  variantId: string | null;
  variantName: string | null;
  addonIds: string[];
  addonNames: string[];
  unitPricePaise: number;
  quantity: number;
}

interface CartState {
  restaurantId: string | null;
  restaurantName: string | null;
  lines: CartLine[];
  couponCode: string | null;
  tipPaise: number;
  /** Returns false if the cart holds another restaurant's items (UI asks to replace). */
  add: (restaurant: { id: string; name: string }, line: Omit<CartLine, 'key' | 'quantity'>, quantity?: number) => boolean;
  replaceWith: (restaurant: { id: string; name: string }, line: Omit<CartLine, 'key' | 'quantity'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItems: (menuItemIds: string[]) => void;
  setCoupon: (code: string | null) => void;
  setTip: (paise: number) => void;
  clear: () => void;
}

const lineKey = (l: Pick<CartLine, 'menuItemId' | 'variantId' | 'addonIds'>) => [l.menuItemId, l.variantId ?? '-', [...l.addonIds].sort().join(',')].join('|');

const empty = { restaurantId: null, restaurantName: null, lines: [], couponCode: null, tipPaise: 0 };

/** Client-side cart, persisted across restarts. Prices here are display-only; the API re-prices. */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      ...empty,
      add: (restaurant, line, quantity = 1) => {
        const state = get();
        if (state.restaurantId && state.restaurantId !== restaurant.id && state.lines.length) return false;
        const key = lineKey(line);
        const existing = state.lines.find((l) => l.key === key);
        set({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          lines: existing
            ? state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity, unitPricePaise: line.unitPricePaise } : l))
            : [...state.lines, { ...line, key, quantity }],
        });
        return true;
      },
      replaceWith: (restaurant, line) => {
        set({ ...empty, restaurantId: restaurant.id, restaurantName: restaurant.name, lines: [{ ...line, key: lineKey(line), quantity: 1 }] });
      },
      setQuantity: (key, quantity) => {
        const lines = quantity <= 0 ? get().lines.filter((l) => l.key !== key) : get().lines.map((l) => (l.key === key ? { ...l, quantity } : l));
        set(lines.length ? { lines } : { ...empty });
      },
      removeItems: (ids) => {
        const lines = get().lines.filter((l) => !ids.includes(l.menuItemId));
        set(lines.length ? { lines } : { ...empty });
      },
      setCoupon: (couponCode) => set({ couponCode }),
      setTip: (tipPaise) => set({ tipPaise }),
      clear: () => set({ ...empty }),
    }),
    { name: 'bocardo-cart', storage: createJSONStorage(() => jsonStorage) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity * l.unitPricePaise, 0);
export const quantityOf = (lines: CartLine[], menuItemId: string) => lines.filter((l) => l.menuItemId === menuItemId).reduce((n, l) => n + l.quantity, 0);
