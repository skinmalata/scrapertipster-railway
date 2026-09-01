'use strict';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyTeam(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchupSlug(home, away) {
  const h = slugifyTeam(home);
  const a = slugifyTeam(away);
  if (!h || !a) return '';
  return h + '-vs-' + a;
}

function generateFaqSchema(faqs) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  }, null, 2);
}

function generateBreadcrumbSchema(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(i < items.length - 1 ? { item: 'https://winfulltime.com' + (item.href === '/' ? '' : item.href) } : {})
    }))
  }, null, 2);
}

const GTM_SCRIPT = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>`;

const HEAD_BOILERPLATE = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#ff2448">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/app.css?v=3">
<link rel="alternate" type="application/rss+xml" title="WinFulltime Football Predictions RSS" href="/feed.xml">
<script async src="https://news.google.com/swg/js/v1/publisher.js"></script>`;

const HEADER_HTML = `<header>
<div class="header-content">
<div class="logo"><a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a></div>
<button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
<nav id="nav">
 <a href="/">Home</a>
 <a href="/ticket-builder.html">Ticket Builder</a>
 <a href="/best-picks.html">Best Picks</a>
 <a href="/author-picks.html">H2H Picks</a>
 <a href="/predictions/in-play">In-Play</a>
 <a href="/blog/">Blog</a>
 <span class="nav-auth" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
  <a href="/login.html" class="wft-auth-login" style="display:inline-block;background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;">Login</a>
  <a href="/account.html" class="wft-auth-account" style="display:none;background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;">Account</a>
 </span>
</nav>
</div>
</header>`;

const FOOTER_HTML = `<footer>
 <div class="footer-content">
  <div style="text-align:center;margin-bottom:24px;">
   <p style="margin:0 0 12px;font-size:14px;color:var(--text-muted);">Catch live matches as they happen. Get golden tips and in-play alerts.</p><a href="/predictions/in-play" style="display:inline-block;background:linear-gradient(135deg,#ff2448,#d41a38);color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">In-Play Tips</a>
  </div>
  <div class="footer-links">
   <a href="/">Home</a>
   <a href="/ticket-builder.html">Ticket Builder</a>
   <a href="/2-odds-of-the-day.html">2 Odds</a>
   <a href="/best-picks.html">Best Picks</a>
   <a href="/author-picks.html">H2H Picks</a>
   <a href="/blog/">Blog</a>
   <a href="/predictions/in-play">In-Play</a>
   <a href="/predictions/1x2">1X2</a>
   <a href="/predictions/over-1-5">Over 1.5</a>
   <a href="/predictions/over-2-5">Over 2.5</a>
   <a href="/predictions/btts">BTTS Yes</a>
   <a href="/predictions/btts-no">BTTS No</a>
   <a href="/predictions/unbeaten">Unbeaten</a>
   <a href="/predictions/corners">Corners</a>
   <a href="/predictions/cards">Cards</a>
   <a href="/advertise.html">Advertise</a>
   <a href="/contact.html">Contact</a>
   <a href="/terms.html">Terms</a>
   <a href="/privacy.html">Privacy</a>
   <a href="/policy.html">Editorial Policy</a>
  </div>
  <p class="footer-copyright">&copy; 2026 WinFulltime. All rights reserved.</p>
 </div>
 <div style="text-align:center;padding:12px 0;"><button id="themeToggle" class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">Light</button></div>
 <div style="text-align:center;padding:0 0 8px;"><div google-add-preferred-source-btn data-theme="dark"></div></div>
</footer>`;

const BODY_SCRIPTS = `<script src="/config.js"></script>
<script src="/supabase-client.js"></script>
<script src="/auth.js?v=20260801"></script>
<script>
(function() {
  const saved = localStorage.getItem("wf-theme");
  const theme = saved || "dark";
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "" : "light");
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "Light" : "Dark";
})();
document.addEventListener("DOMContentLoaded", function() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", function() {
    const html = document.documentElement;
    const isLight = html.getAttribute("data-theme") === "light";
    if (isLight) {
      html.removeAttribute("data-theme");
      btn.textContent = "Light";
      localStorage.setItem("wf-theme", "dark");
    } else {
      html.setAttribute("data-theme", "light");
      btn.textContent = "Dark";
      localStorage.setItem("wf-theme", "light");
    }
  });
});
</script><script>
document.getElementById('hamburger')?.addEventListener('click', function() {
  this.classList.toggle('active');
  document.getElementById('nav')?.classList.toggle('open');
});
</script>`;

const SHARED_CSS = `.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:16px;color:var(--text-primary)}
.faq-list{display:flex;flex-direction:column;gap:8px}
.faq-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.faq-item summary{padding:16px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
.faq-item summary::after{content:'+';font-size:18px;font-weight:700;color:var(--accent)}
.faq-item[open] summary::after{content:'\\2212'}
.faq-item p{padding:0 20px 16px;font-size:14px;line-height:1.6;color:var(--text-secondary);margin:0}
.related-links{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
.related-links a{display:inline-block;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--text-secondary);text-decoration:none;transition:background 0.15s,color 0.15s}
.related-links a:hover{background:rgba(255,36,72,0.15);color:#fff}`;

function renderBreadcrumbs(items) {
  const parts = items.map((item, i) => {
    if (i === items.length - 1) {
      return `<span aria-current="page">${escapeHtml(item.label)}</span>`;
    }
    return `<a href="${item.href}">${escapeHtml(item.label)}</a><span>/</span>`;
  });
  return `<nav class="crumbs" aria-label="Breadcrumb">\n  ${parts.join('\n  ')}\n</nav>`;
}

function wrapPage({ title, description, keywords, canonicalUrl, schemaJson, pageCss, breadcrumbs, body }) {
  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const allSchema = [breadcrumbSchema];
  if (schemaJson) allSchema.push(schemaJson);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${GTM_SCRIPT}
${HEAD_BOILERPLATE}
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="https://winfulltime.com/winfulltimelogo.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WinFulltime">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${canonicalUrl}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="https://winfulltime.com/winfulltimelogo.png">
<link rel="canonical" href="${canonicalUrl}">
${allSchema.map(s => `<script type="application/ld+json">\n${s}\n</script>`).join('\n')}
<style>
${SHARED_CSS}
${pageCss || ''}
</style>
</head>
<body>
<div>
${HEADER_HTML}
<main class="container">
${renderBreadcrumbs(breadcrumbs)}
${body}
</main>
${FOOTER_HTML}
</div>
${BODY_SCRIPTS}
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  slugifyTeam,
  matchupSlug,
  generateFaqSchema,
  generateBreadcrumbSchema,
  wrapPage,
  renderBreadcrumbs,
  SHARED_CSS,
  GTM_SCRIPT,
  HEAD_BOILERPLATE,
  HEADER_HTML,
  FOOTER_HTML
};
