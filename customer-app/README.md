# Bocardo — customer app

Expo SDK 58 · Expo Router · TanStack Query · Zustand. Browse nearby restaurants, customise dishes,
check out (Razorpay or COD), track the rider live, rate, get support.

```bash
cp .env.example .env
pnpm install
pnpm ios        # or pnpm android — builds the development client (native modules: Mapbox, Firebase, Razorpay)
pnpm start      # afterwards, just start Metro
```

Firebase: put `google-services.json` / `GoogleService-Info.plist` in `./firebase/` (git-ignored).

| Script | |
|---|---|
| `pnpm gen:api` | regenerate `src/core/api/generated` from `../api/openapi.json` |
| `pnpm typecheck` / `pnpm lint` | |

Structure: `src/app` (routes only) → `src/features/*` (screens, stores) → `src/core` (api, auth,
maps, push, realtime, payments) → `src/ui` (design system). Cart lives on device; the server re-prices
it on every change (`features/cart/use-quote.ts`).
