'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml, generateFaqSchema, wrapPage } = require('./lib/layout');

const RESULTS_FILE = path.join(__dirname, '..', 'results-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions', 'date');

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
    const won = r.status === 'WON' || r.win === true;
    if (won) wonCount++;

    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.league || 'Football')}</span>
        <span style="background:${won ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};color:${won ? '#22c55e' : '#ef4444'};padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;">
          ${won ? '\u2713 WON' : '\u2718 SETTLED'}
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

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Football Predictions & Results for ${dateTitle}`,
    description: metaDesc,
    url: canonicalUrl
  }, null, 2);

  const faqJson = generateFaqSchema([
    {
      q: `What was the accuracy hit rate for football predictions on ${dateTitle}?`,
      a: `WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${dateTitle} is settled against official scores. The recorded hit rate for this date is ${winRate}% across ${totalCount} matches.`
    },
    {
      q: 'Are past prediction results verified on WinFulltime?',
      a: 'Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently. Each result card shows the final score and whether the prediction won or lost.'
    }
  ]);

  const pageCss = `.stats-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:24px 0 32px}
.stat-box{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stat-num{font-size:24px;font-weight:800;color:var(--accent)}
.stat-txt{font-size:12px;color:var(--text-secondary);margin-top:4px}`;

  const body = `
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
WinFulltime maintains a transparent, permanent archive of all football prediction outcomes. Predictions published prior to kick-off are automatically settled against final full-time scores to ensure complete accountability and performance tracking. This page provides a complete ${totalCount}-match ledger for ${escapeHtml(dateTitle)}.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>What was the accuracy hit rate for football predictions on ${escapeHtml(dateTitle)}?</summary>
    <p>WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${escapeHtml(dateTitle)} is settled against official scores. The recorded hit rate for this date is ${winRate}% across ${totalCount} matches.</p>
  </details>
  <details class="faq-item">
    <summary>Are past prediction results verified on WinFulltime?</summary>
    <p>Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently. Each result card shows the final score and whether the prediction won or lost.</p>
  </details>
</div>
</section>`;

  return wrapPage({
    title: metaTitle,
    description: metaDesc,
    keywords: `football predictions ${dateStr}, betting results ${dateStr}, prediction track record, ${dateTitle} football tips`,
    canonicalUrl,
    schemaJson,
    pageCss,
    breadcrumbs: [
      { href: '/', label: 'Home' },
      { label: dateTitle }
    ],
    body
  });
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
