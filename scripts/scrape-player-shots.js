'use strict';

// Player-shots tips from Understat (free JSON API, no Cloudflare, no headless
// browser). Covers the big-5 European leagues. For every league we store:
//   - players:  season shot totals + team (team_title) + shots-per-game
//   - fixtures: today's matches (falls back to the next matchday when the
//               league has no games today) with generated shot tips:
//               the highest-volume shooters on each side, mapped to a
//               half-goal shots line (e.g. Haaland 3.86 shots/game -> Over 3.5).
// Output: data/player-shots/understat.json (cache) + public/data/player-shots.json
// (static mirror read by /player-shots.html). Runs from refresh-local-caches.ps1.
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

const CACHE_FILE = path.join(process.cwd(), 'data', 'player-shots', 'understat.json');
const STATIC_FILE = path.join(process.cwd(), 'public', 'data', 'player-shots.json');

const LEAGUES = [
  { key: 'EPL', label: 'English Premier League' },
  { key: 'La Liga', label: 'La Liga' },
  { key: 'Serie A', label: 'Serie A' },
  { key: 'Bundesliga', label: 'Bundesliga' },
  { key: 'Ligue 1', label: 'Ligue 1' }
];

const MIN_GAMES = 3;       // ignore players with too small a sample for tips
const MIN_SPG = 1.5;       // only tip players averaging >= 1.5 shots/game
const TIPS_PER_TEAM = 2;   // top shooters listed per side
const MAX_PLAYERS_PER_LEAGUE = 100; // leaderboard size cap per league
const HTTP_TIMEOUT_MS = 20000;

// Understat season key: "2026" means the 2026/2027 season (starts in July).
function seasonYear(d) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        // Understat returns 404 for plain requests; the XHR header is required.
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://understat.com/league/EPL',
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

async function fetchLeague(leagueKey, year) {
  const url = `https://understat.com/getLeagueData/${encodeURIComponent(leagueKey)}/${year}`;
  const body = await httpGet(url);
  return JSON.parse(body);
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Highest half-line (x.5) that sits below the player's shots-per-game average,
// so the tip is "Over <line> shots" with the average acting as the value anchor.
function shotsLine(spg) {
  const line = Math.floor(spg - 0.5) + 0.5;
  return Math.max(0.5, Math.min(line, 5.5));
}

function buildTipsForLeague(data, leagueLabel, todayStr) {
  const fixtures = (data.dates || []).filter((d) => d && d.h && d.a);
  const todays = fixtures.filter((d) => !d.isResult && String(d.datetime || '').slice(0, 10) === todayStr);

  let selected = todays;
  let isNextMatchday = false;
  if (!selected.length) {
    // No games today: fall back to the next upcoming matchday so the page is
    // never empty (labelled as such in the UI).
    const upcoming = fixtures
      .filter((d) => !d.isResult)
      .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    if (!upcoming.length) return { fixtures: [], isNextMatchday: false };
    const nextDate = String(upcoming[0].datetime).slice(0, 10);
    selected = upcoming.filter((d) => String(d.datetime).slice(0, 10) === nextDate);
    isNextMatchday = true;
  }

  const players = data.players || [];
  const byTeam = new Map();
  for (const p of players) {
    const team = String(p.team_title || '').trim();
    if (!team) continue;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(p);
  }

  const out = [];
  for (const fx of selected) {
    const sides = [
      { side: 'home', team: String(fx.h.title).trim() },
      { side: 'away', team: String(fx.a.title).trim() }
    ];
    const tips = [];
    for (const s of sides) {
      const squad = (byTeam.get(s.team) || []).slice();
      const ranked = squad
        .map((p) => ({
          name: String(p.player_name).trim(),
          position: String(p.position || '').trim(),
          games: toNum(p.games),
          shots: toNum(p.shots),
          goals: toNum(p.goals),
          xg: toNum(p.xG),
          spg: toNum(p.games) > 0 ? toNum(p.shots) / toNum(p.games) : 0
        }))
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
      date: String(fx.datetime).slice(0, 10),
      time: String(fx.datetime).slice(11, 16),
      home: String(fx.h.title).trim(),
      away: String(fx.a.title).trim(),
      match: `${String(fx.h.title).trim()} vs ${String(fx.a.title).trim()}`,
      tips
    });
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { fixtures: out, isNextMatchday };
}

function buildLeaderboard(data, leagueLabel) {
  return (data.players || [])
    .map((p) => {
      const games = toNum(p.games);
      const shots = toNum(p.shots);
      return {
        name: String(p.player_name).trim(),
        team: String(p.team_title || '').trim(),
        league: leagueLabel,
        position: String(p.position || '').trim(),
        games,
        shots,
        goals: toNum(p.goals),
        xg: Math.round(toNum(p.xG) * 10) / 10,
        spg: games > 0 ? Math.round((shots / games) * 100) / 100 : 0
      };
    })
    .filter((p) => p.games >= MIN_GAMES && p.shots > 0)
    .sort((a, b) => b.shots - a.shots)
    .slice(0, MAX_PLAYERS_PER_LEAGUE);
}

async function main() {
  const now = new Date();
  const year = seasonYear(now);
  const todayStr = now.toISOString().slice(0, 10);

  const fixtures = [];
  const players = [];
  let anyNextMatchday = false;

  for (const lg of LEAGUES) {
    try {
      console.log(`[Player Shots] Fetching Understat ${lg.key} ${year}...`);
      const data = await fetchLeague(lg.key, year);
      const built = buildTipsForLeague(data, lg.label, todayStr);
      fixtures.push(...built.fixtures);
      if (built.isNextMatchday) anyNextMatchday = true;
      players.push(...buildLeaderboard(data, lg.label));
      console.log(`[Player Shots] ${lg.key}: ${(data.players || []).length} players, ${built.fixtures.length} fixture(s) with tips`);
    } catch (err) {
      console.warn(`[Player Shots] ${lg.key} failed: ${err.message} — skipping league`);
    }
  }

  if (!players.length) {
    console.error('[Player Shots] No players parsed from any league');
    process.exit(1);
  }

  const result = {
    success: true,
    date: todayStr,
    updatedAt: now.toISOString(),
    source: 'understat.com',
    season: `${year}/${year + 1}`,
    isNextMatchday: anyNextMatchday,
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
