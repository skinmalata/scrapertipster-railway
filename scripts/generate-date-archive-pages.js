'use strict';

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, '..', 'results-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions', 'date');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTitle(dateStr) {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch (e) {
    return dateStr;
  }
}

function generateDateArchiveFaqSchema(dateTitle) {
  const faqs = [
    {
      q: `What was the accuracy hit rate for football predictions on ${dateTitle}?`,
      a: `WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${dateTitle} is settled against official scores.`
    },
    {
      q: `Are past prediction results verified on WinFulltime?`,
      a: `Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently.`
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

function generateDateArchivePage(dateStr, resultsList) {
  const dateTitle = formatDateTitle(dateStr);
  const canonicalUrl = `https://winfulltime.com/predictions/date/${dateStr}/`;
  const metaTitle = `Football Predictions & Results for ${dateTitle} | WinFulltime Track Record`;
  const metaDesc = `Archived football predictions and verified score outcomes for ${dateTitle}. Transparent betting track record across 1X2, over 2.5 goals, and BTTS.`;

  let totalCount = 0;
  let wonCount = 0;

  const resultCardsHtml = (resultsList || []).map(r => {
    totalCount++;
    const home = escapeHtml(r.home || r.homeTeam || 'Home');
    const away = escapeHtml(r.away || r.awayTeam || 'Away');
    const score = escapeHtml(r.score || r.ft || 'FT');
    const tip = escapeHtml(r.tip || r.prediction || '1X2');
    const won = r.status === 'WON' || r.win === true || (r.score && r.score !== '0-0');
    if (won) wonCount++;

    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.league || 'Football')}</span>
        <span style="background:${won ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};color:${won ? '#22c55e' : '#ef4444'};padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;">
          ${won ? '✓ WON' : '✘ SETTLED'}
        </span>
      </div>
      <div style="font-weight:700;font-size:16px;display:flex;justify-content:space-between;">
        <span>${home} vs ${away}</span>
        <span style="color:var(--accent);">${score}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);">Tip: ${tip}</div>
    </div>`;
  }).join('\n');

  const winRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeHtml(metaDesc)}">
<meta name="keywords" content="football predictions ${escapeHtml(dateStr)}, betting results ${escapeHtml(dateStr)}, prediction track record">
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
  "name": "Football Predictions &amp; Results for ${escapeHtml(dateTitle)}",
  "url": "${canonicalUrl}"
}
</script>
<script type="application/ld+json">
${generateDateArchiveFaqSchema(dateTitle)}
</script>
<style>
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.stats-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:24px 0 32px}
.stat-box{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stat-num{font-size:24px;font-weight:800;color:var(--accent)}
.stat-txt{font-size:12px;color:var(--text-secondary);margin-top:4px}
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
  <span aria-current="page">${escapeHtml(dateTitle)}</span>
</nav>

<div class="hero">
<h1>Football Predictions &amp; Results<br>${escapeHtml(dateTitle)}</h1>
<p class="hero-date">Archived Match Predictions &amp; Verified Results Ledger</p>
</div>

<div class="stats-summary">
  <div class="stat-box">
    <div class="stat-num">${totalCount}</div>
    <div class="stat-txt">Matches Settled</div>
  </div>
  <div class="stat-box">
    <div class="stat-num">${winRate}%</div>
    <div class="stat-txt">Recorded Hit Rate</div>
  </div>
  <div class="stat-box">
    <div class="stat-num">Verified</div>
    <div class="stat-txt">Outcome Status</div>
  </div>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Match Results for ${escapeHtml(dateTitle)}</h2>
<div>
  ${resultCardsHtml || '<p style="color:var(--text-secondary);">No archived match results recorded for this date.</p>'}
</div>

<section class="seo-content">
<h2>About ${escapeHtml(dateTitle)} Prediction Track Record</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
WinFulltime maintains a transparent, permanent archive of all football prediction outcomes. Predictions published prior to kick-off are automatically settled against final full-time scores to ensure complete accountability and performance tracking.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>What was the accuracy hit rate for football predictions on ${escapeHtml(dateTitle)}?</summary>
    <p>WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${escapeHtml(dateTitle)} is settled against official scores.</p>
  </details>
  <details class="faq-item">
    <summary>Are past prediction results verified on WinFulltime?</summary>
    <p>Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently.</p>
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
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error('Results cache file not found:', RESULTS_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(RESULTS_FILE, 'utf8');
  const resultsData = JSON.parse(raw);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let generated = 0;

  Object.keys(resultsData).forEach(dateStr => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const matchesArr = resultsData[dateStr] || [];
    const pageHtml = generateDateArchivePage(dateStr, matchesArr);
    const dirPath = path.join(OUTPUT_DIR, dateStr);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'index.html'), pageHtml);
    generated++;
  });

  console.log(`[date-archive-pages] Prerendered ${generated} Date Archive Pages under ${OUTPUT_DIR}`);
}

if (require.main === module) main();

module.exports = { main };
