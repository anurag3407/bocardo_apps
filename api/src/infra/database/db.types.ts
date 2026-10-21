/**
 * Kysely table types mirroring supabase/migrations. Hand-maintained so the API compiles
 * without a live database; `pnpm db:types` regenerates db.generated.ts for diffing.
 * Generated PostGIS columns (`location`, `boundary`) are queried via raw `sql` only.
 */
import type { ColumnType, Generated, Insertable, RawBuilder, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
/** jsonb: read as T, always written as a JSON string (pg would turn JS arrays into PG arrays). */
type Json<T> = ColumnType<T, string, string>;
type Id = Generated<string>;

export type AdminRole = 'super_admin' | 'ops' | 'support' | 'finance';
export type RestaurantStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type KycStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type OrderStatus =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PLACED'
  | 'ACCEPTED'
  | 'READY'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'UNDELIVERED';
export type DispatchStatus =
  | 'UNASSIGNED'
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'AT_RESTAURANT'
  | 'PICKED'
  | 'AT_DROP'
  | 'DONE'
  | 'FAILED';
export type PaymentMethod = 'cod' | 'online';
export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
export type VehicleType = 'bicycle' | 'scooter' | 'motorcycle' | 'ev';
export type ClientApp = 'customer' | 'restaurant' | 'rider' | 'admin';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type RefundStatus = 'pending' | 'processed' | 'failed';
export type ActorType = 'customer' | 'restaurant' | 'rider' | 'system' | 'admin';

export interface DeliveryAddressSnapshot {
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  contactName: string | null;
  contactPhone: string | null;
}

export interface OrderItemAddonSnapshot {
  id: string;
  name: string;
  pricePaise: number;
}

export interface ProfilesTable {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  roles: ColumnType<string[], string[] | undefined, string[]>;
  admin_role: AdminRole | null;
  is_blocked: Generated<boolean>;
  deleted_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeviceTokensTable {
  id: Id;
  user_id: string;
  app: ClientApp;
  token: string;
  platform: 'ios' | 'android' | 'web';
  updated_at: Generated<Date>;
}

export interface CitiesTable {
  id: Id;
  name: string;
  timezone: Generated<string>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface ZonesTable {
  id: Id;
  city_id: string;
  name: string;
  /** PostGIS geography; written via st_geomfromgeojson, read via st_asgeojson. */
  boundary: ColumnType<unknown, RawBuilder<unknown>, RawBuilder<unknown>>;
  is_active: Generated<boolean>;
  delivery_base_fee_paise: Generated<number>;
  delivery_base_km: Generated<number>;
  delivery_per_km_paise: Generated<number>;
  platform_fee_paise: Generated<number>;
  free_delivery_above_paise: number | null;
  surge_multiplier: Generated<number>;
  rain_mode: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AddressesTable {
  id: Id;
  user_id: string;
  label: Generated<'home' | 'work' | 'other'>;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  is_default: Generated<boolean>;
  deleted_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface RestaurantsTable {
  id: Id;
  name: string;
  slug: string;
  description: string | null;
  cuisines: ColumnType<string[], string[] | undefined, string[]>;
  cover_image_url: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address_line: string;
  city_id: string;
  zone_id: string | null;
  lat: number;
  lng: number;
  delivery_radius_m: Generated<number>;
  status: Generated<RestaurantStatus>;
  is_open: Generated<boolean>;
  busy_until: NullableTimestamp;
  avg_prep_minutes: Generated<number>;
  min_order_paise: Generated<number>;
  packaging_fee_paise: Generated<number>;
  cost_for_two_paise: number | null;
  is_veg_only: Generated<boolean>;
  rating_avg: Generated<number>;
  rating_count: Generated<number>;
  commission_bps: Generated<number>;
  missed_orders_count: Generated<number>;
  last_heartbeat_at: NullableTimestamp;
  fssai_license: string | null;
  gstin: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RestaurantMembersTable {
  restaurant_id: string;
  user_id: string;
  role: Generated<'owner' | 'manager' | 'staff'>;
  created_at: Generated<Date>;
}

export interface RestaurantHoursTable {
  id: Id;
  restaurant_id: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
}

export interface MenuCategoriesTable {
  id: Id;
  restaurant_id: string;
  name: string;
  sort_order: Generated<number>;
  is_active: Generated<boolean>;
}

export interface MenuItemsTable {
  id: Id;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_paise: number;
  is_veg: Generated<boolean>;
  in_stock: Generated<boolean>;
  is_active: Generated<boolean>;
  is_bestseller: Generated<boolean>;
  max_per_order: Generated<number>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemVariantsTable {
  id: Id;
  item_id: string;
  name: string;
  price_paise: number;
  is_default: Generated<boolean>;
  in_stock: Generated<boolean>;
  sort_order: Generated<number>;
}

export interface AddonGroupsTable {
  id: Id;
  item_id: string;
  name: string;
  min_select: Generated<number>;
  max_select: Generated<number>;
  sort_order: Generated<number>;
}

export interface AddonsTable {
  id: Id;
  group_id: string;
  name: string;
  price_paise: Generated<number>;
  is_veg: Generated<boolean>;
  in_stock: Generated<boolean>;
}

export interface CouponsTable {
  id: Id;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  max_discount_paise: number | null;
  min_order_paise: Generated<number>;
  valid_from: Timestamp;
  valid_until: NullableTimestamp;
  max_uses: number | null;
  used_count: Generated<number>;
  per_user_limit: Generated<number>;
  first_order_only: Generated<boolean>;
  restaurant_id: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface CouponRedemptionsTable {
  id: Id;
  coupon_id: string;
  user_id: string;
  order_id: string;
  discount_paise: number;
  created_at: Generated<Date>;
}

export interface RidersTable {
  id: string;
  vehicle_type: VehicleType;
  vehicle_number: string | null;
  license_number: string | null;
  kyc_status: Generated<KycStatus>;
  city_id: string | null;
  is_online: Generated<boolean>;
  current_order_id: string | null;
  cash_in_hand_paise: Generated<number>;
  cash_limit_paise: Generated<number>;
  rating_avg: Generated<number>;
  rating_count: Generated<number>;
  offers_received: Generated<number>;
  offers_accepted: Generated<number>;
  flags_count: Generated<number>;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrdersTable {
  id: Id;
  short_code: string;
  customer_id: string;
  restaurant_id: string;
  rider_id: string | null;
  city_id: string;
  zone_id: string;
  status: OrderStatus;
  dispatch_status: Generated<DispatchStatus>;
  version: Generated<number>;
  payment_method: PaymentMethod;
  payment_status: Generated<PaymentStatus>;
  delivery_address: Json<DeliveryAddressSnapshot>;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  distance_m: number;
  item_total_paise: number;
  packaging_fee_paise: Generated<number>;
  delivery_fee_paise: Generated<number>;
  platform_fee_paise: Generated<number>;
  tax_paise: Generated<number>;
  discount_paise: Generated<number>;
  tip_paise: Generated<number>;
  total_paise: number;
  pricing: Json<Record<string, unknown>>;
  coupon_id: string | null;
  prep_minutes: number | null;
  estimated_delivery_at: NullableTimestamp;
  delivery_otp_hash: string;
  delivery_proof_path: string | null;
  delivery_proof_lat: number | null;
  delivery_proof_lng: number | null;
  customer_note: string | null;
  cancel_reason: string | null;
  cancelled_by: ActorType | null;
  placed_at: NullableTimestamp;
  accepted_at: NullableTimestamp;
  ready_at: NullableTimestamp;
  picked_up_at: NullableTimestamp;
  delivered_at: NullableTimestamp;
  cancelled_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderItemsTable {
  id: Id;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  variant_name: string | null;
  addons: Json<OrderItemAddonSnapshot[]>;
  is_veg: boolean;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
}

export interface OrderEventsTable {
  id: Generated<number>;
  order_id: string;
  event: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  actor_type: ActorType;
  actor_id: string | null;
  metadata: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface PaymentsTable {
  id: Id;
  order_id: string;
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  amount_paise: number;
  refunded_paise: Generated<number>;
  status: Generated<PaymentStatus>;
  method: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RefundsTable {
  id: Id;
  order_id: string;
  payment_id: string | null;
  amount_paise: number;
  provider_refund_id: string | null;
  status: Generated<RefundStatus>;
  reason: string;
  attempts: Generated<number>;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WebhookEventsTable {
  id: string;
  provider: string;
  event_type: string;
  received_at: Generated<Date>;
}

export interface RiderOffersTable {
  id: Id;
  order_id: string;
  rider_id: string;
  status: Generated<OfferStatus>;
  score: number;
  distance_m: number;
  payout_paise: number;
  expires_at: Timestamp;
  responded_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface RiderLocationPingsTable {
  id: Generated<number>;
  rider_id: string;
  order_id: string | null;
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading: number | null;
  accuracy_m: number | null;
  is_mock: Generated<boolean>;
  recorded_at: Timestamp;
}

export interface RatingsTable {
  id: Id;
  order_id: string;
  customer_id: string;
  restaurant_id: string;
  rider_id: string | null;
  restaurant_rating: number;
  rider_rating: number | null;
  comment: string | null;
  created_at: Generated<Date>;
}

export interface SupportTicketsTable {
  id: Id;
  user_id: string;
  order_id: string | null;
  app: ClientApp;
  category: string;
  subject: string;
  description: string;
  attachments: ColumnType<string[], string[] | undefined, string[]>;
  status: Generated<TicketStatus>;
  resolution: string | null;
  refund_paise: number | null;
  assigned_to: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayoutsTable {
  id: Id;
  account_type: 'restaurant' | 'rider';
  account_id: string;
  amount_paise: number;
  status: Generated<'pending' | 'processing' | 'paid' | 'failed'>;
  provider_ref: string | null;
  period_end: Timestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type LedgerAccount = 'customer' | 'restaurant' | 'rider' | 'platform' | 'tax' | 'cash';

export interface LedgerEntriesTable {
  id: Generated<number>;
  order_id: string | null;
  account_type: LedgerAccount;
  account_id: string | null;
  amount_paise: number;
  entry_type: string;
  payout_id: string | null;
  created_at: Generated<Date>;
}

export interface OutboxTable {
  id: Generated<number>;
  topic: string;
  payload: Json<Record<string, unknown>>;
  available_at: Generated<Date>;
  locked_until: NullableTimestamp;
  attempts: Generated<number>;
  last_error: string | null;
  processed_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: Generated<number>;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Json<unknown> | null;
  after: Json<unknown> | null;
  created_at: Generated<Date>;
}

export interface CallLogsTable {
  id: Id;
  order_id: string;
  caller_id: string;
  caller_role: ActorType;
  callee_role: ActorType;
  provider: string;
  provider_ref: string | null;
  status: Generated<string>;
  duration_seconds: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OtpSendLogTable {
  id: Generated<number>;
  phone: string;
  outcome: 'sent' | 'blocked_no_ticket' | 'failed';
  provider: string;
  error: string | null;
  created_at: Generated<Date>;
}

export interface AppConfigTable {
  key: string;
  value: Json<unknown>;
  updated_at: Generated<Date>;
}

export interface Database {
  profiles: ProfilesTable;
  device_tokens: DeviceTokensTable;
  cities: CitiesTable;
  zones: ZonesTable;
  addresses: AddressesTable;
  restaurants: RestaurantsTable;
  restaurant_members: RestaurantMembersTable;
  restaurant_hours: RestaurantHoursTable;
  menu_categories: MenuCategoriesTable;
  menu_items: MenuItemsTable;
  item_variants: ItemVariantsTable;
  addon_groups: AddonGroupsTable;
  addons: AddonsTable;
  coupons: CouponsTable;
  coupon_redemptions: CouponRedemptionsTable;
  riders: RidersTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  order_events: OrderEventsTable;
  payments: PaymentsTable;
  refunds: RefundsTable;
  webhook_events: WebhookEventsTable;
  rider_offers: RiderOffersTable;
  rider_location_pings: RiderLocationPingsTable;
  ratings: RatingsTable;
  support_tickets: SupportTicketsTable;
  payouts: PayoutsTable;
  ledger_entries: LedgerEntriesTable;
  outbox: OutboxTable;
  audit_logs: AuditLogsTable;
  app_config: AppConfigTable;
  call_logs: CallLogsTable;
  otp_send_log: OtpSendLogTable;
}

export type Order = Selectable<OrdersTable>;
export type NewOrder = Insertable<OrdersTable>;
export type OrderUpdate = Updateable<OrdersTable>;
export type Restaurant = Selectable<RestaurantsTable>;
export type Rider = Selectable<RidersTable>;
export type Zone = Selectable<ZonesTable>;
export type MenuItem = Selectable<MenuItemsTable>;
export type Coupon = Selectable<CouponsTable>;
export type Payment = Selectable<PaymentsTable>;
export type RiderOffer = Selectable<RiderOffersTable>;
