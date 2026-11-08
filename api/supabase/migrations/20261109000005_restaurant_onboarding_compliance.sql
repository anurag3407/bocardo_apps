-- ── Restaurant Onboarding & Regulatory Compliance (FSSAI, PAN, GST, Banking) ──
alter table public.restaurants
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists owner_email text,
  add column if not exists fssai_expiry_date date,
  add column if not exists fssai_document_path text,
  add column if not exists pan_number text,
  add column if not exists pan_document_path text,
  add column if not exists gst_document_path text,
  add column if not exists legal_entity_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_beneficiary_name text,
  add column if not exists bank_name text,
  add column if not exists bank_cheque_document_path text,
  add column if not exists rejection_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id);

create index if not exists restaurants_status_created_idx
  on public.restaurants (status, created_at desc);
