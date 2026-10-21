# Edge cases and where they are handled

Paths are relative to `api/src` unless they start with an app folder.

## Cart & checkout
| Case | Handling | Where |
|---|---|---|
| Item went out of stock / removed / price changed after it was added | Quote re-prices from DB; issues return `CART_INVALID` with per-line codes; price changes are warnings | `modules/orders/domain/cart-validation.ts`, `customer-app/src/features/cart/CheckoutScreen.tsx` |
| Required add-on group not satisfied, add-on from another dish, too many add-ons | Validated per group min/max | `cart-validation.ts` |
| Same dish in several lines exceeding max per order | Quantities summed across lines | `cart-validation.ts` |
| Cart from another restaurant | App asks to replace the cart | `customer-app/.../RestaurantScreen.tsx` |
| Restaurant closed / paused / busy / outside hours (incl. past midnight) | `RESTAURANT_CLOSED` with reason, checked at quote **and** at placement | `modules/catalog/restaurant-availability.ts`, `common/utils/opening-hours.ts` |
| Address outside any zone or beyond restaurant radius | `ADDRESS_NOT_SERVICEABLE` / `OUT_OF_DELIVERY_RADIUS` | `modules/orders/quote.service.ts` |
| Below minimum order | `BELOW_MIN_ORDER` | `quote.service.ts` |
| Coupon expired / limit reached / first order only / wrong restaurant | Specific error codes; quote still returned with `couponError` | `modules/promotions/coupons.service.ts` |
| Two orders race for a coupon's last use | Conditional `UPDATE … WHERE used_count < max_uses` inside the order tx | `coupons.service.ts#redeem` |
| Stale prices (quote older than 5 min) or quote reused | `QUOTE_EXPIRED` / `QUOTE_ALREADY_USED`; app re-quotes | `quote.service.ts#consume` |
| Double tap on "Place order" / retry on flaky network | `Idempotency-Key` replays the first response | `common/idempotency/` |
| COD on large orders | COD disabled above ₹3,000 | `quote.service.ts` (`COD_LIMIT_PAISE`) |
| Surge, rain, free delivery threshold | Per-zone pricing levers | `modules/pricing/pricing.calculator.ts` |

## Payments
| Case | Handling | Where |
|---|---|---|
| App killed after paying | Webhook `payment.captured` places the order | `modules/payments/payments.service.ts#capture` |
| Webhook delivered twice / out of order | Deduped by event id; capture is idempotent | `webhook_events` table, `payments.service.ts` |
| Forged success from the client | Signature verified (HMAC) before anything changes | `infra/payments/razorpay-payment-provider.ts` |
| UPI pending, user never completes | Expiry job → `PAYMENT_FAILED` | `modules/orders/orders.jobs.ts` |
| Money captured after the order expired/cancelled | Auto full refund (`late_capture`) | `payments.service.ts#capture` |
| Gateway down when creating the payment | Order → `PAYMENT_FAILED`, `PAYMENT_PROVIDER_ERROR` to the app | `orders.service.ts#place` |
| Refund API fails | Retried with backoff via outbox; marked failed after 8 attempts | `modules/payments/refunds.service.ts` |
| Refund larger than what was paid | `REFUND_EXCEEDS_PAYMENT` (accounts for pending refunds) | `refunds.service.ts#create` |

## Restaurant
| Case | Handling | Where |
|---|---|---|
| Restaurant doesn't respond | Ringing alert + push; auto-cancel + refund after 3 min | `orders.jobs.ts#acceptTimeout` |
| Repeatedly ignores orders | Auto busy-mode for 30 min after 3 misses | `orders.jobs.ts` |
| Two devices accept the same order | Row lock + `from` guard: second gets `ORDER_STATE_CHANGED` | `order-workflow.service.ts` |
| Kitchen running late | "+10 min" extends prep and ETA, dispatch timing follows | `partner-orders.service.ts#extendPrep` |
| Item runs out after accepting | Restaurant cancels with reason → refund; partial refunds via support | `partner-orders.service.ts#cancel`, admin tickets |
| Tablet offline | Heartbeat every minute; console shows last-seen | `restaurant-app/.../OrdersBoardScreen.tsx`, admin restaurants |
| Staff vs manager permissions | Member roles checked per endpoint | `modules/partner/restaurant-access.service.ts` |

## Rider & dispatch
| Case | Handling | Where |
|---|---|---|
| No rider nearby | Retry every 30 s with widening radius (3→5→8 km) and rising payout; `FAILED` + ops alert after max attempts | `modules/dispatch/dispatch.service.ts` |
| Rider ignores / rejects offer | 30 s timeout job → next candidate; acceptance rate lowers future score | `dispatch.service.ts`, `domain/scoring.ts` |
| Two riders accept at once | Redis lock + offer row lock + unique "one accepted offer per order" index | `dispatch.service.ts#acceptOffer`, migration |
| Rider holds too much COD cash | Excluded from COD offers until they deposit | `dispatch.service.ts#findCandidates`, admin cash deposit |
| Rider stops sending GPS mid-trip | Ops alert after 3 min; auto-reassign after 6 min if not yet picked up | `dispatch/dispatch.handlers.ts#sweepStaleRiders` |
| Rider forgets to go offline | Auto-offline after 15 min without location | same |
| Lost retry/timeout timers | Watchdogs re-kick stuck searches, unaccepted and unpaid orders every minute | `dispatch.handlers.ts`, `orders.jobs.ts#watchdog` |
| GPS spoofing / jumps | Mock locations rejected + flagged; >200 km/h jumps dropped | `modules/riders/tracking.service.ts` |
| Rider offline (tunnel, no data) | Points queued on device and replayed in order | `rider-app/src/core/location/background-tracking.ts` |
| OS kills background location | Android foreground service + iOS background location mode | `rider-app/app.config.ts` |
| Food not ready when rider arrives | Rider can only confirm pickup after an explicit warning | `rider-app/.../TripPanel.tsx` |
| Wrong OTP | `OTP_MISMATCH`; deliver endpoint rate-limited | `riders.service.ts#deliver` |
| Customer unreachable | `UNDELIVERED` only after 10 min at the door | `riders.service.ts#undeliverable` |
| Rider in danger | SOS → audit log + realtime alert in console | `riders.service.ts#sos` |

## Customer & accounts
| Case | Handling | Where |
|---|---|---|
| Cancel after the kitchen started | Refused with `CANCEL_NOT_ALLOWED`; support route | `orders.service.ts#cancelByCustomer` |
| Missing / wrong items | Ticket → support resolves with partial refund | `modules/feedback`, admin tickets |
| Rating twice / before delivery | Unique per order; only `DELIVERED` | `feedback.service.ts#rate` |
| Abuse / fraud | Admin block → rejected on next token refresh | `admin-accounts.service.ts#setBlocked`, `auth.guard.ts` |
| Account deletion (DPDP) | Personal data anonymised, orders/ledger retained; refused during an active order | `users.service.ts#deleteAccount` |
| Phone number privacy | Contact numbers only exposed while an order is active | `order-reader.service.ts`, `riders.service.ts` |

## System
| Case | Handling |
|---|---|
| Redis down | Cache read failures fall through to Postgres; dispatch uses last persisted positions; rate limiter fails open |
| Mapbox down / quota | 2.5 s timeout → haversine estimate |
| Realtime down | Every live screen also polls (10–20 s) |
| DB down | `/health/ready` returns 503 (pulled from the load balancer); outbox backs off |
| Push token rotated / app reinstalled | Token upserted on refresh; invalid tokens deleted after FCM reports them |
| Old app versions | `app_config.min_app_version` → blocking "update required" screen |
| Clock skew | Server timestamps only; client GPS timestamps sanity-checked |

## Fleet power & proof of delivery
| Case | Handling | Where |
|---|---|---|
| 5 s GPS drains a budget phone in ~3.5 h | Adaptive profiles: 30 s / 50 m balanced accuracy while idle, 10 s / 20 m high accuracy only during a trip | `rider-app/src/core/location/background-tracking.ts`, `DutyScreen.tsx` |
| Xiaomi/Vivo/Oppo/OnePlus/Huawei kill background tracking | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` system dialog + deep link to the OEM autostart screen; warning before going online | `rider-app/src/core/power/battery-optimization.ts`, `features/power/PowerSetupCard.tsx` |
| "Food not delivered" fraud | Camera-only doorstep photo (no gallery), uploaded to the rider's private storage folder, path + GPS verified by the API, required by default (`app_config.delivery.proofPhotoRequired`) | `rider-app/src/core/proof/delivery-photo.ts`, `api/src/modules/riders/riders.service.ts#validateProof` |
| Rider claims customer was unreachable | Photo of the door required for `UNDELIVERED` too | same |
| Dispute review | Photo (signed URL, 1 h) + photo GPS vs drop pin in the console; customer sees the photo in the app | `admin-panel/.../order-detail-view.tsx`, `customer-app/.../OrderScreen.tsx` |

## Number masking
| Case | Handling | Where |
|---|---|---|
| `tel:` links leaked personal numbers | Customer and rider phones removed from every API response; calls go through `POST /orders/:id/calls` | `api/src/modules/calls/` |
| Who may call whom | Customer↔rider, either↔restaurant; only while active (+30 min grace after delivery); restaurant→customer stops at pickup | `calls/call-policy.ts` (unit tested) |
| Harassment after the order | Same policy: no calls once closed | same |
| Call spam | 6 calls / 10 min per user per order; 10-minute call cap | `calls.service.ts` |
| Disputes ("rider never called") | Every call logged with provider ref; status/duration from provider callbacks; visible in the console | `call_logs`, `webhooks/telephony/:provider` |

## SMS toll fraud (OTP pumping)
| Case | Handling | Where |
|---|---|---|
| Bots spam the OTP endpoint to premium numbers | OTPs are only sent for numbers holding a single-use 3-min ticket from `POST /auth/otp-ticket`; Supabase's Send-SMS hook drops everything else | `api/src/modules/otp/` |
| Scripted clients | Ticket requires a limited-use Firebase App Check token (Play Integrity / App Attest; replay rejected) or Cloudflare Turnstile for web | `infra/security/human-verifier.ts` |
| International premium-rate ranges | Destination country allowlist (`app_config.otp.allowedCountryCodes`, default India) + Indian mobile prefix check | `otp/otp-rules.ts` (unit tested) |
| Distributed attack | Per phone (3/10 min, 10/day), per IP (10/h) and a global hourly budget circuit breaker with an ops alert | `otp.service.ts` |
| Forged hook calls | Standard Webhooks HMAC signature + timestamp tolerance | `otp-rules.ts#verifyStandardWebhook` (unit tested) |
| Monitoring | `otp_send_log` (sent / blocked / failed) → console overview tiles | admin overview |
| Indian operators drop unregistered SMS | MSG91 sends with DLT principal entity ID, content template ID and approved header | `infra/sms/msg91-sms-sender.ts` |
