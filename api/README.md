# Bocardo API

NestJS 11 (Fastify) modular monolith. Owns the database (`supabase/`) and the API contract (`openapi.json`).
Architecture: [../docs/architecture.md](../docs/architecture.md).

```bash
npx supabase start && npx supabase db reset   # local Postgres/Auth/Realtime + migrations + seed
cp .env.example .env                          # SUPABASE_SERVICE_ROLE_KEY from `npx supabase status`
pnpm install
pnpm dev                                      # :4000, Swagger UI at /docs
```

| Script | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | run / compile / run compiled |
| `pnpm test` | unit tests (pure domain logic) |
| `pnpm test:e2e` | full order lifecycle against the local stack (`E2E=1 SUPABASE_ANON_KEY=…`) |
| `pnpm openapi` | regenerate `openapi.json` — then run `pnpm gen:api` in every app |
| `pnpm db:types` | introspect the DB into `db.generated.ts` to diff against `db.types.ts` |
| `pnpm typecheck` / `pnpm lint` | |

## Layout

```
src/
  main.ts, app.module.ts
  config/        zod-validated env (production refuses dev fallbacks)
  common/        auth guard + decorators, error envelope, idempotency, rate limiting, utils
  infra/         adapters behind interfaces: database, kv, jobs, push, realtime, geo, payments
  platform/      outbox (+ processor), notifications, audit
  modules/       one folder per domain (see architecture.md)
supabase/
  migrations/    schema, RLS + realtime authorization, pg_cron housekeeping
  seed.sql       demo city, zones, restaurants, menus, users, coupons
test/            e2e
```

Conventions: controllers stay thin; services hold logic; pure rules live in `domain/` files with
unit tests; anything with side effects goes through the outbox; every error is an `AppError` with a
stable `code` the apps switch on.
