'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml, slugifyTeam, generateFaqSchema, wrapPage } = require('./lib/layout');

const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions');
const LEAGUE_OUTPUT_DIR = path.join(__dirname, '..', 'public', 'predictions', 'league');
const ANALYSIS_OUTPUT_DIR = path.join(__dirname, '..', 'public', 'analysis');
const TEAMS_OUTPUT_DIR = path.join(__dirname, '..', 'public', 'teams');

function listAnalysisUrls() {
  const urls = new Set();
  try {
    if (fs.existsSync(ANALYSIS_OUTPUT_DIR)) {
      fs.readdirSync(ANALYSIS_OUTPUT_DIR).forEach(dateSlug => {
        const datePath = path.join(ANALYSIS_OUTPUT_DIR, dateSlug);
        if (!fs.statSync(datePath).isDirectory()) return;
        fs.readdirSync(datePath).forEach(matchupSlugDir => {
          const mp = path.join(datePath, matchupSlugDir);
          if (fs.statSync(mp).isDirectory()) urls.add(`${dateSlug}/${matchupSlugDir}`);
        });
      });
    }
  } catch (e) {}
  return urls;
}

const MARKETS = {
  '1x2': { label: '1X2 Result', dataKey: 'matches', heading: '1X2 Predictions', desc: 'match outcome' },
  'over-1-5': { label: 'Over 1.5 Goals', dataKey: 'over15Matches', heading: 'Over 1.5 Goals Predictions', desc: 'at least two goals' },
  'over-2-5': { label: 'Over 2.5 Goals', dataKey: 'over25Matches', heading: 'Over 2.5 Goals Predictions', desc: 'three or more goals' },
  'btts': { label: 'BTTS Yes', dataKey: 'bttsMatches', heading: 'Both Teams to Score Predictions', desc: 'both teams scoring' },
  'btts-no': { label: 'BTTS No', dataKey: 'bttsNoMatches', heading: 'BTTS No Predictions', desc: 'at least one team failing to score' },
  'corners': { label: 'Corners', dataKey: 'cornersMatches', heading: 'Corner Kick Predictions', desc: 'corner kick totals' },
  'cards': { label: 'Cards & Bookings', dataKey: 'cardsMatches', heading: 'Cards & Bookings Predictions', desc: 'yellow and red card bookings' }
};

function listDirSlugs(dir) {
  const set = new Set();
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(entry => {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) set.add(entry);
      });
    }
  } catch (e) {}
  return set;
}

function slugifyLeague(name) {
  if (!name) return 'other-league';
  let s = String(name).toLowerCase().trim();
  s = s.replace(/^[\w]+\s*-\s*/i, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'other-league';
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

function renderMatchCard(m, leagueSlug, analysisUrls, teamSlugs) {
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
  const homeTeamSlug = slugifyTeam(homeRaw);
  const awayTeamSlug = slugifyTeam(awayRaw);

  return `
  <div class="match-card" data-tip="${tip}">
    <div class="match-header">
      <span class="match-time">\u23f1 ${time}</span>
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
      <div style="display:flex;gap:12px;align-items:center;">
        ${homeTeamSlug && teamSlugs && teamSlugs.has(homeTeamSlug) ? `<a href="/teams/${homeTeamSlug}/" style="color:var(--text-secondary);font-size:11px;text-decoration:none;">${home}</a>` : ''}
        ${awayTeamSlug && teamSlugs && teamSlugs.has(awayTeamSlug) ? `<a href="/teams/${awayTeamSlug}/" style="color:var(--text-secondary);font-size:11px;text-decoration:none;">${away}</a>` : ''}
        ${analysisUrl ? `<a href="${analysisUrl}" class="analysis-btn" style="color:var(--accent);font-size:12px;font-weight:600;text-decoration:none;">Analysis &rarr;</a>` : ''}
      </div>
    </div>
  </div>`;
}

function generateMatrixPage(leagueName, leagueSlug, marketSlug, marketConfig, matches, existingMarkets, leagueHubExists, analysisUrls, teamSlugs) {
  const count = matches.length;
  const canonicalUrl = `https://winfulltime.com/predictions/${leagueSlug}/${marketSlug}/`;
  const metaTitle = `${leagueName} ${marketConfig.label} Predictions Today | WinFulltime`;
  const metaDesc = `Statistical ${leagueName} ${marketConfig.label.toLowerCase()} predictions with probability scores. Free ${marketConfig.desc} tips, form analysis, and match previews updated daily for ${leagueName}.`;

  const matchCardsHtml = matches.map(m => renderMatchCard(m, leagueSlug, analysisUrls, teamSlugs)).join('\n');

  const relatedLinks = [];
  if (leagueHubExists) relatedLinks.push(`<a href="/predictions/league/${leagueSlug}/">${escapeHtml(leagueName)} Hub</a>`);
  Object.keys(MARKETS)
    .filter(s => s !== marketSlug && existingMarkets && existingMarkets.has(s))
    .forEach(s => relatedLinks.push(`<a href="/predictions/${leagueSlug}/${s}/">${MARKETS[s].label}</a>`));

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${leagueName} ${marketConfig.label} Predictions`,
    description: metaDesc,
    url: canonicalUrl,
    publisher: {
      '@type': 'Organization',
      name: 'WinFulltime',
      logo: { '@type': 'ImageObject', url: 'https://winfulltime.com/winfulltimelogo.png' }
    }
  }, null, 2);

  const faqJson = generateFaqSchema([
    {
      q: `How does WinFulltime generate ${leagueName} ${marketConfig.label} predictions?`,
      a: `Our algorithm analyzes ${leagueName} team form, scoring patterns, defensive records, head-to-head matchups, and home/away splits to calculate probability scores specifically for the ${marketConfig.label.toLowerCase()} market.`
    },
    {
      q: `What ${leagueName} fixtures are covered in today's ${marketConfig.label} predictions?`,
      a: `We cover all scheduled ${leagueName} matches with our ${marketConfig.label.toLowerCase()} prediction model. Each pick includes a confidence percentage, recommended stake, and supporting form data.`
    },
    {
      q: `Can I combine ${leagueName} ${marketConfig.label} picks with other markets?`,
      a: `Yes. Our ${marketConfig.label.toLowerCase()} picks for ${leagueName} pair well with other market predictions. Use the Ticket Builder to combine selections from 1X2, Over 2.5, BTTS, and corners into optimized accumulators.`
    }
  ]);

  const pageCss = `.matches-grid{margin-top:24px}`;

  const body = `
<div class="hero">
<h1>${escapeHtml(leagueName)}<br>${escapeHtml(marketConfig.heading)} Today</h1>
<p class="hero-date">${count} Active Match Pick${count !== 1 ? 's' : ''} Available Today</p>
</div>

<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Today's ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} Picks</h2>
<div class="matches-grid">
  ${matchCardsHtml || `<p style="color:var(--text-secondary);">No ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label.toLowerCase())} matches scheduled today. Check back before kick-off for updated predictions.</p>`}
</div>

<div class="related-links">
  <span style="font-size:13px;font-weight:600;color:var(--text-secondary);align-self:center;">More ${escapeHtml(leagueName)} pages:</span>
  ${relatedLinks.join('\n    ')}
</div>

<section class="seo-content">
<h2>About ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} Predictions</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
Our prediction engine processes ${escapeHtml(leagueName)} fixture data specifically for the ${escapeHtml(marketConfig.label.toLowerCase())} market. We evaluate team scoring patterns, defensive vulnerabilities, recent form indicators, and historical ${escapeHtml(marketConfig.desc)} data to highlight high-confidence betting opportunities. Every ${escapeHtml(leagueName)} pick includes a probability score so you can assess risk before placing a bet.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>How does WinFulltime generate ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} predictions?</summary>
    <p>Our algorithm analyzes ${escapeHtml(leagueName)} team form, scoring patterns, defensive records, head-to-head matchups, and home/away splits to calculate probability scores specifically for the ${escapeHtml(marketConfig.label.toLowerCase())} market.</p>
  </details>
  <details class="faq-item">
    <summary>What ${escapeHtml(leagueName)} fixtures are covered in today's ${escapeHtml(marketConfig.label)} predictions?</summary>
    <p>We cover all scheduled ${escapeHtml(leagueName)} matches with our ${escapeHtml(marketConfig.label.toLowerCase())} prediction model. Each pick includes a confidence percentage, recommended stake, and supporting form data.</p>
  </details>
  <details class="faq-item">
    <summary>Can I combine ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} picks with other markets?</summary>
    <p>Yes. Our ${escapeHtml(marketConfig.label.toLowerCase())} picks for ${escapeHtml(leagueName)} pair well with other market predictions. Use the Ticket Builder to combine selections from 1X2, Over 2.5, BTTS, and corners into optimized accumulators.</p>
  </details>
</div>
</section>`;

  return wrapPage({
    title: metaTitle,
    description: metaDesc,
    keywords: `${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label)} predictions, ${escapeHtml(leagueName)} ${escapeHtml(marketConfig.label.toLowerCase())} tips, soccer betting`,
    canonicalUrl,
    schemaJson,
    pageCss,
    breadcrumbs: [
      { href: '/', label: 'Home' },
      ...(leagueHubExists ? [{ href: `/predictions/league/${leagueSlug}/`, label: leagueName }] : []),
      { label: marketConfig.label }
    ],
    body
  });
}

function main() {
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.error('Predictions cache file not found:', PREDICTIONS_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(PREDICTIONS_FILE, 'utf8');
  const data = JSON.parse(raw);

  const leagueMarkets = new Map();
  Object.keys(MARKETS).forEach(marketSlug => {
    const marketConfig = MARKETS[marketSlug];
    const matchesList = data[marketConfig.dataKey] || [];
    matchesList.forEach(m => {
      const rawLeague = (m.league || 'Other Leagues').trim();
      const leagueSlug = slugifyLeague(rawLeague);
      if (!leagueSlug) return;
      if (!leagueMarkets.has(leagueSlug)) leagueMarkets.set(leagueSlug, new Set());
      leagueMarkets.get(leagueSlug).add(marketSlug);
    });
  });
  const leagueHubSlugs = listDirSlugs(LEAGUE_OUTPUT_DIR);
  const analysisUrls = listAnalysisUrls();
  const teamSlugs = listDirSlugs(TEAMS_OUTPUT_DIR);

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
      const html = generateMatrixPage(
        leagueObj.name,
        leagueObj.slug,
        marketSlug,
        marketConfig,
        leagueObj.matches,
        leagueMarkets.get(leagueObj.slug) || new Set(),
        leagueHubSlugs.has(leagueObj.slug),
        analysisUrls,
        teamSlugs
      );
      const dirPath = path.join(OUTPUT_DIR, leagueObj.slug, marketSlug);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'index.html'), html);
      generated++;
    });
  });

  let retained = 0;
  if (fs.existsSync(OUTPUT_DIR)) {
    function indexExists(p) {
      return fs.existsSync(path.join(p, 'index.html'));
    }
    fs.readdirSync(OUTPUT_DIR).forEach(leagueSlug => {
      if (leagueSlug === 'league' || leagueSlug === 'date') return;
      const leaguePath = path.join(OUTPUT_DIR, leagueSlug);
      if (!fs.statSync(leaguePath).isDirectory()) return;
      let anyRetained = false;
      fs.readdirSync(leaguePath).forEach(marketSlug => {
        const marketPath = path.join(leaguePath, marketSlug);
        if (fs.existsSync(path.join(marketPath, '.redirect-stub'))) return;
        if (!fs.statSync(marketPath).isDirectory()) return;
        if (indexExists(marketPath)) {
          retained++;
          anyRetained = true;
        }
      });
      if (!leagueMarkets.has(leagueSlug) && indexExists(leaguePath)) {
        retained++;
        anyRetained = true;
      }
      if (anyRetained && indexExists(leaguePath)) {
        // league level dir has no own index (markets only); keep it as container
      }
    });
  }
  if (retained) console.log(`[matrix-pages] Retained ${retained} previously published matrix directories`);

  console.log(`[matrix-pages] Prerendered ${generated} Market x League Matrix Pages under ${OUTPUT_DIR}`);

  try { require('./update-sitemap').main(); } catch (e) { console.error('[matrix-pages] Sitemap refresh failed:', e.message); }
}

if (require.main === module) main();

module.exports = { main };
