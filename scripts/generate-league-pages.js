'use strict';

const fs = require('fs');
const path = require('path');
const { CHIPS_CSS, FAQ_CSS, faqsList, chipsSection, renderHead, collectionPageSchema } = require('./lib/seo-blocks');

const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions', 'league');

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
  // Remove common noisy prefixes/suffixes
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

// Matches the slug flavour used by the analysis page generator (build-analysis.js),
// which strips fc/ac/cf prefixes ("AC Milan" => "milan"). Only used to resolve
// analysis-page links so they match the directories that actually exist.
function analysisSlugifyTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('(')[0]
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/\b(?:fc|afc|cf|sc|ac)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function analysisMatchupSlug(home, away) {
  const h = analysisSlugifyTeam(home);
  const a = analysisSlugifyTeam(away);
  if (!h || !a) return '';
  return h + '-vs-' + a;
}

function listDirSlugs(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs.readdirSync(dir).filter(entry => {
      try {
        return fs.statSync(path.join(dir, entry)).isDirectory();
      } catch (e) {
        return false;
      }
    })
  );
}

const AFFILIATE_URL = 'https://one-vv6198.com/betting?open=register&p=f61e';

const MARKET_LABELS = {
  '1x2': '1X2',
  'over-1-5': 'Over 1.5',
  'over-2-5': 'Over 2.5',
  'btts': 'BTTS Yes',
  'btts-no': 'BTTS No',
  'corners': 'Corners',
  'cards': 'Cards'
};

const MARKET_DATA_KEYS = {
  '1x2': 'matches',
  'over-1-5': 'over15Matches',
  'over-2-5': 'over25Matches',
  'btts': 'bttsMatches',
  'btts-no': 'bttsNoMatches',
  'corners': 'cornersMatches',
  'cards': 'cardsMatches'
};

function matchupSlug(home, away) {
  const h = slugifyTeam(home);
  const a = slugifyTeam(away);
  if (!h || !a) return '';
  return h + '-vs-' + a;
}

function leagueFaqs(leagueName) {
  return [
    {
      q: `How accurate are WinFulltime ${leagueName} predictions?`,
      a: `Our statistical model analyzes team form, head-to-head records, home/away performance, and match context for ${leagueName} fixtures. Probability percentages indicate relative confidence levels across 1X2, Over 2.5, BTTS, and corner markets.`
    },
    {
      q: `When are ${leagueName} predictions updated?`,
      a: `Predictions are updated daily. Primary updates run at 1:00 AM WAT with a secondary refresh at 6:00 AM WAT to capture late lineup changes and scheduled fixtures.`
    },
    {
      q: `Which markets are covered for ${leagueName}?`,
      a: `We cover 1X2 match result (Home/Draw/Away), Over 1.5 & Over 2.5 Goals, Both Teams to Score (BTTS Yes/No), Corners, and Yellow Cards for all listed ${leagueName} matches.`
    },
    {
      q: `Can I use ${leagueName} picks in accumulator bets?`,
      a: `Yes. ${leagueName} picks with 75%+ probability make strong accumulator legs. Use our Ticket Builder tool to automatically combine market picks into optimized tickets.`
    }
  ];
}

function generateLeagueFaqSchema(leagueName) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: leagueFaqs(leagueName).map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  }, null, 2);
}

function renderMatchCard(m, analysisUrls) {
  const home = escapeHtml(m.home || (m.match ? m.match.split('-')[0] : 'Home'));
  const away = escapeHtml(m.away || (m.match ? m.match.split('-')[1] : 'Away'));
  const time = escapeHtml(m.time || 'TBD');
  const tip = escapeHtml(m.tip || '1X2');
  const prob = m.probability || (m.probabilities ? Math.max(...Object.values(m.probabilities)) : null);
  const dateStr = m.date || new Date().toISOString().slice(0, 10);

  const homeRaw = (m.home || (m.match ? m.match.split('-')[0] : '') || '').trim();
  const awayRaw = (m.away || (m.match ? m.match.split('-')[1] : '') || '').trim();
  const slug = homeRaw && awayRaw ? analysisMatchupSlug(homeRaw, awayRaw) : '';
  const analysisKey = slug ? `${dateStr}/${slug}` : '';
  const analysisUrl = analysisKey && analysisUrls && analysisUrls.has(analysisKey) ? `/analysis/${analysisKey}/` : '';

  return `
  <div class="match-card fade-in" data-tip="${tip}" data-home="${escapeHtml(homeRaw)}" data-away="${escapeHtml(awayRaw)}">
    <div class="match-header">
      <span>${escapeHtml(m.country || m.league || '')}</span>
      <span>${time}</span>
    </div>
    <div class="match-teams">
      <span class="team team-home">${home}</span>
      <span class="vs-score">vs</span>
      <span class="team team-away">${away}</span>
    </div>
    <div class="match-footer">
      <div style="text-align:center;display:flex;flex-direction:column;align-items:center;">
        <span class="tip-badge">${tip}</span>
        ${prob ? `<div class="probability">${prob}%</div>` : ''}
      </div>
    </div>
    ${analysisUrl ? `<div style="text-align:center;margin-top:6px;"><a href="${analysisUrl}" class="analysis-btn" style="color:var(--accent);font-size:12px;font-weight:600;text-decoration:none;">View Analysis &rarr;</a></div>` : ''}
    <div style="text-align:center;margin-top:8px;"><a href="${AFFILIATE_URL}" target="_blank" rel="noopener nofollow sponsored" class="wft-1xbet-cta" data-tip="${tip}" style="display:inline-block;text-align:center;background:rgba(255,36,72,0.10);color:#fff;padding:4px 12px;border-radius:6px;text-decoration:none;font-weight:600;font-size:12px;margin-top:8px;border:1px solid rgba(255,36,72,0.25);">Bet on 1win<span class="wft-1xbet-odds" style="opacity:0.85;font-weight:600;"></span> &rarr;</a></div>
  </div>`;
}

function generateLeaguePage(leagueName, leagueSlug, matches, ctx) {
  const count = matches.length;
  const canonicalUrl = `https://winfulltime.com/predictions/league/${leagueSlug}/`;
  const metaTitle = `${leagueName} Predictions Today & Betting Tips | WinFulltime`;
  const metaDesc = `Free ${leagueName} football predictions for today. Data-driven 1X2, Over 2.5 goals, BTTS, and corner betting tips for ${leagueName}.`;

  const MAX_CARDS = 200;
  const matchCardsHtml = matches.slice(0, MAX_CARDS).map(m => renderMatchCard(m, ctx && ctx.analysisUrls)).join('\n');
  const truncatedNote = matches.length > MAX_CARDS
    ? `<p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">Showing the first ${MAX_CARDS} of ${matches.length} ${leagueName} fixtures for today.</p>`
    : '';

  const marketLinks = (ctx && ctx.markets && ctx.markets.length)
    ? ctx.markets.map(mSlug => {
        const label = MARKET_LABELS[mSlug] || mSlug;
        return `<a href="/predictions/${leagueSlug}/${mSlug}/" class="chip-link">${escapeHtml(leagueName)} ${escapeHtml(label)}</a>`;
      }).join('\n        ')
    : '';
  const categoryLinks = (ctx && ctx.markets && ctx.markets.length)
    ? ctx.markets.map(mSlug => {
        const label = MARKET_LABELS[mSlug] || mSlug;
        return `<a href="/predictions/${mSlug}" class="chip-link">${escapeHtml(label)} Predictions</a>`;
      }).join('\n        ')
    : '';
  const relatedMarketsHtml = chipsSection({
    heading: `Explore ${escapeHtml(leagueName)} Markets`,
    intro: `Browse today's ${escapeHtml(leagueName)} predictions across every market, or jump to the main market pages for a full breakdown.`,
    chips: [marketLinks, categoryLinks].filter(Boolean).join('\n  ')
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: metaTitle, description: metaDesc, keywords: `${leagueName} predictions, ${leagueName} tips today, ${leagueName} betting picks, soccer predictions`, canonicalUrl, twitterUrl: canonicalUrl })}
<script type="application/ld+json">
${collectionPageSchema({ name: `${leagueName} Football Predictions Today`, description: metaDesc, url: canonicalUrl })}
</script>
<script type="application/ld+json">
${generateLeagueFaqSchema(leagueName)}
</script>
<style>
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.league-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:24px 0 32px}
.league-stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.league-stat-val{font-size:24px;font-weight:800;color:var(--accent)}
.league-stat-lbl{font-size:12px;color:var(--text-secondary);margin-top:4px}
.matches-grid{margin-top:24px}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:16px;color:var(--text-primary)}
${FAQ_CSS}
${CHIPS_CSS}
</style>
<script async src="https://news.google.com/swg/js/v1/publisher.js"></script>
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
<a href="/author-picks.html">H2H Picks</a>
<a href="/blog/">Blog</a>
</nav>
</div>
</header>
<main class="container">
<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/">Home</a><span>/</span>
  <a href="/predictions/1x2">Predictions</a><span>/</span>
  <span aria-current="page">${escapeHtml(leagueName)}</span>
</nav>

<div class="hero">
<h1>${escapeHtml(leagueName)}<br>Predictions Today</h1>
<p class="hero-date">Free Data-Driven Football Betting Tips &amp; Match Analysis</p>
</div>

<div class="league-stats-grid">
  <div class="league-stat-card">
    <div class="league-stat-val">${count}</div>
    <div class="league-stat-lbl">Active Matches</div>
  </div>
  <div class="league-stat-card">
    <div class="league-stat-val">100%</div>
    <div class="league-stat-lbl">Free Coverage</div>
  </div>
  <div class="league-stat-card">
    <div class="league-stat-val">Data Driven</div>
    <div class="league-stat-lbl">Analysis Model</div>
  </div>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Today's ${escapeHtml(leagueName)} Matches</h2>
<div class="matches-grid">
  ${matchCardsHtml || '<p style="color:var(--text-secondary);">No active matches scheduled for this league today. Check back during matchday.</p>'}
</div>
${truncatedNote}

${relatedMarketsHtml}

<section class="seo-content">
<h2>About ${escapeHtml(leagueName)} Predictions</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
Our statistical algorithm evaluates upcoming ${escapeHtml(leagueName)} matches using comprehensive models. We process team form, offensive and defensive efficiency metrics, head-to-head records, and home/away performance variances to generate probability scores across 1X2, Over 2.5, BTTS, and corner markets.
</p>

<h2>Frequently Asked Questions</h2>
${faqsList(leagueFaqs(leagueName))}
</section>
</main>
<footer>
<div class="footer-content">
<p style="text-align:center;color:var(--text-secondary);font-size:13px;">&copy; ${new Date().getFullYear()} WinFulltime. All rights reserved.</p>
</div>
</footer>
<script src="/1xbet-odds-widget.js" defer></script>
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

  const allMatches = []
    .concat(data.matches || [])
    .concat(data.over25Matches || [])
    .concat(data.over15Matches || [])
    .concat(data.bttsMatches || [])
    .concat(data.bttsNoMatches || [])
    .concat(data.cornersMatches || [])
    .concat(data.cardsMatches || []);

  const leaguesMap = new Map();

  allMatches.forEach(m => {
    const rawLeague = (m.league || 'Other Leagues').trim();
    const slug = slugifyLeague(rawLeague);
    if (!slug) return;

    if (!leaguesMap.has(slug)) {
      leaguesMap.set(slug, {
        name: rawLeague,
        slug: slug,
        matches: []
      });
    }

    const entry = leaguesMap.get(slug);
    const home = (m.home || (m.match ? m.match.split('-')[0] : '')).trim();
    const away = (m.away || (m.match ? m.match.split('-')[1] : '')).trim();
    const key = (home + '|' + away).toLowerCase();

    if (!entry.matches.some(x => ((x.home || '').toLowerCase() + '|' + (x.away || '').toLowerCase()) === key)) {
      entry.matches.push(m);
    }
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let generated = 0;

  const analysisUrls = new Set();
  const analysisRoot = path.join(__dirname, '..', 'public', 'analysis');
  if (fs.existsSync(analysisRoot)) {
    fs.readdirSync(analysisRoot).forEach(dateSlug => {
      const datePath = path.join(analysisRoot, dateSlug);
      if (!fs.statSync(datePath).isDirectory()) return;
      fs.readdirSync(datePath).forEach(matchupSlugDir => {
        const mp = path.join(datePath, matchupSlugDir);
        if (fs.statSync(mp).isDirectory()) analysisUrls.add(`${dateSlug}/${matchupSlugDir}`);
      });
    });
  }

  const leagueMarkets = new Map();
  Object.keys(MARKET_DATA_KEYS).forEach(marketSlug => {
    const matchesList = data[MARKET_DATA_KEYS[marketSlug]] || [];
    matchesList.forEach(m => {
      const leagueSlug = slugifyLeague((m.league || 'Other Leagues').trim());
      if (!leagueSlug) return;
      if (!leagueMarkets.has(leagueSlug)) leagueMarkets.set(leagueSlug, []);
      if (!leagueMarkets.get(leagueSlug).includes(marketSlug)) leagueMarkets.get(leagueSlug).push(marketSlug);
    });
  });

  leaguesMap.forEach(league => {
    if (league.matches.length === 0) return;
    const pageHtml = generateLeaguePage(league.name, league.slug, league.matches, {
      analysisUrls,
      markets: leagueMarkets.get(league.slug) || []
    });
    const dir = path.join(OUTPUT_DIR, league.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml);
    generated++;
  });

  let retained = 0;
  fs.readdirSync(OUTPUT_DIR).forEach(slug => {
    const dirPath = path.join(OUTPUT_DIR, slug);
    if (!fs.statSync(dirPath).isDirectory()) return;
    if (leaguesMap.has(slug)) return;
    if (fs.existsSync(path.join(dirPath, 'index.html'))) retained++;
  });
  if (retained) console.log(`[league-pages] Retained ${retained} previously published league hub directories`);

  console.log(`[league-pages] Prerendered ${generated} League Hub Pages under ${OUTPUT_DIR}`);

  try { require('./update-sitemap').main(); } catch (e) { console.error('[league-pages] Sitemap refresh failed:', e.message); }
}

if (require.main === module) main();

module.exports = { main, slugifyLeague };
