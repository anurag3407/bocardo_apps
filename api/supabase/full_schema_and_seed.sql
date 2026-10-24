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
-- ════════════════════════════════════════════════════════════════════════════
-- Auth integration, row-level security and realtime channel authorization.
-- The API connects with an owner role and bypasses RLS; these policies protect
-- any direct client access (Supabase Realtime, Storage, PostgREST).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Profile bootstrap on sign-up ───────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, email, full_name)
  values (new.id, new.phone, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Access-token hook: roles live in the JWT so the API never looks them up ─
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable as $$
declare
  claims jsonb := event -> 'claims';
  p record;
begin
  select roles, admin_role, is_blocked into p
  from public.profiles where id = (event ->> 'user_id')::uuid;

  claims := jsonb_set(claims, '{app_roles}', coalesce(to_jsonb(p.roles), '["customer"]'::jsonb));
  claims := jsonb_set(claims, '{admin_role}', coalesce(to_jsonb(p.admin_role), 'null'::jsonb));
  claims := jsonb_set(claims, '{is_blocked}', to_jsonb(coalesce(p.is_blocked, false)));
  return jsonb_set(event, '{claims}', claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;

-- ── Policy helpers ─────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_roles') ? 'admin', false)
$$;

create or replace function public.is_restaurant_member(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = rid and m.user_id = auth.uid()
  )
$$;

-- Text-typed so malformed realtime topics evaluate to false instead of erroring.
create or replace function public.can_view_order(order_id_text text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id::text = order_id_text
      and (o.customer_id = auth.uid()
           or o.rider_id = auth.uid()
           or exists (select 1 from public.restaurant_members m
                      where m.restaurant_id = o.restaurant_id and m.user_id = auth.uid()))
  )
$$;

create or replace function public.is_restaurant_member_text(rid_text text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id::text = rid_text and m.user_id = auth.uid()
  )
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'device_tokens', 'cities', 'zones', 'addresses', 'restaurants',
    'restaurant_members', 'restaurant_hours', 'menu_categories', 'menu_items',
    'item_variants', 'addon_groups', 'addons', 'coupons', 'riders', 'orders',
    'order_items', 'order_events', 'coupon_redemptions', 'payments', 'refunds',
    'webhook_events', 'rider_offers', 'rider_location_pings', 'ratings',
    'support_tickets', 'payouts', 'ledger_entries', 'outbox', 'audit_logs', 'app_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- own profile
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- own addresses
create policy addresses_owner_all on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- public catalogue
create policy cities_read on public.cities for select to anon, authenticated using (is_active);
create policy zones_read on public.zones for select to anon, authenticated using (is_active);
create policy restaurants_read on public.restaurants for select to anon, authenticated
  using (status = 'active' or public.is_restaurant_member(id) or public.is_admin());
create policy restaurant_hours_read on public.restaurant_hours for select to anon, authenticated using (true);
create policy menu_categories_read on public.menu_categories for select to anon, authenticated using (true);
create policy menu_items_read on public.menu_items for select to anon, authenticated using (true);
create policy item_variants_read on public.item_variants for select to anon, authenticated using (true);
create policy addon_groups_read on public.addon_groups for select to anon, authenticated using (true);
create policy addons_read on public.addons for select to anon, authenticated using (true);

-- orders visible to their participants
create policy orders_participants on public.orders for select to authenticated
  using (customer_id = auth.uid() or rider_id = auth.uid()
         or public.is_restaurant_member(restaurant_id) or public.is_admin());
create policy order_items_participants on public.order_items for select to authenticated
  using (public.can_view_order(order_id::text) or public.is_admin());

create policy riders_self on public.riders for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy rider_offers_self on public.rider_offers for select to authenticated
  using (rider_id = auth.uid());
create policy restaurant_members_self on public.restaurant_members for select to authenticated
  using (user_id = auth.uid());
create policy support_tickets_owner on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- everything else: no policy → no client access (service role / API only)

-- ── Realtime authorization (private broadcast channels) ────────────────────
--   order:<uuid>       customer, assigned rider, restaurant staff
--   restaurant:<uuid>  restaurant staff
--   rider:<uuid>       that rider
--   admin:<anything>   admins
create policy bocardo_realtime_read on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast' and (
       (split_part(realtime.topic(), ':', 1) = 'order'
          and public.can_view_order(split_part(realtime.topic(), ':', 2)))
    or (split_part(realtime.topic(), ':', 1) = 'restaurant'
          and public.is_restaurant_member_text(split_part(realtime.topic(), ':', 2)))
    or realtime.topic() = 'rider:' || auth.uid()::text
    or (split_part(realtime.topic(), ':', 1) = 'admin' and public.is_admin())
  )
);

-- ── Storage buckets ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('menu-images', 'menu-images', true),
  ('kyc-documents', 'kyc-documents', false),
  ('delivery-proofs', 'delivery-proofs', false),
  ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

-- users write into a folder named after their user id
create policy storage_own_folder_write on storage.objects for insert to authenticated
  with check (
    bucket_id in ('kyc-documents', 'delivery-proofs', 'support-attachments', 'menu-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy storage_own_folder_read on storage.objects for select to authenticated
  using ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin());
-- Periodic housekeeping via pg_cron (runs inside Postgres, independent of API instances).
create extension if not exists pg_cron;

select cron.schedule('bocardo-prune-outbox', '15 3 * * *',
  $$delete from public.outbox where processed_at < now() - interval '7 days'$$);

select cron.schedule('bocardo-prune-pings', '30 3 * * *',
  $$delete from public.rider_location_pings where recorded_at < now() - interval '90 days'$$);

select cron.schedule('bocardo-prune-webhooks', '45 3 * * *',
  $$delete from public.webhook_events where received_at < now() - interval '30 days'$$);

-- Lift busy mode automatically once it has expired.
select cron.schedule('bocardo-clear-busy', '* * * * *',
  $$update public.restaurants set busy_until = null where busy_until < now()$$);
-- ════════════════════════════════════════════════════════════════════════════
-- Proof of delivery, masked calling, OTP abuse protection.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Proof of delivery ──────────────────────────────────────────────────────
-- Storage object path in the private `delivery-proofs` bucket: <rider_id>/<order_id>/<file>.jpg
alter table public.orders
  add column delivery_proof_path text,
  add column delivery_proof_lat  double precision,
  add column delivery_proof_lng  double precision;

-- ── Masked calls ───────────────────────────────────────────────────────────
-- Parties are connected through a platform number; neither side ever sees the other's phone.
create table public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  caller_id        uuid not null references public.profiles (id),
  caller_role      public.actor_type not null,
  callee_role      public.actor_type not null,
  provider         text not null,
  provider_ref     text,
  status           text not null default 'initiated',
  duration_seconds integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index call_logs_order_idx on public.call_logs (order_id, created_at);
create index call_logs_provider_ref_idx on public.call_logs (provider, provider_ref);
create trigger call_logs_updated_at before update on public.call_logs
  for each row execute function public.set_updated_at();
alter table public.call_logs enable row level security;

-- ── OTP abuse monitoring ───────────────────────────────────────────────────
-- One row per SMS actually sent (or blocked) — feeds cost dashboards and fraud review.
create table public.otp_send_log (
  id          bigint generated always as identity primary key,
  phone       text not null,
  outcome     text not null check (outcome in ('sent', 'blocked_no_ticket', 'failed')),
  provider    text not null,
  error       text,
  created_at  timestamptz not null default now()
);
create index otp_send_log_time_idx on public.otp_send_log (created_at desc);
alter table public.otp_send_log enable row level security;

select cron.schedule('bocardo-prune-otp-log', '0 4 * * *',
  $$delete from public.otp_send_log where created_at < now() - interval '90 days'$$);

insert into public.app_config (key, value) values
  ('delivery', '{"proofPhotoRequired": true}'),
  ('otp', '{"allowedCountryCodes": ["91"], "hourlyBudget": 5000}')
on conflict (key) do nothing;
-- ════════════════════════════════════════════════════════════════════════════
-- Local demo data. Phone logins use the fixed OTP 123456 (see config.toml).
--   customer    +91 99999 00001
--   restaurant  +91 99999 00002  (owns "Biryani Bros")
--   rider       +91 99999 00003  (approved, scooter)
--   admin       admin@bocardo.app / Admin@12345
-- ════════════════════════════════════════════════════════════════════════════

-- ── Demo auth users ────────────────────────────────────────────────────────
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, null::text, '919999900001'::text, 'Asha Customer'),
      ('22222222-2222-2222-2222-222222222222'::uuid, null, '919999900002', 'Ravi Restaurateur'),
      ('33333333-3333-3333-3333-333333333333'::uuid, null, '919999900003', 'Kiran Rider'),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'admin@bocardo.app', null, 'Bocardo Admin')
    ) as t(id, email, phone, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email,
      case when u.email is not null then extensions.crypt('Admin@12345', extensions.gen_salt('bf')) end,
      case when u.email is not null then now() end,
      u.phone,
      case when u.phone is not null then now() end,
      jsonb_build_object('provider', case when u.email is not null then 'email' else 'phone' end,
                         'providers', jsonb_build_array(case when u.email is not null then 'email' else 'phone' end)),
      jsonb_build_object('full_name', u.full_name),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_strip_nulls(jsonb_build_object('sub', u.id::text, 'email', u.email, 'phone', u.phone)),
      case when u.email is not null then 'email' else 'phone' end,
      now(), now(), now()
    );
  end loop;
end $$;

update public.profiles set roles = '{customer,restaurant}' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set roles = '{customer,rider}'      where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set roles = '{admin}', admin_role = 'super_admin'
  where id = '44444444-4444-4444-4444-444444444444';

-- ── City & zones (Bengaluru) ───────────────────────────────────────────────
insert into public.cities (id, name, timezone) values
  ('c0000000-0000-0000-0000-000000000001', 'Bengaluru', 'Asia/Kolkata');

insert into public.zones (id, city_id, name, boundary, free_delivery_above_paise) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Koramangala-HSR',
   st_geogfromtext('POLYGON((77.590 12.900, 77.670 12.900, 77.670 12.955, 77.590 12.955, 77.590 12.900))'), 49900),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Indiranagar',
   st_geogfromtext('POLYGON((77.600 12.955, 77.670 12.955, 77.670 12.995, 77.600 12.995, 77.600 12.955))'), null);

-- ── Customer address ───────────────────────────────────────────────────────
insert into public.addresses (user_id, label, line1, landmark, city, pincode, lat, lng, is_default) values
  ('11111111-1111-1111-1111-111111111111', 'home', '42, 5th Cross, 6th Block Koramangala',
   'Near Sony Signal', 'Bengaluru', '560095', 12.9352, 77.6245, true);

-- ── Rider ──────────────────────────────────────────────────────────────────
insert into public.riders (id, vehicle_type, vehicle_number, license_number, kyc_status, city_id) values
  ('33333333-3333-3333-3333-333333333333', 'scooter', 'KA01AB1234', 'KA0120210001234', 'approved',
   'c0000000-0000-0000-0000-000000000001');

-- ── Restaurants ────────────────────────────────────────────────────────────
insert into public.restaurants (
  id, name, slug, description, cuisines, address_line, city_id, zone_id, lat, lng,
  status, is_open, avg_prep_minutes, min_order_paise, packaging_fee_paise, cost_for_two_paise, is_veg_only
) values
  ('b0000000-0000-0000-0000-000000000001', 'Biryani Bros', 'biryani-bros-koramangala',
   'Slow-cooked dum biryani since 2012', '{Biryani,Mughlai,North Indian}',
   '80 Feet Rd, 4th Block Koramangala', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 12.9338, 77.6271, 'active', true, 25, 14900, 2000, 60000, false),
  ('b0000000-0000-0000-0000-000000000002', 'Dosa Junction', 'dosa-junction-hsr',
   'Crisp dosas and filter coffee', '{South Indian,Breakfast}',
   '27th Main, HSR Layout Sector 1', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 12.9116, 77.6474, 'active', true, 15, 0, 1000, 30000, true),
  ('b0000000-0000-0000-0000-000000000003', 'Pizza Forno', 'pizza-forno-indiranagar',
   'Wood-fired Neapolitan pizza', '{Pizza,Italian}',
   '100 Feet Rd, Indiranagar', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002', 12.9719, 77.6412, 'active', true, 20, 19900, 3000, 80000, false),
  ('b0000000-0000-0000-0000-000000000004', 'Green Bowl', 'green-bowl-koramangala',
   'Salads, bowls and smoothies', '{Healthy,Salads}',
   '1st Block Koramangala', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 12.9279, 77.6338, 'active', true, 12, 9900, 1500, 50000, true);

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

-- Open 24h every day (opens_at = closes_at means all day).
insert into public.restaurant_hours (restaurant_id, day_of_week, opens_at, closes_at)
select r.id, d, '00:00', '00:00'
from public.restaurants r cross join generate_series(0, 6) d;

-- ── Menus ──────────────────────────────────────────────────────────────────
do $$
declare
  cat uuid;
  item uuid;
  grp uuid;
begin
  -- Biryani Bros
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', 'Biryani', 1) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price_paise, is_veg, is_bestseller, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', cat, 'Chicken Dum Biryani', 'Hyderabadi style, served with raita', 29900, false, true, 1)
    returning id into item;
  insert into public.item_variants (item_id, name, price_paise, is_default, sort_order) values
    (item, 'Half', 29900, true, 1), (item, 'Full', 44900, false, 2);
  insert into public.addon_groups (item_id, name, min_select, max_select) values (item, 'Extras', 0, 3) returning id into grp;
  insert into public.addons (group_id, name, price_paise, is_veg) values
    (grp, 'Extra Raita', 3000, true), (grp, 'Boiled Egg', 2000, false), (grp, 'Mirchi ka Salan', 4000, true);
  insert into public.menu_items (restaurant_id, category_id, name, description, price_paise, is_veg, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', cat, 'Veg Dum Biryani', 'Seasonal vegetables, saffron rice', 22900, true, 2);
  insert into public.menu_items (restaurant_id, category_id, name, description, price_paise, is_veg, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', cat, 'Mutton Biryani', 'Tender goat, slow dum', 39900, false, 3);
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000001', 'Starters', 2) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, price_paise, is_veg, sort_order) values
    ('b0000000-0000-0000-0000-000000000001', cat, 'Chicken 65', 24900, false, 1),
    ('b0000000-0000-0000-0000-000000000001', cat, 'Paneer Tikka', 22900, true, 2);

  -- Dosa Junction
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000002', 'Dosas', 1) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, price_paise, is_veg, is_bestseller, sort_order) values
    ('b0000000-0000-0000-0000-000000000002', cat, 'Masala Dosa', 9900, true, true, 1),
    ('b0000000-0000-0000-0000-000000000002', cat, 'Ghee Roast Dosa', 12900, true, false, 2),
    ('b0000000-0000-0000-0000-000000000002', cat, 'Rava Onion Dosa', 11900, true, false, 3);
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000002', 'Beverages', 2) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, price_paise, is_veg, sort_order) values
    ('b0000000-0000-0000-0000-000000000002', cat, 'Filter Coffee', 4900, true, 1);

  -- Pizza Forno
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000003', 'Pizzas', 1) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price_paise, is_veg, is_bestseller, sort_order)
    values ('b0000000-0000-0000-0000-000000000003', cat, 'Margherita', 'San Marzano, fior di latte, basil', 34900, true, true, 1)
    returning id into item;
  insert into public.item_variants (item_id, name, price_paise, is_default, sort_order) values
    (item, '10 inch', 34900, true, 1), (item, '12 inch', 44900, false, 2);
  insert into public.addon_groups (item_id, name, min_select, max_select) values (item, 'Toppings', 0, 4) returning id into grp;
  insert into public.addons (group_id, name, price_paise) values
    (grp, 'Olives', 4000), (grp, 'Jalapeños', 4000), (grp, 'Extra Cheese', 6000);
  insert into public.menu_items (restaurant_id, category_id, name, price_paise, is_veg, sort_order) values
    ('b0000000-0000-0000-0000-000000000003', cat, 'Pepperoni', 44900, false, 2);

  -- Green Bowl
  insert into public.menu_categories (restaurant_id, name, sort_order)
    values ('b0000000-0000-0000-0000-000000000004', 'Bowls', 1) returning id into cat;
  insert into public.menu_items (restaurant_id, category_id, name, price_paise, is_veg, sort_order) values
    ('b0000000-0000-0000-0000-000000000004', cat, 'Quinoa Power Bowl', 27900, true, 1),
    ('b0000000-0000-0000-0000-000000000004', cat, 'Greek Salad', 21900, true, 2),
    ('b0000000-0000-0000-0000-000000000004', cat, 'Berry Smoothie', 15900, true, 3);
end $$;

-- ── Coupons ────────────────────────────────────────────────────────────────
insert into public.coupons (code, description, discount_type, discount_value, max_discount_paise, min_order_paise, first_order_only, per_user_limit) values
  ('WELCOME50', '50% off your first order, up to ₹100', 'percent', 50, 10000, 14900, true, 1),
  ('FLAT75', '₹75 off on orders above ₹399', 'flat', 7500, null, 39900, false, 3);

-- ── App config ─────────────────────────────────────────────────────────────
insert into public.app_config (key, value) values
  ('min_app_version', '{"customer": "1.0.0", "restaurant": "1.0.0", "rider": "1.0.0"}'),
  ('dispatch', '{"offerTimeoutSeconds": 30, "radiiMeters": [3000, 5000, 8000], "maxAttempts": 8}'),
  ('support', '{"phone": "+918000000000", "email": "support@bocardo.app"}');
