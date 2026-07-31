'use strict';

// Shared site layout: one canonical nav + footer injected into every HTML
// response, so future menu/footer changes are global instead of per-page.

const fs = require('fs');
const path = require('path');

const NAV_LINKS = [
  { href: '/', label: 'Home', match: (p) => p === '/' || p === '/index.html' },
  { href: '/ticket-builder.html', label: 'Ticket Builder', match: (p) => p.startsWith('/ticket-builder') },
  { href: '/best-picks.html', label: 'Best Picks', match: (p) => p.startsWith('/best-picks') },
  { href: '/author-picks.html', label: 'Author Picks', match: (p) => p.startsWith('/author-picks') },
  { href: '/predictions/in-play', label: 'In-Play', match: (p) => p.startsWith('/predictions/in-play') },
  { href: '/blog/', label: 'Blog', match: (p) => p.startsWith('/blog') },
  { href: '/pricing.html', label: 'Pro', match: (p) => p.startsWith('/pricing') }
];

const AUTH_BTN_STYLE = 'background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;';

function navLinksHtml(activePath) {
  let html = '';
  for (const link of NAV_LINKS) {
    const active = link.match(activePath) ? ' class="active"' : '';
    html += `\n <a href="${link.href}"${active}>${link.label}</a>`;
  }
  html += '\n <span class="nav-auth" style="margin-left:auto;display:flex;align-items:center;gap:10px;">';
  html += `\n  <a href="/login.html" class="wft-auth-login" style="display:inline-block;${AUTH_BTN_STYLE}">Sign In</a>`;
  html += `\n  <a href="/signup.html" class="wft-auth-login" style="display:inline-block;${AUTH_BTN_STYLE}">Sign Up</a>`;
  html += `\n  <a href="/account.html" class="wft-auth-account" style="display:none;${AUTH_BTN_STYLE}">Account</a>`;
  html += '\n </span>';
  return html;
}

const FOOTER_HTML = `
 <div class="footer-content">
  <div style="text-align:center;margin-bottom:24px;">
   <p style="margin:0 0 12px;font-size:14px;color:var(--text-muted);">Catch live matches as they happen. Get golden tips and in-play alerts.</p><a href="/predictions/in-play" style="display:inline-block;background:linear-gradient(135deg,#ff2448,#d41a38);color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">In-Play Tips</a>
  </div>
  <div class="footer-links">
   <a href="/">Home</a>
   <a href="/ticket-builder.html">Ticket Builder</a>
   <a href="/2-odds-of-the-day.html">2 Odds</a>
   <a href="/best-picks.html">Best Picks</a>
   <a href="/author-picks.html">Author Picks</a>
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
  </div>
  <p class="footer-copyright">&copy; 2026 WinFulltime. All rights reserved.</p>
 </div>
 <div style="text-align:center;padding:12px 0;"><button id="themeToggle" class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">Light</button></div>`;

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
const SKIP_PAGES = new Set(['admin.html', 'app.html', 'offline.html']);

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
