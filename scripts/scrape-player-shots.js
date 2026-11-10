'use strict';

// Player-shots tips from FotMob (website JSON API, no key, no headless browser).
// Covers the big-5 European leagues. For every league we store:
//   - players:  season shot totals + team + shots-per-game
//   - fixtures: matches for a 3-day window (yesterday, today, tomorrow) plus
//               the next matchday, with generated shot tips: the highest-volume
//               shooters on each side, mapped to a half-goal shots line
//               (e.g. Haaland 3.8 shots/game -> Over 3.5).
// Output: data/player-shots/fotmob.json (cache) + public/data/player-shots.json
// (static mirror read by /player-shots.html). Runs from refresh-local-caches.ps1.
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

const CACHE_FILE = path.join(process.cwd(), 'data', 'player-shots', 'fotmob.json');
const STATIC_FILE = path.join(process.cwd(), 'public', 'data', 'player-shots.json');

const API_BASE = 'https://www.fotmob.com/api/data';
const STATS_BASE = 'https://data.fotmob.com/stats';

const LEAGUES = [
  { id: 47, label: 'English Premier League' },
  { id: 87, label: 'La Liga' },
  { id: 55, label: 'Serie A' },
  { id: 54, label: 'Bundesliga' },
  { id: 53, label: 'Ligue 1' }
];

const MIN_GAMES = 3;       // ignore players with too small a sample for tips
const MIN_SPG = 1.5;       // only tip players averaging >= 1.5 shots/game
const TIPS_PER_TEAM = 2;   // top shooters listed per side
const MAX_PLAYERS_PER_LEAGUE = 100; // leaderboard size cap per league
const HTTP_TIMEOUT_MS = 20000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.fotmob.com/',
        'Accept-Encoding': 'gzip, deflate'
      },
      timeout: HTTP_TIMEOUT_MS
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(httpGet(res.headers.location));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        try {
          if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
          else if (res.headers['content-encoding'] === 'deflate') buf = zlib.inflateSync(buf);
        } catch (e) { /* fall through with raw buffer */ }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        resolve(buf.toString('utf8'));
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`timeout fetching ${url}`)); });
    req.on('error', reject);
  });
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function teamKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'’]/g, '')
    .replace(/\b(?:afc|fc|cf|sc|ac|club|football club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Highest half-line (x.5) that sits below the player's shots-per-game average,
// so the tip is "Over <line> shots" with the average acting as the value anchor.
function shotsLine(spg) {
  const line = Math.floor(spg - 0.5) + 0.5;
  return Math.max(0.5, Math.min(line, 5.5));
}

function statList(payload) {
  const list = payload && payload.TopLists && payload.TopLists[0] && payload.TopLists[0].StatList;
  return Array.isArray(list) ? list : [];
}

async function fetchStats(leagueId, seasonId, stat) {
  try {
    const body = await httpGet(`${STATS_BASE}/${leagueId}/season/${seasonId}/${stat}.json`);
    return statList(JSON.parse(body));
  } catch (err) {
    console.warn(`[Player Shots] ${stat} unavailable for league ${leagueId}: ${err.message}`);
    return [];
  }
}

async function fetchLeague(league) {
  const body = await httpGet(`${API_BASE}/leagues?id=${league.id}`);
  const data = JSON.parse(body);
  const links = (data.stats && data.stats.seasonStatLinks) || [];
  if (!links.length) throw new Error('no season statistics links');

  const seasonLink = links[0];
  const seasonId = seasonLink.TournamentId;
  const [shots, goals, xg] = await Promise.all([
    fetchStats(league.id, seasonId, 'total_scoring_att'),
    fetchStats(league.id, seasonId, 'goals'),
    fetchStats(league.id, seasonId, 'expected_goals')
  ]);

  return { league: data, season: seasonLink.Name, seasonId, shots, goals, xg };
}

function buildPlayerPool(leagueLabel, data) {
  const goalsById = new Map(data.goals.map((p) => [p.ParticiantId, toNum(p.StatValue)]));
  const xgById = new Map(data.xg.map((p) => [p.ParticiantId, toNum(p.StatValue)]));

  return data.shots
    .map((p) => {
      const minutes = toNum(p.MinutesPlayed);
      const games = toNum(p.MatchesPlayed);
      const shotsPer90 = toNum(p.StatValue);
      const shots = Math.round((shotsPer90 * minutes) / 90);
      return {
        name: String(p.ParticipantName || '').trim(),
        team: String(p.TeamName || '').trim(),
        league: leagueLabel,
        position: '',
        games,
        shots,
        goals: goalsById.get(p.ParticiantId) || 0,
        xg: xgById.get(p.ParticiantId) || 0,
        spg: games > 0 ? shots / games : 0
      };
    })
    .filter((p) => p.name && p.team && p.games >= MIN_GAMES && p.shots > 0);
}

function buildLeaderboard(players) {
  return players
    .map((p) => ({
      name: p.name,
      team: p.team,
      league: p.league,
      position: p.position,
      games: p.games,
      shots: p.shots,
      goals: p.goals,
      xg: Math.round(p.xg * 10) / 10,
      spg: Math.round(p.spg * 100) / 100
    }))
    .filter((p) => p.games >= MIN_GAMES && p.shots > 0)
    .sort((a, b) => b.shots - a.shots)
    .slice(0, MAX_PLAYERS_PER_LEAGUE);
}

function dateOffset(baseStr, offset) {
  const d = new Date(baseStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Build tips for every fixture inside the [yesterday, today, tomorrow] window,
// plus the league's next matchday so the page still has an explicitly labelled
// upcoming preview when there are no games in the window (e.g. international
// breaks). Yesterday is kept so the date tabs have a "Yesterday" view (mostly
// finished matches); today and tomorrow only carry actionable fixtures.
function buildTipsForLeague(leagueData, leagueLabel, players, windowDates, todayStr, tomorrowStr) {
  const dateSet = new Set(windowDates);
  const all = ((leagueData.fixtures && leagueData.fixtures.allMatches) || [])
    .filter((m) => m && m.home && m.away && m.status && m.status.utcTime && !m.status.cancelled)
    .map((m) => ({
      date: String(m.status.utcTime).slice(0, 10),
      time: String(m.status.utcTime).slice(11, 16),
      home: String(m.home.name || '').trim(),
      away: String(m.away.name || '').trim(),
      finished: !!m.status.finished
    }))
    .filter((m) => m.home && m.away);

  const windowFixtures = all
    .filter((m) => dateSet.has(m.date))
    .filter((m) => m.date !== todayStr || !m.finished);

  const upcoming = all
    .filter((m) => m.date > tomorrowStr && !m.finished)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const nextDate = upcoming.length ? upcoming[0].date : null;
  const nextFixtures = nextDate ? all.filter((m) => m.date === nextDate && !m.finished) : [];

  const fixtures = windowFixtures.concat(nextFixtures);

  const byTeam = new Map();
  for (const p of players) {
    const key = teamKey(p.team);
    if (!key) continue;
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(p);
  }

  const out = [];
  for (const fx of fixtures) {
    const sides = [
      { side: 'home', team: fx.home },
      { side: 'away', team: fx.away }
    ];
    const tips = [];
    for (const s of sides) {
      const squad = (byTeam.get(teamKey(s.team)) || []).slice();
      const ranked = squad
        .filter((p) => p.games >= MIN_GAMES && p.spg >= MIN_SPG)
        .sort((a, b) => b.spg - a.spg || b.shots - a.shots)
        .slice(0, TIPS_PER_TEAM);
      for (const p of ranked) {
        const line = shotsLine(p.spg);
        tips.push({
          player: p.name,
          team: s.team,
          side: s.side,
          position: p.position,
          games: p.games,
          shots: p.shots,
          goals: p.goals,
          xg: Math.round(p.xg * 10) / 10,
          spg: Math.round(p.spg * 100) / 100,
          line,
          tip: `Over ${line} shots`
        });
      }
    }
    if (!tips.length) continue;
    out.push({
      league: leagueLabel,
      date: fx.date,
      time: fx.time,
      home: fx.home,
      away: fx.away,
      match: `${fx.home} vs ${fx.away}`,
      tips
    });
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out;
}

async function main() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = dateOffset(todayStr, -1);
  const tomorrowStr = dateOffset(todayStr, 1);
  const windowDates = [yesterdayStr, todayStr, tomorrowStr];

  const fixtures = [];
  const players = [];
  let season = '';

  for (const lg of LEAGUES) {
    try {
      console.log(`[Player Shots] Fetching FotMob ${lg.label}...`);
      const data = await fetchLeague(lg);
      if (!season) season = data.season;
      const pool = buildPlayerPool(lg.label, data);
      const built = buildTipsForLeague(data.league, lg.label, pool, windowDates, todayStr, tomorrowStr);
      fixtures.push(...built);
      players.push(...buildLeaderboard(pool));
      console.log(`[Player Shots] ${lg.label}: ${pool.length} players, ${built.length} fixture(s) with tips`);
    } catch (err) {
      console.warn(`[Player Shots] ${lg.label} failed: ${err.message} - skipping league`);
    }
  }

  if (!players.length) {
    console.error('[Player Shots] No players parsed from any league');
    process.exit(1);
  }

  const hasToday = fixtures.some((f) => f.date === todayStr);
  const hasFuture = fixtures.some((f) => f.date > todayStr);

  const result = {
    success: true,
    date: todayStr,
    updatedAt: now.toISOString(),
    window: { yesterday: yesterdayStr, today: todayStr, tomorrow: tomorrowStr },
    source: 'player-scoring-v1',
    provider: 'fotmob.com',
    season,
    isNextMatchday: !hasToday && hasFuture,
    totalFixtures: fixtures.length,
    totalPlayers: players.length,
    fixtures,
    players
  };

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
  console.log(`[Player Shots] Saved ${players.length} players, ${fixtures.length} tip fixtures -> ${CACHE_FILE}`);

  fs.mkdirSync(path.dirname(STATIC_FILE), { recursive: true });
  fs.writeFileSync(STATIC_FILE, JSON.stringify(result, null, 2));
  console.log(`[Player Shots] Mirrored to ${STATIC_FILE}`);
}

main().catch((err) => {
  console.error('[Player Shots] Failed:', err.message);
  process.exit(1);
});
