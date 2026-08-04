'use strict';

const fs = require('fs');
const path = require('path');

const H2H_CACHE_FILE = path.join(__dirname, '..', 'h2h-unbeaten-cache.json');
const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'h2h');

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

function generateH2hFaqSchema(home, away) {
  const faqs = [
    {
      q: `What is the head-to-head record between ${home} and ${away}?`,
      a: `Head-to-head performance tracks historical wins, draws, scoring averages, and active unbeaten streaks between ${home} and ${away} across recent competitive meetings.`
    },
    {
      q: `Where can I view match analysis for ${home} vs ${away}?`,
      a: `WinFulltime provides match predictions, probability metrics, team form, and head-to-head statistics for ${home} vs ${away} fixtures.`
    },
    {
      q: `Which team has the stronger form between ${home} and ${away}?`,
      a: `Form analysis combines recent league results, goal scoring rates, defensive clean sheets, and venue performance (home vs away) to calculate overall win probability.`
    }
  ];

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

function generateH2hPage(home, away, slug, streaks, league, country) {
  const canonicalUrl = `https://winfulltime.com/h2h/${slug}/`;
  const metaTitle = `${home} vs ${away} Head to Head Stats & History | WinFulltime`;
  const metaDesc = `Head-to-head statistics, unbeaten streaks, win records, and match predictions for ${home} vs ${away}. Data-driven football analysis.`;

  const streakItemsHtml = (streaks || []).map(s => `
    <div class="streak-badge" style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:12px 16px;margin-bottom:10px;">
      <span style="font-weight:700;color:var(--accent);font-size:16px;">🔥 ${s.count || 'Long'} Streak</span>
      <p style="margin:4px 0 0;font-size:14px;color:var(--text-secondary);">${escapeHtml(s.text || 'Unbeaten streak recorded in competitive matches.')}</p>
    </div>
  `).join('\n') || '<p style="color:var(--text-secondary);">No active long streaks recorded for this specific matchup.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeHtml(metaDesc)}">
<meta name="keywords" content="${escapeHtml(home)} vs ${escapeHtml(away)}, h2h stats, head to head record, ${escapeHtml(home)} stats, ${escapeHtml(away)} stats">
<meta property="og:title" content="${escapeHtml(metaTitle)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:description" content="${escapeHtml(metaDesc)}">
<meta property="og:image" content="https://winfulltime.com/winfulltimelogo.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(metaTitle)}">
<meta name="twitter:description" content="${escapeHtml(metaDesc)}">
<meta name="twitter:image" content="https://winfulltime.com/winfulltimelogo.png">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#ff2448">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/app.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  "name": "${escapeHtml(home)} vs ${escapeHtml(away)} Head to Head",
  "homeTeam": { "@type": "SportsTeam", "name": "${escapeHtml(home)}" },
  "awayTeam": { "@type": "SportsTeam", "name": "${escapeHtml(away)}" },
  "location": { "@type": "Place", "name": "${escapeHtml(country || league || 'Football Match')}" }
}
</script>
<script type="application/ld+json">
${generateH2hFaqSchema(home, away)}
</script>
<style>
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.matchup-header{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:32px}
.team-names{display:flex;justify-content:center;align-items:center;gap:24px;font-size:24px;font-weight:800;margin:16px 0}
.vs-badge{background:var(--accent);color:#fff;font-size:14px;padding:4px 12px;border-radius:20px}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:16px;color:var(--text-primary)}
.faq-list{display:flex;flex-direction:column;gap:8px}
.faq-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.faq-item summary{padding:16px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
.faq-item summary::after{content:'+';font-size:18px;font-weight:700;color:var(--accent)}
.faq-item[open] summary::after{content:'\\2212'}
.faq-item p{padding:0 20px 16px;font-size:14px;line-height:1.6;color:var(--text-secondary);margin:0}
</style>
</head>
<body>
<div>
<header>
<div class="header-content">
<div class="logo"><a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a></div>
<button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
<nav id="nav">
<a href="/">Home</a>
<a href="/ticket-builder.html">Ticket Builder</a>
<a href="/best-picks.html">Best Picks</a>
<a href="/author-picks.html">Author Picks</a>
<a href="/blog/">Blog</a>
</nav>
</div>
</header>
<main class="container">
<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/">Home</a><span>/</span>
  <a href="/predictions/1x2">Predictions</a><span>/</span>
  <span aria-current="page">${escapeHtml(home)} vs ${escapeHtml(away)} H2H</span>
</nav>

<div class="matchup-header">
  <div style="font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;font-weight:600;">Head to Head Statistics</div>
  <h1 class="team-names" style="margin:0;">
    <div>${escapeHtml(home)}</div>
    <div class="vs-badge">VS</div>
    <div>${escapeHtml(away)}</div>
  </h1>
  <p style="color:var(--text-secondary);margin:0;font-size:14px;">${escapeHtml(league || 'Football')} ${country ? `(${escapeHtml(country)})` : ''}</p>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Active Streaks &amp; H2H Performance</h2>
<div class="streaks-list" style="margin-bottom:32px;">
  ${streakItemsHtml}
</div>

<section class="seo-content">
<h2>About ${escapeHtml(home)} vs ${escapeHtml(away)} Matchup</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
This head-to-head page tracks historic statistics, unbeaten streaks, and competitive performance trends between ${escapeHtml(home)} and ${escapeHtml(away)}. Our statistical model processes team records to identify value betting opportunities across match outcome (1X2), goal lines, and team form indicators.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>What is the head-to-head record between ${escapeHtml(home)} and ${escapeHtml(away)}?</summary>
    <p>Head-to-head performance tracks historical wins, draws, scoring averages, and active unbeaten streaks between ${escapeHtml(home)} and ${escapeHtml(away)} across recent competitive meetings.</p>
  </details>
  <details class="faq-item">
    <summary>Where can I view match analysis for ${escapeHtml(home)} vs ${escapeHtml(away)}?</summary>
    <p>WinFulltime provides match predictions, probability metrics, team form, and head-to-head statistics for ${escapeHtml(home)} vs ${escapeHtml(away)} fixtures.</p>
  </details>
  <details class="faq-item">
    <summary>Which team has the stronger form between ${escapeHtml(home)} and ${escapeHtml(away)}?</summary>
    <p>Form analysis combines recent league results, goal scoring rates, defensive clean sheets, and venue performance (home vs away) to calculate overall win probability.</p>
  </details>
</div>
</section>
</main>
<footer>
<div class="footer-content">
<p style="text-align:center;color:var(--text-secondary);font-size:13px;">&copy; ${new Date().getFullYear()} WinFulltime. All rights reserved.</p>
</div>
</footer>
</div>
</body>
</html>`;
}

function main() {
  const matchupsMap = new Map();

  // Load from H2H cache file
  if (fs.existsSync(H2H_CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(H2H_CACHE_FILE, 'utf8');
      const h2hData = JSON.parse(raw);
      const datesObj = h2hData.dates || {};

      Object.keys(datesObj).forEach(dateKey => {
        const matchesArr = datesObj[dateKey] || [];
        matchesArr.forEach(m => {
          const home = (m.home || '').trim();
          const away = (m.away || '').trim();
          const slug = matchupSlug(home, away);
          if (!slug) return;

          if (!matchupsMap.has(slug)) {
            matchupsMap.set(slug, {
              home,
              away,
              slug,
              streaks: m.streaks || [],
              league: m.league || '',
              country: m.country || ''
            });
          }
        });
      });
    } catch (e) {
      console.warn('[h2h-pages] Failed to read H2H cache:', e.message);
    }
  }

  // Load from predictions cache file as well
  if (fs.existsSync(PREDICTIONS_FILE)) {
    try {
      const raw = fs.readFileSync(PREDICTIONS_FILE, 'utf8');
      const predData = JSON.parse(raw);
      const matchesArr = predData.matches || [];

      matchesArr.forEach(m => {
        const home = (m.home || (m.match ? m.match.split('-')[0] : '')).trim();
        const away = (m.away || (m.match ? m.match.split('-')[1] : '')).trim();
        const slug = matchupSlug(home, away);
        if (!slug) return;

        if (!matchupsMap.has(slug)) {
          matchupsMap.set(slug, {
            home,
            away,
            slug,
            streaks: [],
            league: m.league || '',
            country: m.country || ''
          });
        }
      });
    } catch (e) {
      console.warn('[h2h-pages] Failed to read predictions cache:', e.message);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let generated = 0;

  matchupsMap.forEach(item => {
    const pageHtml = generateH2hPage(item.home, item.away, item.slug, item.streaks, item.league, item.country);
    const dir = path.join(OUTPUT_DIR, item.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml);
    generated++;
  });

  console.log(`[h2h-pages] Prerendered ${generated} Evergreen H2H Pages under ${OUTPUT_DIR}`);
}

if (require.main === module) main();

module.exports = { main, matchupSlug };
