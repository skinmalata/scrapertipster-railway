'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml, generateFaqSchema, wrapPage } = require('./lib/layout');
const { readableLeagueLabel } = require('./league-labels');
const { CHIPS_CSS, chipsBlock, faqBlock } = require('./lib/seo-blocks');

const RESULTS_FILE = path.join(__dirname, '..', 'results-cache.json');
const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions', 'date');

const MARKET_LINKS = [
  { slug: '1x2', label: '1X2' },
  { slug: 'over-1-5', label: 'Over 1.5' },
  { slug: 'over-2-5', label: 'Over 2.5' },
  { slug: 'btts', label: 'BTTS Yes' },
  { slug: 'btts-no', label: 'BTTS No' },
  { slug: 'corners', label: 'Corners' },
  { slug: 'cards', label: 'Cards' },
  { slug: 'unbeaten', label: 'Unbeaten' },
  { slug: 'in-play', label: 'In Play' }
];

function listDirSlugs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(entry => {
    try {
      return fs.statSync(path.join(dir, entry)).isDirectory();
    } catch (e) {
      return false;
    }
  }).sort();
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

function normalizeTeam(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(fc|cd|club|cf|de|ac|as|sc|ss|us|sa|ec|cska|ts|sk|as|atk|atletico|athletic|sv|bv|rb|w)\s+/i, '')
    .replace(/\s+(fc|cd|club|cf|de|ac|as|sc|ss|us|sa|ec|cska|ts|sk)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchKey(home, away) {
  return `${normalizeTeam(home)}|${normalizeTeam(away)}`;
}

/** Build date -> normalized fixture key -> tip from predictions-cache */
function buildTipLookup() {
  const lookup = {};
  if (!fs.existsSync(PREDICTIONS_FILE)) return lookup;
  try {
    const preds = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
    const buckets = [
      preds.matches, preds.over15Matches, preds.over25Matches,
      preds.bttsMatches, preds.bttsNoMatches, preds.winstreakMatches,
      preds.losestreakMatches, preds.drawstreakMatches, preds.teamToScoreMatches,
      preds.teamToScore2PlusMatches, preds.cornersMatches, preds.cardsMatches
    ];
    for (const bucket of buckets) {
      if (!bucket) continue;
      for (const m of bucket) {
        if (!m || !m.match || !m.tip || !m.date) continue;
        const [home, away] = m.match.split(/\s+-\s+/);
        if (!home || !away) continue;
        const key = matchKey(home, away);
        if (!lookup[m.date]) lookup[m.date] = {};
        lookup[m.date][key] = m.tip;
      }
    }
  } catch (e) {
    console.error('[date-archive-pages] Failed to load predictions-cache for hit rate:', e.message);
  }
  return lookup;
}

/** Evaluate whether a tip won given final scores. Returns true/false/null (null = not evaluable). */
function evaluateTip(tip, homeGoals, awayGoals) {
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (isNaN(h) || isNaN(a)) return null;
  const t = String(tip || '').toUpperCase().trim();
  switch (t) {
    case '1': return h > a;
    case '2': return a > h;
    case 'X': return h === a;
    case '1X': return h >= a;
    case 'X2': return a >= h;
    case '12': return h !== a;
    case 'OVER 1.5': return (h + a) >= 2;
    case 'OVER 2.5': return (h + a) >= 3;
    case 'BTTS YES': return h >= 1 && a >= 1;
    case 'BTTS NO': return h < 1 || a < 1;
    default: return null;
  }
}

function generateDateArchivePage(dateStr, resultsList, ctx, tipsForDate) {
  const dateTitle = formatDateTitle(dateStr);
  const canonicalUrl = `https://winfulltime.com/predictions/date/${dateStr}/`;
  const metaTitle = `Football Predictions & Results for ${dateTitle} | WinFulltime Track Record`;
  const metaDesc = `Archived football predictions and verified score outcomes for ${dateTitle}. Transparent betting track record across 1X2, over 2.5 goals, and BTTS.`;

  const allMatches = resultsList || [];

  let totalCount = 0;
  let wonCount = 0;
  let settledCount = 0;
  let evaluatedCount = 0;

  const evaluatedMatches = allMatches.map(r => {
    const key = matchKey(r.home || r.homeTeam, r.away || r.awayTeam);
    const tip = (tipsForDate && tipsForDate[key]) ? tipsForDate[key] : (r.tip || r.prediction || '');
    const score = r.score || r.ft || '';
    const scoreMatch = typeof score === 'string' ? score.match(/(\d+)\s*[-:]\s*(\d+)/) : null;
    const homeGoals = r.homeGoals != null ? r.homeGoals : (scoreMatch ? parseInt(scoreMatch[1], 10) : null);
    const awayGoals = r.awayGoals != null ? r.awayGoals : (scoreMatch ? parseInt(scoreMatch[2], 10) : null);
    const settled = homeGoals != null && awayGoals != null;
    const result = settled ? evaluateTip(tip, homeGoals, awayGoals) : null;
    if (settled) settledCount++;
    if (result !== null) {
      evaluatedCount++;
      if (result) wonCount++;
    }
    return { ...r, tip, homeGoals, awayGoals, won: result };
  });

  totalCount = allMatches.length;

  const MAX_CARDS = 200;
  const cardsToShow = evaluatedMatches.slice(0, MAX_CARDS);
  const resultCardsHtml = cardsToShow.map(r => {
    const home = escapeHtml(r.home || r.homeTeam || 'Home');
    const away = escapeHtml(r.away || r.awayTeam || 'Away');
    const score = escapeHtml(r.score || r.ft || (r.homeGoals != null ? `${r.homeGoals} - ${r.awayGoals}` : 'FT'));
    const tip = escapeHtml(r.tip || '1X2');
    const won = r.won;

    let statusBadge;
    if (won === true) {
      statusBadge = `<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;">\u2713 WON</span>`;
    } else if (won === false) {
      statusBadge = `<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;">\u2718 LOST</span>`;
    } else {
      statusBadge = `<span style="background:rgba(148,163,184,0.12);color:#94a3b8;padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px;">SETTLED</span>`;
    }

    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.league || 'Football')}</span>
        ${statusBadge}
      </div>
      <div style="font-weight:700;font-size:16px;display:flex;justify-content:space-between;">
        <span>${home} vs ${away}</span>
        <span style="color:var(--accent);">${score}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);">Tip: ${tip}</div>
    </div>`;
  }).join('\n');

  const winRate = evaluatedCount > 0 ? Math.round((wonCount / evaluatedCount) * 100) : null;
  const hitRateDisplay = winRate !== null ? `${winRate}%` : 'N/A';
  const hitRateCopy = winRate !== null
    ? `The recorded hit rate for this date is ${winRate}% across ${evaluatedCount} evaluated prediction${evaluatedCount !== 1 ? 's' : ''}.`
    : `This archive lists ${settledCount} settled match result${settledCount !== 1 ? 's' : ''}; predictions published for this date are evaluated against final scores where both a pick and a score are available.`;

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
      a: `WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${dateTitle} is settled against official scores. ${hitRateCopy}`
    },
    {
      q: 'Are past prediction results verified on WinFulltime?',
      a: 'Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently. Each result card shows the final score and whether the prediction won, lost, or was recorded without an evaluable tip.'
    }
  ]);

  const pageCss = `.stats-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:24px 0 32px}
.stat-box{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stat-num{font-size:24px;font-weight:800;color:var(--accent)}
.stat-txt{font-size:12px;color:var(--text-secondary);margin-top:4px}
${CHIPS_CSS}`;

  const marketChips = MARKET_LINKS.map(l => `<a href="/predictions/${l.slug}" class="chip-link">${escapeHtml(l.label)} Predictions</a>`).join('\n        ');
  const leagueChips = (ctx && ctx.leagueSlugs && ctx.leagueSlugs.length)
    ? ctx.leagueSlugs.map(ls => `<a href="/predictions/league/${ls}/" class="chip-link">${escapeHtml(readableLeagueLabel(ls, ctx.leagueLabelBySlug))}</a>`).join('\n        ')
    : '';
  const relatedLinksHtml = `
<section class="seo-content">
${chipsBlock({
    heading: 'Explore Markets',
    intro: 'Browse today\'s live predictions across every market WinFulltime covers.',
    chips: marketChips
  })}
${leagueChips ? chipsBlock({
    heading: 'Browse Leagues',
    intro: 'Jump to today\'s fixtures for any league.',
    chips: leagueChips,
    h2Style: 'margin-top:32px;'
  }) : ''}
</section>`;

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
    <div class="stat-num">${hitRateDisplay}</div>
    <div class="stat-txt">Recorded Hit Rate</div>
  </div>
  <div class="stat-box">
    <div class="stat-num">${evaluatedCount}</div>
    <div class="stat-txt">Predictions Evaluated</div>
  </div>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Match Results for ${escapeHtml(dateTitle)}</h2>
<div>
  ${resultCardsHtml || '<p style="color:var(--text-secondary);">No archived match results recorded for this date.</p>'}
  ${evaluatedMatches.length > MAX_CARDS ? `<p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">Showing the first ${MAX_CARDS} of ${evaluatedMatches.length} settled matches for ${escapeHtml(dateTitle)}.</p>` : ''}
</div>

${relatedLinksHtml}

<section class="seo-content">
${faqBlock({
    heading: `About ${escapeHtml(dateTitle)} Prediction Track Record`,
    intro: `WinFulltime maintains a transparent, permanent archive of all football prediction outcomes. Predictions published prior to kick-off are automatically settled against final full-time scores to ensure complete accountability and performance tracking. This page provides a ${totalCount}-match ledger for ${escapeHtml(dateTitle)} with ${evaluatedCount} prediction${evaluatedCount !== 1 ? 's' : ''} evaluated against official results.`,
    introMarginBottom: 20
  })}
${faqBlock({
    heading: 'Frequently Asked Questions',
    faqs: [
      { q: `What was the accuracy hit rate for football predictions on ${escapeHtml(dateTitle)}?`, a: `WinFulltime publishes verified, transparent track records for all past match predictions. Every match result on ${escapeHtml(dateTitle)} is settled against official scores. ${hitRateCopy}` },
      { q: 'Are past prediction results verified on WinFulltime?', a: 'Yes. All prediction outcomes are automatically cross-referenced against post-match scores and archived permanently. Each result card shows the final score and whether the prediction won, lost, or was recorded without an evaluable tip.' }
    ]
  })}
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

  const leagueSlugs = listDirSlugs(path.join(__dirname, '..', 'public', 'predictions', 'league'));
  const ctx = { leagueSlugs, leagueLabelBySlug: require('./league-labels').buildLeagueLabelBySlug() };
  const tipLookup = buildTipLookup();

  Object.keys(resultsData).forEach(dateStr => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const raw = resultsData[dateStr] || {};
    const matchesArr = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([fixture, v]) => {
          const [home, away] = fixture.split(' - ');
          return { ...v, home, away, score: `${v.home}-${v.away}` };
        });
    const pageHtml = generateDateArchivePage(dateStr, matchesArr, ctx, tipLookup[dateStr] || {});
    const dirPath = path.join(OUTPUT_DIR, dateStr);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'index.html'), pageHtml);
    generated++;
  });

  let retained = 0;
  fs.readdirSync(OUTPUT_DIR).forEach(slug => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slug)) return;
    if (resultsData[slug]) return;
    if (fs.existsSync(path.join(OUTPUT_DIR, slug, 'index.html'))) retained++;
  });
  if (retained) console.log(`[date-archive-pages] Retained ${retained} previously published date archive directories`);

  console.log(`[date-archive-pages] Prerendered ${generated} Date Archive Pages under ${OUTPUT_DIR}`);

  try { require('./update-sitemap').main(); } catch (e) { console.error('[date-archive-pages] Sitemap refresh failed:', e.message); }
}

if (require.main === module) main();

module.exports = { main };
