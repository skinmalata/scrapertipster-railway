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
   <div class="footer-social">
    <a href="https://web.facebook.com/profile.php?id=61583581716476" aria-label="Facebook" target="_blank" rel="noopener"><svg viewBox="0 0 320 512"><path fill="currentColor" d="M279 14H40a40 40 0 0 0-40 40v404a40 40 0 0 0 40 40h239a40 40 0 0 0 40-40V54a40 40 0 0 0-40-40zM189 512h-58V330h-63v-86h63v-39c0-87 41-140 129-140h86v86h-54c-40 0-47 18-47 51v42h100l-13 86h-87z"/></svg></a>
    <a href="https://www.threads.net/@officialwinfulltime" aria-label="Threads" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.186 2.5c-2.124 0-3.924.614-5.28 1.846C5.62 5.508 4.852 7.24 4.703 9.297c-.17 2.325.56 4.29 1.83 5.713-.1-.057-.2-.118-.3-.183-1.144-.76-1.944-1.877-2.307-3.197a.505.505 0 0 0-.9-.062.492.492 0 0 0-.056.14c-.47 2.1-.01 4.12 1.2 5.63 1.07 1.34 2.68 2.12 4.67 2.27-.23.26-.49.5-.78.72-1.03.79-2.3 1.22-3.85 1.28a.516.516 0 0 0-.37.15.5.5 0 0 0-.14.36.502.502 0 0 0 .15.37c.93.94 2.44 1.42 4.49 1.42 1.9 0 3.72-.6 5.29-1.73 1.45-1.05 2.7-2.55 3.7-4.48.3-.57.55-1.15.77-1.72.74 1.24 1.67 2.24 2.8 3.02 1.55 1.06 3.35 1.6 5.36 1.6 2.15 0 3.92-.72 5.27-2.13 1.27-1.33 1.98-3.2 2-5.3v-.36c.02-1.2-.09-2.43-.34-3.63a.498.498 0 0 0-.47-.4.495.495 0 0 0-.49.43c-.24 1.12-.33 2.26-.3 3.35-.05 1.57-.51 2.83-1.35 3.73-.82.9-1.95 1.36-3.35 1.36-1.3 0-2.38-.4-3.25-1.19-.4-.36-.75-.77-1.05-1.22-.58-.88-.93-1.93-1.06-3.13-.07-.64-.09-1.31-.07-1.98.02-.62.03-1.24.06-1.86.06-1.17.16-2.22.3-3.14a.496.496 0 0 0-.4-.57.498.498 0 0 0-.57.4c-.07.37-.12.74-.16 1.12-.25-.79-.62-1.5-1.13-2.15-.94-1.2-2.27-1.9-3.83-2.02-.5-.04-1.02-.03-1.53.05-.9.13-1.7.43-2.39.87a5.06 5.06 0 0 0-2.05 2.47c-.3.78-.43 1.6-.4 2.43.02.6.14 1.19.33 1.75l-.13-.06a5.4 5.4 0 0 1-1.73-2.43.508.508 0 0 0-.4-.34.494.494 0 0 0-.53.23.493.493 0 0 0-.06.12c-.29.9-.4 1.85-.34 2.77.1 1.66.8 3.12 2.06 4.27.14.13.3.26.46.38l-.04.01a4.9 4.9 0 0 1-2.68-1.5c-.97-1.02-1.57-2.42-1.7-4.03zm3.7-5.01c.95-.1 1.9-.09 2.83.15 1.2.3 2.1.83 2.8 1.66.63.75 1.07 1.7 1.3 2.84.19.95.28 1.93.25 2.9-.02.58-.03 1.16-.05 1.74-.03.64-.04 1.28-.04 1.92 0 .94.05 1.86.18 2.78.22 1.51.78 2.73 1.72 3.67.9.9 2.1 1.37 3.57 1.37 1.83 0 3.36-.64 4.42-1.87 1.1-1.27 1.68-3.08 1.67-5.23-.02-1.18-.13-2.33-.35-3.42a.46.46 0 0 1 .9-.18c.23.9.35 1.83.36 2.76.01 2.53-.69 4.7-2.05 6.32-1.52 1.8-3.69 2.72-6.3 2.72-2.32 0-4.28-.72-5.82-2.13-1.03-.94-1.87-2.1-2.5-3.42-.16.36-.34.72-.53 1.06-.9 1.69-2 3.01-3.28 3.93-1.37.98-2.99 1.48-4.76 1.48-1.53 0-2.77-.37-3.65-1.08-1.13-.9-1.74-2.17-1.72-3.65.02-1.32.45-2.55 1.3-3.6.99-1.22 2.4-2.06 4.17-2.49.55-.13 1.13-.23 1.7-.3l-.1-.06c-.7-.42-1.3-.92-1.78-1.5-.96-1.17-1.47-2.6-1.52-4.24-.05-1.6.23-3.03.83-4.27a3.98 3.98 0 0 1 1.63-1.92c.6-.35 1.27-.58 1.98-.66zM12.16 4.5c-1.02 0-1.87.33-2.5.97-.7.72-1.05 1.76-1.02 3 .02.97.24 1.8.68 2.54.45.75 1.08 1.3 1.93 1.67.7.3 1.47.44 2.28.4l-.01-.54c-.01-.4-.03-.81-.06-1.23-.06-1.16-.28-2.19-.66-3.09a3.32 3.32 0 0 0-1.24-1.5.5.5 0 0 0-.58.02.494.494 0 0 0-.12.68.85.85 0 0 0 .06.08c.22.26.36.56.42.9.1.55.11 1.13.05 1.69-.06.56-.19 1.1-.39 1.61-.6.18-1.1.42-1.5.72-.53.4-.85.85-.96 1.34-.1.4-.09.76.04 1.05.27.66.85 1.02 1.6 1.05.5.02.96-.13 1.4-.4l-.12.23c-.22.44-.45.87-.7 1.29-.68 1.16-1.51 2.05-2.53 2.7-.76.49-1.61.78-2.5.87-.37.04-.74.05-1.09.05-.64 0-1.15.13-1.56.38-.44.28-.72.62-.85 1.03-.11.34-.09.64.06.91.32.6.95.9 1.85.9 1.53 0 2.96-.46 4.13-1.32 1.08-.8 2-1.9 2.77-3.27.31-.55.6-1.12.88-1.7a10.7 10.7 0 0 1 1.16 3.02c.12.7.36 1.35.72 1.94.28.47.64.86 1.07 1.16 1.4.98 3.32 1.18 5.5.47-.6 1.4-1.4 2.63-2.34 3.5a7.37 7.37 0 0 1-4.1 1.44.5.5 0 0 0-.47.53.504.504 0 0 0 .15.34c.43.43 1.36.88 2.6.88 1.87 0 3.62-.53 5.06-1.55.6-.42 1.15-.88 1.66-1.38-1.14.3-2.18.32-3.12.05-1.18-.33-2.15-1.03-2.9-2.08-.5-.7-.87-1.55-1.12-2.54-.06-.25-.12-.5-.16-.76a6.9 6.9 0 0 1 0-2.34c.2-.3.4-.62.61-.94.64-.98 1.33-1.8 2.07-2.47.87-.79 1.85-1.38 2.9-1.75.1-.04.2-.1.3-.17a.49.49 0 0 0-.15-.9c-.22-.05-.44-.08-.66-.1a5.08 5.08 0 0 0-1.9.18 7.35 7.35 0 0 0-1.85.84c.5-1.5 1.24-2.74 2.2-3.7.88-.87 1.97-1.51 3.18-1.87a.5.5 0 0 0 .34-.62.5.5 0 0 0-.62-.34c-1.43.42-2.74 1.2-3.83 2.24-.86.82-1.58 1.84-2.15 2.98-.35.7-.64 1.44-.88 2.2-.3.94-.52 1.94-.64 2.99l-.01.05a7.8 7.8 0 0 0-.05.95c0 .54.04 1.06.1 1.58.06.53.17 1.05.34 1.55.14.42.31.83.52 1.22.5.96 1.18 1.66 2.02 2.14.86.48 1.85.71 2.91.68.87-.02 1.65-.2 2.33-.54-1.15.28-2.26.33-3.27.15-1.3-.24-2.38-.94-3.18-2.03-.52-.72-.9-1.6-1.12-2.65-.1-.47-.16-.96-.18-1.45-.01-.3-.02-.6-.01-.9.04-1.05.14-2.1.29-3.13.06-.42.14-.84.23-1.25.06-.27.12-.55.2-.82.24-.84.54-1.66.93-2.45.88-1.78 2.05-3.26 3.49-4.42.2-.16.32-.4.33-.66a.82.82 0 0 0-.26-.62 1.53 1.53 0 0 0-1.03-.4c-.44 0-.86.08-1.27.22-.66.23-1.25.6-1.78 1.06-.93.82-1.7 1.88-2.29 3.14-.1.2-.18.4-.25.6a.5.5 0 0 0 .33.63.5.5 0 0 0 .63-.33c.02-.05.03-.1.05-.15.53-1.12 1.2-2.07 1.99-2.79.43-.4.9-.7 1.4-.9.26-.1.52-.17.8-.2.5-.06 1-.05 1.47.04.82.17 1.5.5 2.03 1.02.32.32.57.69.75 1.09-.2.02-.4.04-.6.07-.93.16-1.8.48-2.6.94-.73.42-1.39.94-1.98 1.54a6.06 6.06 0 0 0-1.44 2.25c-.36.9-.6 1.86-.73 2.85-.03.21-.05.42-.07.62z"/></svg></a>
    <a href="https://x.com" aria-label="X / Twitter" target="_blank" rel="noopener"><svg viewBox="0 0 512 512"><path fill="currentColor" d="M389 32h70L304 224 415 480H340L257 316 161 480H91l155-178L58 32h75l124 165 132-165z"/></svg></a>
    <a href="https://telegram.org" aria-label="Telegram" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>
    <a href="https://www.youtube.com/@winfulltime" aria-label="YouTube" target="_blank" rel="noopener"><svg viewBox="0 0 576 512"><path fill="currentColor" d="M549 156c-6-23-24-40-47-46-41-11-166-11-166-11s-125 0-166 11c-23 6-41 23-47 46-11 41-11 127-11 127s0 86 11 127c6 23 24 40 47 46 41 11 166 11 166 11s125 0 166-11c23-6 41-23 47-46 11-41 11-127 11-127s0-86-11-127zM235 326V202l112 62-112 62z"/></svg></a>
   </div>
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
