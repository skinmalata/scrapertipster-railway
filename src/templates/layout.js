'use strict';

// Shared site layout: one canonical nav + footer injected into every HTML
// response, so future menu/footer changes are global instead of per-page.

const fs = require('fs');
const path = require('path');

const NAV_LINKS = [
  { href: '/', label: 'Home', match: (p) => p === '/' || p === '/index.html' },
  { href: '/ticket-builder.html', label: 'Ticket Builder', match: (p) => p.startsWith('/ticket-builder') },
  { href: '/converter.html', label: 'Code Converter', match: (p) => p.startsWith('/converter') },
  { href: '/code-splitter.html', label: 'Code Splitter', match: (p) => p.startsWith('/code-splitter') },
  { href: '/code-merger.html', label: 'Code Merger', match: (p) => p.startsWith('/code-merger') },
  { href: '/predictions/in-play', label: 'In-Play', match: (p) => p.startsWith('/predictions/in-play') },
  { href: '/blog/', label: 'Blog', match: (p) => p.startsWith('/blog') }
];

const AUTH_BTN_STYLE = 'background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;';

const TELEGRAM_BTN_STYLE = 'display:inline-flex;align-items:center;background:linear-gradient(135deg,#1e96c8,#1a7da8);color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;';

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
     <li><a href="/predictions/under-2-5.html">Under 2.5</a></li>
     <li><a href="/predictions/highest-scoring-half.html">Highest Scoring Half</a></li>
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
    <li><a href="/code-splitter.html">Code Splitter</a></li>
    <li><a href="/code-merger.html">Code Merger</a></li>
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
   <a href="https://t.me/winfulltime" target="_blank" rel="noopener" style="${TELEGRAM_BTN_STYLE}">Telegram Channel</a>
  </span>
  <span class="kofi-footer">
   <script type='text/javascript' src='https://storage.ko-fi.com/cdn/widget/Widget_2.js'></script>
   <script type='text/javascript'>kofiwidget2.init('Support us', '#ff2448', 'winfulltime');kofiwidget2.draw();</script>
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
/* Seven links plus the login button need ~680px, and .header-content caps at
   960px, so the inline nav only fits on genuinely wide screens. Collapse to
   the hamburger earlier to keep the header from overflowing on tablets. */
body > header nav { display: flex; gap: 18px; }
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
@media (max-width: 1024px) {
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






// Ad slots. Markup only -- /monetag.js and /adsterra.js inject the network
// scripts lazily. /ads.css reserves slot height so late-arriving creatives
// don't shift layout, and is shared by whichever network is enabled.
//
// ADS_ASSET_VERSION must be bumped whenever /ads.css, /monetag.js or
// /pred-ads.js changes. These files are served with a long-lived cache, and a
// stylesheet whose URL does not change keeps serving the previous version: the
// new rules simply never reach visitors. The JS files were unaffected so far
// only because they are new enough that no stale copy exists yet.
const ADS_ASSET_VERSION = 3;
const ADS_CSS_LINK = '<link rel="stylesheet" href="/ads.css?v=' + ADS_ASSET_VERSION + '">';

const ADS_SECTION =
  '<aside class="wft-ads" aria-label="Advertisements">\n' +
  '  <div class="wft-ad wft-ad-native" data-wft-ad="native">\n' +
  '    <div id="container-c31a1718b62d775ad47181a89eb1cb93"></div>\n' +
  '  </div>\n' +
  '  <div class="wft-ad wft-ad-rect" data-wft-ad="rect"></div>\n' +
  '</aside>';

// Monetag builds its own container, so this slot stays empty and exists only to
// anchor the lazy load (see loadInPagePush in /monetag.js).
const MONETAG_SECTION =
  '<aside class="wft-ads" aria-label="Advertisements">\n' +
  '  <div class="wft-ad wft-ad-ipp" data-wft-ad="ipp"></div>\n' +
  '</aside>';

const ADS_LOADER = '<script src="/adsterra.js?v=' + ADS_ASSET_VERSION + '" defer></script>';
const MONETAG_LOADER = '<script src="/monetag.js?v=' + ADS_ASSET_VERSION + '" defer></script>';
// Runtime helper that slots banners between prediction cards on /predictions/*.
const PRED_ADS_LOADER = '<script src="/pred-ads.js?v=' + ADS_ASSET_VERSION + '" defer></script>';

// Adsterra is switched off for now; flip to true to re-enable. Monetag runs
// In-Page Push + Vignette. Baked copies of the markup are stripped either way
// (stripAds) so pages never keep empty reserved boxes, which would otherwise
// collapse to a gap without /ads.css.
const ADSTERRA_ENABLED = false;
const MONETAG_ENABLED = true;
const ADS_ANY_ENABLED = ADSTERRA_ENABLED || MONETAG_ENABLED;

// Site-wide consent gate. Needed by every ad loader before it may request a
// personalised network. Lives outside ADSTERRA_ENABLED because Monetag uses it
// regardless of the Adsterra switch.
const CONSENT_CSS_LINK = '<link rel="stylesheet" href="/consent.css">';
const CONSENT_JS = '<script src="/consent.js?v=1" defer></script>';

// Utility/legal/payment pages carry no monetisable content and ads here
// read as deceptive on a privacy or terms screen.
const ADS_EXCLUDE = new Set([
  'about', 'account', 'admin', 'app', 'author-bio', 'advertise', 'contact',
  'login', 'offline', 'policy', 'privacy', 'reset-password', 'signup',
  'terms', '404'
]);

function shouldShowAds(url) {
  if (!url) return false;
  const last = (url.split('/').pop() || '').replace(/\.html$/, '');
  const bare = url.replace(/^\/+/, '').replace(/\.html$/, '');
  // '/' is the homepage. Both segments are empty, but the page is perfectly
  // ad-eligible -- rejecting it meant the one page with the most traffic never
  // carried a slot, for this network and every previous one. Only a genuinely
  // empty value is rejected here.
  if (!last && !bare && url !== '/') return false;
  return !ADS_EXCLUDE.has(last) && !ADS_EXCLUDE.has(bare);
}

function applyLayout(html, req) {
  return applyLayoutToHtml(html, (req && req.path) || '/');
}

// The Featured Bookmakers carousel was retired. Pages already carrying baked
// copies are cleaned on every bake/render so the markup does not linger.
function stripFeaturedBooks(html) {
  return html
    .replace(/[ \t]*<link[^>]*featured-bookmakers-carousel\.css[^>]*>\r?\n?/gi, '')
    .replace(/[ \t]*<script[^>]*featured-bookmakers-carousel\.js[^>]*><\/script>\r?\n?/gi, '')
    .replace(/[ \t]*<section class="featured-books"[\s\S]*?<\/section>\r?\n?/gi, '');
    }

    // No ad network enabled. Remove every loader, the stylesheet that reserves
    // the slot heights, and any already-baked <aside class="wft-ads"> block.
    function stripAds(html) {
    return html
    .replace(/[ \t]*<link[^>]*\/ads\.css[^>]*>\r?\n?/gi, '')
    .replace(/[ \t]*<link[^>]*adsterra\.css[^>]*>\r?\n?/gi, '')
    .replace(/[ \t]*<script[^>]*adsterra\.js[^>]*><\/script>\r?\n?/gi, '')
    .replace(/[ \t]*<script[^>]*monetag\.js[^>]*><\/script>\r?\n?/gi, '')
    .replace(/[ \t]*<aside class="wft-ads"[\s\S]*?<\/aside>\r?\n?/gi, '')
    // Defensive: a partially-baked page could still carry bare slot divs.
    .replace(/[ \t]*<div class="wft-ad wft-ad-(?:native|rect|ipp)"[^>]*>[\s\S]*?<\/div>\r?\n?/gi, '')
    .replace(/[ \t]*<div class="wft-ad wft-ad-(?:native|rect|ipp)"[^>]*\/?>\r?\n?/gi, '');
    }

function applyLayoutToHtml(html, activePath) {
  html = stripFeaturedBooks(html);
  // Always drop any previously baked ad markup. Whichever network is enabled
  // re-injects a fresh section in 3a, so Adsterra's baked container must not
  // survive its own disable, and an excluded page must never keep a stale slot.
  html = stripAds(html);

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

  // 2d. Monetag site-verification tag. This only proves ownership to the
  // Monetag dashboard so the site can be approved -- it does NOT serve ads.
  // Actual ad serving needs the MultiTag zone script from the dashboard.
  if (!/name="monetag"/i.test(html)) {
    html = html.replace(/<\/head>/i, '<meta name="monetag" content="63978e270d03ed74967ae29834504e62">\n</head>');
  }

  // 2e. Site-wide consent gate. Injected on every page that goes through the
  // layout; SKIP_PAGES bypass the layout entirely and so never load ad scripts
  // either, which means they do not need the gate.
  if (!/consent\.css/.test(html)) {
    html = html.replace(/<\/head>/i, CONSENT_CSS_LINK + '\n</head>');
  }
  if (!/consent\.js/.test(html)) {
    html = html.replace(/<\/body>/i, CONSENT_JS + '\n</body>');
  }

  // 3. Footer: replace the existing <footer> or inject one before </body>.
  if (footerRe.test(html)) {
    html = html.replace(footerRe, (m, open, close) => open + FOOTER_HTML + '\n' + close);
  } else {
    html = html.replace(/<\/body>/i, '<footer>' + FOOTER_HTML + '\n</footer>\n</body>');
  }

  // 3a. Ad slots (content/prediction pages only).
  if (ADS_ANY_ENABLED && shouldShowAds(activePath) && !/data-wft-ad="/.test(html)) {
    if (!/\/ads\.css/.test(html)) {
      html = html.replace(/<\/head>/i, ADS_CSS_LINK + '\n</head>');
    }
    const section = ADSTERRA_ENABLED ? ADS_SECTION : MONETAG_SECTION;
    if (/<\/main>/i.test(html)) {
      html = html.replace(/<\/main>/i, section + '\n</main>');
    } else if (/<footer[^>]*>/i.test(html)) {
      html = html.replace(/(<footer[^>]*>)/i, section + '\n$1');
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, section + '\n</body>');
    }
    if (ADSTERRA_ENABLED && !/adsterra\.js/.test(html)) {
      html = html.replace(/<\/body>/i, ADS_LOADER + '\n</body>');
    }
    if (MONETAG_ENABLED && !/monetag\.js/.test(html)) {
      html = html.replace(/<\/body>/i, MONETAG_LOADER + '\n</body>');
    }
    // Market pages render their cards client-side, so the inter-card slots are
    // injected at runtime by /pred-ads.js rather than baked like the footer
    // slot above. Scoped to /predictions/* so no other page grows a second and
    // third banner.
    if (MONETAG_ENABLED && /^\/predictions\/[^/]+\/?$/.test(activePath) && !/pred-ads\.js/.test(html)) {
      html = html.replace(/<\/body>/i, PRED_ADS_LOADER + '\n</body>');
    }
  }


  // 4. Ensure the auth stack + theme/hamburger scripts are present so the
  //    auth-driven nav links and theme toggle work on every page.
  const needsTheme = !/wf-theme/.test(html);
  const needsConfig = !/config\.js/.test(html);
  const needsSupabase = !/supabase-client\.js/.test(html);
  const needsAuth = !/auth\.js/.test(html);
  const needsHamburger = !/getElementById\(['"]hamburger['"]\)/.test(html);
  const needsVipTab = !/vip-tab\.js/.test(html) && /id="categoryLinks"|id="categoryTabs"/.test(html);
  if (needsTheme || needsAuth || needsConfig || needsSupabase || needsHamburger || needsVipTab) {
    let block = '\n';
    if (needsConfig) block += '<script src="/config.js"></script>\n';
    if (needsSupabase) block += '<script src="/supabase-client.js"></script>\n';
    if (needsAuth) block += '<script src="/auth.js?v=20260801"></script>\n';
    if (needsVipTab) block += '<script src="/vip-tab.js" defer></script>\n';
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
