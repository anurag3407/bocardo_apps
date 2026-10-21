import type { MenuCategoryView } from '../../catalog/catalog.dto';
import { validateCart } from './cart-validation';

const menu: MenuCategoryView[] = [
  {
    id: 'cat',
    name: 'Biryani',
    sortOrder: 1,
    isActive: true,
    items: [
      {
        id: 'biryani',
        categoryId: 'cat',
        name: 'Chicken Biryani',
        description: null,
        imageUrl: null,
        pricePaise: 29900,
        isVeg: false,
        inStock: true,
        isActive: true,
        isBestseller: true,
        maxPerOrder: 5,
        variants: [
          { id: 'half', name: 'Half', pricePaise: 29900, isDefault: true, inStock: true },
          { id: 'full', name: 'Full', pricePaise: 44900, isDefault: false, inStock: false },
        ],
        addonGroups: [
          {
            id: 'extras',
            name: 'Extras',
            minSelect: 0,
            maxSelect: 2,
            addons: [
              { id: 'raita', name: 'Raita', pricePaise: 3000, isVeg: true, inStock: true },
              { id: 'egg', name: 'Egg', pricePaise: 2000, isVeg: false, inStock: true },
              { id: 'salan', name: 'Salan', pricePaise: 4000, isVeg: true, inStock: false },
            ],
          },
        ],
      },
      {
        id: 'soldout',
        categoryId: 'cat',
        name: 'Mutton Biryani',
        description: null,
        imageUrl: null,
        pricePaise: 39900,
        isVeg: false,
        inStock: false,
        isActive: true,
        isBestseller: false,
        maxPerOrder: 5,
        variants: [],
        addonGroups: [],
      },
    ],
  },
];

describe('validateCart', () => {
  it('prices from the server menu, using the default variant and add-ons', () => {
    const { lines, issues } = validateCart(menu, [
      { menuItemId: 'biryani', addonIds: ['raita', 'egg'], quantity: 2 },
    ]);
    expect(issues).toEqual([]);
    expect(lines[0]).toMatchObject({
      variantName: 'Half',
      unitPricePaise: 29900 + 3000 + 2000,
      lineTotalPaise: 2 * 34900,
    });
  });

  it('flags removed and sold-out items', () => {
    const { issues } = validateCart(menu, [
      { menuItemId: 'ghost', quantity: 1 },
      { menuItemId: 'soldout', quantity: 1 },
    ]);
    expect(issues.map((i) => i.code)).toEqual(['ITEM_NOT_FOUND', 'ITEM_OUT_OF_STOCK']);
  });

  it('flags sold-out variants and add-ons', () => {
    expect(
      validateCart(menu, [{ menuItemId: 'biryani', variantId: 'full', quantity: 1 }]).issues[0]
        .code,
    ).toBe('VARIANT_OUT_OF_STOCK');
    expect(
      validateCart(menu, [{ menuItemId: 'biryani', addonIds: ['salan'], quantity: 1 }]).issues[0]
        .code,
    ).toBe('ADDON_OUT_OF_STOCK');
  });

  it('enforces add-on group limits and rejects foreign add-ons', () => {
    expect(
      validateCart(menu, [
        { menuItemId: 'biryani', addonIds: ['raita', 'egg', 'salan'], quantity: 1 },
      ]).issues[0].code,
    ).toBe('ADDON_SELECTION');
    expect(
      validateCart(menu, [{ menuItemId: 'biryani', addonIds: ['other-item-addon'], quantity: 1 }])
        .issues[0].code,
    ).toBe('ADDON_INVALID');
  });

  it('enforces max quantity across duplicate lines of the same item', () => {
    const { issues } = validateCart(menu, [
      { menuItemId: 'biryani', quantity: 3 },
      { menuItemId: 'biryani', addonIds: ['raita'], quantity: 3 },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ lineIndex: 1, code: 'QUANTITY_LIMIT' });
  });

  it('warns (not fails) when the displayed price is stale', () => {
    const { issues, warnings } = validateCart(menu, [
      { menuItemId: 'biryani', quantity: 1, expectedUnitPricePaise: 25000 },
    ]);
    expect(issues).toEqual([]);
    expect(warnings[0]).toMatchObject({
      code: 'PRICE_CHANGED',
      previousPaise: 25000,
      currentPaise: 29900,
    });
  });

  it('marks a line non-veg when a non-veg add-on is chosen', () => {
    const vegMenu = structuredClone(menu);
    vegMenu[0].items[0].isVeg = true;
    expect(
      validateCart(vegMenu, [{ menuItemId: 'biryani', addonIds: ['raita'], quantity: 1 }]).lines[0]
        .isVeg,
    ).toBe(true);
    expect(
      validateCart(vegMenu, [{ menuItemId: 'biryani', addonIds: ['egg'], quantity: 1 }]).lines[0]
        .isVeg,
    ).toBe(false);
  });
});
