const https = require('https');

const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;
const FOTMOB_STATS_DELAY_MS = 200;
const MAX_FOTMOB_DETAIL_MATCHES = 20;
const HTTP_TIMEOUT_MS = 8000;

let liveCache = null;
let isScraping = false;
let scrapeTimer = null;

function todayStr() {
  const d = new Date();
  return d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
}

function normaliseTeam(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLiveMinute(time) {
  if (!time) return 0;
  if (time.liveTime && time.liveTime.short) {
    const n = parseInt(String(time.liveTime.short).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n)) return n;
  }
  if (time.currentPeriodStartTimestamp) {
    const periodElapsed = Math.floor((Date.now() / 1000 - time.currentPeriodStartTimestamp) / 60);
    return 45 + Math.max(1, periodElapsed);
  }
  return 0;
}

function parseScore(status) {
  if (!status || !status.scoreStr) return { home: 0, away: 0 };
  const m = String(status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return { home: 0, away: 0 };
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}

function httpGet(url, timeoutMs) {
  var timeout = timeoutMs || HTTP_TIMEOUT_MS;
  return new Promise(function (resolve, reject) {
    var req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: timeout
    }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

async function fetchFotMobLive() {
  var date = todayStr();
  var res = await httpGet('https://www.fotmob.com/api/data/matches?date=' + date);
  if (res.status !== 200 || !res.data || !res.data.leagues) return [];

  var matches = [];
  res.data.leagues.forEach(function (league) {
    league.matches.forEach(function (m) {
      if (!m.status || !m.status.started || m.status.finished || !m.status.ongoing) return;
      var minute = parseLiveMinute(m.status);
      var score = parseScore(m.status);
      matches.push({
        matchId: String(m.id),
        home: m.home ? m.home.name : '',
        away: m.away ? m.away.name : '',
        homeId: m.home ? m.home.id : null,
        awayId: m.away ? m.away.id : null,
        homeNormal: normaliseTeam(m.home ? m.home.name : ''),
        awayNormal: normaliseTeam(m.away ? m.away.name : ''),
        league: league.name || '',
        leagueId: league.id || null,
        minute: minute,
        score: score,
        htScore: null
      });
    });
  });
  return matches;
}

function extractFotMobStats(matchDetails) {
  if (!matchDetails) return null;
  var allStats = matchDetails.content && matchDetails.content.stats && matchDetails.content.stats.Periods && matchDetails.content.stats.Periods.All && matchDetails.content.stats.Periods.All.stats;
  if (!allStats || !allStats.length) return null;

  var homeShotsOn = 0, awayShotsOn = 0, homeShotsTotal = 0, awayShotsTotal = 0, homeCorners = 0, awayCorners = 0, homePossession = 0, awayPossession = 0;

  allStats.forEach(function (group) {
    (group.stats || []).forEach(function (s) {
      var h = Array.isArray(s.stats) ? (parseFloat(s.stats[0]) || 0) : 0;
      var a = Array.isArray(s.stats) ? (parseFloat(s.stats[1]) || 0) : 0;
      if (s.key === 'ShotsOnTarget') { homeShotsOn = h; awayShotsOn = a; }
      if (s.key === 'total_shots') { homeShotsTotal = h; awayShotsTotal = a; }
      if (s.key === 'corners') { homeCorners = h; awayCorners = a; }
      if (s.key === 'BallPossesion') { homePossession = h; awayPossession = a; }
    });
  });

  if (homeShotsOn === 0 && awayShotsOn === 0 && homeShotsTotal === 0 && awayShotsTotal === 0) return null;

  return {
    homeTeam: { shotsOnGoal: homeShotsOn, shotsOffGoal: homeShotsTotal - homeShotsOn, corners: homeCorners, possession: homePossession },
    awayTeam: { shotsOnGoal: awayShotsOn, shotsOffGoal: awayShotsTotal - awayShotsOn, corners: awayCorners, possession: awayPossession },
    total: {
      shotsOnGoal: homeShotsOn + awayShotsOn,
      shotsOffGoal: (homeShotsTotal - homeShotsOn) + (awayShotsTotal - awayShotsOn),
      corners: homeCorners + awayCorners,
      totalShots: homeShotsTotal + awayShotsTotal
    }
  };
}

function extractH2H(matchDetails) {
  if (!matchDetails) return null;
  var h2h = matchDetails.content && matchDetails.content.h2h;
  if (!h2h || !h2h.summary) return null;
  var summary = h2h.summary;
  var pastMatches = (h2h.matches || []).filter(function (m) { return m.status && m.status.started && m.status.finished; });
  var homeWins = summary[0] || 0;
  var draws = summary[1] || 0;
  var awayWins = summary[2] || 0;
  var total = homeWins + draws + awayWins;
  if (total === 0) return null;
  return {
    homeWins: homeWins,
    draws: draws,
    awayWins: awayWins,
    total: total,
    homeWinPct: Math.round((homeWins / total) * 100),
    awayWinPct: Math.round((awayWins / total) * 100),
    drawPct: Math.round((draws / total) * 100),
    recentCount: pastMatches.length
  };
}

async function fetchFotMobMatchDetails(matchId) {
  var url = 'https://www.fotmob.com/api/data/matchDetails?matchId=' + matchId;
  var res = await httpGet(url);
  if (res.status !== 200 || !res.data) return null;
  return {
    stats: extractFotMobStats(res.data),
    h2h: extractH2H(res.data)
  };
}

async function scrapeLive() {
  if (isScraping) return liveCache;
  isScraping = true;

  try {
    var matches = await fetchFotMobLive();
    if (!matches.length) {
      liveCache = { fetchedAt: new Date().toISOString(), matchCount: 0, matches: [] };
      isScraping = false;
      return liveCache;
    }

    var detailLimit = Math.min(matches.length, MAX_FOTMOB_DETAIL_MATCHES);
    for (var i = 0; i < detailLimit; i++) {
      var m = matches[i];
      if (i > 0 && i % 3 === 0) await new Promise(function (r) { setTimeout(r, FOTMOB_STATS_DELAY_MS); });
      var details = await fetchFotMobMatchDetails(m.matchId).catch(function () { return null; });
      if (details) {
        if (details.stats) m.fotmobStats = details.stats;
        if (details.h2h) m.h2h = details.h2h;
      }
    }

    liveCache = { fetchedAt: new Date().toISOString(), matchCount: matches.length, matches: matches };
    var withStats = matches.filter(function (m) { return m.fotmobStats; }).length;
    var withH2h = matches.filter(function (m) { return m.h2h; }).length;
    console.log('[fotmob-live] Scraped', matches.length, 'live matches (' + withStats + ' stats, ' + withH2h + ' h2h)');
  } catch (e) {
    console.warn('[fotmob-live] Scrape failed:', e.message);
  }

  isScraping = false;
  return liveCache;
}

function getCachedLive() {
  return liveCache;
}

function startLiveScrapeLoop() {
  if (scrapeTimer) return;
  console.log('[fotmob-live] Starting scrape loop (every 5 min)');
  scrapeLive();
  scrapeTimer = setInterval(scrapeLive, SCRAPE_INTERVAL_MS);
}

module.exports = { scrapeLive, getCachedLive, startLiveScrapeLoop };
