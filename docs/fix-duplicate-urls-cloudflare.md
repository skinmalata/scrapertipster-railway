# Fix duplicate .html / non-.html URLs with Cloudflare

> What we are doing (in simple words):
> Your site is on GitHub Pages. GitHub Pages shows Google TWO copies of every
> page (example.com/blog/abc and example.com/blog/abc.html). Google gets
> confused and splits your clicks between the two copies.
> We will stand Cloudflare in front (it is already set up!) and add
> "traffic signs" (redirects) that tell Google only ONE copy exists.
> No code changes needed. Your GitHub deploy keeps working as before.

## Good news — already done for you

- Your domain is already on Cloudflare's nameservers. Nothing to create.
- Your `@` A records already point to the right GitHub Pages IPs
  (185.199.108.153 / .109 / .110 / .111).
- The `www` CNAME to `skinmalata.github.io` already exists.

So you only need **4 small jobs** below.

---

## Step 1 — Turn on the Cloudflare proxy (make the clouds orange)

1. Go to https://dash.cloudflare.com and click your **winfulltime.com** site.
2. Click **DNS** on the left menu.
3. Find the row whose name is `@` (the A record, value starts `185.199.`).
4. Click the **grey cloud** icon on that row. It must turn **orange**.
5. Find the `www` row (CNAME to `skinmalata.github.io`).
6. Click its **grey cloud** too, so it is also **orange**.
7. Wait ~2 minutes. Both clouds stay orange.

Orange cloud = Cloudflare stands in front. Grey cloud = traffic bypasses it.

## Step 2 — Set SSL to "Full (strict)"

1. Left menu: **SSL/TLS** → **Overview**.
2. Set **SSL mode** to **Full (strict)** (save if asked).
3. Don't pick anything lower than this.

## Step 3 — Add the redirects

Two pieces:
- **One single redirect rule** for blog pages (Free-plan friendly, no regex).
- **One bulk redirect list** for the 11 prediction pages (also Free-plan friendly;
  no regex — Cloudflare's docs confirmed regex redirects need a paid plan, so
  we use bulk lists which are free with up to 10,000 entries).

### 3a. Single redirect — blog pages: no `.html` → add `.html`

1. Left menu: **Rules** → **Redirect Rules** → **Create rule**.
2. **Rule name**: `blog .html canonical`
3. "If incoming requests match" → **Custom filter expression** → **Edit expression**, paste:
   ```
   (starts_with(http.request.uri.path, "/blog/") and not ends_with(http.request.uri.path, ".html") and not ends_with(http.request.uri.path, "/"))
   ```
4. "Then…" → **Type = Dynamic**, **Status code = 301**, Expression:
   ```
   concat("https://winfulltime.com", http.request.uri.path, ".html")
   ```
5. **Preserve query string** ON → **Deploy**.

> This one rule covers every blog post now and in the future. It must show as
> **Active**.

### 3b. Bulk redirect — predictions pages: `.html` → no `.html`

The exact list of the 11 affected pages is in
`scripts/predictions-bulk-redirects.csv` (one row per pair, e.g. source
`https://winfulltime.com/predictions/1x2.html` → target
`https://winfulltime.com/predictions/1x2`, status 301).

1. Left menu: **Rules** → **Bulk Redirects** → **Create URL redirect list**.
   (If you can't see "Bulk Redirects", it's on the Rules **Overview** page as a card.)
2. Enter a **list name**: `predictions html-canonical`.
3. **Paste** the contents of the CSV file into the list editor
   (or add the 11 rows by hand — they're printed below).
4. **Save** the list.
5. Now create the **bulk redirect rule**:
   - Source/List: **`predictions html-canonical`**
   - **Preserve query string: ON**
   - **Include subpaths: OFF**
   - Leave **Preserve path suffix: OFF**
   - Status: **301** (set per row)
6. **Deploy**.

The 11 rows (source, target, status):

| source (requested) | target (redirect to) | status |
|---|---|---|
| `https://winfulltime.com/predictions/1x2.html` | `https://winfulltime.com/predictions/1x2` | 301 |
| `https://winfulltime.com/predictions/over-1-5.html` | `https://winfulltime.com/predictions/over-1-5` | 301 |
| `https://winfulltime.com/predictions/over-2-5.html` | `https://winfulltime.com/predictions/over-2-5` | 301 |
| `https://winfulltime.com/predictions/btts.html` | `https://winfulltime.com/predictions/btts` | 301 |
| `https://winfulltime.com/predictions/btts-no.html` | `https://winfulltime.com/predictions/btts-no` | 301 |
| `https://winfulltime.com/predictions/unbeaten.html` | `https://winfulltime.com/predictions/unbeaten` | 301 |
| `https://winfulltime.com/predictions/winning-streak.html` | `https://winfulltime.com/predictions/winning-streak` | 301 |
| `https://winfulltime.com/predictions/losing-streak.html` | `https://winfulltime.com/predictions/losing-streak` | 301 |
| `https://winfulltime.com/predictions/draws-streak.html` | `https://winfulltime.com/predictions/draws-streak` | 301 |
| `https://winfulltime.com/predictions/corners.html` | `https://winfulltime.com/predictions/corners` | 301 |
| `https://winfulltime.com/predictions/cards.html` | `https://winfulltime.com/predictions/cards` | 301 |

> Only these 11 really need fixing: teams, h2h, analysis and date-archive
> pages use folder URLs (with a trailing slash) whose `.html` twins return 404,
> so Google never sees duplicate copies of them.

---

## Step 4 — Check it worked

In PowerShell, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-redirects.ps1
```

- All lines say **PASS** → done.
- Any **FAIL** lines → check the rule conditions/targets again, then re-run.

Quick manual check (any browser): visit
`https://winfulltime.com/blog/head-to-head-statistics`
— it should instantly change to
`https://winfulltime.com/blog/head-to-head-statistics.html`.

## Step 5 — Tell Google (speeds it up, optional but recommended)

1. Open https://search.google.com/search-console → winfulltime.com.
2. Top bar type `https://winfulltime.com/blog/head-to-head-statistics.html`
   press Enter → **Request indexing**.
3. Repeat (a few minutes apart) for your top pages, e.g.:
   - `https://winfulltime.com/blog/1x2-betting-guide.html`
   - `https://winfulltime.com/predictions/1x2`
   - `https://winfulltime.com/`
4. Google re-crawls, follows the 301 signs, and drops the duplicate copies.
   Expect this to take **1–4 weeks** to fully show in Search Console.

---

## Never touch these (they keep your site alive)

- Don't delete the `@` A records or the `www` CNAME.
- Don't set SSL mode below **Full (strict)**.
- Don't change anything in your GitHub repo / delete the deploy workflow.
- If you add a `www.winfulltime.com` record, Cloudflare keeps the same rules.

## Troubleshooting

- **Site won't load after Step 1** → set SSL to Full (strict), confirm both
  clouds are orange, wait ~5 min, refresh.
- **Rule won't save** → double-check exact text; the conditions need those
  brackets `(` `)` around them.
- **`curl -I` / script shows 200 instead of 301** → the rule isn't deployed,
  or the cloud is still grey on the DNS page.