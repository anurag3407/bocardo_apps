import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LatLngQuery } from '../../common/http/schemas';

const ClosedReason = z.enum(['INACTIVE', 'PAUSED', 'BUSY', 'OUTSIDE_HOURS']).nullable();

export const RestaurantCardSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    cuisines: z.array(z.string()),
    coverImageUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    costForTwoPaise: z.number().int().nullable(),
    isVegOnly: z.boolean(),
    distanceM: z.number().int(),
    etaMinutes: z.number().int(),
    isOpen: z.boolean(),
    closedReason: ClosedReason,
  })
  .meta({ id: 'RestaurantCard' });

export class NearbyQueryDto extends createZodDto(
  LatLngQuery.extend({
    cuisine: z.string().optional(),
    vegOnly: z.coerce.boolean().optional(),
    sort: z
      .enum(['relevance', 'rating', 'delivery_time', 'cost_low', 'cost_high'])
      .default('relevance'),
  }),
) {}

export class RestaurantListDto extends createZodDto(
  z.object({
    serviceable: z.boolean(),
    restaurants: z.array(RestaurantCardSchema),
    cuisines: z.array(z.string()),
  }),
) {}

export const AddonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    pricePaise: z.number().int(),
    isVeg: z.boolean(),
    inStock: z.boolean(),
  })
  .meta({ id: 'Addon' });

export const AddonGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    minSelect: z.number().int(),
    maxSelect: z.number().int(),
    addons: z.array(AddonSchema),
  })
  .meta({ id: 'AddonGroup' });

export const VariantSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    pricePaise: z.number().int(),
    isDefault: z.boolean(),
    inStock: z.boolean(),
  })
  .meta({ id: 'Variant' });

export const MenuItemSchema = z
  .object({
    id: z.string(),
    categoryId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    pricePaise: z.number().int(),
    isVeg: z.boolean(),
    inStock: z.boolean(),
    isActive: z.boolean(),
    isBestseller: z.boolean(),
    maxPerOrder: z.number().int(),
    variants: z.array(VariantSchema),
    addonGroups: z.array(AddonGroupSchema),
  })
  .meta({ id: 'MenuItem' });

export const MenuCategorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    items: z.array(MenuItemSchema),
  })
  .meta({ id: 'MenuCategory' });

export type MenuItemView = z.infer<typeof MenuItemSchema>;
export type MenuCategoryView = z.infer<typeof MenuCategorySchema>;

export class RestaurantDetailQueryDto extends createZodDto(LatLngQuery.partial()) {}

export class RestaurantDetailDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    cuisines: z.array(z.string()),
    coverImageUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    addressLine: z.string(),
    lat: z.number(),
    lng: z.number(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    costForTwoPaise: z.number().int().nullable(),
    minOrderPaise: z.number().int(),
    packagingFeePaise: z.number().int(),
    isVegOnly: z.boolean(),
    isOpen: z.boolean(),
    closedReason: ClosedReason,
    /** omitted when no location was supplied */
    deliversToLocation: z.boolean().optional(),
    distanceM: z.number().int().nullable(),
    etaMinutes: z.number().int().nullable(),
    menu: z.array(MenuCategorySchema),
  }),
) {}

export class SearchQueryDto extends createZodDto(
  LatLngQuery.extend({ q: z.string().trim().min(2).max(60) }),
) {}

export class SearchResultDto extends createZodDto(
  z.object({
    restaurants: z.array(RestaurantCardSchema),
    dishes: z.array(
      z.object({
        itemId: z.string(),
        name: z.string(),
        pricePaise: z.number().int(),
        isVeg: z.boolean(),
        imageUrl: z.string().nullable(),
        restaurant: RestaurantCardSchema,
      }),
    ),
  }),
) {}
