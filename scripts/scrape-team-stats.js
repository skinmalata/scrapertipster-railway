'use strict';

// Scrape per-team statistics from FotMob (league position, W/D/L record,
// recent form, recent results with scores) so /teams/<slug>/ pages have live
// data. Runs inside gh-pages-scraper before the linker regenerators, so the
// nightly CI cron keeps the cache fresh. Output: team-stats-cache.json.
const fs = require('fs');
const path = require('path');
const https = require('https');

const HTTP_TIMEOUT_MS = 10000;
const CONCURRENCY = 3;
const DELAY_MS = 400;
const MIN_SIMILARITY = 0.7;
const MAX_RECENT = 8;
const PREDICTIONS_FILE = path.join(process.cwd(), 'predictions-cache.json');
const CACHE_FILE = path.join(process.cwd(), 'team-stats-cache.json');

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

function collectTeamNames(predictions) {
  const names = [];
  const byName = new Map();
  const matches = predictions.matches || [];
  matches.forEach(m => {
    const parts = splitMatch(m.match);
    const home = (parts[0] || '').trim();
    const away = (parts[1] || '').trim();
    [home, away].forEach(n => {
      if (!n) return;
      if (!byName.has(n)) {
        byName.set(n, { name: n, league: m.league || '', country: m.country || '', dates: new Set() });
        names.push(n);
      }
      if (m.date) byName.get(n).dates.add(m.date);
    });
  });
  return { names, byName };
}

function extractTableRow(teamData, teamId) {
  try {
    const table = teamData && teamData.overview && teamData.overview.table;
    const entry = (table && table[0] && table[0].data) || {};
    const rows = (entry.table && entry.table.all) || [];
    const row = rows.find(r => String(r.id) === String(teamId));
    if (!row) return null;
    return {
      position: row.idx,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      points: row.pts,
      goalDiff: row.goalConDiff,
      league: entry.leagueName || ''
    };
  } catch (e) {
    return null;
  }
}

function extractRecent(teamData, teamId, maxN) {
  try {
    const fixtures = (teamData && teamData.fixtures && teamData.fixtures.allFixtures && teamData.fixtures.allFixtures.fixtures) || [];
    const finished = fixtures.filter(f => f && f.status && f.status.finished && f.status.scoreStr);
    finished.sort((a, b) => new Date(b.status.utcTime) - new Date(a.status.utcTime));
    const recent = [];
    for (const f of finished) {
      if (recent.length >= maxN) break;
      const mm = String(f.status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
      if (!mm) continue;
      const homeId = f.home && f.home.id;
      const awayId = f.away && f.away.id;
      const isHome = String(homeId) === String(teamId);
      const gf = isHome ? parseInt(mm[1], 10) : parseInt(mm[2], 10);
      const ga = isHome ? parseInt(mm[2], 10) : parseInt(mm[1], 10);
      const opponent = (f.opponent && f.opponent.name) || (isHome ? (f.away && f.away.name) : (f.home && f.home.name)) || '';
      recent.push({
        date: (f.status.utcTime || '').slice(0, 10),
        opponent,
        score: gf + '-' + ga,
        result: gf > ga ? 'W' : gf === ga ? 'D' : 'L'
      });
    }
    return recent;
  } catch (e) {
    return [];
  }
}

function extractFormAndRecord(teamData, teamId) {
  try {
    const fixtures = (teamData && teamData.fixtures && teamData.fixtures.allFixtures && teamData.fixtures.allFixtures.fixtures) || [];
    const finished = fixtures.filter(f => f && f.status && f.status.finished && f.status.scoreStr);
    finished.sort((a, b) => new Date(a.status.utcTime) - new Date(b.status.utcTime));
    const results = [];
    for (const f of finished) {
      if (results.length >= 10) break;
      const mm = String(f.status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
      if (!mm) continue;
      const homeId = f.home && f.home.id;
      const awayId = f.away && f.away.id;
      const isHome = String(homeId) === String(teamId);
      const gf = isHome ? parseInt(mm[1], 10) : parseInt(mm[2], 10);
      const ga = isHome ? parseInt(mm[2], 10) : parseInt(mm[1], 10);
      results.push({ gf, ga, won: gf > ga, drew: gf === ga });
    }
    if (results.length < 3) return null;
    const wins = results.filter(r => r.won).length;
    const draws = results.filter(r => r.drew).length;
    const losses = results.length - wins - draws;
    const gfSum = results.reduce((s, r) => s + r.gf, 0);
    const gaSum = results.reduce((s, r) => s + r.ga, 0);
    return {
      wins,
      draws,
      losses,
      avgScored: +(gfSum / results.length).toFixed(1),
      avgConceded: +(gaSum / results.length).toFixed(1),
      form: results.slice(-5).map(r => r.won ? 'W' : r.drew ? 'D' : 'L').join('')
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('[team-stats] No predictions-cache.json — skipping team stats scrape');
    return;
  }

  let predictions;
  try {
    predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
  } catch (e) {
    console.error('[team-stats] Failed to parse predictions cache:', e.message);
    return;
  }

  const { names, byName } = collectTeamNames(predictions);
  if (names.length === 0) {
    console.log('[team-stats] No team names found in predictions');
    return;
  }

  // Resolve each team to a FotMob team id by scanning a date window of
  // fixtures. Reuses the same matches-by-date endpoint as build-analysis.
  const today = new Date().toISOString().slice(0, 10);
  const dateSet = new Set([addDays(today, -3), addDays(today, -2), addDays(today, -1), today, addDays(today, 1), addDays(today, 2)]);
  names.forEach(n => {
    const meta = byName.get(n);
    (meta.dates || []).forEach(d => dateSet.add(d));
  });

  const fixturesByName = new Map();
  for (const d of dateSet) {
    if (!d) continue;
    try {
      const list = await fetchFixturesForDate(d);
      list.forEach(f => {
        if (!fixturesByName.has(String(f.homeName).toLowerCase())) fixturesByName.set(String(f.homeName).toLowerCase(), f.homeId);
        if (!fixturesByName.has(String(f.awayName).toLowerCase())) fixturesByName.set(String(f.awayName).toLowerCase(), f.awayId);
      });
      await sleep(DELAY_MS);
    } catch (e) {
      console.warn('[team-stats] fixtures fetch failed for', d, e.message);
    }
  }

  const resolved = names.map(name => {
    let bestId = null;
    let bestScore = 0;
    fixturesByName.forEach((id, key) => {
      const score = teamSimilarity(name, key);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    });
    return { name, id: bestScore >= MIN_SIMILARITY ? bestId : null, score: bestScore };
  }).filter(r => r.id);

  console.log('[team-stats] Resolved', resolved.length, 'of', names.length, 'teams to FotMob ids');

  const teams = await mapLimit(resolved, CONCURRENCY, async function (t) {
    await sleep(DELAY_MS);
    try {
      const data = await fetchJson('https://www.fotmob.com/api/data/teams?id=' + t.id);
      if (!data || !data.details) return null;
      const meta = byName.get(t.name) || {};
      const table = extractTableRow(data, t.id);
      const formAndRecord = extractFormAndRecord(data, t.id);
      const recent = extractRecent(data, t.id, MAX_RECENT);
      return {
        name: t.name,
        slug: String(t.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        league: meta.league || (table && table.league) || (data.details.primaryLeagueName || ''),
        country: meta.country || (data.details.country || ''),
        table,
        form: formAndRecord ? formAndRecord.form : '',
        record: formAndRecord ? { wins: formAndRecord.wins, draws: formAndRecord.draws, losses: formAndRecord.losses, avgScored: formAndRecord.avgScored, avgConceded: formAndRecord.avgConceded } : null,
        recent
      };
    } catch (e) {
      console.warn('[team-stats] team fetch failed for', t.name, e.message);
      return null;
    }
  });

  const cache = {
    cacheTime: new Date().toISOString(),
    teams: {}
  };
  teams.forEach(t => {
    if (t && t.slug) cache.teams[t.slug] = t;
  });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log('[team-stats] Saved', CACHE_FILE, 'with', Object.keys(cache.teams).length, 'teams');
}

if (require.main === module) {
  main().catch(function (err) {
    console.error('[team-stats] fatal:', err && err.message);
    process.exit(1);
  });
}

module.exports = { main };
