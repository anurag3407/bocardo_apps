# Order state machine

Source of truth: `api/src/modules/orders/domain/order-state-machine.ts` (unit tested).

```
PAYMENT_PENDING ──► PLACED ──► ACCEPTED ──► READY ──► PICKED_UP ──► DELIVERED
      │                │           │           │           └──────► UNDELIVERED
      ▼                ▼           └───────────┴──► CANCELLED
PAYMENT_FAILED   REJECTED / CANCELLED          (ACCEPTED ──► PICKED_UP allowed when the
                                                 restaurant forgot to tap "ready")
```

| Status | Entered by | Timers / effects started |
|---|---|---|
| `PAYMENT_PENDING` | order created with online payment | payment expiry job (15 min) |
| `PLACED` | COD order, or payment captured | restaurant accept timeout (3 min); ring + push to restaurant |
| `ACCEPTED` | restaurant accepts with prep time | ETA set; dispatch starts at `prep − 10 min` |
| `READY` | restaurant marks ready | push to assigned rider |
| `PICKED_UP` | rider confirms pickup | customer push with delivery OTP |
| `DELIVERED` | rider enters correct OTP | ledger settlement, rider freed, COD cash added to rider |
| `REJECTED` / `CANCELLED` | restaurant / customer / system / admin | automatic refund if paid, coupon released, rider freed |
| `PAYMENT_FAILED` | payment expiry | late capture later → automatic refund |
| `UNDELIVERED` | rider, after ≥10 min at the door | rider freed; no automatic refund (support decides) |

Dispatch has its own lane on the same row:

```
UNASSIGNED ─► SEARCHING ─► ASSIGNED ─► AT_RESTAURANT ─► PICKED ─► AT_DROP ─► DONE
                  │  ▲          │            │
                  ▼  └──────────┴────────────┘  (reassignment before pickup)
                FAILED ─► SEARCHING (ops retry)
```

Who may cancel: customer while `PAYMENT_PENDING`/`PLACED`; restaurant after accepting (with reason);
system on timeouts; admin until pickup. Nobody can cancel after pickup — the food is with the rider.

Every transition writes an `order_events` row (actor, metadata) — the console shows it as the event log.
