'use strict';

const fs = require('fs');
const path = require('path');

const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions');

const MARKETS = {
  '1x2': { label: '1X2 Result', dataKey: 'matches', heading: '1X2 Predictions' },
  'over-1-5': { label: 'Over 1.5 Goals', dataKey: 'over15Matches', heading: 'Over 1.5 Goals Predictions' },
  'over-2-5': { label: 'Over 2.5 Goals', dataKey: 'over25Matches', heading: 'Over 2.5 Goals Predictions' },
  'btts': { label: 'BTTS Yes', dataKey: 'bttsMatches', heading: 'Both Teams to Score Predictions' },
  'btts-no': { label: 'BTTS No', dataKey: 'bttsNoMatches', heading: 'BTTS No Predictions' },
  'corners': { label: 'Corners', dataKey: 'cornersMatches', heading: 'Corner Kick Predictions' },
  'cards': { label: 'Cards & Bookings', dataKey: 'cardsMatches', heading: 'Cards & Bookings Predictions' }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyLeague(name) {
  if (!name) return 'other-league';
  let s = String(name).toLowerCase().trim();
  s = s.replace(/^(england|spain|italy|germany|france|netherlands|portugal|brazil|argentina|turkey)\s*-\s*/i, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'other-league';
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

function generateMatrixFaqSchema(leagueName, marketLabel) {
  const faqs = [
    {
      q: `How accurate are WinFulltime ${leagueName} ${marketLabel} predictions?`,
      a: `Our AI algorithm evaluates team form, goal averages, historical hit rates, and match context to calculate probability scores for ${leagueName} ${marketLabel} picks.`
    },
    {
      q: `When are ${leagueName} ${marketLabel} tips updated?`,
      a: `Predictions update daily at 1:00 AM WAT with a secondary refresh at 6:00 AM WAT to capture late squad news and scheduled ${leagueName} fixtures.`
    },
    {
      q: `Can I combine ${leagueName} ${marketLabel} picks in accumulators?`,
      a: `Yes. High-probability ${leagueName} ${marketLabel} picks are ideal accumulator legs. Use our Ticket Builder tool to build optimized bets.`
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

function renderMatchCard(m) {
  const home = escapeHtml(m.home || (m.match ? m.match.split('-')[0] : 'Home'));
  const away = escapeHtml(m.away || (m.match ? m.match.split('-')[1] : 'Away'));
  const time = escapeHtml(m.time || 'TBD');
  const tip = escapeHtml(m.tip || '1X2');
  const prob = m.probability || (m.probabilities ? Math.max(...Object.values(m.probabilities)) : null);
  const dateStr = m.date || new Date().toISOString().slice(0, 10);
  
  const slug = matchupSlug(m.home || '', m.away || '');
  const analysisUrl = slug ? `/analysis/${dateStr}/${slug}/` : '#';

  return `
  <div class="match-card" data-tip="${tip}">
    <div class="match-header">
      <span class="match-time">⏱ ${time}</span>
      <span class="match-country">${escapeHtml(m.country || m.league || 'Football')}</span>
    </div>
    <div class="match-teams">
      <div class="team home">${home}</div>
      <div class="vs">VS</div>
      <div class="team away">${away}</div>
    </div>
    <div class="match-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
      <div class="tip-badge" style="background:rgba(255,36,72,0.15);color:var(--accent);padding:4px 10px;border-radius:6px;font-weight:700;font-size:13px;">
        ${tip} ${prob ? `<span style="opacity:0.8;font-size:11px;">(${prob}%)</span>` : ''}
      </div>
      ${slug ? `<a href="${analysisUrl}" class="analysis-btn" style="color:var(--text-secondary);font-size:12px;font-weight:600;text-decoration:none;">View Analysis &rarr;</a>` : ''}
    </div>
  </div>`;
}

function generateMatrixPage(leagueName, leagueSlug, marketSlug, marketConfig, matches) {
  const count = matches.length;
  const canonicalUrl = `https://winfulltime.com/predictions/${leagueSlug}/${marketSlug}/`;
  const metaTitle = `${leagueName} ${marketConfig.label} Predictions Today | WinFulltime`;
  const metaDesc = `Free ${leagueName} ${marketConfig.label} football predictions for today. AI-powered ${marketConfig.label} tips and match analysis for ${leagueName}.`;

  const matchCardsHtml = matches.map(renderMatchCard).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeHtml(metaDesc)}">
<meta name="keywords" content="${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)}, ${escapeHtml(leagueName)} predictions, soccer betting tips">
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
  "@type": "CollectionPage",
  "name": "${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} Predictions",
  "description": "${escapeHtml(metaDesc)}",
  "url": "${canonicalUrl}",
  "publisher": {
    "@type": "Organization",
    "name": "WinFulltime",
    "logo": { "@type": "ImageObject", "url": "https://winfulltime.com/winfulltimelogo.png" }
  }
}
</script>
<script type="application/ld+json">
${generateMatrixFaqSchema(leagueName, marketConfig.label)}
</script>
<style>
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.matches-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:24px}
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
  <a href="/predictions/league/${leagueSlug}/">${escapeHtml(leagueName)}</a><span>/</span>
  <span aria-current="page">${escapeHtml(marketConfig.label)}</span>
</nav>

<div class="hero">
<h1>${escapeHtml(leagueName)}<br>${escapeHtml(marketConfig.heading)} Today</h1>
<p class="hero-date">${count} Active Match Picks Available Today</p>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Today's ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} Picks</h2>
<div class="matches-grid">
  ${matchCardsHtml || '<p style="color:var(--text-secondary);">No active matches scheduled for this specific market today.</p>'}
</div>

<section class="seo-content">
<h2>About ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} Predictions</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
Our AI algorithm evaluates upcoming ${escapeHtml(leagueName)} fixtures specifically for the ${escapeHtml(marketConfig.label)} market. We process team scoring patterns, defensive vulnerabilities, head-to-head history, and form indicators to highlight high-confidence betting opportunities.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>How accurate are WinFulltime ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} predictions?</summary>
    <p>Our AI algorithm evaluates team form, goal averages, historical hit rates, and match context to calculate probability scores for ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} picks.</p>
  </details>
  <details class="faq-item">
    <summary>When are ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} tips updated?</summary>
    <p>Predictions update daily at 1:00 AM WAT with a secondary refresh at 6:00 AM WAT to capture late squad news and scheduled ${escapeHtml(leagueName)} fixtures.</p>
  </details>
  <details class="faq-item">
    <summary>Can I combine ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} picks in accumulators?</summary>
    <p>Yes. High-probability ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} picks are ideal accumulator legs. Use our Ticket Builder tool to build optimized bets.</p>
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
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.error('Predictions cache file not found:', PREDICTIONS_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(PREDICTIONS_FILE, 'utf8');
  const data = JSON.parse(raw);

  let generated = 0;

  Object.keys(MARKETS).forEach(marketSlug => {
    const marketConfig = MARKETS[marketSlug];
    const matchesList = data[marketConfig.dataKey] || [];
    const leagueMap = new Map();

    matchesList.forEach(m => {
      const rawLeague = (m.league || 'Other Leagues').trim();
      const leagueSlug = slugifyLeague(rawLeague);
      if (!leagueSlug) return;

      if (!leagueMap.has(leagueSlug)) {
        leagueMap.set(leagueSlug, {
          name: rawLeague,
          slug: leagueSlug,
          matches: []
        });
      }

      const entry = leagueMap.get(leagueSlug);
      const home = (m.home || (m.match ? m.match.split('-')[0] : '')).trim();
      const away = (m.away || (m.match ? m.match.split('-')[1] : '')).trim();
      const key = (home + '|' + away).toLowerCase();

      if (!entry.matches.some(x => ((x.home || '').toLowerCase() + '|' + (x.away || '').toLowerCase()) === key)) {
        entry.matches.push(m);
      }
    });

    leagueMap.forEach(leagueObj => {
      if (leagueObj.matches.length === 0) return;
      const html = generateMatrixPage(leagueObj.name, leagueObj.slug, marketSlug, marketConfig, leagueObj.matches);
      const dirPath = path.join(OUTPUT_DIR, leagueObj.slug, marketSlug);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'index.html'), html);
      generated++;
    });
  });

  console.log(`[matrix-pages] Prerendered ${generated} Market x League Matrix Pages under ${OUTPUT_DIR}`);
}

if (require.main === module) main();

module.exports = { main };
