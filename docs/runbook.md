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

## Housekeeping (pg_cron, inside Postgres)
Processed outbox rows > 7 days, location pings > 90 days and webhook ids > 30 days are pruned nightly;
expired busy mode is cleared every minute.
