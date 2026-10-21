# Architecture

## Shape

```
 customer-app ─┐                         ┌─ Supabase Postgres (+PostGIS, pg_cron)  ← source of truth
 restaurant-app├─ HTTPS (JWT) ─► api ────┼─ Upstash Redis   live rider GEO index, caches, locks, idempotency, rate limits
 rider-app ────┤                 (NestJS)├─ Upstash QStash  delayed jobs (timeouts, retries)
 admin-panel ──┘                         ├─ FCM             push
       ▲                                 ├─ Mapbox          routes / ETA matrix
       └──── Supabase Auth + Realtime ◄──┘ Razorpay         payments, refunds
             (login, private broadcast channels)
```

* **Supabase Auth** issues JWTs for all four apps (phone OTP for mobile, email + TOTP for admins). A
  Postgres *custom access token hook* stamps `app_roles` / `admin_role` into the token, so the API
  authorizes without a DB lookup per request. Tokens are verified locally against the project JWKS.
* **All reads and writes go through the API.** Apps use Supabase only for auth and for subscribing to
  **private Realtime broadcast channels**; who can join which channel is enforced by RLS on
  `realtime.messages` (`order:<id>`, `restaurant:<id>`, `rider:<id>`, `admin:ops:<city>`).

## The API is a modular monolith

`api/src/modules/*` each own their tables and expose services; cross-module side effects travel as
**outbox events**. Any module (dispatch, tracking, notifications) can later be extracted into its own
service without the apps noticing.

| Module | Responsibility |
|---|---|
| `zones` | Serviceability: which zone polygon covers a point (PostGIS `st_covers`) |
| `catalog` | Nearby restaurants (geohash-cell cache), menus (cached, invalidated on edit), search (pg_trgm) |
| `orders` | Quote → place → state machine (`OrderWorkflow`), customer views, timeout jobs + watchdog |
| `payments` | Razorpay verify + webhooks (deduped), refunds (row first, money via outbox with retries) |
| `dispatch` | Rider matching, offers, reassignment, stale-rider and stuck-search watchdogs |
| `riders` | Rider app API: onboarding, duty, location ingestion, trip actions with OTP |
| `partner` | Restaurant app API: onboarding, board actions, menu/stock, hours, busy mode |
| `promotions` | Coupon rules and race-safe redemption |
| `finance` | Double-entry ledger on delivery, COD cash tracking, payout runs |
| `feedback` | Ratings, support tickets |
| `admin` | Console API, every mutation audit-logged |
| `calls` | Masked calling (Exotel/Twilio click-to-call bridge), call policy, call logs |
| `otp` | SMS-pumping defence: App Check/Turnstile-verified OTP tickets, limits, Supabase Send-SMS hook, DLT SMS |
| `platform/` | Outbox (+ processor), notifications, audit — shared plumbing |
| `infra/` | Adapters behind interfaces: DB, KV (Upstash/memory), jobs (QStash/local), push (FCM/log), geo (Mapbox/haversine), payments (Razorpay/mock), realtime |

### Patterns that make it scale

1. **Single state machine.** Only `OrderWorkflow.transition()` / `setDispatch()` change an order: row
   lock (`SELECT … FOR UPDATE`) → legality check → update + `version` bump → `order_events` row →
   outbox message, all in one transaction. See [order-state-machine.md](order-state-machine.md).
2. **Transactional outbox.** Push, realtime, job scheduling, refunds and dispatch starts are written
   to `outbox` inside the business transaction and delivered at-least-once by a poller that claims
   rows with `FOR UPDATE SKIP LOCKED` (safe across many API instances; exponential backoff;
   dead-letters after 12 attempts). Every handler is idempotent.
3. **Quotes, not client prices.** `POST /orders/quote` re-prices the cart from the DB (stock, variants,
   add-on rules, zone fees, surge, coupon) and stores a 5-minute single-use quote in Redis. Orders are
   created only from a stored quote.
4. **Idempotency keys** on every money/state mutation (`Idempotency-Key` header, stored response
   replayed for 24 h).
5. **Geo-partitioning.** Cities → zones (PostGIS polygons). Pricing, surge and rain mode are per zone;
   rider GEO sets are per city. City/zone is the natural shard key later.
6. **Dispatch.** Sequential offers: `GEOSEARCH` idle riders near the restaurant → filter (KYC, fresh
   GPS, COD cash limit, not already offered) → road ETA via Mapbox Matrix → score (ETA 55%,
   acceptance 20%, idle time 15%, rating 10%) → 30 s offer under a Redis lock → on reject/timeout the
   next rider, with a wider radius and a higher payout each attempt → `FAILED` + ops alert after the
   configured attempts. Dispatch starts `prep_time − 10 min` after acceptance so riders don't wait.
7. **Live tracking.** Rider app batches GPS (foreground service) → API → Redis (hot position + GEO
   index) → broadcast on `order:<id>`; Postgres gets a breadcrumb every 30 s. Implausible jumps
   (>200 km/h) and mock locations are rejected and flagged.
8. **Self-healing.** Every timer has a watchdog: unaccepted orders, unpaid orders, searches with no
   live offer, riders gone silent mid-trip. Lost QStash/in-process timers can't strand an order.
9. **Graceful degradation.** Redis down → cache misses + Postgres rider fallback; Mapbox down →
   haversine ETAs; realtime down → apps poll; push down → realtime + polling.
10. **Money is integer paise.** Settlement is double-entry and always sums to zero (unit tested).
11. **Privacy by construction.** Personal phone numbers never leave the API; parties talk through a
    masked number, and every call is logged for disputes.
12. **Abuse economics.** SMS spend is gated by device/browser attestation, country allowlist, layered
    rate limits and a global budget breaker; delivery fraud is countered by geotagged doorstep photos.
13. **Battery-aware tracking.** GPS frequency follows what the data is used for (dispatch vs live tracking).

## Apps

All three mobile apps share one structure (copied, not shared):

```
src/app/            Expo Router routes only — thin files that export a feature screen
src/features/<x>/   screens, components, hooks, stores for one feature
src/core/           api (generated client + http-client), auth, config, notifications,
                    realtime, maps (provider-neutral DeliveryMap), location, storage, app-config
src/ui/             design tokens + primitives (Text, Button, Card, Input, Screen, Badge…)
src/lib/            pure helpers (formatting)
```

Switching maps to Google = new implementations of `core/maps/delivery-map.tsx` +
`core/maps/geocoding.ts` in the apps, `infra/geo/google-geo-provider.ts` in the API
(`GEO_PROVIDER=google`), and `features/common/mapbox-map.tsx` in the console.

## Scale-out path

* API is stateless → run N instances behind a load balancer (`/health/ready` gates traffic).
* Supabase pooler (PgBouncer) for connections; read replica for console analytics.
* Partition `orders` (monthly) and `rider_location_pings` (daily) when volumes justify.
* Extract `dispatch` + `tracking` into a service fed by the same outbox topics when location write
  volume dominates.
* Search → Typesense/Meilisearch fed from the outbox when pg_trgm becomes the bottleneck.
