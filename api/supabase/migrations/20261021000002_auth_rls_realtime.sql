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
