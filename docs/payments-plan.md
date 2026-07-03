# Payments integration plan (follow-up)

Status: **planned, not started.** The tier model shipped first (see `shared/src/tiers.ts`):
entitlements are data keyed by `Tier`, the client gates on them, and a local dev unlock
(`GEFF-DEV-2026`) stands in for a real purchase. This document is the plan for replacing
that stand-in with a payment service.

## Guiding decisions

- **Stripe** — Checkout + Billing (subscriptions) + Customer Portal + webhooks. Best docs,
  test mode, handles EU VAT via Stripe Tax. We never touch card data.
- **License keys before accounts.** Phase 1 ships *account-less* premium: buying produces a
  license key the user pastes into the app. No signup friction, no password storage, fits
  the current no-backend-state design. Full accounts (Phase 2) only if cross-device sync
  or key abuse makes them necessary.
- **The server becomes the source of truth for entitlements.** Today `useTier` trusts
  localStorage; after Phase 1 the client stores only the key, and the server validates it
  and returns the tier. The `Entitlements` shape in `shared` does not change — that's the
  point of modeling it as data.
- **The price data itself is never gated.** Premium sells tooling on top of the
  community's data (also an etiquette matter towards the wiki).

## Phase 1 — Stripe Checkout + license keys (~2–3 days)

### New pieces

| Piece | Where | Notes |
|---|---|---|
| SQLite via `better-sqlite3` | `server/data/geff.db` | keys table; no external DB service |
| `POST /api/checkout` | server | creates a Stripe Checkout Session (monthly/yearly price id), `success_url = /premium?session={CHECKOUT_SESSION_ID}` |
| `POST /api/stripe/webhook` | server | raw-body route; signature-verified |
| `GET /api/license/claim?session=` | server | after redirect: look up session → return the key ONCE |
| `GET /api/license/validate` | server | `Authorization: License <key>` → `{tier, status}`; called by the client on boot, cached |
| Client `useTier` rework | client | stores the key, validates on boot, falls back to `free` offline-grace 72h |

### Data model

```sql
CREATE TABLE licenses (
  key TEXT PRIMARY KEY,              -- 'GEFF-' + 20 chars crockford base32
  stripe_customer TEXT NOT NULL,
  stripe_subscription TEXT NOT NULL,
  status TEXT NOT NULL,              -- active | past_due | canceled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Webhook handling (the whole lifecycle)

- `checkout.session.completed` → generate key, insert `active`, attach key to the session
  metadata for `/claim`.
- `invoice.payment_failed` / `customer.subscription.updated` → set `past_due` (app keeps
  premium during Stripe's retry window).
- `customer.subscription.deleted` → `canceled` (validate returns `free`).
- Refund/chargeback → `canceled`.

### Config (`.env`)

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
```

### Client changes

- Premium page: "Subscribe" buttons → `POST /api/checkout` → redirect to Stripe.
- On `/premium?session=...`: claim the key, store it, show it prominently ("save this —
  it's your login"). Stripe's receipt email is the recovery path (support can look up the
  customer and re-issue).
- `useTier`: `localStorage 'geff:license'` → validate on boot → cache tier + timestamp;
  if the server is unreachable, honour the last-known tier for 72h, then degrade to free.
- Keep the dev-code path behind `import.meta.env.DEV` only.

### Testing

- Stripe test mode + `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Unit: key generation/validation, webhook state transitions (table-driven).
- e2e: mock the validate endpoint (Playwright `page.route`) — one spec for each tier;
  real-Stripe flow is a manual checklist (test cards 4242…, decline, refund).

### Gotchas to remember

- The webhook route needs the **raw body** for signature verification — register it with
  `config: { rawBody: true }` (fastify-raw-body) BEFORE the JSON parser touches it.
- `@fastify/compress` must not compress the webhook response (Stripe doesn't care, but
  keep the route minimal).
- Rate-limit `/api/license/validate` (it's a key oracle) — `@fastify/rate-limit`, keyed by IP.
- Keys are bearer tokens: log only prefixes, never full keys.
- The existing local-premium flag migrates cleanly: on boot, if `geff:tier:v1` is
  'premium' but no license exists, show a one-time "premium now requires a license" note
  and downgrade gracefully.

## Phase 2 — accounts (only if needed)

Triggers: users want cross-device sync (watchlist/flip log server-side), or key sharing
becomes rampant. Plan: email magic-link auth (no passwords), licenses attach to the
account, watchlist/fliplog gain optional server sync with the localStorage version as the
offline cache. Est. ~1 week. Not before there's evidence it's needed.

## Unlocked by this backend (already designed client-side)

Once license keys give us a server-side identity, three shipped-adjacent features light up:

- **Push alert delivery** — the client-side alert model (`lib/alerts.ts`) moves its
  evaluation loop server-side for licensed users; delivery via user-supplied Discord
  webhook URL or email. The alert schema needs no changes.
- **Cross-device sync** — watchlist/flip log/alerts/saved views are all localStorage
  stores with identical shapes; sync = the same JSON keyed by license.
- **RuneLite Flipping Utilities import** — extend `fromCsv` with a column mapping for
  their export format (the import UI already exists).

## Out of scope (deliberately)

- Crypto/gp payments (ToS risk), lifetime tier (kills MRR signal while validating),
  regional pricing (Stripe adaptive pricing can come later), free trials (the free tier IS
  the trial).
