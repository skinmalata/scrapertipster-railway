'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml, slugifyTeam, matchupSlug, generateFaqSchema, wrapPage } = require('./lib/layout');

const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const H2H_CACHE_FILE = path.join(__dirname, '..', 'h2h-unbeaten-cache.json');
const RESULTS_FILE = path.join(__dirname, '..', 'results-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'teams');
const H2H_OUTPUT_DIR = path.join(__dirname, '..', 'public', 'h2h');
const ANALYSIS_LINKS_FILE = path.join(__dirname, '..', 'public', 'data', 'analysis-links.json');

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

function loadAnalysisLinksMap() {
  const rawMap = new Map();
  const normMap = new Map();
  try {
    if (fs.existsSync(ANALYSIS_LINKS_FILE)) {
      const links = JSON.parse(fs.readFileSync(ANALYSIS_LINKS_FILE, 'utf8'));
      Object.keys(links).forEach(key => {
        const parts = key.split('|');
        if (parts.length !== 2) return;
        rawMap.set(key, links[key]);
        normMap.set(analysisSlugifyTeam(parts[0]) + '|' + analysisSlugifyTeam(parts[1]), links[key]);
      });
    }
  } catch (e) {
    console.warn('[team-pages] Failed to read analysis links:', e.message);
  }
  return { rawMap, normMap };
}

function findAnalysisLink(home, away, analysisLinks) {
  const h = home.trim().toLowerCase();
  const a = away.trim().toLowerCase();
  const direct = analysisLinks.rawMap.get(h + '|' + a);
  if (direct) return direct;
  const reverse = analysisLinks.rawMap.get(a + '|' + h);
  if (reverse) return reverse;
  const normDirect = analysisLinks.normMap.get(analysisSlugifyTeam(home) + '|' + analysisSlugifyTeam(away));
  if (normDirect) return normDirect;
  return analysisLinks.normMap.get(analysisSlugifyTeam(away) + '|' + analysisSlugifyTeam(home)) || '';
}

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
  if (!name) return '';
  let s = String(name).toLowerCase().trim();
  s = s.replace(/^[\w]+\s*-\s*/i, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || '';
}

function generateTeamPage(teamName, teamSlug, teamData, ctx) {
  ctx = ctx || {};
  const canonicalUrl = `https://winfulltime.com/teams/${teamSlug}/`;
  const leagueSlug = slugifyLeague(teamData.league || '');
  const leagueName = teamData.league || 'Football';
  const countryLabel = teamData.country ? ` \u2022 ${teamData.country}` : '';

  const metaTitle = `${teamName} Betting Tips, Stats & Predictions | WinFulltime`;
  const upcomingCount = (teamData.upcoming || []).length;
  const streakCount = (teamData.streaks || []).length;
  const metaDesc = upcomingCount > 0
    ? `${teamName} next match prediction, recent form, and ${leagueName} betting statistics. ${upcomingCount} upcoming fixture${upcomingCount !== 1 ? 's' : ''} with AI-powered tips and probability scores.${streakCount > 0 ? ` ${streakCount} active streak${streakCount !== 1 ? 's' : ''} tracked.` : ''}`
    : `${teamName} form history, head-to-head records, and ${leagueName} statistics. AI-powered prediction model covering 1X2, Over 2.5, BTTS, and corner markets.`;

  const upcomingCardsHtml = (teamData.upcoming || []).map(m => {
    const homeSlug = slugifyTeam(m.home);
    const awaySlug = slugifyTeam(m.away);
    const homeTeamLink = ctx.teamExists && ctx.teamExists(homeSlug)
      ? `<a href="/teams/${homeSlug}/" style="color:var(--text-primary);text-decoration:none;">${escapeHtml(m.home)}</a>`
      : escapeHtml(m.home);
    const awayTeamLink = ctx.teamExists && ctx.teamExists(awaySlug)
      ? `<a href="/teams/${awaySlug}/" style="color:var(--text-primary);text-decoration:none;">${escapeHtml(m.away)}</a>`
      : escapeHtml(m.away);
    const analysisUrl = ctx.analysisUrl ? ctx.analysisUrl(m.home, m.away) : '';
    return `
    <div class="match-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">\u23f1 ${escapeHtml(m.time || 'TBD')} | ${escapeHtml(m.league || 'Football')}</div>
      <div style="font-weight:700;font-size:16px;">
        ${homeTeamLink}
         vs
        ${awayTeamLink}
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="background:rgba(255,36,72,0.15);color:var(--accent);padding:4px 10px;border-radius:6px;font-weight:700;font-size:13px;">Tip: ${escapeHtml(m.tip || '1X2')}</span>
        ${analysisUrl ? `<a href="${analysisUrl}" style="color:var(--accent);font-size:12px;text-decoration:none;font-weight:600;">View Analysis &rarr;</a>` : ''}
      </div>
    </div>`;
  }).join('\n') || `<p style="color:var(--text-secondary);">No upcoming ${escapeHtml(teamName)} fixtures scheduled today.</p>`;

  const h2hRecordsHtml = (teamData.h2hRecords || []).map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
      <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${escapeHtml(r.opponent)}</span>
      <a href="${r.href}" style="color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;">H2H Stats &rarr;</a>
    </div>`).join('\n');

  const streaksHtml = (teamData.streaks || []).map(s => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:12px 16px;margin-bottom:10px;">
      <span style="font-weight:700;color:var(--accent);font-size:14px;">\ud83d\udd25 ${s.count} Match Streak</span>
      <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary);">${escapeHtml(s.text)}</p>
    </div>
  `).join('\n');

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: teamName,
    sport: 'Soccer',
    url: canonicalUrl,
    memberOf: { '@type': 'SportsOrganization', name: leagueName }
  }, null, 2);

  const faqJson = generateFaqSchema([
    {
      q: `How accurate are WinFulltime ${teamName} predictions?`,
      a: `Our AI model evaluates ${teamName}'s recent form, goal scoring rates, defensive efficiency, head-to-head records, and home/away splits to generate probability scores across 1X2, Over 2.5, BTTS, and corner markets.`
    },
    {
      q: `When is ${teamName}'s next match?`,
      a: upcomingCount > 0
        ? `${teamName}'s next fixture is ${escapeHtml(teamData.upcoming[0].home)} vs ${escapeHtml(teamData.upcoming[0].away)}${teamData.upcoming[0].time ? ` at ${escapeHtml(teamData.upcoming[0].time)}` : ''}. Check this page for the latest prediction and probability score.`
        : `There are no upcoming ${teamName} fixtures scheduled at this time. This page updates automatically when new matches are added to the schedule.`
    },
    {
      q: `Does ${teamName} perform better at home or away?`,
      a: `Our prediction model factors in ${teamName}'s home and away form splits, including scoring output, defensive solidity, and clean sheet rates across all competitive fixtures.`
    }
  ]);

  const pageCss = `.team-hero{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:32px}`;

  const leagueLink = leagueSlug
    ? `<a href="/predictions/league/${leagueSlug}/" style="color:var(--accent);text-decoration:none;font-weight:600;">${escapeHtml(leagueName)}</a>`
    : escapeHtml(leagueName);

  const body = `
<div class="team-hero">
<h1 style="font-size:28px;font-weight:800;margin-bottom:8px;">${escapeHtml(teamName)}</h1>
<p style="color:var(--text-secondary);margin:0;font-size:14px;">${leagueLink}${countryLabel}</p>
</div>

${streaksHtml ? `<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Active Streaks &amp; Form</h2>${streaksHtml}` : ''}

<h2 style="font-size:20px;font-weight:700;margin:24px 0 16px;">Upcoming Fixtures &amp; Predictions</h2>
<div>
  ${upcomingCardsHtml}
</div>

${h2hRecordsHtml ? `<h2 style="font-size:20px;font-weight:700;margin:24px 0 16px;">Head-to-Head Records</h2>\n<div>\n  ${h2hRecordsHtml}\n</div>` : ''}

<section class="seo-content">
<h2>About ${escapeHtml(teamName)} Predictions</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
WinFulltime tracks ${escapeHtml(teamName)} across all competitive fixtures to generate probability models for 1X2, Over 2.5 goals, Both Teams to Score (BTTS), and corner lines. Our statistical engine evaluates form trends, offensive output, defensive solidity, and head-to-head matchup data to produce data-driven betting recommendations.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>How accurate are WinFulltime ${escapeHtml(teamName)} predictions?</summary>
    <p>Our AI model evaluates ${escapeHtml(teamName)}'s recent form, goal scoring rates, defensive efficiency, head-to-head records, and home/away splits to generate probability scores across 1X2, Over 2.5, BTTS, and corner markets.</p>
  </details>
  <details class="faq-item">
    <summary>When is ${escapeHtml(teamName)}'s next match?</summary>
    <p>${upcomingCount > 0 ? `${escapeHtml(teamName)}'s next fixture is ${escapeHtml(teamData.upcoming[0].home)} vs ${escapeHtml(teamData.upcoming[0].away)}${teamData.upcoming[0].time ? ` at ${escapeHtml(teamData.upcoming[0].time)}` : ''}. Check this page for the latest prediction and probability score.` : `There are no upcoming ${escapeHtml(teamName)} fixtures scheduled at this time. This page updates automatically when new matches are added to the schedule.`}</p>
  </details>
  <details class="faq-item">
    <summary>Does ${escapeHtml(teamName)} perform better at home or away?</summary>
    <p>Our prediction model factors in ${escapeHtml(teamName)}'s home and away form splits, including scoring output, defensive solidity, and clean sheet rates across all competitive fixtures.</p>
  </details>
</div>
</section>`;

  return wrapPage({
    title: metaTitle,
    description: metaDesc,
    keywords: `${escapeHtml(teamName)} betting tips, ${escapeHtml(teamName)} stats, ${escapeHtml(teamName)} predictions, ${escapeHtml(leagueName)} ${escapeHtml(teamName)}`,
    canonicalUrl,
    schemaJson,
    pageCss,
    breadcrumbs: [
      { href: '/', label: 'Home' },
      ...(leagueSlug ? [{ href: `/predictions/league/${leagueSlug}/`, label: leagueName }] : []),
      { label: teamName }
    ],
    body
  });
}

function main() {
  const teamsMap = new Map();
  const h2hSlugs = listDirSlugs(H2H_OUTPUT_DIR);

  function getOrCreateTeam(name) {
    const slug = slugifyTeam(name);
    if (!slug) return null;
    if (!teamsMap.has(slug)) {
      teamsMap.set(slug, {
        name,
        slug,
        league: '',
        country: '',
        upcoming: [],
        streaks: [],
        h2hRecords: []
      });
    }
    return teamsMap.get(slug);
  }

  function addH2hRecord(teamName, opponent) {
    const t = getOrCreateTeam(teamName);
    if (!t) return;
    const s1 = matchupSlug(teamName, opponent);
    const s2 = matchupSlug(opponent, teamName);
    const href = s1 && h2hSlugs.has(s1) ? `/h2h/${s1}/` : s2 && h2hSlugs.has(s2) ? `/h2h/${s2}/` : '';
    if (!href) return;
    const key = String(opponent).toLowerCase();
    if (!t.h2hRecords.some(r => r.opponent.toLowerCase() === key)) {
      t.h2hRecords.push({ opponent, href });
    }
  }

  // Load predictions cache
  if (fs.existsSync(PREDICTIONS_FILE)) {
    try {
      const predData = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
      const matches = predData.matches || [];
      matches.forEach(m => {
        const homeName = (m.home || (m.match ? m.match.split('-')[0] : '')).trim();
        const awayName = (m.away || (m.match ? m.match.split('-')[1] : '')).trim();

        if (homeName) {
          const t = getOrCreateTeam(homeName);
          if (t) {
            if (m.league && !t.league) t.league = m.league;
            if (m.country && !t.country) t.country = m.country;
            t.upcoming.push({ home: homeName, away: awayName, time: m.time, tip: m.tip, league: m.league, date: m.date });
          }
          addH2hRecord(homeName, awayName);
        }
        if (awayName) {
          const t = getOrCreateTeam(awayName);
          if (t) {
            if (m.league && !t.league) t.league = m.league;
            if (m.country && !t.country) t.country = m.country;
            t.upcoming.push({ home: homeName, away: awayName, time: m.time, tip: m.tip, league: m.league, date: m.date });
          }
          addH2hRecord(awayName, homeName);
        }
      });
    } catch (e) {
      console.warn('[team-pages] Error reading predictions cache:', e.message);
    }
  }

  // Load H2H cache for streaks and matchup records
  if (fs.existsSync(H2H_CACHE_FILE)) {
    try {
      const h2hData = JSON.parse(fs.readFileSync(H2H_CACHE_FILE, 'utf8'));
      const datesObj = h2hData.dates || {};
      Object.keys(datesObj).forEach(d => {
        (datesObj[d] || []).forEach(m => {
          const homeName = (m.home || '').trim();
          const awayName = (m.away || '').trim();
          if (homeName && awayName) {
            addH2hRecord(homeName, awayName);
            addH2hRecord(awayName, homeName);
          }
          (m.streaks || []).forEach(s => {
            if (s.team) {
              const t = getOrCreateTeam(s.team);
              if (t && !t.streaks.some(x => x.text === s.text)) {
                t.streaks.push(s);
              }
            }
          });
        });
      });
    } catch (e) {
      console.warn('[team-pages] Error reading H2H cache:', e.message);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const analysisLinks = loadAnalysisLinksMap();
  const existingTeamSlugs = listDirSlugs(OUTPUT_DIR);
  const ctx = {
    teamExists: slug => !!slug && existingTeamSlugs.has(slug),
    analysisUrl: (home, away) => findAnalysisLink(home, away, analysisLinks)
  };
  let generated = 0;

  teamsMap.forEach(tData => {
    const html = generateTeamPage(tData.name, tData.slug, tData, ctx);
    const dirPath = path.join(OUTPUT_DIR, tData.slug);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'index.html'), html);
    generated++;
  });

  let pruned = 0;
  listDirSlugs(OUTPUT_DIR).forEach(slug => {
    if (teamsMap.has(slug)) return;
    fs.rmSync(path.join(OUTPUT_DIR, slug), { recursive: true, force: true });
    pruned++;
  });
  if (pruned) console.log(`[team-pages] Pruned ${pruned} stale team directories`);

  console.log(`[team-pages] Prerendered ${generated} Team Statistics Pages under ${OUTPUT_DIR}`);
}

if (require.main === module) main();

module.exports = { main };
