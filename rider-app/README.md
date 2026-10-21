# Bocardo Rider — delivery partner app

Duty toggle, background GPS (Android foreground service / iOS background location), ringing offer
screen with a 30 s countdown, step-by-step trip (navigate → arrived → picked up → arrived → OTP),
COD collection, SOS, earnings and trip history.

```bash
cp .env.example .env && pnpm install && pnpm android   # or pnpm ios
```

Location points are batched and **queued on the device when offline**, then replayed in order
(`src/core/location/background-tracking.ts`). The task is registered at app start in
`src/app/_layout.tsx`. `pnpm gen:api` regenerates the client (rider endpoints only).
