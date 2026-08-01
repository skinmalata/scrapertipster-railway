// Build static match-analysis data for GitHub Pages.
// Strategy: try the existing statarea scraper first (capped budget); any matchup it
// fails to cover (or returns empty) falls back to FotMob (matchDetails H2H + teams form).
// Output: public/data/analysis.json keyed by lowercase "home|away".
const fs = require('fs');
const path = require('path');
const https = require('https');

const HTTP_TIMEOUT_MS = 10000;
const DETAIL_CONCURRENCY = 3;
const DETAIL_DELAY_MS = 400;
const MAX_TEAM_MATCHES = 10;
const MAX_H2H_ENTRIES = 10;
const MIN_SIMILARITY = 0.7;
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'analysis.json');
const ANALYSIS_CACHE_FILE = path.join(process.cwd(), 'analysis-cache.json');
const LINKS_FILE = path.join(process.cwd(), 'public', 'data', 'analysis-links.json');
const PRERENDER_DIR = path.join(process.cwd(), 'public', 'analysis');
const ANALYSIS_TEMPLATE_FILE = path.join(process.cwd(), 'public', 'analysis.html');
const SITE_URL = 'https://winfulltime.com';

const COMMON_WORDS = new Set(['fc', 'sc', 'ac', 'rc', 'us', 'ud', 'utd', 'as', 'ss', 'cf', 'cd', 'de', 'da', 'do', 'el', 'la', 'le', 'il', 'al', 'united', 'city', 'club', 'team', 'sporting', 'athletic', 'association', 'real', 'inter', 'san', 'saint', 'st']);

function httpGet(url) {
  return new Promise(function (resolve) {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: HTTP_TIMEOUT_MS
    }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('timeout', function () { req.destroy(); resolve({ status: 0, data: null }); });
    req.on('error', function () { resolve({ status: 0, data: null }); });
  });
}

async function fetchJson(url) {
  const res = await httpGet(url);
  return (res && res.status === 200 && res.data) ? res.data : null;
}

function normalizeTeam(name) {
  const normalized = String(name || '').toLowerCase()
    .replace(/\(w\)/g, '')
    .replace(/\(u\d+\)/g, '')
    .replace(/\b(u\.?td|united|fc|afc|cf|sc|ac)\b/g, '')
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = { 'milton keynes dons': 'mk dons', ucd: 'uc dublin', 'uanl tigres': 'tigres uanl' };
  return aliases[normalized] || normalized;
}

function getSignificantTokens(name) {
  return normalizeTeam(name).split(/\s+/).filter(t => t.length > 2 && !COMMON_WORDS.has(t));
}

function editSimilarity(first, second) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[second.length] / Math.max(first.length, second.length);
}

function teamSimilarity(name1, name2) {
  const norm1 = normalizeTeam(name1);
  const norm2 = normalizeTeam(name2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
  if (norm1.length >= 7 && norm2.length >= 7 && editSimilarity(norm1, norm2) >= 0.85) return 0.85;
  const tokens1 = getSignificantTokens(name1);
  const tokens2 = getSignificantTokens(name2);
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  let matches = 0;
  for (const t1 of tokens1) {
    for (const t2 of tokens2) {
      if (t1.includes(t2) || t2.includes(t1)) { matches++; break; }
    }
  }
  return matches / Math.max(tokens1.length, tokens2.length);
}

function splitMatch(match) {
  const separator = String(match || '').search(/\s+-\s+|\s+vs\s+/i);
  if (separator < 0) return [];
  const token = String(match).slice(separator).match(/^\s+(?:-|vs)\s+/i);
  if (!token) return [];
  return [String(match).slice(0, separator), String(match).slice(separator + token[0].length)];
}

function addDays(dateStr, days) {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '';
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fotMobDateStr(dateStr) {
  return String(dateStr || '').replace(/-/g, '');
}

function extractH2HList(matchDetails) {
  try {
    const h2h = matchDetails && matchDetails.content && matchDetails.content.h2h;
    const matches = (h2h && h2h.matches) || [];
    const list = [];
    matches.forEach(m => {
      if (!m || !m.status || !m.status.finished || !m.status.scoreStr) return;
      const mm = String(m.status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
      if (!mm) return;
      list.push({
        homeTeam: (m.home && m.home.name) || '',
        awayTeam: (m.away && m.away.name) || '',
        homeGoals: parseInt(mm[1], 10),
        awayGoals: parseInt(mm[2], 10)
      });
    });
    return list.slice(0, MAX_H2H_ENTRIES);
  } catch (e) {
    return [];
  }
}

function extractTeamStats(teamData, teamId, maxN) {
  maxN = maxN || MAX_TEAM_MATCHES;
  try {
    const lists = [];
    (function collect(v) {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        if (v.some(function (i) { return i && i.status; })) lists.push(v);
        return;
      }
      Object.keys(v).forEach(k => collect(v[k]));
    })(teamData && teamData.fixtures);
    const fixtures = lists.sort((a, b) => b.length - a.length)[0] || [];
    const results = [];
    fixtures.forEach(f => {
      if (results.length >= maxN || !f || !f.status || !f.status.finished) return;
      const mm = String(f.status.scoreStr || '').match(/(\d+)\s*-\s*(\d+)/);
      if (!mm) return;
      const homeId = f.home && (f.home.id || (f.home.team && f.home.team.id));
      const awayId = f.away && (f.away.id || (f.away.team && f.away.team.id));
      if (String(homeId) !== String(teamId) && String(awayId) !== String(teamId)) return;
      const isHome = String(homeId) === String(teamId);
      const gf = isHome ? parseInt(mm[1], 10) : parseInt(mm[2], 10);
      const ga = isHome ? parseInt(mm[2], 10) : parseInt(mm[1], 10);
      results.push({ gf: gf, ga: ga, won: gf > ga, drew: gf === ga });
    });
    if (results.length < 3) return null;
    const wins = results.filter(r => r.won).length;
    const draws = results.filter(r => r.drew).length;
    const losses = results.length - wins - draws;
    const gfSum = results.reduce((s, r) => s + r.gf, 0);
    const gaSum = results.reduce((s, r) => s + r.ga, 0);
    return {
      wins: wins,
      draws: draws,
      losses: losses,
      avgScored: +(gfSum / results.length).toFixed(1),
      avgConceded: +(gaSum / results.length).toFixed(1),
      form: results.slice(-5).map(r => r.won ? 'W' : r.drew ? 'D' : 'L').join('')
    };
  } catch (e) {
    return null;
  }
}

async function fetchFixturesForDate(dateStr) {
  const url = 'https://www.fotmob.com/api/data/matches?date=' + fotMobDateStr(dateStr);
  const data = await fetchJson(url);
  if (!data || !data.leagues) return [];
  const out = [];
  data.leagues.forEach(lg => {
    (lg.matches || []).forEach(m => {
      if (!m || !m.id || !m.home || !m.away) return;
      out.push({ id: String(m.id), homeName: m.home.name, awayName: m.away.name, homeId: m.home.id, awayId: m.away.id });
    });
  });
  return out;
}

function findFixture(fixtures, home, away) {
  let best = null;
  let bestScore = 0;
  for (const f of fixtures) {
    const combos = [
      { h: f.homeName, a: f.awayName },
      { h: f.awayName, a: f.homeName }
    ];
    for (const c of combos) {
      const score = (teamSimilarity(home, c.h) + teamSimilarity(away, c.a)) / 2;
      if (score >= MIN_SIMILARITY && score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
  }
  return best;
}

function generateSummary(analysis) {
  const homeClean = String(analysis.homeTeam || '').split('(')[0].trim();
  const awayClean = String(analysis.awayTeam || '').split('(')[0].trim();
  const hf = analysis.homeForm || '';
  const af = analysis.awayForm || '';
  const h10 = analysis.homeLast10 || {};
  const a10 = analysis.awayLast10 || {};

  const homeWins = (hf.match(/W/g) || []).length;
  const awayWins = (af.match(/W/g) || []).length;
  const homeAvgScored = h10.avgScored != null ? h10.avgScored : 0;
  const homeAvgConceded = h10.avgConceded != null ? h10.avgConceded : 0;
  const awayAvgScored = a10.avgScored != null ? a10.avgScored : 0;
  const awayAvgConceded = a10.avgConceded != null ? a10.avgConceded : 0;

  let formDescription = '';
  if (homeWins > awayWins + 1) {
    formDescription = homeClean + ' comes into this match in excellent form with ' + homeWins + ' wins from their last 5 matches, recently averaging ' + homeAvgScored + ' goals scored per game.';
  } else if (awayWins > homeWins + 1) {
    formDescription = awayClean + ' enters this fixture in superior condition, winning ' + awayWins + ' of their last 5 games and averaging ' + awayAvgScored + ' goals scored per game.';
  } else if (homeWins === awayWins && homeWins > 0) {
    formDescription = 'Both teams arrive with identical recent records, each winning ' + homeWins + ' of their last 5 matches, setting up what promises to be a closely contested encounter.';
  } else {
    formDescription = 'Both teams show similar recent form with ' + homeWins + ' wins for ' + homeClean + ' and ' + awayWins + ' for ' + awayClean + ', making this a difficult match to predict confidently.';
  }

  const statsDescription = 'Defensively, ' + homeClean + ' has conceded an average of ' + homeAvgConceded + ' goals per game while ' + awayClean + ' has shipped ' + awayAvgConceded + ', keeping things competitive at both ends.';

  let h2hDescription = '';
  const h2h = analysis.h2h || [];
  if (h2h.length > 0) {
    const homeH2HWins = h2h.filter(h => h.homeGoals > h.awayGoals).length;
    const awayH2HWins = h2h.filter(h => h.awayGoals > h.homeGoals).length;
    const draws = h2h.length - homeH2HWins - awayH2HWins;
    h2hDescription = ' Their head-to-head history shows ' + homeClean + ' winning ' + homeH2HWins + ', ' + awayClean + ' winning ' + awayH2HWins + ', and ' + draws + ' draws in their last ' + h2h.length + ' meetings.';
  }

  let predictionHint = '';
  if (homeWins > awayWins && homeAvgScored > awayAvgConceded) {
    predictionHint = homeClean + ' appears better positioned for a positive result.';
  } else if (awayWins > homeWins && awayAvgScored > homeAvgConceded) {
    predictionHint = awayClean + ' looks better placed to take something from this match.';
  } else {
    predictionHint = 'Expect a competitive match with the potential for a share of the spoils.';
  }

  return (formDescription + ' ' + statsDescription + h2hDescription + ' ' + predictionHint).replace(/\s+/g, ' ').trim();
}

function sideHasTeamData(form, last10) {
  const s = last10 || {};
  return !!(form && form.length) ||
    (s.wins || 0) + (s.draws || 0) + (s.losses || 0) > 0 ||
    Number(s.avgScored || 0) > 0;
}

// Reject matchups where either team has no form or statistics, otherwise the
// page renders misleading zeroed-out stats and summaries for that side.
function isEmptyAnalysis(a) {
  if (!a) return true;
  return !sideHasTeamData(a.homeForm, a.homeLast10) || !sideHasTeamData(a.awayForm, a.awayLast10);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function cleanTeamName(name) {
  return String(name || '').split('(')[0].trim();
}

function slugifyTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchupSlug(home, away) {
  const slug = slugifyTeam(home) + '-vs-' + slugifyTeam(away);
  return slug === '-vs-' ? '' : slug;
}

function renderForm(team, form) {
  return '<div class="analysis-card"><h4>' + escapeHtml(cleanTeamName(team)) + '</h4><div class="form-bar">' +
    String(form || '').slice(-5).split('').map(function (f) {
      return '<span class="form-result ' + (f === 'W' ? 'form-win' : f === 'D' ? 'form-draw' : f === 'L' ? 'form-loss' : '') + '">' + escapeHtml(f) + '</span>';
    }).join('') +
    '</div></div>';
}

function renderStats(team, stats) {
  const s = stats || {};
  return '<div class="analysis-card"><h4>' + escapeHtml(cleanTeamName(team)) + '</h4><div class="stats-grid">' +
    '<div class="stat-item"><div class="stat-label">W</div><div class="stat-value">' + (s.wins || 0) + '</div></div>' +
    '<div class="stat-item"><div class="stat-label">D</div><div class="stat-value">' + (s.draws || 0) + '</div></div>' +
    '<div class="stat-item"><div class="stat-label">L</div><div class="stat-value">' + (s.losses || 0) + '</div></div>' +
    '<div class="stat-item"><div class="stat-label">Scored</div><div class="stat-value">' + Number(s.avgScored || 0).toFixed(1) + '</div></div>' +
    '<div class="stat-item"><div class="stat-label">Conceded</div><div class="stat-value">' + Number(s.avgConceded || 0).toFixed(1) + '</div></div>' +
    '</div></div>';
}

function hasStats(stats) {
  const s = stats || {};
  return (s.wins || 0) + (s.draws || 0) + (s.losses || 0) > 0 || Number(s.avgScored || 0) > 0;
}

function buildContentHtml(analysis, home, away) {
  const hasForm = !!(analysis.homeForm && analysis.awayForm);
  const hasStat = hasStats(analysis.homeLast10) || hasStats(analysis.awayLast10);
  const h2h = analysis.h2h || [];
  const summary = analysis.summary || '';
  let html = '';
  if (hasForm) {
    html += '<div class="analysis-section"><h3>Recent Form</h3><div class="analysis-grid">' +
      renderForm(analysis.homeTeam || home, analysis.homeForm) +
      renderForm(analysis.awayTeam || away, analysis.awayForm) +
      '</div></div>';
  }
  if (hasStat) {
    html += '<div class="analysis-section"><h3>Statistics (Last 10 Matches)</h3><div class="analysis-grid">' +
      renderStats(analysis.homeTeam || home, analysis.homeLast10) +
      renderStats(analysis.awayTeam || away, analysis.awayLast10) +
      '</div></div>';
  }
  if (h2h.length > 0) {
    html += '<div class="analysis-section"><h3>Head to Head</h3><div class="h2h-list">' +
      h2h.slice(0, 5).map(function (h) {
        return '<div class="h2h-item"><span>' + escapeHtml(h.homeTeam) + '</span><span>' + (Number(h.homeGoals) || 0) + ' - ' + (Number(h.awayGoals) || 0) + '</span><span>' + escapeHtml(h.awayTeam) + '</span></div>';
      }).join('') +
      '</div></div>';
  }
  if (summary) {
    html += '<div class="summary-section"><h3>Match Summary</h3><div class="summary-text"><p>' + escapeHtml(summary) + '</p></div></div>';
  }
  html += '<div class="disclaimer"><p><strong>18+ Only</strong></p><p>Predictions are for informational purposes only. Gambling involves financial risk and may lead to addiction. Please play responsibly.</p></div>';
  return html;
}

function buildUnavailableHtml() {
  return '<div class="analysis-section" style="background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.2);">' +
    '<h3 style="color: #ef4444;">Analysis Unavailable</h3>' +
    '<p style="margin-bottom: 12px; line-height: 1.6;">We could not find analysis data for this fixture. It may not be covered by today\'s predictions yet. View all predictions on the <a href="/" style="color: #ef4444;">home page</a>.</p>' +
    '</div>' +
    '<div class="disclaimer"><p><strong>18+ Only</strong></p><p>Predictions are for informational purposes only. Gambling involves financial risk and may lead to addiction. Please play responsibly.</p></div>';
}

function buildStaticPage(home, away, slug, analysis, template) {
  const cleanTitle = (home + ' vs ' + away).trim();
  const url = SITE_URL + '/analysis/' + slug + '/';
  const hasContent = !!analysis;
  const desc = hasContent
    ? cleanTitle + ' - detailed football match analysis: recent form, head-to-head results, team statistics and a betting summary.'
    : 'Match analysis for ' + cleanTitle + ' from WinFulltime.';

  let page = template;
  page = page.replace('<title>Match Analysis - WinFulltime</title>', '<title>' + escapeHtml(cleanTitle + ' - Analysis - WinFulltime') + '</title>');
  page = page.replace('<meta name="description" content="Detailed football match analysis including recent form, head-to-head statistics, team performance metrics, and predictions.">', '<meta name="description" content="' + escapeHtml(desc) + '">');
  page = page.replace('<link rel="canonical" href="https://winfulltime.com/analysis.html">', '<link rel="canonical" href="' + url + '">');
  page = page.replace('<meta property="og:title" content="Match Analysis - WinFulltime">', '<meta property="og:title" content="' + escapeHtml(cleanTitle + ' - Analysis - WinFulltime') + '">');
  page = page.replace('<meta property="og:description" content="Detailed football match analysis with statistics and predictions.">', '<meta property="og:description" content="' + escapeHtml(desc) + '">');
  page = page.replace('<meta name="robots" content="index, follow">', hasContent ? '<meta name="robots" content="index, follow">' : '<meta name="robots" content="noindex, nofollow">');

  const start = page.indexOf('<div id="staticContent">');
  if (start < 0) throw new Error('Template missing <div id="staticContent">');

  // Anchor on the analysis script itself so additional inline scripts do not
  // shift the replacement region. Fall back to the first script after the
  // static content block if the anchor is missing.
  const jsAnchor = page.indexOf('async function loadAnalysis');
  let scriptIdx = page.lastIndexOf('<script>', jsAnchor);
  let scriptClose = jsAnchor >= 0 ? page.indexOf('</script>', jsAnchor) : -1;
  if (jsAnchor < 0 || scriptIdx < start || scriptClose < 0) {
    scriptIdx = page.indexOf('<script>', start);
    scriptClose = page.indexOf('</script>', scriptIdx);
    if (scriptIdx < 0 || scriptClose < 0) throw new Error('Template missing analysis script');
  }
  scriptClose += '</script>'.length;

  const body = hasContent ? buildContentHtml(analysis, home, away) : buildUnavailableHtml();
  const contentHtml = '<h1 id="matchTitle" style="font-size: 28px; margin-bottom: 20px;">' + escapeHtml(cleanTitle) + '</h1>\n\n<div id="content" style="display: block;">\n' + body + '\n</div>\n';

  return page.slice(0, start) + contentHtml + page.slice(scriptClose);
}

function writePrerenderedPages(matchups, result, links, template) {
  const usedSlugs = new Set();
  fs.mkdirSync(PRERENDER_DIR, { recursive: true });
  let written = 0;
  matchups.forEach(function (m, i) {
    const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
    const analysis = result[key] || null;
    if (!analysis || isEmptyAnalysis(analysis)) return;
    let slug = matchupSlug(m.home, m.away);
    if (!slug) slug = 'match-' + (i + 1);
    let finalSlug = slug;
    let n = 2;
    while (usedSlugs.has(finalSlug)) {
      finalSlug = slug + '-' + (n++);
    }
    usedSlugs.add(finalSlug);
    links[key] = '/analysis/' + finalSlug + '/';

    const page = buildStaticPage(m.home, m.away, finalSlug, analysis, template);
    const dir = path.join(PRERENDER_DIR, finalSlug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    written++;
  });
  fs.mkdirSync(path.dirname(LINKS_FILE), { recursive: true });
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links));

  fs.readdirSync(PRERENDER_DIR).forEach(function (d) {
    if (usedSlugs.has(d)) return;
    const dir = path.join(PRERENDER_DIR, d);
    if (!fs.statSync(dir).isDirectory()) return;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log('[analysis] Prerendered', written, 'static pages to', PRERENDER_DIR);
}

function collectMatchups(predictions) {
  const out = [];
  const seen = new Set();
  const categories = [
    predictions.matches,
    predictions.over15Matches,
    predictions.over25Matches,
    predictions.bttsMatches,
    predictions.bttsNoMatches
  ];
  categories.forEach(cat => {
    (cat || []).forEach(m => {
      const teams = splitMatch(m.match || m.nextMatch || '');
      if (teams.length !== 2) return;
      const home = teams[0].trim();
      const away = teams[1].trim();
      if (!home || !away) return;
      const key = home.toLowerCase() + '|' + away.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ home: home, away: away, date: m.date || predictions.date || '' });
    });
  });
  return out;
}

function loadAnalysisCacheFile() {
  try {
    if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

async function runStatareaPhase() {
  if (process.env.SKIP_STATAREA_ANALYSIS === '1') {
    console.log('[analysis] statarea phase skipped (SKIP_STATAREA_ANALYSIS=1)');
    return loadAnalysisCacheFile();
  }
  try {
    const scraper = require('../src/services/scraper');
    console.log('[analysis] Running statarea phase (capped)...');
    await scraper.scrapeMissingAnalysis();
  } catch (e) {
    console.warn('[analysis] statarea phase error:', e.message);
  }
  return loadAnalysisCacheFile();
}

async function buildFotMobAnalysis(home, away, date, fixturesCache) {
  const candidates = [date];
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  if (prev) candidates.push(prev);
  if (next) candidates.push(next);

  let fixture = null;
  for (const d of candidates) {
    if (!d) continue;
    if (!fixturesCache.has(d)) {
      const list = await fetchFixturesForDate(d);
      fixturesCache.set(d, list);
      await sleep(DETAIL_DELAY_MS);
    }
    fixture = findFixture(fixturesCache.get(d), home, away);
    if (fixture) break;
  }
  if (!fixture) return null;

  const details = await fetchJson('https://www.fotmob.com/api/data/matchDetails?matchId=' + fixture.id);
  if (!details || !details.content) return null;
  const h2h = extractH2HList(details);

  const teams = (details.header && details.header.teams) || [];
  const homeId = teams[0] && teams[0].id;
  const awayId = teams[1] && teams[1].id;

  const [homeTeamData, awayTeamData] = await Promise.all([
    homeId ? fetchJson('https://www.fotmob.com/api/data/teams?id=' + homeId) : null,
    awayId ? fetchJson('https://www.fotmob.com/api/data/teams?id=' + awayId) : null
  ]);
  const homeStats = homeTeamData ? extractTeamStats(homeTeamData, homeId) : null;
  const awayStats = awayTeamData ? extractTeamStats(awayTeamData, awayId) : null;

  const emptyStats = { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 };
  const result = {
    homeTeam: home,
    awayTeam: away,
    homeForm: homeStats ? homeStats.form : '',
    awayForm: awayStats ? awayStats.form : '',
    homeLast10: homeStats ? { wins: homeStats.wins, draws: homeStats.draws, losses: homeStats.losses, avgScored: homeStats.avgScored, avgConceded: homeStats.avgConceded } : emptyStats,
    awayLast10: awayStats ? { wins: awayStats.wins, draws: awayStats.draws, losses: awayStats.losses, avgScored: awayStats.avgScored, avgConceded: awayStats.avgConceded } : emptyStats,
    h2h: h2h,
    summary: ''
  };
  result.summary = generateSummary(result);
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const predFile = path.join(process.cwd(), 'public', 'data', 'predictions.json');
  if (!fs.existsSync(predFile)) {
    console.log('[analysis] No public/data/predictions.json — skipping analysis build');
    return;
  }
  let predictions;
  try {
    predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
  } catch (e) {
    console.error('[analysis] Failed to parse predictions:', e.message);
    return;
  }

  const matchups = collectMatchups(predictions);
  const maxMatchups = parseInt(process.env.ANALYSIS_MAX_MATCHUPS, 10) || 200;
  const limited = matchups.slice(0, maxMatchups);
  console.log('[analysis] Matchups found:', matchups.length, '| processing up to', limited.length);

  const statareaCache = await runStatareaPhase();
  const fixturesCache = new Map();
  const result = {};
  const seen = new Set();

  const analyzed = await mapLimit(limited, DETAIL_CONCURRENCY, async function (m) {
    const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    const reverseKey = m.away.toLowerCase() + '|' + m.home.toLowerCase();
    const cached = statareaCache[key] || statareaCache[reverseKey];
    if (cached && !isEmptyAnalysis(cached)) {
      console.log('[analysis] statarea: ' + m.home + ' vs ' + m.away);
      return { key: key, value: cached };
    }
    try {
      const analysis = await buildFotMobAnalysis(m.home, m.away, m.date, fixturesCache);
      if (analysis && !isEmptyAnalysis(analysis)) {
        console.log('[analysis] fotmob: ' + m.home + ' vs ' + m.away);
        return { key: key, value: analysis };
      }
      console.log('[analysis] unavailable: ' + m.home + ' vs ' + m.away);
      return null;
    } catch (e) {
      console.warn('[analysis] fotmob error ' + m.home + ' vs ' + m.away + ':', e.message);
      return null;
    }
  });

  analyzed.forEach(entry => {
    if (entry) result[entry.key] = entry.value;
  });

  // Include cached analyses for matchups beyond the per-run processing cap so
  // previously-analyzed fixtures still get a prerendered page.
  matchups.slice(maxMatchups).forEach(function (m) {
    const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
    if (result[key]) return;
    const reverseKey = m.away.toLowerCase() + '|' + m.home.toLowerCase();
    const cached = statareaCache[key] || statareaCache[reverseKey];
    if (cached && !isEmptyAnalysis(cached)) result[key] = cached;
  });

  const out = { generatedAt: new Date().toISOString(), matchups: result };
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));
  console.log('[analysis] Saved', OUTPUT_FILE, 'with', Object.keys(result).length, 'matchups');

  if (fs.existsSync(ANALYSIS_TEMPLATE_FILE)) {
    const template = fs.readFileSync(ANALYSIS_TEMPLATE_FILE, 'utf8');
    const links = {};
    writePrerenderedPages(matchups, result, links, template);
  } else {
    console.warn('[analysis] No public/analysis.html template — skipping prerender');
  }
}

if (require.main === module) {
  main().catch(function (err) {
    console.error('[analysis] fatal:', err && err.message);
    process.exit(1);
  });
}

module.exports = {
  collectMatchups,
  buildFotMobAnalysis,
  generateSummary,
  isEmptyAnalysis,
  extractTeamStats,
  extractH2HList,
  slugifyTeam,
  matchupSlug,
  buildContentHtml,
  buildStaticPage,
  writePrerenderedPages,
  main
};
