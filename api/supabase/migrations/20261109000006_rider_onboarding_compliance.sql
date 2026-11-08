-- ── Rider Onboarding & KYC Compliance (Aadhaar, PAN, Driving Licence, RC, Banking) ──
alter table public.riders
  add column if not exists dob date,
  add column if not exists gender text,
  add column if not exists current_address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relation text,
  add column if not exists aadhaar_number text,
  add column if not exists aadhaar_front_path text,
  add column if not exists aadhaar_back_path text,
  add column if not exists pan_number text,
  add column if not exists pan_card_path text,
  add column if not exists license_expiry_date date,
  add column if not exists license_front_path text,
  add column if not exists license_back_path text,
  add column if not exists rc_number text,
  add column if not exists rc_document_path text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expiry_date date,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_beneficiary_name text,
  add column if not exists bank_name text,
  add column if not exists bank_cheque_document_path text,
  add column if not exists rejection_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id);

create index if not exists riders_kyc_created_idx
  on public.riders (kyc_status, created_at desc);
