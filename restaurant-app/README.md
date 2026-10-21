# Bocardo Partner — restaurant app

Runs on the counter phone/tablet: a live order board that **rings until every new order is handled**,
accept with prep time, mark ready, extend prep, stock toggles (item / variant / add-on), menu editing,
busy mode, opening hours, earnings and partner onboarding.

```bash
cp .env.example .env && pnpm install && pnpm android   # or pnpm ios
```

Keeps the screen awake on the board, sends a heartbeat every minute, and listens on the private
`restaurant:<id>` realtime channel with 10 s polling as a fallback. `pnpm gen:api` regenerates the
client (partner endpoints only).
