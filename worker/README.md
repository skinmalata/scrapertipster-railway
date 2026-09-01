# Bet9ja Cloudflare Worker Proxy

Bet9ja's coupon API blocks cloud/datacenter IPs via Akamai WAF. This Cloudflare Worker acts as a lightweight CORS proxy so users' browsers can decode Bet9ja booking codes directly.

## Deploy

1. Go to https://workers.cloudflare.com and sign up (free, 100K requests/day)
2. Click "Create a Service"
3. Name it `bet9ja-proxy`
4. Paste the contents of `bet9ja-proxy.js`
5. Click "Deploy"
6. Copy your worker URL (e.g. `https://bet9ja-proxy.your-subdomain.workers.dev`)
7. In `converter.html`, set `window.WFT_BET9JA_PROXY` to your worker URL:

```html
<script>window.WFT_BET9JA_PROXY = 'https://bet9ja-proxy.your-subdomain.workers.dev';</script>
```

Or deploy the worker to a custom domain like `proxy.winfulltime.com`.
