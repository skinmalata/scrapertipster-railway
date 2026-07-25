# WinFulltime Pro Membership — Implementation Prompt

## Context

WinFulltime is a football predictions website with a **split deployment**:

- **GitHub Pages** — hosts the public site (static HTML/CSS/JS from `public/`)
- **Render.com** (`winfulltime-api.onrender.com`) — hosts the Node/Express API backend

The public site stays on GitHub Pages. Render handles only the API and the new membership/Pro features.

**Tech stack:**
- Frontend: Vanilla HTML/CSS/JS in `public/` (no React/Vue/Svelte), deployed to GitHub Pages
- Backend: Node.js/Express on Render.com
- Database/Auth: Supabase (Postgres + Auth)
- Email: Brevo (Sendinblue) API
- Styling: Tailwind CSS v4 + inline styles, dark theme (accent `#ff2448`, backgrounds `#1e2638`, text `#e8edf5`, Inter font)

**Current architecture:**

```
GitHub Pages (public site)
    ├── index.html, ticket-builder.html, predictions/*, blog/*
    ├── /data/predictions.json (static data files)
    └── fetches from ↓ for some features
         │
Render winfulltime-api.onrender.com (Node/Express)
    ├── /api/* (predictions, odds, chat, newsletter, analysis, live-tips, golden-tips)
    ├── /data/predictions.json (also served here as fallback)
    └── Persistent disk (live-tip-history, daily-send logs)
         ↓
    Supabase (Postgres — profiles, subscriptions, payments tables)
         ↓
    Brevo (free daily tips email list)
```

**Important:** Some pages (`app.html`, `in-play.html`) already hardcode `https://winfulltime-api.onrender.com` as the API base for cross-origin requests. Other pages (homepage, prediction pages) use relative paths like `/data/predictions.json` and `/api/*`. Pages using relative paths currently only work when served from the same origin as the API. This needs to be addressed.

---

## Existing Infrastructure (Ready to Use)

### Supabase Schema (`supabase-schema.sql`)

Already has these tables, fully designed with RLS policies:

- **`profiles`** — extends `auth.users`. Columns: `id` (FK), `email`, `full_name`, `vip_status` (`free`/`vip`/`admin`), `vip_expires_at`, `created_at`, `updated_at`
- **`subscriptions`** — tracks subscriptions. Columns: `user_id`, `plan_type` (`monthly`/`yearly`/`lifetime`), `payment_id`, `payment_status` (`pending`/`completed`/`failed`/`cancelled`), `amount`, `currency`, `started_at`, `expires_at`
- **`payments`** — tracks individual payments. Columns: `user_id`, `subscription_id`, `payment_method`, `payment_id`, `transaction_id`, `amount`, `currency`, `status` (`pending`/`completed`/`failed`/`refunded`), `payment_details` (JSONB)
- **`handle_new_user()`** — trigger function that auto-creates a `profiles` row when a user signs up via `auth.users`
- **`set_vip_status(user_uuid, vip_expires)`** — security definer function to activate/deactivate Pro status
- **RLS policies** — users can read/update own profile, users can read/insert own subscriptions, users can read own payments, admins can read all profiles
- **Default pricing (comments only):** Monthly $9.99, Yearly $79.99, Lifetime $199.99

### Server-Side VIP Check (`src/routes/api.js:66-80`)

```javascript
async function checkUserVipStatus(userId) {
  if (!userId || !supabase) return { isVip: false };
  const { data: profile } = await supabase
    .from('profiles')
    .select('vip_status, vip_expires_at')
    .eq('id', userId)
    .single();
  if (profile && profile.vip_status === 'vip') {
    const expiresAt = new Date(profile.vip_expires_at);
    if (expiresAt > new Date()) return { isVip: true };
  }
  return { isVip: false };
}
```

**CRITICAL SECURITY ISSUE:** The `/api/predictions` route currently reads `x-user-id` from the request header — an unauthenticated value the browser sends. Any user can fake this header. This MUST be replaced with server-side Supabase JWT verification before launch.

### Free Tier Limits (`src/routes/api.js:57-64`)

```javascript
const FREE_LIMITS = {
  btts: 8,
  winstreak: 2,
  losestreak: 2,
  drawstreak: 2,
  teamtoscore: 4,
  teamtoscore2plus: 4
};
```

### Brevo Integration (`src/services/brevo.js`)

- `subscribeDailyTips(email)` — adds contact to a Brevo list
- `createAndSendDailyTicketCampaign(ticket)` — creates and sends an email campaign
- `buildDailyTicketEmail(ticket, config)` — generates styled HTML email
- Config from env vars: `BREVO_API_KEY`, `BREVO_DAILY_TIPS_LIST_ID`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BASE_URL`

### Server Routes (`server.js`)

Direct routes: `POST /api/newsletter/subscribe`, `POST /api/newsletter/daily-send` (cron-protected), RSS feeds, YouTube videos, blog serving.
API routes (`src/routes/api.js`): predictions, odds, live-tips, golden-tips, corners, cards, news, analysis, articles, h2h-unbeaten.
Chat routes (`src/routes/chat.js`): `POST /api/chat`, `GET /api/chat/info`.

### Existing Cross-Origin Pattern

Some pages already call the Render API cross-origin from GitHub Pages:

```javascript
// app.html, in-play.html
var API_BASE = 'https://winfulltime-api.onrender.com';
var res = await fetch(API_BASE + '/api/golden-tips', { mode: 'cors', cache: 'no-store' });
```

The Render server already has CORS configured:

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['https://winfulltime.com', 'https://www.winfulltime.com']
}));
```

### What Does NOT Exist

- No Supabase anon key in `.env.example` (only service role key)
- No login/signup/account/pricing pages
- No payment integration code (PayPal env vars in `.env.example` are dead placeholders — zero code uses them)
- No auth middleware (no JWT validation, no session handling)
- No client-side Supabase usage (no `@supabase/supabase-js` in any `.html` or `public/*.js`)
- No Pro gating on the frontend
- No `API_BASE` constant on pages that use relative paths (homepage, prediction pages, ticket-builder)

---

## Payment Provider Constraint (MUST RESOLVE FIRST)

**This is a showstopper that must be resolved before writing any code.**

Major payment providers prohibit sports betting tips/predictions businesses:

- **Stripe** — Prohibited. "All forms of gambling are prohibited" including sports betting. No pre-approval pathway.
- **Lemon Squeezy** — Prohibited. Lists "gambling" as a regulated product and defers to Stripe's restrictions.
- **PayPal** — Prohibited unless approved. Policy explicitly covers "providing gambling tips or instructions." Approval requires demonstrating you can block users in gambling-restricted jurisdictions.
- **Paddle** — Likely prohibited. Same gambling restrictions.

**Before implementing anything**, contact each provider's sales/compliance team:
- Frame the business as: "Subscription access to AI-generated football prediction analytics and accumulator building tools"
- Emphasize: "We do not accept wagers, process bets, or hold user funds"
- Emphasize: "We operate as a data/analytics SaaS, not as a bookmaker"
- List your target countries

Alternative options if mainstream providers refuse:
- Gumroad (more permissive with digital goods)
- Specialized gaming merchant account (PaymentNerds, etc. — higher fees 5-10%, rolling reserves)
- Crypto payments (USDT/BTC — no provider restrictions, high user friction)

**Do not start implementation until a payment provider says yes.** The entire architecture depends on which provider you can use.

---

## What To Build

### 0. Fix Cross-Origin API Access

Before building membership, ensure all pages on GitHub Pages can reach the Render API. Currently some pages use relative paths (`/api/*`, `/data/predictions.json`) that only work on the same origin.

Create a shared config file `public/config.js`:

```javascript
window.WFT_API = 'https://winfulltime-api.onrender.com';
```

Include this script on every page. Then update all `fetch()` calls that use relative paths to use `window.WFT_API` as the base. This affects:

- Homepage ticket builder (`index.html`) — fetches `/data/predictions.json` and `/api/football-odds`
- Full ticket builder (`ticket-builder.html`) — fetches `/data/predictions.json`, `/data/h2h-unbeaten.json`, `/api/football-odds`
- Prediction pages (1x2, over-1.5, over-2.5, btts, corners, cards, unbeaten) — fetch `/data/predictions.json`
- Chat widget (`chat-widget.js`) — posts to `/api/chat`
- Newsletter signup in ticket-builder.html — posts to `/api/newsletter/subscribe`

Pages that already use `API_BASE = 'https://winfulltime-api.onrender.com'` (`app.html`, `in-play.html`) should be updated to use `window.WFT_API` instead of hardcoding.

### 1. Supabase Client Auth (Browser-Side)

- Add `SUPABASE_ANON_KEY` to `.env.example`
- Add the Supabase URL and anon key as `<meta>` tags in the HTML pages (the anon key is safe to expose; the service role key is NOT). The Render API can serve a small endpoint `GET /api/config` that returns `{ supabaseUrl, supabaseAnonKey }` so the frontend can initialize Supabase without hardcoding keys in HTML.
- Create `public/supabase-client.js` that initializes the Supabase browser client using the CDN version of `@supabase/supabase-js`

### 2. Auth UI Pages (Static HTML + JS)

All pages must match the existing dark theme, be mobile-first responsive, and use vanilla HTML/CSS/JS. These are static files served from GitHub Pages.

**`public/login.html`** — Email + password login form. "Don't have an account? Sign up" link. On success, redirect to `/account.html`. Supabase `signInWithPassword()`. "Forgot password?" link that calls `resetPasswordForEmail()`.

**`public/signup.html`** — Email + password + full name registration form. "Already have an account? Log in" link. On success, redirect to `/account.html`. Supabase `signUp()`. Handle email confirmation if required by Supabase config.

**`public/account.html`** — Protected page (redirect to `/login.html` if not authenticated). Shows:
- User profile (email, name)
- Current plan (Free / Pro Monthly / Pro Yearly / Lifetime)
- Subscription status and expiry date
- If free: "Upgrade to Pro" button → `/pricing.html`
- If Pro: "Manage Subscription" info + Brevo premium email preferences
- Logout button (Supabase `signOut()`)
- Password change form

**`public/pricing.html`** — Public page with 3 tiers:
- **Free:** Current features (homepage ticket builder with limited runs, basic predictions)
- **Pro Monthly:** $9.99/month — unlimited ticket builder runs, full qualifying in-play tips, premium daily email, priority alerts
- **Pro Yearly:** $79.99/year (save 33%) — same as monthly
- **Lifetime:** $199.99 one-time — same as yearly, no recurring billing
- Each tier has a CTA button. Free shows "Current Plan" if logged in as free. Pro tiers show "Start 7-Day Trial" for new users.

**`public/reset-password.html`** — Supabase password reset. Calls `updateUser({ password })` from the email reset link.

### 3. Payment Provider Integration

Create `src/services/payment.js` on the Render server:

- `createCheckoutUrl(userId, email, planType)` — generates a hosted checkout URL for the given plan, passing the Supabase user ID as `custom_data` so the webhook can identify them
- `handleWebhook(payload, signature)` — verifies the webhook signature, then:
  - `subscription_created` / `subscription_updated`: call `set_vip_status()` to activate Pro, insert into `subscriptions` and `payments` tables
  - `subscription_cancelled` / `subscription_expired`: set `vip_status` to `'free'`, update `subscriptions` row
  - `subscription_paused`: optionally keep Pro active until pause ends

Create API routes in `server.js`:
- `POST /api/checkout` — authenticated (requires Supabase JWT), calls `createCheckoutUrl()`, returns checkout URL
- `POST /api/webhook/payment` — raw body parser for webhook verification, calls `handleWebhook()`
- `POST /api/subscription/cancel` — authenticated, initiates cancellation via payment provider API

**Trial logic:** 7-day trial requires payment method (handled by the payment provider). Limit to one trial per account — check `subscriptions` table for any existing trial row before creating a new checkout.

### 4. Server-Side Auth Middleware

Create `src/middleware/auth.js` on the Render server:

- `requireAuth(req, res, next)` — validates the Supabase JWT from the `Authorization: Bearer <token>` header using `supabase.auth.getUser(token)` server-side. Returns 401 if invalid. Attaches `req.user = { id, email }`.
- `requirePro(req, res, next)` — calls `checkUserVipStatus(req.user.id)`, attaches `req.vip = { isVip, expiresAt }`. Returns 403 if not Pro.

**Replace the `x-user-id` header** on `/api/predictions` and all other VIP-gated routes with `requireAuth` + `requirePro`.

### 5. Pro-Gated API Routes

Update existing routes in `src/routes/api.js`:

- **`GET /api/predictions`** — Free users get predictions with `FREE_LIMITS`. Pro users get all predictions without limits. Use `requireAuth` middleware.
- **`GET /api/live-tips`** — Free: 2-3 basic live tips. Pro: full qualifying in-play tips with detailed analysis.
- **`GET /api/golden-tips`** — Free: basic golden tips. Pro: enhanced golden tips with higher confidence thresholds.
- **`GET /api/ticket-builder/generate`** (new) — Server-side ticket builder endpoint. Free: max 3 runs/day. Pro: unlimited.

Create a `usage` table:
```sql
CREATE TABLE public.usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(user_id, action, date)
);
```

### 6. Client-Side Pro State Management

Create `public/auth.js` — shared script loaded on all pages (served from GitHub Pages):

- On page load, check `supabase.auth.getSession()`
- If session exists, attach user info to `window.WFT`: `window.WFT.user = { id, email, isPro, expiresAt }`
- `window.WFT.requirePro(callback)` — if Pro, run callback. If not, redirect to `/pricing.html`
- `window.WFT.apiFetch(url, options)` — wraps `fetch()` with the Authorization header and prepends `window.WFT_API` to relative URLs
- Update `chat-widget.js` to show different responses for Pro users

### 7. Brevo Premium Email List

- Add `BREVO_PREMIUM_LIST_ID` env var for a second Brevo list
- Update `src/services/brevo.js`:
  - `subscribePremiumTips(email)` — adds to premium list
  - `unsubscribePremiumTips(email)` — removes from premium list
  - `createAndSendPremiumTicketCampaign(ticket)` — richer email with more selections, higher-value picks, live odds
- Update `/api/newsletter/daily-send` to send premium email to the premium list AND standard email to the free list
- On Pro signup webhook: add user to premium Brevo list
- On Pro cancellation webhook: remove user from premium Brevo list

### 8. Frontend Pro Gating

- Homepage ticket builder: add banner for free users — "Free tier: 3 runs/day. Pro: Unlimited — Upgrade"
- Full ticket builder (`ticket-builder.html`): track runs via `window.WFT.apiFetch()`, show paywall modal when free limit hit
- In-play tips: show first 2-3 tips free, blur/hide rest with "Unlock with Pro" CTA
- Golden tips: show basic tips free, enhanced tips behind Pro wall
- Daily email signup: two options — "Free Daily Email" (existing) and "Pro Premium Email" (requires account)

### 9. Navigation and Pages

- Add "Login" / "Sign Up" links to nav (show "Account" when logged in)
- Add `/pricing.html` link to nav and footer
- Add "Pro" badge next to premium features throughout the site
- Update chat widget to know about Pro status and direct users to upgrade

---

## Environment Variables To Add

### Render (.env)
```
SUPABASE_ANON_KEY=your_supabase_anon_key
LEMONSQUEEZY_API_KEY=your_api_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
LEMONSQUEEZY_PRODUCT_ID_MONTHLY=product_id
LEMONSQUEEZY_PRODUCT_ID_YEARLY=product_id
LEMONSQUEEZY_PRODUCT_ID_LIFETIME=product_id
BREVO_PREMIUM_LIST_ID=list_id
ALLOWED_ORIGINS=https://winfulltime.com,https://www.winfulltime.com
```

(Replace Lemon Squeezy with whichever payment provider approves your business.)

### GitHub Pages (static files)
No server env vars needed — the Supabase anon key and API base URL are embedded in the JavaScript files.

---

## Design Constraints

- No React/Vue/Svelte — pure vanilla HTML/CSS/JS like the rest of the site
- Match the existing dark theme (accent `#ff2448`, backgrounds `#1e2638`, text `#e8edf5`, Inter font)
- All auth pages must be responsive (mobile-first)
- The Supabase anon key is safe to expose in client code; the service role key must NEVER be sent to the browser
- JWT tokens from Supabase are stored in `localStorage` (Supabase JS SDK handles this by default)
- Payment webhooks must be verified — never trust unverified webhook payloads
- All API calls from GitHub Pages to Render must use `mode: 'cors'`

---

## Implementation Order

1. **Payment provider research** — contact providers, get approval, set up sandbox account
2. Fix cross-origin API access — create `public/config.js` with `WFT_API`, update all relative fetch paths
3. Supabase anon key setup + `supabase-client.js` + `/api/config` endpoint
4. `auth.js` shared client-side auth module
5. Login + Signup pages
6. Account page
7. Server-side auth middleware (`requireAuth`, `requirePro`)
8. Payment provider integration + `payment.js` service + checkout/webhook routes
9. Pricing page
10. Brevo premium list integration
11. Pro-gated API routes + usage tracking table
12. Frontend Pro gating on ticket builder, in-play, golden tips
13. Nav updates, Pro badges, chat widget update
14. Password reset flow
15. **Security audit** — verify no `x-user-id` headers remain, test webhook verification, test JWT validation on all protected routes, verify CORS is correctly configured

---

## Critical Reminders

- **Test webhooks thoroughly** — use the payment provider's test/sandbox mode
- **Handle edge cases:** subscription expiry (cron job to check daily and downgrade expired users), failed payments, network errors during checkout
- **Don't break the free tier** — all existing functionality must continue working for non-logged-in users
- **The `x-user-id` header is a security hole** — replace it with proper JWT validation BEFORE launch
- **Add rate limiting** on auth endpoints to prevent brute-force attacks
- **CSRF protection** on checkout and account pages
- **Add a daily cron job on Render** to check for expired subscriptions and downgrade users (set `vip_status = 'free'` where `vip_expires_at < NOW()`)
- **GitHub Pages has no server-side code** — all dynamic logic (auth validation, payment processing, Pro gating) must happen on the Render backend. The static site only handles UI and Supabase client-side auth.
