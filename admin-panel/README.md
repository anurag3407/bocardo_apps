# Bocardo Console (admin panel)

Next.js 16 (App Router) · Tailwind 4 · TanStack Query · Mapbox GL. For ops, support and finance.

```bash
cp .env.example .env.local
pnpm install
pnpm dev      # http://localhost:3000 — local login: admin@bocardo.app / Admin@12345
pnpm build
```

| Page | Roles |
|---|---|
| Overview (KPIs), Orders, Restaurants, Riders | ops, support, finance |
| Live ops map + realtime alerts (no rider, silent rider, SOS) | ops, support |
| Order actions: cancel / reassign / refund | ops, support / ops / support, finance |
| Zones & pricing (draw polygons, surge, rain mode, fees) | ops |
| Coupons | finance, ops |
| Payouts, Audit log | finance |
| Support tickets (resolve with refund) | support, ops |
| Settings (remote config, grant console access) | super_admin |

`src/proxy.ts` (Next 16's middleware) keeps non-admins out; the API enforces the same roles on every
call, and every admin mutation is written to the audit log. `pnpm gen:api` regenerates the client.
