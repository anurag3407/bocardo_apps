# Runbook

## Environments & secrets

| Service | Where the secret goes |
|---|---|
| Supabase URL / anon key | apps (`EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`) |
| Supabase service-role key, `DATABASE_URL` (pooler, port 6543) | `api/.env` only |
| Upstash Redis + QStash (token, signing keys) | `api/.env` |
| Firebase service account (base64) | `api/.env`; `google-services.json` / `GoogleService-Info.plist` per app as EAS file secrets |
| Mapbox public token | apps; secret token only if your Mapbox account requires it for SDK downloads |
| Razorpay key id / secret / webhook secret | `api/.env`; webhook URL: `POST {API}/webhooks/razorpay` |
| `APP_SECRET` (delivery OTP derivation) | `api/.env` — rotating it changes OTPs of in-flight orders |

`NODE_ENV=production` refuses to boot with any in-memory/mock fallback.

## SMS: TRAI DLT registration (India, before launch)
Indian operators silently drop SMS that are not DLT-registered. One-time, takes ~1–2 weeks:
1. Register the company as a **Principal Entity** on an operator DLT portal (Jio, Airtel, Vi or BSNL — one is enough). → `DLT_PRINCIPAL_ENTITY_ID`
2. Register a 6-character **header** (sender ID), e.g. `BOCRDO`, category *Transactional/Service*. → `SMS_SENDER_ID`
3. Register the **content template** (category *Service Implicit*, type OTP), exactly:
   `{#var#} is your Bocardo login code. Do not share it with anyone. - Bocardo`  → `DLT_OTP_TEMPLATE_ID`
4. Link the header and template to your SMS provider (MSG91) as the telemarketer; create the MSG91 OTP template with the same text. → `MSG91_OTP_TEMPLATE_ID`
5. Supabase → Auth → Hooks → **Send SMS** → HTTPS `{API}/webhooks/auth/send-sms`, copy the secret → `SUPABASE_SEND_SMS_HOOK_SECRET`. Set `SMS_PROVIDER=msg91`.

## Firebase App Check
1. Firebase console → App Check → register the three Android apps with **Play Integrity** (add the Play signing SHA-256) and the iOS apps with **App Attest** (DeviceCheck fallback).
2. Dev builds use the debug provider: put the debug token from the device log in the console and in `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN`.
3. Set `OTP_HUMAN_CHECK=required` on the API (production refuses `optional`).
4. A future customer **website** sends a Cloudflare Turnstile token in `turnstileToken` instead (`TURNSTILE_SECRET_KEY`).

## Masked calling
* **Exotel** (recommended in India): buy an ExoPhone, set `TELEPHONY_PROVIDER=exotel` + `EXOTEL_*`. Exotel rings the caller first, then bridges; both see the ExoPhone.
* **Twilio**: `TELEPHONY_PROVIDER=twilio` + `TWILIO_*` (Indian numbers need a registered caller ID).
* Set `TELEPHONY_WEBHOOK_TOKEN`; status callbacks arrive at `{API}/webhooks/telephony/:provider?token=…`.
* Calls are capped at 10 minutes and only allowed while the order is active (see `calls/call-policy.ts`).

## Rider phones (battery)
* The rider app requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Google Play allows it for apps whose core
  function needs background location (delivery): declare it in the Play Console's sensitive-permissions form
  together with the background-location declaration and a short video of the trip flow.
* Support script for riders whose tracking freezes: Profile → Duty screen shows "Keep Bocardo running";
  tap both buttons (battery + autostart) and lock Bocardo in the recent-apps tray on MIUI/ColorOS.

## Supabase project setup (production)
1. `supabase link --project-ref …` then `supabase db push` (migrations).
2. Auth → Hooks → enable **Custom access token** → `public.custom_access_token_hook`.
3. Auth → Providers → Phone: configure MSG91/Twilio. Email: enable for admins; enforce MFA (TOTP).
4. Realtime → enable private channels ("Allow public access" off).
5. First admin: sign in once with email, then in SQL:
   `update profiles set roles = '{admin}', admin_role = 'super_admin' where email = '…';`
   Further admins are granted from the console (Settings).

## Deploy
* **API**: `api/Dockerfile` → Fly.io / Railway / Render / ECS. Stateless; scale horizontally.
  Health: `/health` (liveness), `/health/ready` (readiness, 503 if DB down).
  QStash must reach `{API_PUBLIC_URL}/internal/jobs/:name`.
* **Admin**: Vercel (`admin-panel`), env from `.env.example`.
* **Mobile**: `eas build --profile production` per app; JS-only fixes via `eas update`.
  After an API contract change: `pnpm gen:api` in each consumer, typecheck, ship.

## Common operations
| Situation | Action |
|---|---|
| Rain / demand spike in an area | Console → Zones → raise surge or enable rain mode |
| Order stuck "searching" | Console → Orders → "No rider" tab; reassign or cancel |
| Rider SOS / silent rider alerts | Console → Live ops alert feed |
| Approve new restaurant / rider | Console → Restaurants / Riders → Pending |
| Rider deposits COD cash | Console → Riders → Cash deposit |
| Weekly payouts | Console → Payouts → Run payout cycle → transfer → Mark paid |
| Force app update | Console → Settings → `min_app_version` |
| Tune dispatch (radius, timeouts) | Console → Settings → `dispatch` (picked up within 60 s) |
| "OTP requests blocked" spikes / budget alert | Likely SMS pumping: check `otp_send_log`, lower `otp.hourlyBudget`, confirm App Check enforcement |
| Make doorstep photo optional (e.g. a city with poor data) | Console → Settings → `delivery.proofPhotoRequired = false` |

## Housekeeping (pg_cron, inside Postgres)
Processed outbox rows > 7 days, location pings > 90 days and webhook ids > 30 days are pruned nightly;
expired busy mode is cleared every minute.
