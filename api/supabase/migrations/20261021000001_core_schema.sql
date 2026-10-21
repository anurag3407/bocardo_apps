-- ════════════════════════════════════════════════════════════════════════════
-- Bocardo core schema
-- Money is always integer paise. Locations are lat/lng columns with a generated
-- PostGIS geography column for spatial queries.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.admin_role as enum ('super_admin', 'ops', 'support', 'finance');
create type public.restaurant_status as enum ('pending', 'active', 'suspended', 'rejected');
create type public.kyc_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.order_status as enum (
  'PAYMENT_PENDING', 'PAYMENT_FAILED', 'PLACED', 'ACCEPTED', 'READY',
  'PICKED_UP', 'DELIVERED', 'REJECTED', 'CANCELLED', 'UNDELIVERED'
);
create type public.dispatch_status as enum (
  'UNASSIGNED', 'SEARCHING', 'ASSIGNED', 'AT_RESTAURANT', 'PICKED', 'AT_DROP', 'DONE', 'FAILED'
);
create type public.payment_method as enum ('cod', 'online');
create type public.payment_status as enum ('pending', 'captured', 'failed', 'refunded', 'partially_refunded');
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'expired', 'cancelled');
create type public.vehicle_type as enum ('bicycle', 'scooter', 'motorcycle', 'ev');
create type public.client_app as enum ('customer', 'restaurant', 'rider', 'admin');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.refund_status as enum ('pending', 'processed', 'failed');
create type public.actor_type as enum ('customer', 'restaurant', 'rider', 'system', 'admin');

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Identity ────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  email       text,
  avatar_url  text,
  -- a single person can be a customer, a rider and a restaurant owner at once
  roles       text[] not null default '{customer}'
              check (roles <@ array['customer', 'restaurant', 'rider', 'admin']),
  admin_role  public.admin_role,
  is_blocked  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  app         public.client_app not null,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  updated_at  timestamptz not null default now()
);
create index device_tokens_user_app_idx on public.device_tokens (user_id, app);

-- ── Geography ───────────────────────────────────────────────────────────────
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  timezone    text not null default 'Asia/Kolkata',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- A zone is the unit of serviceability, pricing, surge and (later) sharding.
create table public.zones (
  id                         uuid primary key default gen_random_uuid(),
  city_id                    uuid not null references public.cities (id),
  name                       text not null,
  boundary                   geography(Polygon, 4326) not null,
  is_active                  boolean not null default true,
  delivery_base_fee_paise    integer not null default 2500 check (delivery_base_fee_paise >= 0),
  delivery_base_km           real not null default 2.0,
  delivery_per_km_paise      integer not null default 800 check (delivery_per_km_paise >= 0),
  platform_fee_paise         integer not null default 500 check (platform_fee_paise >= 0),
  free_delivery_above_paise  integer,
  surge_multiplier           real not null default 1.0 check (surge_multiplier between 1.0 and 3.0),
  rain_mode                  boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (city_id, name)
);
create index zones_boundary_gix on public.zones using gist (boundary);
create trigger zones_updated_at before update on public.zones
  for each row execute function public.set_updated_at();

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text not null default 'home' check (label in ('home', 'work', 'other')),
  line1       text not null,
  line2       text,
  landmark    text,
  city        text,
  pincode     text,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  location    geography(Point, 4326)
              generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  is_default  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id) where deleted_at is null;

-- ── Restaurants & menu ─────────────────────────────────────────────────────
create table public.restaurants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  description          text,
  cuisines             text[] not null default '{}',
  cover_image_url      text,
  logo_url             text,
  phone                text,
  email                text,
  address_line         text not null,
  city_id              uuid not null references public.cities (id),
  zone_id              uuid references public.zones (id),
  lat                  double precision not null,
  lng                  double precision not null,
  location             geography(Point, 4326)
                       generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  delivery_radius_m    integer not null default 6000 check (delivery_radius_m between 500 and 20000),
  status               public.restaurant_status not null default 'pending',
  -- manual "accepting orders" switch; hours are checked separately
  is_open              boolean not null default false,
  -- temporary pause (busy mode / auto-pause after missed orders)
  busy_until           timestamptz,
  avg_prep_minutes     integer not null default 20 check (avg_prep_minutes between 1 and 180),
  min_order_paise      integer not null default 0,
  packaging_fee_paise  integer not null default 0,
  cost_for_two_paise   integer,
  is_veg_only          boolean not null default false,
  rating_avg           real not null default 0,
  rating_count         integer not null default 0,
  commission_bps       integer not null default 2000 check (commission_bps between 0 and 10000),
  missed_orders_count  integer not null default 0,
  last_heartbeat_at    timestamptz,
  fssai_license        text,
  gstin                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index restaurants_location_gix on public.restaurants using gist (location);
create index restaurants_name_trgm on public.restaurants using gin (name extensions.gin_trgm_ops);
create index restaurants_status_idx on public.restaurants (status, city_id);
create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();

create table public.restaurant_members (
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           text not null default 'owner' check (role in ('owner', 'manager', 'staff')),
  created_at     timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index restaurant_members_user_idx on public.restaurant_members (user_id);

-- day_of_week: 0 = Sunday. closes_at <= opens_at means the slot runs past midnight.
create table public.restaurant_hours (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  day_of_week    smallint not null check (day_of_week between 0 and 6),
  opens_at       time not null,
  closes_at      time not null
);
create index restaurant_hours_restaurant_idx on public.restaurant_hours (restaurant_id);

create table public.menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null,
  sort_order     integer not null default 0,
  is_active      boolean not null default true
);
create index menu_categories_restaurant_idx on public.menu_categories (restaurant_id);

create table public.menu_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  category_id     uuid not null references public.menu_categories (id) on delete cascade,
  name            text not null,
  description     text,
  image_url       text,
  price_paise     integer not null check (price_paise >= 0),
  is_veg          boolean not null default true,
  in_stock        boolean not null default true,
  is_active       boolean not null default true,
  is_bestseller   boolean not null default false,
  max_per_order   integer not null default 10 check (max_per_order between 1 and 100),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id, category_id);
create index menu_items_name_trgm on public.menu_items using gin (name extensions.gin_trgm_ops);
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- A variant replaces the item's base price (e.g. Half / Full).
create table public.item_variants (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.menu_items (id) on delete cascade,
  name         text not null,
  price_paise  integer not null check (price_paise >= 0),
  is_default   boolean not null default false,
  in_stock     boolean not null default true,
  sort_order   integer not null default 0
);
create index item_variants_item_idx on public.item_variants (item_id);

create table public.addon_groups (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.menu_items (id) on delete cascade,
  name        text not null,
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  sort_order  integer not null default 0,
  check (min_select <= max_select)
);
create index addon_groups_item_idx on public.addon_groups (item_id);

create table public.addons (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.addon_groups (id) on delete cascade,
  name         text not null,
  price_paise  integer not null default 0 check (price_paise >= 0),
  is_veg       boolean not null default true,
  in_stock     boolean not null default true
);
create index addons_group_idx on public.addons (group_id);

-- ── Promotions ──────────────────────────────────────────────────────────────
create table public.coupons (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code = upper(code)),
  description         text,
  discount_type       text not null check (discount_type in ('percent', 'flat')),
  discount_value      integer not null check (discount_value > 0),
  max_discount_paise  integer,
  min_order_paise     integer not null default 0,
  valid_from          timestamptz not null default now(),
  valid_until         timestamptz,
  max_uses            integer,
  used_count          integer not null default 0,
  per_user_limit      integer not null default 1,
  first_order_only    boolean not null default false,
  -- null = platform-funded; set = restaurant-funded and only valid there
  restaurant_id       uuid references public.restaurants (id) on delete cascade,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100)
);

-- ── Riders ──────────────────────────────────────────────────────────────────
create table public.riders (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type        public.vehicle_type not null,
  vehicle_number      text,
  license_number      text,
  kyc_status          public.kyc_status not null default 'pending',
  city_id             uuid references public.cities (id),
  is_online           boolean not null default false,
  current_order_id    uuid,
  cash_in_hand_paise  integer not null default 0,
  cash_limit_paise    integer not null default 200000,
  rating_avg          real not null default 0,
  rating_count        integer not null default 0,
  offers_received     integer not null default 0,
  offers_accepted     integer not null default 0,
  flags_count         integer not null default 0,
  last_lat            double precision,
  last_lng            double precision,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index riders_online_idx on public.riders (city_id) where is_online;
create trigger riders_updated_at before update on public.riders
  for each row execute function public.set_updated_at();

-- ── Orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  short_code             text not null unique,
  customer_id            uuid not null references public.profiles (id),
  restaurant_id          uuid not null references public.restaurants (id),
  rider_id               uuid references public.riders (id),
  city_id                uuid not null references public.cities (id),
  zone_id                uuid not null references public.zones (id),
  status                 public.order_status not null,
  dispatch_status        public.dispatch_status not null default 'UNASSIGNED',
  -- optimistic concurrency guard: every transition bumps it
  version                integer not null default 0,
  payment_method         public.payment_method not null,
  payment_status         public.payment_status not null default 'pending',
  delivery_address       jsonb not null,
  pickup_lat             double precision not null,
  pickup_lng             double precision not null,
  drop_lat               double precision not null,
  drop_lng               double precision not null,
  distance_m             integer not null,
  item_total_paise       integer not null,
  packaging_fee_paise    integer not null default 0,
  delivery_fee_paise     integer not null default 0,
  platform_fee_paise     integer not null default 0,
  tax_paise              integer not null default 0,
  discount_paise         integer not null default 0,
  tip_paise              integer not null default 0,
  total_paise            integer not null check (total_paise >= 0),
  pricing                jsonb not null,
  coupon_id              uuid references public.coupons (id),
  prep_minutes           integer,
  estimated_delivery_at  timestamptz,
  delivery_otp_hash      text not null,
  customer_note          text,
  cancel_reason          text,
  cancelled_by           public.actor_type,
  placed_at              timestamptz,
  accepted_at            timestamptz,
  ready_at               timestamptz,
  picked_up_at           timestamptz,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_restaurant_idx on public.orders (restaurant_id, created_at desc);
create index orders_rider_idx on public.orders (rider_id, created_at desc);
create index orders_active_idx on public.orders (status, zone_id)
  where status in ('PAYMENT_PENDING', 'PLACED', 'ACCEPTED', 'READY', 'PICKED_UP');
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.riders
  add constraint riders_current_order_fk foreign key (current_order_id) references public.orders (id) on delete set null;

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  menu_item_id       uuid references public.menu_items (id) on delete set null,
  name               text not null,
  variant_name       text,
  addons             jsonb not null default '[]',
  is_veg             boolean not null,
  unit_price_paise   integer not null,
  quantity           integer not null check (quantity > 0),
  line_total_paise   integer not null
);
create index order_items_order_idx on public.order_items (order_id);

-- Append-only audit trail of every order transition.
create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  event        text not null,
  from_status  public.order_status,
  to_status    public.order_status,
  actor_type   public.actor_type not null,
  actor_id     uuid,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, id);

create table public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons (id),
  user_id         uuid not null references public.profiles (id),
  order_id        uuid not null unique references public.orders (id) on delete cascade,
  discount_paise  integer not null,
  created_at      timestamptz not null default now()
);
create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);

-- ── Payments ────────────────────────────────────────────────────────────────
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  provider             text not null,
  provider_order_id    text not null unique,
  provider_payment_id  text,
  amount_paise         integer not null,
  refunded_paise       integer not null default 0,
  status               public.payment_status not null default 'pending',
  method               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  payment_id          uuid references public.payments (id),
  amount_paise        integer not null check (amount_paise > 0),
  provider_refund_id  text,
  status              public.refund_status not null default 'pending',
  reason              text not null,
  attempts            integer not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index refunds_pending_idx on public.refunds (status) where status = 'pending';
create trigger refunds_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- Webhook de-duplication (providers retry and re-order deliveries).
create table public.webhook_events (
  id           text primary key,
  provider     text not null,
  event_type   text not null,
  received_at  timestamptz not null default now()
);

-- ── Dispatch & tracking ────────────────────────────────────────────────────
create table public.rider_offers (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  rider_id      uuid not null references public.riders (id) on delete cascade,
  status        public.offer_status not null default 'pending',
  score         real not null,
  distance_m    integer not null,
  payout_paise  integer not null,
  expires_at    timestamptz not null,
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index rider_offers_order_idx on public.rider_offers (order_id);
create index rider_offers_rider_idx on public.rider_offers (rider_id, status);
-- at most one accepted offer per order, ever
create unique index rider_offers_one_accepted on public.rider_offers (order_id) where status = 'accepted';

-- Sampled breadcrumbs for disputes/audits (live position lives in Redis).
-- Scale path: convert to a range-partitioned table by recorded_at.
create table public.rider_location_pings (
  id           bigint generated always as identity primary key,
  rider_id     uuid not null references public.riders (id) on delete cascade,
  order_id     uuid references public.orders (id) on delete set null,
  lat          double precision not null,
  lng          double precision not null,
  speed_mps    real,
  heading      real,
  accuracy_m   real,
  is_mock      boolean not null default false,
  recorded_at  timestamptz not null
);
create index rider_location_pings_rider_idx on public.rider_location_pings (rider_id, recorded_at desc);
create index rider_location_pings_time_brin on public.rider_location_pings using brin (recorded_at);

-- ── Feedback & support ─────────────────────────────────────────────────────
create table public.ratings (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references public.orders (id) on delete cascade,
  customer_id        uuid not null references public.profiles (id),
  restaurant_id      uuid not null references public.restaurants (id),
  rider_id           uuid references public.riders (id),
  restaurant_rating  smallint not null check (restaurant_rating between 1 and 5),
  rider_rating       smallint check (rider_rating between 1 and 5),
  comment            text,
  created_at         timestamptz not null default now()
);

create table public.support_tickets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id),
  order_id       uuid references public.orders (id),
  app            public.client_app not null,
  category       text not null check (category in (
                   'missing_item', 'wrong_item', 'quality', 'late_delivery', 'payment',
                   'rider_behaviour', 'restaurant_issue', 'account', 'other')),
  subject        text not null,
  description    text not null,
  attachments    text[] not null default '{}',
  status         public.ticket_status not null default 'open',
  resolution     text,
  refund_paise   integer,
  assigned_to    uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ── Money ───────────────────────────────────────────────────────────────────
create table public.payouts (
  id             uuid primary key default gen_random_uuid(),
  account_type   text not null check (account_type in ('restaurant', 'rider')),
  account_id     uuid not null,
  amount_paise   integer not null,
  status         text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  provider_ref   text,
  period_end     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger payouts_updated_at before update on public.payouts
  for each row execute function public.set_updated_at();

-- Double-entry ledger: entries for one order always sum to zero.
create table public.ledger_entries (
  id            bigint generated always as identity primary key,
  order_id      uuid references public.orders (id),
  account_type  text not null check (account_type in (
                  'customer', 'restaurant', 'rider', 'platform', 'tax', 'cash')),
  account_id    uuid,
  amount_paise  integer not null,
  entry_type    text not null,
  payout_id     uuid references public.payouts (id),
  created_at    timestamptz not null default now()
);
create index ledger_entries_account_idx on public.ledger_entries (account_type, account_id) where payout_id is null;
create index ledger_entries_order_idx on public.ledger_entries (order_id);

-- ── Platform plumbing ──────────────────────────────────────────────────────
-- Transactional outbox: side effects are committed with the state change.
create table public.outbox (
  id            bigint generated always as identity primary key,
  topic         text not null,
  payload       jsonb not null,
  available_at  timestamptz not null default now(),
  locked_until  timestamptz,
  attempts      integer not null default 0,
  last_error    text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index outbox_pending_idx on public.outbox (available_at) where processed_at is null;

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id),
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_time_idx on public.audit_logs (created_at desc);

create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
