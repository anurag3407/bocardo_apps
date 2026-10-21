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
