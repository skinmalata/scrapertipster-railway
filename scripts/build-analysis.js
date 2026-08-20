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
const ARCHIVE_FILE = path.join(process.cwd(), 'data', 'analysis-archive.json');
const PRERENDER_DIR = path.join(process.cwd(), 'public', 'analysis');
const TEAMS_OUTPUT_DIR = path.join(process.cwd(), 'public', 'teams');
const H2H_OUTPUT_DIR = path.join(process.cwd(), 'public', 'h2h');
const ANALYSIS_TEMPLATE_FILE = path.join(process.cwd(), 'public', 'analysis.html');
const SITE_URL = 'https://winfulltime.com';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RETENTION_DAYS = 90;

function validDateStr(s) {
  return DATE_RE.test(String(s || '')) ? String(s) : '';
}

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

  const homeHasForm = sideHasTeamData(hf, h10);
  const awayHasForm = sideHasTeamData(af, a10);

  let parts = [];

  if (homeHasForm && awayHasForm) {
    if (homeWins > awayWins + 1) {
      parts.push(homeClean + ' comes into this match in excellent form with ' + homeWins + ' wins from their last 5 matches, recently averaging ' + homeAvgScored + ' goals scored per game.');
    } else if (awayWins > homeWins + 1) {
      parts.push(awayClean + ' enters this fixture in superior condition, winning ' + awayWins + ' of their last 5 games and averaging ' + awayAvgScored + ' goals scored per game.');
    } else if (homeWins === awayWins && homeWins > 0) {
      parts.push('Both teams arrive with identical recent records, each winning ' + homeWins + ' of their last 5 matches, setting up what promises to be a closely contested encounter.');
    } else {
      parts.push('Both teams show similar recent form with ' + homeWins + ' wins for ' + homeClean + ' and ' + awayWins + ' for ' + awayClean + ', making this a difficult match to predict confidently.');
    }
    parts.push('Defensively, ' + homeClean + ' has conceded an average of ' + homeAvgConceded + ' goals per game while ' + awayClean + ' has shipped ' + awayAvgConceded + ', keeping things competitive at both ends.');
  } else if (homeHasForm) {
    parts.push(homeClean + ' come into this match with ' + homeWins + ' wins from their last 5 matches, averaging ' + homeAvgScored + ' goals scored per game.');
  } else if (awayHasForm) {
    parts.push(awayClean + ' come into this match with ' + awayWins + ' wins from their last 5 games, averaging ' + awayAvgScored + ' goals scored per game.');
  }

  const h2h = analysis.h2h || [];
  if (h2h.length > 0) {
    const homeH2HWins = h2h.filter(h => h.homeGoals > h.awayGoals).length;
    const awayH2HWins = h2h.filter(h => h.awayGoals > h.homeGoals).length;
    const draws = h2h.length - homeH2HWins - awayH2HWins;
    parts.push('Their head-to-head history shows ' + homeClean + ' winning ' + homeH2HWins + ', ' + awayClean + ' winning ' + awayH2HWins + ', and ' + draws + ' draws in their last ' + h2h.length + ' meetings.');
  }

  if (homeHasForm && awayHasForm) {
    if (homeWins > awayWins && homeAvgScored > awayAvgConceded) {
      parts.push(homeClean + ' appears better positioned for a positive result.');
    } else if (awayWins > homeWins && awayAvgScored > homeAvgConceded) {
      parts.push(awayClean + ' looks better placed to take something from this match.');
    } else {
      parts.push('Expect a competitive match with the potential for a share of the spoils.');
    }
  } else if (h2h.length > 0) {
    parts.push('Historical meetings suggest this fixture could produce a competitive contest.');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function sideHasTeamData(form, last10) {
  const s = last10 || {};
  return !!(form && form.length) ||
    (s.wins || 0) + (s.draws || 0) + (s.losses || 0) > 0 ||
    Number(s.avgScored || 0) > 0;
}

// Reject matchups with no usable data at all. Matchups with partial data
// (form, statistics, or head-to-head for either side) are kept so over/under
// and BTTS fixtures still get a page; the renderer shows only what exists.
function isEmptyAnalysis(a) {
  if (!a) return true;
  return !sideHasTeamData(a.homeForm, a.homeLast10) &&
         !sideHasTeamData(a.awayForm, a.awayLast10) &&
         !(a.h2h && a.h2h.length);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function cleanTeamName(name) {
  return String(name || '').split('(')[0].trim();
}

// Google's Events rich result requires ISO-8601 datetimes with a timezone
// offset (e.g. "2026-08-05T19:30:00Z"). The scraper only knows the kick-off
// time, not the venue timezone, so it is emitted as UTC.
function eventStartDate(dateStr, time) {
  const day = validDateStr(dateStr) ? dateStr : new Date().toISOString().slice(0, 10);
  if (!time) return day + 'T00:00:00Z';
  const iso = day + 'T' + String(time) + ':00Z';
  return isNaN(new Date(iso).getTime()) ? day + 'T00:00:00Z' : iso;
}

function eventEndDate(dateStr, time) {
  const start = eventStartDate(dateStr, time);
  const d = new Date(start);
  d.setUTCHours(d.getUTCHours() + 2);
  return d.toISOString().replace(/\.000Z$/, 'Z');
}

function slugifyTeam(name) {
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

function matchupSlug(home, away) {
  const slug = slugifyTeam(home) + '-vs-' + slugifyTeam(away);
  return slug === '-vs-' ? '' : slug;
}

// Slug flavour used by the team/h2h page generators (prefixes kept: "AC Milan"
// => "ac-milan"). Used only for cross-linking to /teams/ and /h2h/ so the
// analysis page links match the pages that actually exist.
function linkSlugifyTeam(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function linkMatchupSlug(home, away) {
  const h = linkSlugifyTeam(home);
  const a = linkSlugifyTeam(away);
  if (!h || !a) return '';
  return h + '-vs-' + a;
}

function listDirSlugs(dir) {
  const set = new Set();
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function (entry) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) set.add(entry);
      });
    }
  } catch (e) {}
  return set;
}

function teamStatsHref(ctx, team) {
  if (!ctx || !ctx.teamExists) return '';
  const slug = linkSlugifyTeam(team);
  return slug && ctx.teamExists(slug) ? '/teams/' + slug + '/' : '';
}

// generate-team-pages / generate-h2h-pages run AFTER buildAnalysis in the
// same CI pipeline (gh-pages-scraper.js) and create a page for every team and
// matchup listed in predictions-cache.json, so seed the expected slugs from
// today's predictions too. Otherwise teams new to today's fixtures have no
// on-disk page yet when analysis builds and never get linked.
function seedSlugsFromPredictions(predictions, teamSlugs, h2hSlugs) {
  ((predictions && predictions.matches) || []).forEach(function (m) {
    const home = String(m.home || (m.match ? m.match.split('-')[0] : '')).trim();
    const away = String(m.away || (m.match ? m.match.split('-')[1] : '')).trim();
    const hs = linkSlugifyTeam(home);
    const as = linkSlugifyTeam(away);
    if (hs) teamSlugs.add(hs);
    if (as) teamSlugs.add(as);
    const ms = linkMatchupSlug(home, away);
    if (ms) h2hSlugs.add(ms);
  });
}

function teamHeading(team, href) {
  const name = escapeHtml(cleanTeamName(team));
  return href ? '<a href="' + href + '">' + name + '</a>' : name;
}

function renderForm(team, form, href) {
  return '<div class="analysis-card"><h4>' + teamHeading(team, href) + '</h4><div class="form-bar">' +
    String(form || '').slice(-5).split('').map(function (f) {
      return '<span class="form-result ' + (f === 'W' ? 'form-win' : f === 'D' ? 'form-draw' : f === 'L' ? 'form-loss' : '') + '">' + escapeHtml(f) + '</span>';
    }).join('') +
    '</div></div>';
}

function renderStats(team, stats, href) {
  const s = stats || {};
  return '<div class="analysis-card"><h4>' + teamHeading(team, href) + '</h4><div class="stats-grid">' +
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

function renderNoDataCard(team, note, href) {
  return '<div class="analysis-card"><h4>' + teamHeading(team, href) + '</h4><p style="margin:0;color:rgba(232,237,245,0.55);font-size:13px;line-height:1.5;">' + note + '</p></div>';
}

function buildContentHtml(analysis, home, away, matchup, dateStr, ctx) {
  ctx = ctx || {};
  const homeName = analysis.homeTeam || home;
  const awayName = analysis.awayTeam || away;
  const h2h = analysis.h2h || [];
  const summary = analysis.summary || '';
  let html = '';

  const today = new Date().toISOString().slice(0, 10);
  const infoBits = [];
  if (dateStr) infoBits.push(escapeHtml(dateStr));
  if (matchup && matchup.league) infoBits.push(escapeHtml(matchup.league));
  if (matchup && matchup.country) infoBits.push(escapeHtml(matchup.country));
  if (matchup && matchup.time) infoBits.push('KO ' + escapeHtml(matchup.time));
  if (infoBits.length) {
    html += '<div class="analysis-section" style="padding:12px 20px;"><p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">' +
      infoBits.join(' &middot; ') + ' &middot; Updated ' + escapeHtml(today) + '</p></div>';
  }

  const homeHref = teamStatsHref(ctx, home);
  const awayHref = teamStatsHref(ctx, away);

  const formCards = [];
  const homeHasForm = sideHasTeamData(analysis.homeForm, analysis.homeLast10);
  const awayHasForm = sideHasTeamData(analysis.awayForm, analysis.awayLast10);
  if (homeHasForm) {
    formCards.push(renderForm(homeName, analysis.homeForm, homeHref));
  } else if (awayHasForm) {
    formCards.push(renderNoDataCard(homeName, 'No recent form data available for ' + escapeHtml(cleanTeamName(homeName)) + '.', homeHref));
  }
  if (awayHasForm) {
    formCards.push(renderForm(awayName, analysis.awayForm, awayHref));
  } else if (homeHasForm) {
    formCards.push(renderNoDataCard(awayName, 'No recent form data available for ' + escapeHtml(cleanTeamName(awayName)) + '.', awayHref));
  }
  if (formCards.length) {
    html += '<div class="analysis-section"><h3>Recent Form</h3><div class="analysis-grid">' + formCards.join('') + '</div></div>';
  }

  const statCards = [];
  const homeHasStats = hasStats(analysis.homeLast10);
  const awayHasStats = hasStats(analysis.awayLast10);
  if (homeHasStats) {
    statCards.push(renderStats(homeName, analysis.homeLast10, homeHref));
  } else if (awayHasStats) {
    statCards.push(renderNoDataCard(homeName, 'No recent statistics available for ' + escapeHtml(cleanTeamName(homeName)) + '.', homeHref));
  }
  if (awayHasStats) {
    statCards.push(renderStats(awayName, analysis.awayLast10, awayHref));
  } else if (homeHasStats) {
    statCards.push(renderNoDataCard(awayName, 'No recent statistics available for ' + escapeHtml(cleanTeamName(awayName)) + '.', awayHref));
  }
  if (statCards.length) {
    html += '<div class="analysis-section"><h3>Statistics (Last 10 Matches)</h3><div class="analysis-grid">' + statCards.join('') + '</div></div>';
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

  const watch = [];
  const homeWins = (analysis.homeForm || '').match(/W/g) || [];
  const awayWins = (analysis.awayForm || '').match(/W/g) || [];
  if (homeHasForm && awayHasForm && homeWins.length !== awayWins.length) {
    const leader = homeWins.length > awayWins.length ? cleanTeamName(homeName) : cleanTeamName(awayName);
    watch.push(leader + ' arrive with stronger recent form (' + Math.max(homeWins.length, awayWins.length) + ' wins in their last five against ' + Math.min(homeWins.length, awayWins.length) + ' for the opposition).');
  }
  const homeScored = Number((analysis.homeLast10 || {}).avgScored || 0);
  const awayScored = Number((analysis.awayLast10 || {}).avgScored || 0);
  if (homeScored + awayScored > 0) {
    const combined = (homeScored + awayScored).toFixed(1);
    watch.push('The sides average a combined ' + combined + ' goals scored per game over their last 10 outings, pointing to ' + (combined >= 2.5 ? 'an open contest with goals likely at both ends.' : 'a tighter, lower-scoring affair.'));
  }
  const homeH2HWins = h2h.filter(function (h) { return h.homeGoals > h.awayGoals; }).length;
  const awayH2HWins = h2h.filter(function (h) { return h.awayGoals > h.homeGoals; }).length;
  if (h2h.length > 0 && (homeH2HWins || awayH2HWins)) {
    const dominant = homeH2HWins > awayH2HWins ? cleanTeamName(homeName) : cleanTeamName(awayName);
    watch.push('Head-to-head history favours ' + dominant + ' with ' + Math.max(homeH2HWins, awayH2HWins) + ' wins in the last ' + h2h.length + ' meetings.');
  }
  if (watch.length) {
    html += '<div class="analysis-section"><h3>What to Watch</h3><ul class="watch-list">' +
      watch.map(function (w) { return '<li>' + escapeHtml(w) + '</li>'; }).join('') +
      '</ul></div>';
  }

  html += '<div class="cta-links">' +
    '<a href="/" class="cta-link">Today\'s Predictions</a>' +
    '<a href="/predictions/1x2" class="cta-link">1X2</a>' +
    '<a href="/predictions/over-2-5" class="cta-link">Over 2.5 Goals</a>' +
    '<a href="/predictions/btts" class="cta-link">BTTS</a>' +
    '<a href="/ticket-builder.html" class="cta-link">Ticket Builder</a>' +
    '</div>';

  if (ctx.teamExists) {
    const related = [];
    const homeTeamSlug = linkSlugifyTeam(home);
    const awayTeamSlug = linkSlugifyTeam(away);
    if (homeTeamSlug && ctx.teamExists(homeTeamSlug)) related.push('<a href="/teams/' + homeTeamSlug + '/" class="cta-link">' + escapeHtml(cleanTeamName(homeName)) + ' Team Stats</a>');
    if (awayTeamSlug && ctx.teamExists(awayTeamSlug)) related.push('<a href="/teams/' + awayTeamSlug + '/" class="cta-link">' + escapeHtml(cleanTeamName(awayName)) + ' Team Stats</a>');
    if (ctx.h2hExists) {
      const h2hSlug = linkMatchupSlug(home, away);
      if (h2hSlug && ctx.h2hExists(h2hSlug)) related.push('<a href="/h2h/' + h2hSlug + '/" class="cta-link">Head to Head</a>');
    }
    if (related.length) {
      html += '<div class="analysis-section"><h3>Related Pages</h3><div class="cta-links">' + related.join('') + '</div></div>';
    }
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

function buildStaticPage(matchup, slug, analysis, template, dateStr, ctx) {
  const home = matchup.home;
  const away = matchup.away;
  const today = new Date().toISOString().slice(0, 10);
  const cleanTitle = (home + ' vs ' + away).trim();
  const url = SITE_URL + '/analysis/' + dateStr + '/' + slug + '/';
  const hasContent = !!analysis;
  const desc = hasContent
    ? cleanTitle + ' - detailed football match analysis: recent form, head-to-head results, team statistics and a betting summary.'
    : 'Match analysis for ' + cleanTitle + ' from WinFulltime.';

  let page = template;
  page = page.replace('<title>Match Analysis - WinFulltime</title>', '<title>' + escapeHtml(cleanTitle + ' - Analysis - WinFulltime') + '</title>');
  page = page.replace('<meta name="description" content="Detailed football match analysis including recent form, head-to-head statistics, team performance metrics, and predictions.">', '<meta name="description" content="' + escapeHtml(desc) + '">');
  page = page.replace('<meta name="keywords" content="match analysis, football analysis, team statistics, head to head, h2h">', '<meta name="keywords" content="' + escapeHtml(home + ' vs ' + away + ', ' + (matchup.league || '') + ', ' + (matchup.country || '') + ', match analysis, football analysis, team statistics, head to head, h2h').replace(/\s+/g, ' ').trim() + '">');
  page = page.replace('<link rel="canonical" href="https://winfulltime.com/analysis.html">', '<link rel="canonical" href="' + url + '">\n <meta property="article:published_time" content="' + escapeHtml(dateStr || today) + '">\n <meta property="article:modified_time" content="' + escapeHtml(today) + '">');
  page = page.replace('<meta property="og:url" content="https://winfulltime.com/analysis.html">', '<meta property="og:url" content="' + url + '">');
  page = page.replace('<meta name="twitter:url" content="https://winfulltime.com/analysis.html">', '<meta name="twitter:url" content="' + url + '">');
  page = page.replace('<meta property="og:title" content="Match Analysis - WinFulltime">', '<meta property="og:title" content="' + escapeHtml(cleanTitle + ' - Analysis - WinFulltime') + '">');
  page = page.replace('<meta property="og:description" content="Detailed football match analysis with statistics and predictions.">', '<meta property="og:description" content="' + escapeHtml(desc) + '">');
  page = page.replace('<meta name="robots" content="index, follow">', hasContent ? '<meta name="robots" content="index, follow">' : '<meta name="robots" content="noindex, nofollow">');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
          { '@type': 'ListItem', position: 2, name: 'Match Analysis', item: SITE_URL + '/analysis.html' },
          { '@type': 'ListItem', position: 3, name: cleanTitle, item: url }
        ]
      },
      {
        '@type': 'SportsEvent',
        name: cleanTitle,
        url: url,
        description: desc,
        startDate: eventStartDate(dateStr, matchup.time),
        endDate: eventEndDate(dateStr, matchup.time),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: matchup.country || matchup.league || 'Football match',
          address: {
            '@type': 'PostalAddress',
            addressCountry: matchup.country || ''
          }
        },
        image: SITE_URL + '/winfulltimelogo.png',
        organizer: { '@type': 'Organization', name: matchup.league || 'WinFulltime', url: SITE_URL + '/' },
        performer: { '@type': 'SportsTeam', name: cleanTeamName(home) },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: url, availability: 'https://schema.org/InStock' },
        homeTeam: { '@type': 'SportsTeam', name: cleanTeamName(home) },
        awayTeam: { '@type': 'SportsTeam', name: cleanTeamName(away) }
      }
    ]
  };
  const schemaHtml = '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>';
  page = page.replace('<script type="application/ld+json" id="seoJsonLd"></script>', schemaHtml);

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

  const body = hasContent ? buildContentHtml(analysis, home, away, matchup, dateStr, ctx) : buildUnavailableHtml();
  const contentHtml = '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/analysis.html">Match Analysis</a><span>/</span><span aria-current="page">' + escapeHtml(cleanTitle) + '</span></nav>\n' +
    '<h1 id="matchTitle" style="font-size: 28px; margin-bottom: 20px;">' + escapeHtml(cleanTitle) + '</h1>\n\n<div id="content" style="display: block;">\n' + body + '\n</div>\n';

  return page.slice(0, start) + contentHtml + page.slice(scriptClose);
}

function writePrerenderedPages(matchups, result, links, template, ctx, archive) {
  const used = new Set();
  fs.mkdirSync(PRERENDER_DIR, { recursive: true });
  let written = 0;
  matchups.forEach(function (m, i) {
    const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
    const analysis = result[key] || null;
    if (!analysis || isEmptyAnalysis(analysis)) return;
    let slug = matchupSlug(m.home, m.away);
    if (!slug) slug = 'match-' + (i + 1);
    const date = validDateStr(m.date) || new Date().toISOString().slice(0, 10);
    let finalSlug = slug;
    let n = 2;
    while (used.has(date + '/' + finalSlug)) {
      finalSlug = slug + '-' + (n++);
    }
    used.add(date + '/' + finalSlug);
    links[key] = '/analysis/' + date + '/' + finalSlug + '/';

    const page = buildStaticPage(m, finalSlug, analysis, template, date, ctx);
    const dir = path.join(PRERENDER_DIR, date, finalSlug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    written++;
  });
  const archived = emitArchivedPages(archive, used, links, template, ctx);
  fs.mkdirSync(path.dirname(LINKS_FILE), { recursive: true });
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links));

  if (written > 0) pruneAnalysisDirs(used);

  console.log('[analysis] Prerendered', written, 'static pages to', PRERENDER_DIR);
  return { used: used, written: written, archived: archived };
}

// Re-emit prerendered pages for fixtures that already left the rolling
// prediction window but are still within the retention window. Their URLs were
// previously indexed, so dropping the pages would 404 those URLs. Data comes
// from the committed archive (data/analysis-archive.json) rather than the
// volatile analysis cache, so the pages survive across CI runs.
function emitArchivedPages(archive, used, links, template, ctx) {
  const rows = (archive && archive.matchups) || [];
  if (!rows.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = addDays(today, -RETENTION_DAYS);
  let emitted = 0;
  rows.forEach(function (row) {
    if (!row || !row.date || !row.slug) return;
    if (row.date < cutoff || row.date > today) return;
    if (used.has(row.date + '/' + row.slug)) return;
    if (!row.analysis || isEmptyAnalysis(row.analysis)) return;
    const key = row.key || String(row.home || '').toLowerCase() + '|' + String(row.away || '').toLowerCase();
    const matchup = {
      home: row.home || '',
      away: row.away || '',
      date: row.date,
      league: row.league || '',
      country: row.country || '',
      time: row.time || ''
    };
    if (!matchup.home || !matchup.away) return;
    used.add(row.date + '/' + row.slug);
    if (!links[key]) links[key] = '/analysis/' + row.date + '/' + row.slug + '/';
    try {
      const page = buildStaticPage(matchup, row.slug, row.analysis, template, row.date, ctx);
      const dir = path.join(PRERENDER_DIR, row.date, row.slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), page);
      emitted++;
    } catch (e) {
      console.warn('[analysis] archived emit failed ' + row.date + '/' + row.slug + ':', e.message);
    }
  });
  if (emitted) console.log('[analysis] Re-emitted', emitted, 'archived analysis pages');
  return emitted;
}

function loadAnalysisArchive() {
  try {
    if (fs.existsSync(ARCHIVE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
      return Array.isArray(parsed) ? { matchups: parsed } : parsed;
    }
  } catch (e) {
    console.warn('[analysis] Failed to read analysis archive:', e.message);
  }
  return { matchups: [] };
}

// Merge freshly analyzed fixtures into the committed archive so their pages
// keep being re-emitted after they leave the prediction window. Keyed by
// date + slug so stable URLs are preserved; rows older than the retention
// window are dropped so the archive stays bounded.
function updateAnalysisArchive(archive, matchups, result) {
  archive = archive || { matchups: [] };
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = addDays(today, -RETENTION_DAYS);
  const seen = new Set(archive.matchups.map(function (r) {
    return r && r.date && r.slug ? r.date + '/' + r.slug : '';
  }));
  matchups.forEach(function (m) {
    const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
    const analysis = result[key];
    if (!analysis || isEmptyAnalysis(analysis)) return;
    const date = validDateStr(m.date) || today;
    const slug = matchupSlug(m.home, m.away);
    if (!slug) return;
    const id = date + '/' + slug;
    if (seen.has(id)) return;
    seen.add(id);
    archive.matchups.push({
      key: key,
      date: date,
      slug: slug,
      home: analysis.homeTeam || m.home,
      away: analysis.awayTeam || m.away,
      league: m.league || '',
      country: m.country || '',
      time: m.time || '',
      analysis: analysis
    });
  });
  archive.matchups = archive.matchups.filter(function (r) {
    return r && r.date && r.date >= cutoff && r.slug;
  });
  return archive;
}

// Dated URLs archive fixtures by match date. Never delete recent pages (that
// would churn indexed URLs into 404s); only remove legacy undated directories
// from before this migration, and drop dated archives older than the retention
// window. Children inside active dated dirs are kept even when the fixture has
// left the rolling prediction window, so already-indexed URLs stay live.
function pruneAnalysisDirs(used) {
  if (!fs.existsSync(PRERENDER_DIR)) return;
  let removed = 0;
  fs.readdirSync(PRERENDER_DIR).forEach(function (d) {
    const dir = path.join(PRERENDER_DIR, d);
    if (!fs.statSync(dir).isDirectory()) return;
    if (fs.existsSync(path.join(dir, '.redirect-stub'))) return;
    if (!validDateStr(d)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  });
  if (removed) console.log('[analysis] Pruned', removed, 'legacy undated analysis directories');
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
      const canonKey = slugifyTeam(home) + '|' + slugifyTeam(away);
      if (!canonKey || canonKey === '|') return;
      // Dedupe on the canonical slug pair so the same fixture listed under
      // slightly different names (e.g. "Queens Park" vs "Queens Park FC")
      // produces a single dated page instead of near-duplicate URLs.
      if (seen.has(canonKey)) return;
      seen.add(canonKey);
      out.push({
        home: home,
        away: away,
        date: m.date || predictions.date || '',
        league: m.league || '',
        country: m.country || '',
        time: m.time || ''
      });
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
  const maxMatchups = parseInt(process.env.ANALYSIS_MAX_MATCHUPS, 10) || 500;
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
    const teamSlugs = listDirSlugs(TEAMS_OUTPUT_DIR);
    const h2hSlugs = listDirSlugs(H2H_OUTPUT_DIR);
    seedSlugsFromPredictions(predictions, teamSlugs, h2hSlugs);
    const ctx = {
      teamExists: function (slug) { return !!slug && teamSlugs.has(slug); },
      h2hExists: function (slug) { return !!slug && h2hSlugs.has(slug); }
    };
    let archive = loadAnalysisArchive();
    writePrerenderedPages(matchups, result, links, template, ctx, archive);
    archive = updateAnalysisArchive(archive, matchups, result);
    try {
      fs.mkdirSync(path.dirname(ARCHIVE_FILE), { recursive: true });
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive.matchups, null, 2));
      console.log('[analysis] Updated analysis archive (' + archive.matchups.length + ' entries)');
    } catch (e) {
      console.warn('[analysis] Failed to write analysis archive:', e.message);
    }
  } else {
    console.warn('[analysis] No public/analysis.html template — skipping prerender');
  }

  try { require('./update-sitemap').main(); } catch (e) { console.error('[analysis] Sitemap refresh failed:', e.message); }
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
