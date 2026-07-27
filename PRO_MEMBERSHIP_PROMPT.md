# WinFulltime Pro Membership - Implementation Prompt

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

## Preconditions - Do Not Skip

1. Obtain written approval from the selected payment provider for a
   subscription product offering football prediction analytics. The business
   must accurately describe its jurisdiction coverage, age restrictions and
   that it does not accept bets or hold customer funds.
2. Apply and verify Supabase migrations in the production project. The local
   `supabase-schema.sql` file is not proof that production has these tables.
3. Confirm Supabase Auth Site URL and redirect URLs include:
   - `https://winfulltime.com`
   - `https://winfulltime.com/account.html`
   - `https://winfulltime.com/reset-password.html`
4. Keep the existing `tip_history` database support intact. Membership changes
   must not break the in-play results history.

## Security Requirements

These requirements are mandatory before payment launch.

- Remove all use of `x-user-id` for access decisions. It is forgeable.
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

Retain the existing `profiles`, `subscriptions`, `payments`, and `tip_history`
tables. Add a migration for the following tables and policies.

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

- Users may read their own `usage` records.
- Clients have no write policy for `usage`, `subscriptions`, `payments`, or
  `payment_events`.
- Add an atomic SQL function/RPC to consume a free usage allowance. It must
  increment and check the daily limit in one transaction.
- Keep `set_vip_status()` callable only by the server service-role client.

## Shared Frontend Configuration

Create `public/config.js`:

```javascript
window.WFT_API = 'https://winfulltime-api.onrender.com';
```

Create `public/supabase-client.js` using the Supabase browser CDN client.
Obtain the Supabase URL and anon key from a public Render configuration endpoint
or a checked-in public config file. Do not duplicate the values across every
HTML page.

Create `public/auth.js` with:

- session restoration through `supabase.auth.getSession()`;
- `window.WFT.user` containing only current user display state;
- `window.WFT.apiFetch(path, options)` that adds the bearer token and prefixes
  only API paths with `window.WFT_API`;
- sign-out and auth-change handling;
- UI helpers for login, account, and Pro calls to action.

Update existing hardcoded Render API URLs to use `window.WFT_API`. Leave static
`/data/*.json` requests relative to GitHub Pages.

## Authentication Pages

Build responsive vanilla HTML pages in the existing dark theme:

- `public/signup.html`: full name, email, password, confirmation-state UI.
- `public/login.html`: email/password login and password-reset request.
- `public/reset-password.html`: validates the Supabase recovery session, then
  calls `updateUser({ password })`.
- `public/account.html`: requires a valid session; shows profile, plan,
  subscription state, expiry, upgrade link, provider customer-portal link when
  available, password update, and logout.
- `public/pricing.html`: Free, Pro Monthly, Pro Yearly, and Lifetime plans.
  Show a trial only for eligible recurring plans supported by the approved
  provider. Never offer a trial for Lifetime automatically.

Use the existing visual system: Inter, dark backgrounds, accent `#ff2448`, and
mobile-first layouts.

## Render Authentication Middleware

Create `src/middleware/auth.js`:

- `optionalAuth`: if a valid bearer token is present, attach
  `req.user = { id, email }`; otherwise continue as an anonymous visitor.
- `requireAuth`: return 401 without a valid Supabase user token.
- `requirePro`: require authentication, read the user profile server-side, and
  return 403 unless `vip_status = 'vip'` and `vip_expires_at` is in the future.

Replace the current `x-user-id` logic in `/api/predictions` and audit every
membership-sensitive route for the same vulnerability.

## Payment Provider Adapter

Do not name or configure a provider until compliance approval is complete.
Create `src/services/payment.js` with a provider-neutral interface:

```javascript
createCheckout({ userId, email, planType, returnUrl })
verifyWebhook({ rawBody, headers })
handleEvent(event)
createCustomerPortal({ userId })
cancelSubscription({ userId })
```

The webhook event handler must:

1. Verify authenticity before parsing business data.
2. Insert the provider event ID into `payment_events`; stop safely if it was
   already processed.
3. Activate, renew, cancel, expire, or refund access based on authoritative
   provider events.
4. Update `profiles`, `subscriptions`, and `payments` with the service-role
   client only.
5. Never trust plan, amount, expiry, or user ID received from the browser.

Routes:

- `POST /api/checkout`: `requireAuth`; validates an allowed plan and returns a
  hosted checkout URL.
- `POST /api/webhook/payment`: raw-body parser for this route only; no browser
  authentication; verifies provider signature.
- `POST /api/subscription/cancel`: `requireAuth`; use the provider portal when
  possible.
- `GET /api/me/subscription`: `requireAuth`; returns the caller's safe account
  and subscription view.

## Free and Pro Entitlements

Server-side enforcement is the source of truth.

- `GET /api/predictions`: use `optionalAuth`. Anonymous and Free users retain
  `FREE_LIMITS`; valid Pro users receive the full allowed dataset.
- `GET /api/live-tips` and `GET /api/golden-tips`: use `optionalAuth`. Return a
  small documented free preview and the full payload only to Pro users.
- `POST /api/ticket-builder/generate`: `optionalAuth`. Pro is unlimited. For
  signed-in Free users, consume the allowance through the atomic `usage` RPC
  (maximum three runs per day). Define a separate, rate-limited guest policy;
  do not pretend localStorage is secure enforcement.

The response should include entitlement metadata such as:

```json
{ "isPro": false, "limit": 3, "remaining": 1 }
```

Do not create separate "higher confidence" Pro predictions unless the model
logic genuinely supports that claim. Prefer the same source data with a clear,
transparent difference in access depth and volume.

## Frontend Gating and Navigation

- Homepage and ticket builder: show free allowance and a clear upgrade CTA.
- In-play and golden tips: render the returned free preview; use a non-sensitive
  blurred/locked UI for the rest. The API must withhold the Pro payload.
- Add Login, Sign Up, Account, and Pricing links across shared navigation and
  footer templates.
- Show a Pro badge only beside capabilities actually enforced by the API.
- Update the chat widget only after authenticated API access is available; do
  not grant Pro answers based on browser state alone.

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

## Implementation Order

1. Payment-provider approval and product/legal requirements.
2. Supabase migration, RLS review, and production verification.
3. Shared config, Supabase client, and authentication pages.
4. `optionalAuth`, `requireAuth`, `requirePro`; remove `x-user-id` usage.
5. Payment adapter, verified webhook, idempotency, subscription lifecycle.
6. Account and pricing pages, then checkout/customer portal UI.
7. Server-enforced prediction, in-play, and ticket-builder entitlements.
8. Frontend Pro gates, navigation, and account status indicators.
9. Security and regression testing.

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
