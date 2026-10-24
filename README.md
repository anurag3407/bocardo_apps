# Bocardo

Food delivery platform: three React Native apps, an ops console and one backend.

| Folder | What | Stack |
|---|---|---|
| [`api/`](api/README.md) | Backend for every app; owns the database and the API contract (`openapi.json`) | NestJS 11 on Fastify, Kysely, Supabase Postgres + PostGIS, Upstash Redis + QStash, FCM, Mapbox, Razorpay |
| [`customer-app/`](customer-app/README.md) | Browse, order, pay, track live | Expo SDK 58, Expo Router, TanStack Query, Zustand |
| [`restaurant-app/`](restaurant-app/README.md) | Ringing order board, menu & stock, outlet hours, earnings | Expo SDK 58 |
| [`rider-app/`](rider-app/README.md) | Duty toggle, background GPS, offers, trip flow with OTP | Expo SDK 58 |
| [`admin-panel/`](admin-panel/README.md) | Ops / support / finance console | Next.js 16, Tailwind 4, Mapbox GL |
| [`docs/`](docs/) | Architecture, order state machine, edge cases, runbook | |

Each folder is fully independent (own `package.json`, lockfile, env, build). The apps never share code
packages; instead each **generates its typed API client from `api/openapi.json`** (`pnpm gen:api`), so a
change to one app never forces a change or redeploy of another, and the contract can't silently drift.

## Run everything locally

Prerequisites: Node 22+, pnpm 10, Docker (for the local Supabase stack), and for the mobile apps Xcode
and/or Android Studio (they use native modules, so they run as **development builds**, not Expo Go).

```bash
# 1. Database + auth (Supabase CLI: https://supabase.com/docs/guides/local-development)
cd api
npx supabase start          # Postgres, Auth, Realtime, Storage on :54321/:54322
npx supabase db reset       # applies supabase/migrations + seed.sql (demo city, restaurants, users)

# 2. API
cp .env.example .env        # paste SUPABASE_SERVICE_ROLE_KEY from `supabase status`
pnpm install && pnpm dev    # http://localhost:4000, Swagger at /docs

# 3. Admin console
cd ../admin-panel && cp .env.example .env.local && pnpm install && pnpm dev   # http://localhost:3000

# 4. Mobile apps (each folder)
cd ../customer-app && cp .env.example .env && pnpm install
pnpm ios   # or: pnpm android  — builds the dev client once, then `pnpm start`
```

Expo Go and the browser can't run these apps (Firebase, Mapbox and Razorpay are native modules). Opening
`localhost:8081` in Chrome only shows Metro's JSON manifest. Without Android Studio, build the dev client
in the cloud instead: `eas build -p android --profile development`, install the APK, then
`pnpm start --lan` (or `--tunnel` on another network) and open the project from the dev client.

Release builds: `eas build -p android --profile preview` gives an installable APK and `--profile production`
gives a Play Store AAB. Their `EXPO_PUBLIC_*` values come from **EAS environment variables**
(`eas env:list preview`), not `.env`, because `.env` is git-ignored and never uploaded. `app.config.ts`
fails the build if any of them is missing or not https.

Without Upstash, QStash, Firebase, Mapbox or Razorpay credentials the API falls back to in-memory /
logging / straight-line / mock adapters, so the whole order flow works offline. Production config
validation refuses to start with those fallbacks.

### Demo accounts (seeded, local only)

| App | Login |
|---|---|
| Customer | +91 99999 00001, OTP `123456` |
| Restaurant (Biryani Bros) | +91 99999 00002, OTP `123456` |
| Rider (approved) | +91 99999 00003, OTP `123456` |
| Admin console | `admin@bocardo.app` / `Admin@12345` |

Coupons: `WELCOME50` (first order), `FLAT75`.

## Verify

```bash
cd api && pnpm test                     # unit tests: state machine, pricing, cart, dispatch scoring, settlement, hours
cd api && E2E=1 SUPABASE_ANON_KEY=… pnpm test:e2e   # full COD order lifecycle against the local stack
cd <each app> && pnpm typecheck && pnpm lint
cd admin-panel && pnpm build
```

Read [docs/architecture.md](docs/architecture.md) first.
