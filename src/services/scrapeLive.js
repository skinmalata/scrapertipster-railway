const https = require('https');

const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;
const STATS_FETCH_DELAY_MS = 350;
const FOTMOB_STATS_DELAY_MS = 200;
const FOTMOB_MATCH_DETAILS_DELAY_MS = 150;
const MAX_FOTMOB_DETAIL_MATCHES = 20;
const HTTP_TIMEOUT_MS = 8000;

let liveCache = null;
let isScraping = false;
let scrapeTimer = null;

let apiFootballDailyCount = 0;
let apiFootballDailyResetMs = 0;

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

function httpGetAuth(url, headers, timeoutMs) {
  var timeout = timeoutMs || HTTP_TIMEOUT_MS;
  return new Promise(function (resolve, reject) {
    var req = https.get(url, { headers: headers, timeout: timeout }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { try { resolve(JSON.parse(body)); } catch (e) { resolve(null); } });
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', function () { resolve(null); });
  });
}

function resetApiFootballDailyIfNeeded() {
  var now = Date.now();
  var startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  var resetMs = startOfToday.getTime() + 86400000;
  if (now >= apiFootballDailyResetMs) {
    apiFootballDailyCount = 0;
    apiFootballDailyResetMs = resetMs;
  }
}

function canCallApiFootball() {
  resetApiFootballDailyIfNeeded();
  return apiFootballDailyCount < 95;
}

function trackApiFootballCall() {
  resetApiFootballDailyIfNeeded();
  apiFootballDailyCount++;
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
        htScore: null,
        probabilities: { home: 0, draw: 0, away: 0 },
        prediction: '',
        avgGoals: 0,
        preMatchOdds: { home: null, draw: null, away: null },
        matchUrl: null
      });
    });
  });
  return matches;
}

function extractApiFootballStats(response) {
  if (!response) return null;
  var statsArr = Array.isArray(response) ? response : [];
  function extract(entry) {
    var stats = (entry && entry.statistics) || [];
    function val(type) {
      var t = String(type).toLowerCase();
      var s = stats.find(function (x) { return String(x.type).toLowerCase() === t; });
      return s ? (parseFloat(s.value) || 0) : 0;
    }
    return { shotsOnGoal: val('Shots on Goal'), shotsOffGoal: val('Shots off Goal'), corners: val('Corner Kicks') };
  }
  var homeEntry = statsArr[0] || null;
  var awayEntry = statsArr[1] || null;
  var homeStats = extract(homeEntry);
  var awayStats = extract(awayEntry);
  return {
    homeTeam: homeStats,
    awayTeam: awayStats,
    total: {
      shotsOnGoal: homeStats.shotsOnGoal + awayStats.shotsOnGoal,
      shotsOffGoal: homeStats.shotsOffGoal + awayStats.shotsOffGoal,
      corners: homeStats.corners + awayStats.corners,
      totalShots: homeStats.shotsOnGoal + homeStats.shotsOffGoal + awayStats.shotsOnGoal + awayStats.shotsOffGoal
    }
  };
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

async function fetchFotMobMatchStats(matchId) {
  var url = 'https://www.fotmob.com/api/data/matchDetails?matchId=' + matchId;
  var res = await httpGet(url);
  if (res.status !== 200 || !res.data) return null;
  return extractFotMobStats(res.data);
}

async function fetchApiFootballStats(apiKey, fixtureId) {
  if (!canCallApiFootball()) return null;
  var url = 'https://v3.football.api-sports.io/fixtures/statistics?fixture=' + encodeURIComponent(fixtureId);
  var res = await httpGetAuth(url, { 'x-apisports-key': apiKey, 'accept': 'application/json' });
  trackApiFootballCall();
  if (!res || !res.response) return null;
  return extractApiFootballStats(res.response);
}

async function matchFotMobToApiFootball(fotmobMatches, apiKey) {
  if (!canCallApiFootball()) return new Map();
  var fixtureRes = await httpGetAuth('https://v3.football.api-sports.io/fixtures?live=all', {
    'x-apisports-key': apiKey,
    'accept': 'application/json'
  });
  trackApiFootballCall();
  if (!fixtureRes || !fixtureRes.response) return new Map();
  var apiFixtures = Array.isArray(fixtureRes.response) ? fixtureRes.response : [];

  var fixtureByTeam = new Map();
  apiFixtures.forEach(function (f) {
    var home = f.teams && f.teams.home ? normaliseTeam(f.teams.home.name) : '';
    var away = f.teams && f.teams.away ? normaliseTeam(f.teams.away.name) : '';
    fixtureByTeam.set(home + '|' + away, f);
  });

  var matched = new Map();
  fotmobMatches.forEach(function (m) {
    var key = m.homeNormal + '|' + m.awayNormal;
    var fixture = fixtureByTeam.get(key);
    if (fixture) {
      matched.set(m.matchId, fixture.fixture ? fixture.fixture.id : null);
    }
  });
  return matched;
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
      var fotmobStats = await fetchFotMobMatchStats(m.matchId).catch(function () { return null; });
      if (fotmobStats) m.fotmobStats = fotmobStats;
    }

    var apiKey = process.env.API_FOOTBALL_KEY;
    if (apiKey && canCallApiFootball()) {
      var idMap = await matchFotMobToApiFootball(matches, apiKey).catch(function () { return new Map(); });

      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var apiFixtureId = idMap.get(m.matchId);
        if (apiFixtureId && canCallApiFootball()) {
          if (i > 0 && i % 3 === 0) await new Promise(function (r) { setTimeout(r, STATS_FETCH_DELAY_MS); });
          var stats = await fetchApiFootballStats(apiKey, apiFixtureId).catch(function () { return null; });
          if (stats) m.apiStats = stats;
        }
      }
    }

    liveCache = { fetchedAt: new Date().toISOString(), matchCount: matches.length, matches: matches };
    var withFotmob = matches.filter(function (m) { return m.fotmobStats; }).length;
    var withApi = matches.filter(function (m) { return m.apiStats; }).length;
    console.log('[fotmob-live] Scraped', matches.length, 'live matches (' + withFotmob + ' FotMob stats, ' + withApi + ' API-Football stats, API-Football budget:', apiFootballDailyCount + '/95)');
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
