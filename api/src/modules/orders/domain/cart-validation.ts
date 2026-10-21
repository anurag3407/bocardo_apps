import type { MenuCategoryView, MenuItemView } from '../../catalog/catalog.dto';

export interface CartLineInput {
  menuItemId: string;
  variantId?: string | null;
  addonIds?: string[];
  quantity: number;
  /** Price the app displayed; a mismatch yields a PRICE_CHANGED warning, not an error. */
  expectedUnitPricePaise?: number;
}

export interface PricedLine {
  menuItemId: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  addons: { id: string; name: string; pricePaise: number }[];
  isVeg: boolean;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export type CartIssueCode =
  | 'ITEM_NOT_FOUND'
  | 'ITEM_OUT_OF_STOCK'
  | 'VARIANT_INVALID'
  | 'VARIANT_OUT_OF_STOCK'
  | 'ADDON_INVALID'
  | 'ADDON_OUT_OF_STOCK'
  | 'ADDON_SELECTION'
  | 'QUANTITY_LIMIT';

export interface CartIssue {
  lineIndex: number;
  menuItemId: string;
  code: CartIssueCode;
  message: string;
}

export interface CartWarning {
  lineIndex: number;
  code: 'PRICE_CHANGED';
  message: string;
  previousPaise: number;
  currentPaise: number;
}

export const MAX_CART_LINES = 50;

/**
 * Re-prices a cart purely from the server's menu. Client prices are never trusted;
 * they are only compared to warn the customer that something changed.
 */
export function validateCart(menu: MenuCategoryView[], lines: CartLineInput[]) {
  const items = new Map<string, MenuItemView>();
  menu.forEach((c) => c.items.forEach((i) => items.set(i.id, i)));

  const priced: PricedLine[] = [];
  const issues: CartIssue[] = [];
  const warnings: CartWarning[] = [];
  const qtyByItem = new Map<string, number>();

  lines.forEach((line, lineIndex) => {
    const issue = (code: CartIssueCode, message: string) =>
      issues.push({ lineIndex, menuItemId: line.menuItemId, code, message });
    const item = items.get(line.menuItemId);
    if (!item) return issue('ITEM_NOT_FOUND', 'This item is no longer on the menu');
    if (!item.inStock) return issue('ITEM_OUT_OF_STOCK', `${item.name} is out of stock`);

    const totalQty = (qtyByItem.get(item.id) ?? 0) + line.quantity;
    qtyByItem.set(item.id, totalQty);
    if (totalQty > item.maxPerOrder)
      return issue('QUANTITY_LIMIT', `You can order at most ${item.maxPerOrder} × ${item.name}`);

    let base = item.pricePaise;
    let variant: MenuItemView['variants'][number] | undefined;
    if (item.variants.length) {
      variant = line.variantId
        ? item.variants.find((v) => v.id === line.variantId)
        : (item.variants.find((v) => v.isDefault) ?? item.variants[0]);
      if (!variant) return issue('VARIANT_INVALID', `Choose a valid option for ${item.name}`);
      if (!variant.inStock)
        return issue('VARIANT_OUT_OF_STOCK', `${item.name} (${variant.name}) is out of stock`);
      base = variant.pricePaise;
    } else if (line.variantId) {
      return issue('VARIANT_INVALID', `${item.name} has no size options`);
    }

    const chosen = new Set(line.addonIds ?? []);
    const addons: PricedLine['addons'] = [];
    for (const group of item.addonGroups) {
      const picked = group.addons.filter((a) => chosen.has(a.id));
      picked.forEach((a) => chosen.delete(a.id));
      if (picked.length < group.minSelect || picked.length > group.maxSelect) {
        return issue(
          'ADDON_SELECTION',
          `${group.name}: choose ${group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}-${group.maxSelect}`}`,
        );
      }
      const unavailable = picked.find((a) => !a.inStock);
      if (unavailable) return issue('ADDON_OUT_OF_STOCK', `${unavailable.name} is unavailable`);
      addons.push(...picked.map((a) => ({ id: a.id, name: a.name, pricePaise: a.pricePaise })));
    }
    if (chosen.size) return issue('ADDON_INVALID', `Some add-ons are not valid for ${item.name}`);

    const unitPricePaise = base + addons.reduce((acc, a) => acc + a.pricePaise, 0);
    if (
      line.expectedUnitPricePaise !== undefined &&
      line.expectedUnitPricePaise !== unitPricePaise
    ) {
      warnings.push({
        lineIndex,
        code: 'PRICE_CHANGED',
        message: `Price of ${item.name} changed`,
        previousPaise: line.expectedUnitPricePaise,
        currentPaise: unitPricePaise,
      });
    }
    priced.push({
      menuItemId: item.id,
      name: item.name,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      addons,
      isVeg:
        item.isVeg &&
        addons.every((a) =>
          item.addonGroups.some((g) => g.addons.some((x) => x.id === a.id && x.isVeg)),
        ),
      unitPricePaise,
      quantity: line.quantity,
      lineTotalPaise: unitPricePaise * line.quantity,
    });
  });

  return { lines: priced, issues, warnings };
}
