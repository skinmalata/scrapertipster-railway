'use strict';

// Shared site layout: one canonical nav + footer injected into every HTML
// response, so future menu/footer changes are global instead of per-page.

const fs = require('fs');
const path = require('path');

const NAV_LINKS = [
  { href: '/', label: 'Home', match: (p) => p === '/' || p === '/index.html' },
  { href: '/ticket-builder.html', label: 'Ticket Builder', match: (p) => p.startsWith('/ticket-builder') },
  { href: '/converter.html', label: 'Code Converter', match: (p) => p.startsWith('/converter') },
  { href: '/predictions/in-play', label: 'In-Play', match: (p) => p.startsWith('/predictions/in-play') },
  { href: '/blog/', label: 'Blog', match: (p) => p.startsWith('/blog') }
];

const AUTH_BTN_STYLE = 'background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;';

function navLinksHtml(activePath) {
  let html = '';
  for (const link of NAV_LINKS) {
    const active = link.match(activePath) ? ' class="active"' : '';
    html += `\n <a href="${link.href}"${active}>${link.label}</a>`;
  }

  html += '\n <span class="nav-auth" style="margin-left:auto;display:flex;align-items:center;gap:10px;">';
  html += `\n  <a href="/login.html" class="wft-auth-login" style="display:inline-block;${AUTH_BTN_STYLE}">Login</a>`;
  html += `\n  <a href="/account.html" class="wft-auth-account" style="display:none;${AUTH_BTN_STYLE}">Account</a>`;
  html += '\n </span>';
  return html;
}

const FOOTER_HTML = `
 <div class="footer-grid">
  <div class="footer-brand">
   <a href="/" class="footer-brand-link">
    <img src="/winfulltimelogo.png" alt="WinFulltime" class="footer-logo" width="34" height="34">
    <span class="footer-brand-name">Win<span>Fulltime</span></span>
   </a>
   <p class="footer-about">Data-driven football predictions, in-play alerts and expert analysis — built for smart bettors who want an edge, every single day.</p>
  </div>

  <div class="footer-col">
   <h5>Predictions</h5>
   <ul>
    <li><a href="/predictions/1x2.html">1X2</a></li>
    <li><a href="/predictions/over-2-5.html">Over 2.5</a></li>
    <li><a href="/predictions/over-1-5.html">Over 1.5</a></li>
    <li><a href="/predictions/btts.html">BTTS Yes</a></li>
    <li><a href="/predictions/btts-no.html">BTTS No</a></li>
    <li><a href="/predictions/unbeaten.html">Unbeaten</a></li>
    <li><a href="/predictions/in-play.html">In-Play</a></li>
    <li><a href="/predictions/1x2.html">All Predictions</a></li>
   </ul>
  </div>

  <div class="footer-col">
   <h5>Top Leagues</h5>
   <ul>
    <li><a href="/predictions/league/premier-league/">Premier League</a></li>
    <li><a href="/predictions/league/la-liga/">La Liga</a></li>
    <li><a href="/predictions/league/serie-a/">Serie A</a></li>
    <li><a href="/predictions/league/ligue-1/">Ligue 1</a></li>
    <li><a href="/predictions/league/uefa-champions-league/">Champions League</a></li>
   </ul>
  </div>

  <div class="footer-col">
   <h5>Picks &amp; Tools</h5>
   <ul>
    <li><a href="/best-picks.html">Best Picks</a></li>
    <li><a href="/2-odds-of-the-day.html">2 Odds</a></li>
    <li><a href="/author-picks.html">H2H Picks</a></li>
    <li><a href="/ticket-builder.html">Ticket Builder</a></li>
    <li><a href="/converter.html">Code Converter</a></li>
   </ul>
  </div>

  <div class="footer-col">
   <h5>Company</h5>
   <ul>
    <li><a href="/about.html">About</a></li>
    <li><a href="/blog/">Blog</a></li>
    <li><a href="/advertise.html">Advertise</a></li>
    <li><a href="/contact.html">Contact</a></li>
   </ul>
  </div>
 </div>

 <div class="footer-bottom">
  <span>&copy; <span class="js-year">2026</span> <a href="/">WinFulltime</a>. All rights reserved.</span>
  <span class="footer-bottom-links">
   <a href="/terms.html">Terms</a>
   <a href="/privacy.html">Privacy</a>
   <a href="/policy.html">Editorial Policy</a>
  </span>
   <button id="themeToggle" class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">Light</button>
 </div>
 <div style="text-align:center;padding:0 0 8px;"><div google-add-preferred-source-btn data-theme="dark"></div></div>
 </div>`;

function headerHtml(activePath) {
  return `
<header>
 <div class="header-content">
  <div class="logo">
   <a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a>
  </div>
  <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
  <nav id="nav">${navLinksHtml(activePath)}
 </nav>
 </div>
</header>`;
}

const HEADER_STYLE_OVERRIDE = `
<!-- wf-layout-styles -->
<style>
body > header, header {
  background: rgba(24,30,48,0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}
body > header .header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  max-width: 960px;
  margin: 0 auto;
}
body > header .logo {
  display: flex;
  align-items: center;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  text-align: left;
  margin: 0;
}
body > header .logo a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
}
body > header .logo-icon {
  height: 28px;
  width: auto;
  flex-shrink: 0;
  margin-right: 8px;
}
body > header .logo span { color: #ff7e7e; }
body > header .hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  z-index: 1001;
}
body > header .hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--text-primary, #e8edf5);
  margin: 5px 0;
  transition: all 0.3s;
  border-radius: 2px;
}
body > header .hamburger.active span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
body > header .hamburger.active span:nth-child(2) { opacity: 0; }
body > header .hamburger.active span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
body > header nav { display: flex; gap: 24px; }
body > header nav a {
  color: var(--text-muted, #94a3b8);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: color 0.2s;
  padding: 4px 0;
  position: relative;
}
body > header nav a:hover,
body > header nav a.active { color: var(--text-primary, #e8edf5); }
body > header nav .wft-auth-login,
body > header nav .wft-auth-account { display: inline-block; }
body > header nav .wft-auth-login:hover,
body > header nav .wft-auth-account:hover { color: #fff; opacity: 0.92; }

.theme-toggle {
  background: none;
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted, #94a3b8);
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}
.theme-toggle:hover { border-color: var(--border-hover, rgba(255,255,255,0.12)); color: var(--text-primary, #e8edf5); }
@media (max-width: 640px) {
  body > header .hamburger { display: block; }
  body > header nav {
    display: none !important;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary, #181e30);
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    z-index: 1000;
  }
  body > header nav.open { display: flex !important; }
}
</style>`;

// Pages that keep their own custom shell and must never get the shared layout.
const SKIP_PAGES = new Set(['admin.html', 'app.html', 'offline.html', 'yandex_7d24d4a4103b655d.html']);

const FEATURED_BOOKS_CSS_LINK = '<link rel="stylesheet" href="/featured-bookmakers-carousel.css">';

const FEATURED_BOOKS_SECTION = "  <section class=\"featured-books\" id=\"featured-books\" aria-labelledby=\"featured-books-title\">\n   <div class=\"featured-books-head\">\n    <div>\n     <h2 id=\"featured-books-title\">Featured Bookmakers</h2>\n     <p class=\"featured-books-sub\">Reviewed and recommended betting sites &#8212; welcome offers are for new customers and vary by country.</p>\n    </div>\n    <div class=\"featured-books-nav\">\n     <button type=\"button\" class=\"featured-books-arrow\" id=\"fmPrev\" aria-label=\"Previous bookmakers\">&#8249;</button>\n     <button type=\"button\" class=\"featured-books-arrow\" id=\"fmNext\" aria-label=\"Next bookmakers\">&#8250;</button>\n    </div>\n   </div>\n   <div class=\"featured-books-viewport\">\n    <div class=\"featured-books-track\" id=\"fmTrack\" role=\"list\" aria-label=\"Featured bookmakers\">\n     <article class=\"featured-books-card\" role=\"listitem\">\n      <div class=\"featured-books-top\">\n       <span class=\"featured-books-badge\" style=\"background:linear-gradient(135deg,#1d4ed8,#1e3a8a);\">1xBet</span>\n       <span class=\"featured-books-rating\" title=\"Editorial rating out of 5\"><span class=\"fm-rating-num\">4.2</span><span class=\"fm-outof\">/5</span></span>\n      </div>\n      <p class=\"featured-books-tag\">Welcome Offer</p>\n      <p class=\"featured-books-offer\">First-deposit welcome bonus, pre-match odds across 20+ markets, and booking/code betting for Nigeria, Kenya and Ghana.</p>\n      <div class=\"featured-books-actions\">\n       <a class=\"featured-books-cta\" href=\"https://reffpa.com/L?tag=d_6034393m_97c_&amp;site=6034393&amp;ad=97\" target=\"_blank\" rel=\"noopener noreferrer nofollow sponsored\">Claim Offer &rarr;</a>\n       <a class=\"featured-books-review\" href=\"/blog/1xbet-review.html\">Read 1xBet review</a>\n      </div>\n      <p class=\"featured-books-terms\">18+ only. Bonus tied to your first deposit; minimum odds and wagering requirements apply. T&amp;Cs apply.</p>\n     </article>\n     <article class=\"featured-books-card\" role=\"listitem\">\n      <div class=\"featured-books-top\">\n       <span class=\"featured-books-badge\" style=\"background:linear-gradient(135deg,#e11d48,#881337);\">1win</span>\n       <span class=\"featured-books-rating\" title=\"Editorial rating out of 5\"><span class=\"fm-rating-num\">4.1</span><span class=\"fm-outof\">/5</span></span>\n      </div>\n      <p class=\"featured-books-tag\">Welcome Offer</p>\n      <p class=\"featured-books-offer\">First-deposit welcome bonus with daily accumulator boosts, cash-out and a dedicated mobile betting app.</p>\n      <div class=\"featured-books-actions\">\n       <a class=\"featured-books-cta\" href=\"https://one-vv6198.com/betting?open=register&amp;p=f61e\" target=\"_blank\" rel=\"noopener noreferrer nofollow sponsored\">Claim Offer &rarr;</a>\n       <a class=\"featured-books-review\" href=\"/options.html\">Compare bookmakers</a>\n      </div>\n      <p class=\"featured-books-terms\">18+ only. Bonus tied to your first deposit; minimum odds and wagering requirements apply. T&amp;Cs apply.</p>\n     </article>\n     <article class=\"featured-books-card\" role=\"listitem\">\n      <div class=\"featured-books-top\">\n       <span class=\"featured-books-badge\" style=\"background:linear-gradient(135deg,#16a34a,#0f3d1e);\">Stake</span>\n       <span class=\"featured-books-rating\" title=\"Editorial rating out of 5\"><span class=\"fm-rating-num\">4.3</span><span class=\"fm-outof\">/5</span></span>\n      </div>\n      <p class=\"featured-books-tag\">Welcome Offer</p>\n      <p class=\"featured-books-offer\">Sportsbook and casino with fast crypto deposits and withdrawals, live betting, cash-out and daily promotions.</p>\n      <div class=\"featured-books-actions\">\n       <a class=\"featured-books-cta\" href=\"https://stake.com/?c=FjhqQ3n3\" target=\"_blank\" rel=\"noopener noreferrer nofollow sponsored\">Visit Stake &rarr;</a>\n       <a class=\"featured-books-review\" href=\"/options.html\">Compare bookmakers</a>\n      </div>\n      <p class=\"featured-books-terms\">18+ only. Offer, minimum deposit and wagering requirements vary by location. T&amp;Cs apply.</p>\n     </article>\n     <article class=\"featured-books-card featured-books-slot\" role=\"listitem\" aria-label=\"Advertising slot for bookmakers\">\n      <span class=\"featured-books-slot-label\">Advertise here</span>\n      <p class=\"featured-books-slot-note\">Feature your bookmaker in front of thousands of daily bettors. Sponsored &amp; premium placements available.</p>\n      <a class=\"featured-books-slot-cta\" href=\"/advertise.html\" rel=\"nofollow\">Book this slot &rarr;</a>\n     </article>\n    </div>\n   </div>\n   <p class=\"featured-books-disclosure\">Advertising disclosure: links to bookmakers on this page are affiliate links &#8212; WinFulltime may earn a commission if you sign up, at no extra cost to you. 18+ &middot; T&amp;Cs apply &middot; Please gamble responsibly.</p>\n  </section>\n  <script src=\"/featured-bookmakers-carousel.js?v=20260902c\" defer></script>";

const FEATURED_BOOKS_EXCLUDE = new Set(['about','account','admin','app','author-bio','contact','login','offline','policy','privacy','reset-password','signup','terms']);

function shouldShowFeaturedBooks(url) {
  if (!url) return false;
  const last = (url.split('/').pop() || '').replace(/\.html$/, '');
  const bare = url.replace(/^\/+/, '').replace(/\.html$/, '');
  return !FEATURED_BOOKS_EXCLUDE.has(last) && !FEATURED_BOOKS_EXCLUDE.has(bare);
}


function applyLayout(html, req) {
  return applyLayoutToHtml(html, (req && req.path) || '/');
}

function applyLayoutToHtml(html, activePath) {
  const navRe = /(<nav id="nav">)[\s\S]*?(<\/nav>)/;
  const footerRe = /(<footer[^>]*>)[\s\S]*?(<\/footer>)/;

  // 1. Nav: replace the inner content of an existing <nav id="nav">, or inject
  //    the full shared header when the page has none.
  if (navRe.test(html)) {
    html = html.replace(navRe, (m, open, close) => open + navLinksHtml(activePath) + close);
  } else if (/<nav class="nav">/.test(html)) {
    html = html.replace(/<nav class="nav">[\s\S]*?<\/nav>/, headerHtml(activePath));
  } else if (!/<header[^>]*>/.test(html)) {
    html = html.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs}>` + headerHtml(activePath));
  }

  // 2. Pages that don't load app.css need the header/theme styles so the
  //    injected header + theme toggle render like the rest of the site.
  if (!/app\.css/.test(html) && !/wf-layout-styles/.test(html)) {
    html = html.replace(/<\/head>/i, HEADER_STYLE_OVERRIDE + '\n</head>');
  }

  // 2b. Inject RSS feed auto-discovery tag into <head>
  if (!/type="application\/rss\+xml"/i.test(html)) {
    html = html.replace(/<\/head>/i, '<link rel="alternate" type="application/rss+xml" title="WinFulltime Football Predictions RSS" href="/feed.xml">\n</head>');
  }

  // 2c. Inject Preferred Sources script into <head>
  if (!/news\.google\.com\/swg\/js\/v1\/publisher\.js/.test(html)) {
    html = html.replace(/<\/head>/i, '<script async src="https://news.google.com/swg/js/v1/publisher.js"></script>\n</head>');
  }

  // 2c. Inject Organization (brand entity) schema unless the page already carries it.
  if (!/"@type": "Organization"/.test(html)) {
    const orgSchema = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "WinFulltime",
  "url": "https://winfulltime.com/",
  "logo": { "@type": "ImageObject", "url": "https://winfulltime.com/winfulltimelogo.png" },
  "description": "Data-driven football predictions, in-play alerts and expert analysis.",
  "sameAs": [
    "https://web.facebook.com/profile.php?id=61583581716476",
    "https://www.threads.net/@officialwinfulltime",
    "https://www.youtube.com/@winfulltime"
  ]
}
</script>`;
    html = html.replace(/<\/head>/i, orgSchema + '\n</head>');
  }

  // 3. Footer: replace the existing <footer> or inject one before </body>.
  if (footerRe.test(html)) {
    html = html.replace(footerRe, (m, open, close) => open + FOOTER_HTML + '\n' + close);
  } else {
    html = html.replace(/<\/body>/i, '<footer>' + FOOTER_HTML + '\n</footer>\n</body>');
  }

  // 3b. Featured Bookmakers carousel (content/prediction pages only).
  if (shouldShowFeaturedBooks(activePath) && !/class="featured-books-card"/.test(html)) {
    if (!/featured-bookmakers-carousel\.css/.test(html)) {
      html = html.replace(/<\/head>/i, FEATURED_BOOKS_CSS_LINK + '\n</head>');
    }
    if (/<main[^>]*>/.test(html)) {
      html = html.replace(/(<main[^>]*>)/, function (m) { return m + '\n' + FEATURED_BOOKS_SECTION; });
    } else if (/<footer[^>]*>/i.test(html)) {
      html = html.replace(/(<footer[^>]*>)/i, FEATURED_BOOKS_SECTION + '\n$1');
    }
  }

  // 4. Ensure the auth stack + theme/hamburger scripts are present so the
  //    auth-driven nav links and theme toggle work on every page.
  const needsTheme = !/wf-theme/.test(html);
  const needsConfig = !/config\.js/.test(html);
  const needsSupabase = !/supabase-client\.js/.test(html);
  const needsAuth = !/auth\.js/.test(html);
  const needsHamburger = !/getElementById\(['"]hamburger['"]\)/.test(html);
  if (needsTheme || needsAuth || needsConfig || needsSupabase || needsHamburger) {
    let block = '\n';
    if (needsConfig) block += '<script src="/config.js"></script>\n';
    if (needsSupabase) block += '<script src="/supabase-client.js"></script>\n';
    if (needsAuth) block += '<script src="/auth.js?v=20260801"></script>\n';
    if (needsTheme) {
      block += `<script>
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
</script>`;
    }
    if (needsHamburger) {
      block += `<script>
document.getElementById('hamburger')?.addEventListener('click', function() {
  this.classList.toggle('active');
  document.getElementById('nav')?.classList.toggle('open');
});
</script>`;
    }
    html = html.replace(/<\/body>/i, block + '</body>');
  }

  return html;
}

function staticWithLayout(req, res, next, publicDir) {
  if (req.method !== 'GET') return next();

  const base = req.path.split('?')[0];
  const bare = base.replace(/^\/+/, '');

  let filePath;
  if (bare === '') {
    filePath = path.join(publicDir, 'index.html');
  } else {
    const firstSegment = bare.split('/')[0];
    if (SKIP_PAGES.has(firstSegment)) return next();

    const publicPath = path.join(publicDir, bare);
    if (base.endsWith('/')) {
      filePath = path.join(publicPath, 'index.html');
    } else if (!path.extname(bare)) {
      filePath = publicPath + '.html';
    } else {
      filePath = publicPath;
    }
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
  if (path.extname(filePath).toLowerCase() !== '.html') return next();

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    return res.type('html').send(applyLayout(html, req));
  } catch (err) {
    return next(err);
  }
}

module.exports = { applyLayout, applyLayoutToHtml, staticWithLayout, SKIP_PAGES };
