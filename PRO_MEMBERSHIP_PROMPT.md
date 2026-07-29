# WinFulltime Pro Membership - Implementation Plan

## Goal

Build a secure Pro membership system for WinFulltime without moving the public
site off GitHub Pages. Free visitors must retain the current core experience;
all Pro access decisions must be enforced by the Render API, never by browser
UI alone.

## Architecture

- **GitHub Pages:** static HTML, CSS, JavaScript, blog pages, and generated
  public datasets in `public/data/`.
- **Render:** Node/Express API at `https://winfulltime-api.onrender.com`.
- **Supabase:** Auth and Postgres membership data.
- **Payment provider:** not selected. Use a provider adapter so no provider is
  hardcoded until written compliance approval is received.

Do not add a daily-tips newsletter, Brevo integration, or premium email list.
Those features are intentionally out of scope.

### Data routing rule

Keep static datasets on GitHub Pages:

```javascript
fetch('/data/predictions.json')
fetch('/data/h2h-unbeaten.json')
```

Use Render only for dynamic API routes:

```javascript
fetch(window.WFT_API + '/api/golden-tips')
fetch(window.WFT_API + '/api/checkout')
```

Do not blindly prepend the Render API base URL to every relative fetch. That
would bypass the GitHub Pages deployment data and can serve stale data.

## Completion Status (as of 2026-07-28)

| Area | Status |
|------|--------|
| `x-user-id` eliminated | **Done** — never existed in production code |
| Server-side bearer validation | **Done** — `getAuthenticatedUser()` in `api.js:95` |
| VIP status check (server) | **Done** — `checkUserVipStatus()` in `api.js:71` |
| CORS with GitHub Pages origins | **Done** — `server.js:164` |
| Basic IP rate limiter | **Done** — `server.js:118` (100 req/min/IP) |
| Service-role key server-only | **Done** — never in browser code |
| Static data uses relative paths | **Done** — `/data/*.json` requests are relative |
| Database schema (`profiles`, `subscriptions`, `payments`) | **Done** — in `supabase-schema.sql` (needs prod verification) |
| `tip_history` / `two_odds_history` tables | **Done** — in schema, used by liveTipHistory |
| --- | --- |
| `public/config.js` | **Not started** |
| `public/supabase-client.js` | **Not started** |
| `public/auth.js` | **Not started** |
| Hardcoded Render URLs → `WFT_API` | **Not started** — 4 occurrences in 3 files |
| `public/signup.html` | **Not started** |
| `public/login.html` | **Not started** |
| `public/reset-password.html` | **Not started** |
| `public/account.html` | **Not started** |
| `public/pricing.html` | **Not started** |
| `src/middleware/auth.js` | **Not started** |
| `src/services/payment.js` | **Not started** |
| `usage` + `payment_events` tables | **Not started** |
| Atomic consumption RPC | **Not started** |
| Pro entitlement in API endpoints | **Not started** — `golden-tips`, `live-tips` have zero auth |
| Auth nav links (Login, Sign Up, Account, Pricing) | **Not started** — not in header or footer |
| Frontend gating (blur/lock, upgrade CTAs, Pro badges) | **Not started** |
| Ticket builder endpoint | **Done** — `POST /api/ticket-builder/generate` with tier-gated params (markets, safeOnly, numLegs, maxOdds) |
| Enhanced ticket builder service | **Done** — `src/services/ticketBuilder.js` with `buildTicket()` supporting market filter, safe tips, variable legs, odds cap |
| Ticket builder UI (markets, safe tips, legs selector, tier gating) | **Done** — `public/ticket-builder.html` rewritten with market checkboxes, safe tips toggle, legs slider, tier banner, shuffle/legs/telegram gated by membership |
| Checkout / webhook / cancel routes | **Done** — Lemon Squeezy integrated and live on Render |
| `express-rate-limit` | **Not started** |
| Supabase env vars on Render | **Not started** |

## Preconditions - Do Not Skip

1. Obtain written approval from the selected payment provider for a
   subscription product offering football prediction analytics. The business
   must accurately describe its jurisdiction coverage, age restrictions and
   that it does not accept bets or hold customer funds.
2. Apply and verify Supabase migrations in the production project. The local
   `supabase-schema.sql` file is not proof that production has these tables.
   Must also add `usage` and `payment_events` tables.
3. Confirm Supabase Auth Site URL and redirect URLs include:
   - `https://winfulltime.com`
   - `https://winfulltime.com/account.html`
   - `https://winfulltime.com/reset-password.html`
4. Keep the existing `tip_history` database support intact. Membership changes
   must not break the in-play results history.

## Security Requirements

These requirements are mandatory before payment launch.

- ~~Remove all use of `x-user-id` for access decisions. It is forgeable.~~
  **Done** — not present in production code.
- Validate every bearer token server-side with Supabase before trusting a user
  identity.
- The Supabase **service-role key** must remain on Render only. Never expose it
  in HTML, JavaScript, GitHub Pages, or API responses.
- The Supabase anon key may be public, but RLS must make it safe.
- Browser clients may read their own `profiles`, `subscriptions`, and
  `payments` records. They must not create or update subscription, payment,
  status, amount, expiry, or Pro fields directly.
- Only verified payment webhooks, using the server service-role client, may
  create or update `subscriptions` and `payments`.
- Payment webhooks must verify the provider signature against the untouched raw
  request body, use provider event IDs for idempotency, and safely handle
  duplicate deliveries.
- Protect dynamic public endpoints with rate limits. Use strict CORS origins:
  `https://winfulltime.com` and `https://www.winfulltime.com`.
- Use bearer-token authentication, not cookie sessions, for the static site.
  Prioritise JWT validation and XSS/CSP protection; do not add a token-based
  CSRF mechanism that does not match the authentication model.

## Database Changes

Retain the existing `profiles`, `subscriptions`, `payments`, `tip_history`,
and `two_odds_history` tables. Add a migration for the following tables.

```sql
CREATE TABLE public.usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, usage_date)
);

CREATE TABLE public.payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);
```

- Users may read their own `usage` records via RLS.
- Clients have no write policy for `usage`, `subscriptions`, `payments`, or
  `payment_events`.
- Add an atomic SQL function/RPC to consume a free usage allowance. It must
  increment and check the daily limit in one transaction.
- Keep `set_vip_status()` callable only by the server service-role client.

## Remaining Work — Detailed Plan

### Phase 1: Foundation (env + database)

**Step 1 — Set Supabase env vars on Render**
- Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`,
  `ALLOWED_ORIGINS` to Render environment variables.
- Remove unused PayPal env vars from `.env.example`.

**Step 2 — Apply database migration**
- Add `usage` and `payment_events` tables to `supabase-schema.sql`.
- Run migration in Supabase production SQL Editor.
- Create `consume_free_allowance()` atomic RPC function.
- Verify RLS policies on all tables.
- Confirm Supabase Auth Site URL includes required redirect URLs.

### Phase 2: Shared frontend config

**Step 3 — Create `public/config.js`**
```javascript
window.WFT_API = 'https://winfulltime-api.onrender.com';
```

**Step 4 — Create `public/supabase-client.js`**
- Load Supabase browser CDN client.
- Expose `window.WFT.supabase` client (anon key).
- Obtain URL + anon key from `config.js` or Render config endpoint.

**Step 5 — Create `public/auth.js`**
- Session restoration via `supabase.auth.getSession()`.
- `window.WFT.user` — current user display state.
- `window.WFT.apiFetch(path, options)` — adds bearer token, prefixes with
  `window.WFT_API` for API paths, leaves `/data/*.json` relative.
- signOut() and auth-change listener.
- UI helpers: `renderLoginCta()`, `renderAccountBadge()`, etc.

**Step 6 — Replace hardcoded Render URLs**
- `public/app.html` line 770 → `window.WFT_API + '/api/...'`
- `public/predictions/in-play.html` line 258 → `window.WFT_API + '/api/...'`
- `public/2-odds-of-the-day.html` lines 285, 333 → `window.WFT_API + '/api/...'`
- Static `/data/*.json` fetches stay relative.

### Phase 3: Server auth middleware

**Step 7 — Create `src/middleware/auth.js`**
- `optionalAuth` — parse Bearer token, validate via Supabase, set `req.user`
  or continue as anonymous.
- `requireAuth` — return 401 if no valid token.
- `requirePro` — return 403 unless `vip_status = 'vip'` and not expired.
- Refactor `api.js` inline auth functions to use middleware.
- Apply `optionalAuth` to predictions, golden-tips, live-tips routes.
- Create a `src/middleware/` directory.

### Phase 4: Auth pages

**Step 8 — Build auth UI pages**
All pages: Inter font, dark background, `#ff2448` accent, mobile-first.

- `public/signup.html` — full name, email, password, confirmation state.
- `public/login.html` — email/password login + password reset link.
- `public/reset-password.html` — validates Supabase recovery session, calls
  `updateUser({ password })`.
- `public/account.html` — session required. Shows profile, plan, subscription
  state/expiry, upgrade link, provider portal link (when available), password
  update, logout.
- `public/pricing.html` — Free, Pro Monthly, Pro Yearly, Lifetime. Trial only
  for recurring plans (never for Lifetime automatically).

### Phase 5: Payment system (blocked on provider approval)

**Step 9 — Create `src/services/payment.js`**
Provider-neutral adapter interface:
```javascript
createCheckout({ userId, email, planType, returnUrl })
verifyWebhook({ rawBody, headers })
handleEvent(event)
createCustomerPortal({ userId })
cancelSubscription({ userId })
```
Webhook handler must:
1. Verify authenticity before parsing.
2. Insert into `payment_events`; stop if duplicate.
3. Activate/renew/cancel/expire/refund based on provider events.
4. Update `profiles`, `subscriptions`, `payments` with service-role only.
5. Never trust browser-supplied plan, amount, expiry, or user ID.

**Step 10 — Create payment routes in `api.js`**
- `POST /api/checkout` — `requireAuth`, validate plan, return checkout URL.
- `POST /api/webhook/payment` — raw-body parser, no browser auth.
- `POST /api/subscription/cancel` — `requireAuth`, use provider portal.
- `GET /api/me/subscription` — `requireAuth`, return account + subscription.

### Phase 6: Server entitlement enforcement

**Step 11 — Enforce Pro on existing endpoints**
- `GET /api/predictions` — already has `isAuthenticatedVip()`. Replace inline
  check with `optionalAuth` middleware. `applyLimits()` must actually filter
  dataset rows (not just add metadata flags).
- `GET /api/golden-tips` — add `optionalAuth`. Free users get a limited subset
  (e.g. 3 tips preview); Pro users get full payload.
- `GET /api/live-tips` — add `optionalAuth`. Same tiered response.
- `POST /api/ticket-builder/generate` — `optionalAuth`. Free signed-in users
  consume daily allowance via `consume_free_allowance()` RPC (max 3/day).
  Anonymous users get a lower, rate-limited guest allowance.
- All responses include `{ isPro, limit, remaining }` metadata.

### Phase 7: Frontend gating + navigation

**Step 12 — Add auth links to navigation**
- Update `public/index.html` header (lines ~188-194) and footer (~1360-1386):
  Login, Sign Up, Account, Pricing links.
- Show account badge when logged in; hide auth links.

**Step 13 — Implement frontend gating**
- Homepage + ticket builder: show free allowance + upgrade CTA.
- In-play / golden tips page: render free preview from API, blur/lock
  Pro-only rows. The API response drives what is visible.
- Pro badge next to capabilities enforced server-side.
- Chat widget: only show Pro answers when `window.WFT.user?.isPro` is true
  (confirmed by API, not localStorage).

### Phase 8: Security hardening

**Step 14 — Replace in-memory rate limiter**
- Add `express-rate-limit` to package.json.
- Apply strict limits to `/api/golden-tips`, `/api/live-tips`.
- Looser limits for `/api/predictions` (static data, cached).
- Per-endpoint tuning.

**Step 15 — Audit and final security review**
- Verify no service-role key, payment secret, or protected payload leaks
  in GitHub Pages source, browser storage, or public API.
- Verify existing prediction data loading and in-play results still work.
- Verify tip_history and two_odds_history persistence unaffected.
- Test concurrent request handling for ticket-builder allowance.

## Implementation Order

```
Phase 1:  Set Supabase env vars on Render
          Apply database migration (usage, payment_events, RPC)
Phase 2:  config.js → supabase-client.js → auth.js
          Replace hardcoded Render URLs
Phase 3:  src/middleware/auth.js (optionalAuth, requireAuth, requirePro)
Phase 4:  signup.html, login.html, reset-password.html,
          account.html, pricing.html
Phase 5:  [Blocked: payment provider approval]
          Payment adapter + webhook + checkout routes
Phase 6:  Pro entitlement enforcement in all API endpoints
Phase 7:  Navigation links + frontend gating UI
Phase 8:  express-rate-limit + security audit + regression testing
```

## Environment Variables

Render:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=server-only-service-role-key
SUPABASE_ANON_KEY=public-anon-key
PAYMENT_PROVIDER=approved-provider-name
PAYMENT_WEBHOOK_SECRET=provider-webhook-secret
PAYMENT_PRODUCT_ID_MONTHLY=provider-product-id
PAYMENT_PRODUCT_ID_YEARLY=provider-product-id
PAYMENT_PRODUCT_ID_LIFETIME=provider-product-id
ALLOWED_ORIGINS=https://winfulltime.com,https://www.winfulltime.com
```

Add provider-specific credentials only after selection. Do not retain unused
PayPal, Stripe, Lemon Squeezy, or newsletter environment variables.

## Acceptance Criteria

- A forged `x-user-id` header cannot unlock any content.
- An anonymous visitor retains existing free prediction access.
- A Free signed-in user cannot exceed three ticket-builder runs per day, even
  with concurrent requests.
- A Pro JWT receives the full Pro payload; a Free or anonymous request never
  receives hidden Pro data.
- Invalid, replayed, or duplicate payment webhooks do not change access.
- Cancellation and expiry reliably return users to Free access.
- No service-role key, payment secret, or protected payload appears in GitHub
  Pages source, browser storage, or public API configuration.
- Existing prediction data loading and in-play results continue working on the
  GitHub Pages site.
