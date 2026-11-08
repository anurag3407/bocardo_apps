import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { DB, type Db } from '../../infra/database/database';
import { StorageService } from '../../infra/storage/storage.service';
import { CatalogCache } from '../catalog/catalog.cache';
import { MenuRepository } from '../catalog/menu.repository';
import { UsersService } from '../users/users.service';
import { ZonesService } from '../zones/zones.service';
import type {
  CreateCategoryDto,
  CreateItemDto,
  ItemOptionsDto,
  PartnerRestaurantDto,
  RestaurantApplyDto,
  RestaurantResubmitDto,
  SetHoursDto,
  SetStockDto,
  UpdateCategoryDto,
  UpdateItemDto,
  UpdateRestaurantDto,
} from './partner.dto';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);

@Injectable()
export class PartnerRestaurantService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly zones: ZonesService,
    private readonly users: UsersService,
    private readonly menus: MenuRepository,
    private readonly cache: CatalogCache,
    private readonly storage: StorageService,
  ) {}

  async apply(userId: string, input: RestaurantApplyDto): Promise<PartnerRestaurantDto> {
    const zone = await this.zones.locate(input.lat, input.lng);
    if (!zone)
      throw AppError.unprocessable(
        'OUTSIDE_SERVICE_AREA',
        'Bocardo does not operate at this location yet',
      );

    // Verify KYC document uploads exist in storage if storage is configured
    if (input.fssaiDocumentPath && !(await this.storage.exists('kyc-documents', input.fssaiDocumentPath))) {
      throw AppError.badRequest('FSSAI_DOC_NOT_FOUND', 'FSSAI certificate document not uploaded');
    }
    if (input.panDocumentPath && !(await this.storage.exists('kyc-documents', input.panDocumentPath))) {
      throw AppError.badRequest('PAN_DOC_NOT_FOUND', 'PAN card document not uploaded');
    }

    // Check if applicant already has a pending or rejected restaurant; if so, update instead of duplicating
    const existing = await this.db
      .selectFrom('restaurants as r')
      .innerJoin('restaurant_members as m', 'm.restaurant_id', 'r.id')
      .select('r.id')
      .where('m.user_id', '=', userId)
      .where('m.role', '=', 'owner')
      .where('r.status', 'in', ['pending', 'rejected'])
      .executeTakeFirst();

    if (existing) {
      await this.resubmit(userId, existing.id, input);
      return this.get(userId, existing.id);
    }

    const id = await this.db.transaction().execute(async (tx) => {
      const r = await tx
        .insertInto('restaurants')
        .values({
          name: input.name,
          slug: `${slugify(input.name)}-${randomBytes(4).toString('hex')}`,
          description: input.description ?? null,
          cuisines: input.cuisines,
          phone: input.phone,
          email: input.email ?? null,
          address_line: input.addressLine,
          city_id: zone.city_id,
          zone_id: zone.id,
          lat: input.lat,
          lng: input.lng,
          owner_name: input.ownerName,
          owner_phone: input.ownerPhone ?? input.phone,
          owner_email: input.ownerEmail ?? input.email ?? null,
          fssai_license: input.fssaiLicense,
          fssai_expiry_date: new Date(input.fssaiExpiryDate),
          fssai_document_path: input.fssaiDocumentPath,
          legal_entity_name: input.legalEntityName,
          pan_number: input.panNumber,
          pan_document_path: input.panDocumentPath,
          gstin: input.gstin ?? null,
          gst_document_path: input.gstDocumentPath ?? null,
          bank_account_number: input.bankAccountNumber,
          bank_ifsc: input.bankIfsc,
          bank_beneficiary_name: input.bankBeneficiaryName,
          bank_name: input.bankName,
          bank_cheque_document_path: input.bankChequeDocumentPath ?? null,
          cost_for_two_paise: input.costForTwoPaise ?? null,
          is_veg_only: input.isVegOnly ?? false,
          avg_prep_minutes: input.avgPrepMinutes ?? 20,
          status: 'pending',
          rejection_reason: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('restaurant_members')
        .values({ restaurant_id: r.id, user_id: userId, role: 'owner' })
        .execute();
      await tx
        .insertInto('restaurant_hours')
        .values(
          [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            restaurant_id: r.id,
            day_of_week: d,
            opens_at: '10:00',
            closes_at: '23:00',
          })),
        )
        .execute();
      await this.users.addRole(userId, 'restaurant', tx);
      return r.id;
    });
    return this.get(userId, id);
  }

  async resubmit(userId: string, restaurantId: string, input: RestaurantResubmitDto): Promise<PartnerRestaurantDto> {
    const member = await this.db
      .selectFrom('restaurant_members')
      .select('role')
      .where('restaurant_id', '=', restaurantId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!member || member.role !== 'owner') {
      throw AppError.forbidden('Only the outlet owner can update onboarding information');
    }

    const r = await this.db
      .selectFrom('restaurants')
      .selectAll()
      .where('id', '=', restaurantId)
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Restaurant');
    if (r.status === 'active') {
      throw AppError.conflict('ALREADY_ACTIVE', 'Your restaurant is already active');
    }

    let zoneId = r.zone_id;
    let cityId = r.city_id;
    if (input.lat !== undefined && input.lng !== undefined) {
      const zone = await this.zones.locate(input.lat, input.lng);
      if (!zone) {
        throw AppError.unprocessable('OUTSIDE_SERVICE_AREA', 'Bocardo does not operate at this location yet');
      }
      zoneId = zone.id;
      cityId = zone.city_id;
    }

    await this.db
      .updateTable('restaurants')
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.cuisines !== undefined && { cuisines: input.cuisines }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email ?? null }),
        ...(input.addressLine !== undefined && { address_line: input.addressLine }),
        ...(input.lat !== undefined && { lat: input.lat }),
        ...(input.lng !== undefined && { lng: input.lng }),
        zone_id: zoneId,
        city_id: cityId,
        ...(input.ownerName !== undefined && { owner_name: input.ownerName }),
        ...(input.ownerPhone !== undefined && { owner_phone: input.ownerPhone }),
        ...(input.ownerEmail !== undefined && { owner_email: input.ownerEmail ?? null }),
        ...(input.fssaiLicense !== undefined && { fssai_license: input.fssaiLicense }),
        ...(input.fssaiExpiryDate !== undefined && { fssai_expiry_date: new Date(input.fssaiExpiryDate) }),
        ...(input.fssaiDocumentPath !== undefined && { fssai_document_path: input.fssaiDocumentPath }),
        ...(input.legalEntityName !== undefined && { legal_entity_name: input.legalEntityName }),
        ...(input.panNumber !== undefined && { pan_number: input.panNumber }),
        ...(input.panDocumentPath !== undefined && { pan_document_path: input.panDocumentPath }),
        ...(input.gstin !== undefined && { gstin: input.gstin ?? null }),
        ...(input.gstDocumentPath !== undefined && { gst_document_path: input.gstDocumentPath ?? null }),
        ...(input.bankAccountNumber !== undefined && { bank_account_number: input.bankAccountNumber }),
        ...(input.bankIfsc !== undefined && { bank_ifsc: input.bankIfsc }),
        ...(input.bankBeneficiaryName !== undefined && { bank_beneficiary_name: input.bankBeneficiaryName }),
        ...(input.bankName !== undefined && { bank_name: input.bankName }),
        ...(input.bankChequeDocumentPath !== undefined && { bank_cheque_document_path: input.bankChequeDocumentPath ?? null }),
        ...(input.costForTwoPaise !== undefined && { cost_for_two_paise: input.costForTwoPaise ?? null }),
        ...(input.isVegOnly !== undefined && { is_veg_only: input.isVegOnly }),
        ...(input.avgPrepMinutes !== undefined && { avg_prep_minutes: input.avgPrepMinutes }),
        status: 'pending',
        rejection_reason: null,
      })
      .where('id', '=', restaurantId)
      .execute();

    return this.get(userId, restaurantId);
  }

  async myApplication(userId: string): Promise<PartnerRestaurantDto | null> {
    const member = await this.db
      .selectFrom('restaurant_members')
      .select('restaurant_id')
      .where('user_id', '=', userId)
      .where('role', '=', 'owner')
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (!member) return null;
    return this.get(userId, member.restaurant_id);
  }

  async list(userId: string): Promise<PartnerRestaurantDto[]> {
    const rows = await this.db
      .selectFrom('restaurant_members')
      .select('restaurant_id')
      .where('user_id', '=', userId)
      .execute();
    return Promise.all(rows.map((r) => this.get(userId, r.restaurant_id)));
  }

  async get(userId: string, restaurantId: string): Promise<PartnerRestaurantDto> {
    const r = await this.db
      .selectFrom('restaurants as r')
      .innerJoin('restaurant_members as m', 'm.restaurant_id', 'r.id')
      .selectAll('r')
      .select('m.role as member_role')
      .where('r.id', '=', restaurantId)
      .where('m.user_id', '=', userId)
      .executeTakeFirst();
    if (!r) throw AppError.notFound('Restaurant');
    const hours = await this.db
      .selectFrom('restaurant_hours')
      .selectAll()
      .where('restaurant_id', '=', restaurantId)
      .orderBy('day_of_week')
      .orderBy('opens_at')
      .execute();
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      cuisines: r.cuisines,
      phone: r.phone,
      email: r.email,
      addressLine: r.address_line,
      coverImageUrl: r.cover_image_url,
      logoUrl: r.logo_url,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      isOpen: r.is_open,
      busyUntil: r.busy_until && r.busy_until > new Date() ? r.busy_until.toISOString() : null,
      avgPrepMinutes: r.avg_prep_minutes,
      minOrderPaise: r.min_order_paise,
      packagingFeePaise: r.packaging_fee_paise,
      costForTwoPaise: r.cost_for_two_paise,
      isVegOnly: r.is_veg_only,
      ratingAvg: Math.round(r.rating_avg * 10) / 10,
      ratingCount: r.rating_count,
      deliveryRadiusM: r.delivery_radius_m,
      commissionBps: r.commission_bps,
      memberRole: r.member_role,
      ownerName: r.owner_name,
      ownerPhone: r.owner_phone,
      ownerEmail: r.owner_email,
      fssaiLicense: r.fssai_license,
      fssaiExpiryDate: r.fssai_expiry_date ? new Date(r.fssai_expiry_date).toISOString().slice(0, 10) : null,
      fssaiDocumentPath: r.fssai_document_path,
      panNumber: r.pan_number,
      panDocumentPath: r.pan_document_path,
      gstin: r.gstin,
      gstDocumentPath: r.gst_document_path,
      legalEntityName: r.legal_entity_name,
      bankAccountNumber: r.bank_account_number ? `••••${r.bank_account_number.slice(-4)}` : null,
      bankIfsc: r.bank_ifsc,
      bankBeneficiaryName: r.bank_beneficiary_name,
      bankName: r.bank_name,
      bankChequeDocumentPath: r.bank_cheque_document_path,
      rejectionReason: r.rejection_reason,
      verifiedAt: r.verified_at ? r.verified_at.toISOString() : null,
      hours: hours.map((h) => ({
        dayOfWeek: h.day_of_week,
        opensAt: h.opens_at.slice(0, 5),
        closesAt: h.closes_at.slice(0, 5),
      })),
    };
  }

  async update(userId: string, restaurantId: string, input: UpdateRestaurantDto) {
    await this.db
      .updateTable('restaurants')
      .set({
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email ?? null }),
        ...(input.coverImageUrl !== undefined && { cover_image_url: input.coverImageUrl ?? null }),
        ...(input.logoUrl !== undefined && { logo_url: input.logoUrl ?? null }),
        ...(input.avgPrepMinutes !== undefined && { avg_prep_minutes: input.avgPrepMinutes }),
        ...(input.minOrderPaise !== undefined && { min_order_paise: input.minOrderPaise }),
        ...(input.packagingFeePaise !== undefined && {
          packaging_fee_paise: input.packagingFeePaise,
        }),
        ...(input.costForTwoPaise !== undefined && {
          cost_for_two_paise: input.costForTwoPaise ?? null,
        }),
        ...(input.isVegOnly !== undefined && { is_veg_only: input.isVegOnly }),
      })
      .where('id', '=', restaurantId)
      .execute();
    return this.get(userId, restaurantId);
  }

  async setOpen(userId: string, restaurantId: string, isOpen: boolean) {
    const r = await this.db
      .selectFrom('restaurants')
      .select('status')
      .where('id', '=', restaurantId)
      .executeTakeFirstOrThrow();
    if (isOpen && r.status !== 'active')
      throw AppError.conflict(
        'RESTAURANT_NOT_ACTIVE',
        'Your restaurant is not live yet — our team is reviewing it',
      );
    await this.db
      .updateTable('restaurants')
      .set({ is_open: isOpen, ...(isOpen ? { missed_orders_count: 0 } : {}) })
      .where('id', '=', restaurantId)
      .execute();
    return this.get(userId, restaurantId);
  }

  async setBusy(userId: string, restaurantId: string, minutes: number) {
    await this.db
      .updateTable('restaurants')
      .set({ busy_until: minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null })
      .where('id', '=', restaurantId)
      .execute();
    return this.get(userId, restaurantId);
  }

  async setHours(userId: string, restaurantId: string, input: SetHoursDto) {
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('restaurant_hours').where('restaurant_id', '=', restaurantId).execute();
      if (input.hours.length) {
        await tx
          .insertInto('restaurant_hours')
          .values(
            input.hours.map((h) => ({
              restaurant_id: restaurantId,
              day_of_week: h.dayOfWeek,
              opens_at: h.opensAt,
              closes_at: h.closesAt,
            })),
          )
          .execute();
      }
    });
    return this.get(userId, restaurantId);
  }

  /** Tablet liveness; lets ops spot restaurants whose device went offline. */
  async heartbeat(restaurantId: string) {
    await this.db
      .updateTable('restaurants')
      .set({ last_heartbeat_at: new Date() })
      .where('id', '=', restaurantId)
      .execute();
  }

  // ── Menu ────────────────────────────────────────────────────────────────
  async menu(restaurantId: string) {
    return { categories: await this.menus.loadMenu(restaurantId, { includeInactive: true }) };
  }

  async createCategory(restaurantId: string, input: CreateCategoryDto) {
    await this.db
      .insertInto('menu_categories')
      .values({ restaurant_id: restaurantId, name: input.name, sort_order: input.sortOrder })
      .execute();
    return this.afterMenuChange(restaurantId);
  }

  async updateCategory(restaurantId: string, categoryId: string, input: UpdateCategoryDto) {
    const res = await this.db
      .updateTable('menu_categories')
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      })
      .where('id', '=', categoryId)
      .where('restaurant_id', '=', restaurantId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw AppError.notFound('Category');
    return this.afterMenuChange(restaurantId);
  }

  async createItem(restaurantId: string, input: CreateItemDto) {
    await this.assertCategory(restaurantId, input.categoryId);
    await this.db
      .insertInto('menu_items')
      .values({
        restaurant_id: restaurantId,
        category_id: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        image_url: input.imageUrl ?? null,
        price_paise: input.pricePaise,
        is_veg: input.isVeg,
        is_bestseller: input.isBestseller,
        max_per_order: input.maxPerOrder,
        sort_order: input.sortOrder,
      })
      .execute();
    return this.afterMenuChange(restaurantId);
  }

  async updateItem(restaurantId: string, itemId: string, input: UpdateItemDto) {
    if (input.categoryId) await this.assertCategory(restaurantId, input.categoryId);
    const res = await this.db
      .updateTable('menu_items')
      .set({
        ...(input.categoryId !== undefined && { category_id: input.categoryId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.imageUrl !== undefined && { image_url: input.imageUrl ?? null }),
        ...(input.pricePaise !== undefined && { price_paise: input.pricePaise }),
        ...(input.isVeg !== undefined && { is_veg: input.isVeg }),
        ...(input.isBestseller !== undefined && { is_bestseller: input.isBestseller }),
        ...(input.maxPerOrder !== undefined && { max_per_order: input.maxPerOrder }),
        ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      })
      .where('id', '=', itemId)
      .where('restaurant_id', '=', restaurantId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw AppError.notFound('Menu item');
    return this.afterMenuChange(restaurantId);
  }

  /** Replaces all variants/add-ons of an item (carts holding old option ids get re-validated at quote). */
  async setItemOptions(restaurantId: string, itemId: string, input: ItemOptionsDto) {
    const item = await this.db
      .selectFrom('menu_items')
      .select('id')
      .where('id', '=', itemId)
      .where('restaurant_id', '=', restaurantId)
      .executeTakeFirst();
    if (!item) throw AppError.notFound('Menu item');
    if (input.variants.length && input.variants.filter((v) => v.isDefault).length !== 1) {
      throw AppError.badRequest('ONE_DEFAULT_VARIANT', 'Mark exactly one option as default');
    }
    if (input.addonGroups.some((g) => g.minSelect > g.maxSelect || g.minSelect > g.addons.length)) {
      throw AppError.badRequest(
        'INVALID_ADDON_LIMITS',
        'Add-on group limits do not match its add-ons',
      );
    }
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('item_variants').where('item_id', '=', itemId).execute();
      await tx.deleteFrom('addon_groups').where('item_id', '=', itemId).execute();
      if (input.variants.length) {
        await tx
          .insertInto('item_variants')
          .values(
            input.variants.map((v, i) => ({
              item_id: itemId,
              name: v.name,
              price_paise: v.pricePaise,
              is_default: v.isDefault,
              in_stock: v.inStock,
              sort_order: i,
            })),
          )
          .execute();
        // keep the list price in sync with the default variant
        await tx
          .updateTable('menu_items')
          .set({ price_paise: input.variants.find((v) => v.isDefault)!.pricePaise })
          .where('id', '=', itemId)
          .execute();
      }
      for (const [i, g] of input.addonGroups.entries()) {
        const group = await tx
          .insertInto('addon_groups')
          .values({
            item_id: itemId,
            name: g.name,
            min_select: g.minSelect,
            max_select: g.maxSelect,
            sort_order: i,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .insertInto('addons')
          .values(
            g.addons.map((a) => ({
              group_id: group.id,
              name: a.name,
              price_paise: a.pricePaise,
              is_veg: a.isVeg,
              in_stock: a.inStock,
            })),
          )
          .execute();
      }
    });
    return this.afterMenuChange(restaurantId);
  }

  /** One endpoint for the most frequent restaurant action: marking things (un)available. */
  async setStock(restaurantId: string, input: SetStockDto) {
    let updated: number;
    if (input.type === 'item') {
      const r = await this.db
        .updateTable('menu_items')
        .set({ in_stock: input.inStock })
        .where('id', '=', input.id)
        .where('restaurant_id', '=', restaurantId)
        .executeTakeFirst();
      updated = Number(r.numUpdatedRows);
    } else if (input.type === 'variant') {
      const r = await this.db
        .updateTable('item_variants')
        .set({ in_stock: input.inStock })
        .where('id', '=', input.id)
        .where('item_id', 'in', (eb) =>
          eb.selectFrom('menu_items').select('id').where('restaurant_id', '=', restaurantId),
        )
        .executeTakeFirst();
      updated = Number(r.numUpdatedRows);
    } else {
      const r = await this.db
        .updateTable('addons')
        .set({ in_stock: input.inStock })
        .where('id', '=', input.id)
        .where('group_id', 'in', (eb) =>
          eb
            .selectFrom('addon_groups as g')
            .innerJoin('menu_items as i', 'i.id', 'g.item_id')
            .select('g.id')
            .where('i.restaurant_id', '=', restaurantId),
        )
        .executeTakeFirst();
      updated = Number(r.numUpdatedRows);
    }
    if (!updated) throw AppError.notFound('Menu entry');
    return this.afterMenuChange(restaurantId);
  }

  private async assertCategory(restaurantId: string, categoryId: string) {
    const c = await this.db
      .selectFrom('menu_categories')
      .select('id')
      .where('id', '=', categoryId)
      .where('restaurant_id', '=', restaurantId)
      .executeTakeFirst();
    if (!c) throw AppError.notFound('Category');
  }

  private async afterMenuChange(restaurantId: string) {
    await this.cache.invalidateMenu(restaurantId);
    return this.menu(restaurantId);
  }
}
