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
