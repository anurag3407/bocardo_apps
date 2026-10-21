import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db, type Executor } from '../../infra/database/database';
import type { MenuCategoryView, MenuItemView } from './catalog.dto';

/** Loads a restaurant's full menu tree in 5 flat queries (no N+1). */
@Injectable()
export class MenuRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async loadMenu(
    restaurantId: string,
    opts: { includeInactive: boolean },
    executor: Executor = this.db,
  ): Promise<MenuCategoryView[]> {
    let categoriesQ = executor
      .selectFrom('menu_categories')
      .selectAll()
      .where('restaurant_id', '=', restaurantId);
    let itemsQ = executor
      .selectFrom('menu_items')
      .selectAll()
      .where('restaurant_id', '=', restaurantId);
    if (!opts.includeInactive) {
      categoriesQ = categoriesQ.where('is_active', '=', true);
      itemsQ = itemsQ.where('is_active', '=', true);
    }
    const [categories, items] = await Promise.all([
      categoriesQ.orderBy('sort_order').orderBy('name').execute(),
      itemsQ.orderBy('sort_order').orderBy('name').execute(),
    ]);
    const itemIds = items.map((i) => i.id);
    const options = await this.loadOptions(itemIds, executor);

    const itemsByCategory = new Map<string, MenuItemView[]>();
    for (const i of items) {
      const view: MenuItemView = {
        id: i.id,
        categoryId: i.category_id,
        name: i.name,
        description: i.description,
        imageUrl: i.image_url,
        pricePaise: i.price_paise,
        isVeg: i.is_veg,
        inStock: i.in_stock,
        isActive: i.is_active,
        isBestseller: i.is_bestseller,
        maxPerOrder: i.max_per_order,
        variants: options.variants.get(i.id) ?? [],
        addonGroups: options.groups.get(i.id) ?? [],
      };
      itemsByCategory.set(i.category_id, [...(itemsByCategory.get(i.category_id) ?? []), view]);
    }

    return categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order,
        isActive: c.is_active,
        items: itemsByCategory.get(c.id) ?? [],
      }))
      .filter((c) => opts.includeInactive || c.items.length > 0);
  }

  private async loadOptions(itemIds: string[], executor: Executor) {
    const variants = new Map<string, MenuItemView['variants']>();
    const groups = new Map<string, MenuItemView['addonGroups']>();
    if (!itemIds.length) return { variants, groups };

    const [variantRows, groupRows] = await Promise.all([
      executor
        .selectFrom('item_variants')
        .selectAll()
        .where('item_id', 'in', itemIds)
        .orderBy('sort_order')
        .execute(),
      executor
        .selectFrom('addon_groups')
        .selectAll()
        .where('item_id', 'in', itemIds)
        .orderBy('sort_order')
        .execute(),
    ]);
    const addonRows = groupRows.length
      ? await executor
          .selectFrom('addons')
          .selectAll()
          .where(
            'group_id',
            'in',
            groupRows.map((g) => g.id),
          )
          .orderBy('name')
          .execute()
      : [];

    for (const v of variantRows) {
      variants.set(v.item_id, [
        ...(variants.get(v.item_id) ?? []),
        {
          id: v.id,
          name: v.name,
          pricePaise: v.price_paise,
          isDefault: v.is_default,
          inStock: v.in_stock,
        },
      ]);
    }
    const addonsByGroup = new Map<string, MenuItemView['addonGroups'][number]['addons']>();
    for (const a of addonRows) {
      addonsByGroup.set(a.group_id, [
        ...(addonsByGroup.get(a.group_id) ?? []),
        { id: a.id, name: a.name, pricePaise: a.price_paise, isVeg: a.is_veg, inStock: a.in_stock },
      ]);
    }
    for (const g of groupRows) {
      groups.set(g.item_id, [
        ...(groups.get(g.item_id) ?? []),
        {
          id: g.id,
          name: g.name,
          minSelect: g.min_select,
          maxSelect: g.max_select,
          addons: addonsByGroup.get(g.id) ?? [],
        },
      ]);
    }
    return { variants, groups };
  }
}
