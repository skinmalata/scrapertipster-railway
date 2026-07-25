const https = require('https');
const { fetchTodayStreaks, findStreakForTeam, findMatchStreak } = require('./h2hWinningStreaks');
const { buildGoldenTips } = require('./goldenOpportunities');
const { recordTips, settleTips, getPendingTipsForDate, getPendingCornerFixtureIds } = require('./liveTipHistory');

const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;
const FOTMOB_STATS_DELAY_MS = 200;
const MAX_FOTMOB_DETAIL_MATCHES = 30;
const MAX_FORM_MATCHES_PER_CYCLE = 4;
const HTTP_TIMEOUT_MS = 8000;
const TEAM_FORM_CACHE_MS = 6 * 60 * 60 * 1000;
const CORNER_HISTORY_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CORNER_CONTEXT_MATCHES = 2;
const MAX_CORNER_HISTORY_FIXTURES = 2;

let liveCache = null;
let isScraping = false;
let scrapeTimer = null;
const teamFormCache = new Map();
const cornerHistoryCache = new Map();
let dailyMatchResults = new Map();
let dailyMatchResultsDate = '';

function todayStr() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = {};
  parts.forEach(function(part) { values[part.type] = part.value; });
  return values.year + values.month + values.day;
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
  if (date !== dailyMatchResultsDate) {
    dailyMatchResults = new Map();
    dailyMatchResultsDate = date;
  }
  var res = await httpGet('https://www.fotmob.com/api/data/matches?date=' + date);
  if (res.status !== 200 || !res.data || !res.data.leagues) return [];

  var matches = [];
  res.data.leagues.forEach(function (league) {
    league.matches.forEach(function (m) {
      dailyMatchResults.set(String(m.id), { finished: Boolean(m.status && m.status.finished), score: parseScore(m.status) });
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
    recentCount: pastMatches.length,
    fixtures: pastMatches.map(function(match) { return match.id || match.matchId || match.fixture && match.fixture.id; }).filter(Boolean)
  };
}

function extractRedCards(matchDetails) {
  if (!matchDetails) return null;
  var header = matchDetails.header && matchDetails.header.status;
  if (!header) return null;
  var home = header.numberOfHomeRedCards || 0;
  var away = header.numberOfAwayRedCards || 0;
  if (home === 0 && away === 0) return null;
  return { home: home, away: away };
}

async function fetchFotMobMatchDetails(matchId) {
  var url = 'https://www.fotmob.com/api/data/matchDetails?matchId=' + matchId;
  var res = await httpGet(url);
  if (res.status !== 200 || !res.data) return null;
  return {
    stats: extractFotMobStats(res.data),
    h2h: extractH2H(res.data),
    redCards: extractRedCards(res.data)
  };
}

async function fetchHistoricalCornerTotal(matchId) {
  if (!matchId) return null;
  var cached = cornerHistoryCache.get(String(matchId));
  if (cached && Date.now() - cached.createdAt < CORNER_HISTORY_CACHE_MS) return cached.total;
  var details = await fetchFotMobMatchDetails(matchId).catch(function() { return null; });
  var total = details && details.stats && details.stats.total ? Number(details.stats.total.corners) : null;
  total = Number.isFinite(total) ? total : null;
  cornerHistoryCache.set(String(matchId), { createdAt: Date.now(), total: total });
  return total;
}

async function enrichFinishedCornerResults() {
  var fixtureIds = getPendingCornerFixtureIds();
  for (var i = 0; i < fixtureIds.length; i++) {
    var result = dailyMatchResults.get(fixtureIds[i]);
    if (!result || !result.finished) continue;
    var corners = await fetchHistoricalCornerTotal(fixtureIds[i]);
    if (corners !== null) result.corners = corners;
  }
}

async function averageHistoricalCorners(fixtureIds) {
  var ids = (fixtureIds || []).slice(0, MAX_CORNER_HISTORY_FIXTURES);
  if (!ids.length) return null;
  var totals = [];
  for (var i = 0; i < ids.length; i++) {
    var total = await fetchHistoricalCornerTotal(ids[i]);
    if (total !== null) totals.push(total);
  }
  if (!totals.length) return null;
  return { sample: totals.length, average: totals.reduce(function(sum, total) { return sum + total; }, 0) / totals.length };
}

async function attachCornerContext(match) {
  if (!match || !match.h2h || !match.h2h.fixtures || !match.recentForm) return;
  var h2h = await averageHistoricalCorners(match.h2h.fixtures);
  var home = await averageHistoricalCorners(match.recentForm.home && match.recentForm.home.fixtureIds);
  var away = await averageHistoricalCorners(match.recentForm.away && match.recentForm.away.fixtureIds);
  if (h2h && home && away) match.cornerContext = { h2h: h2h, recent: { home: home, away: away } };
}

function scoreFromFixture(fixture) {
  var score = fixture && fixture.status && fixture.status.scoreStr;
  var m = String(score || '').match(/(\d+)\s*-\s*(\d+)/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

function fixtureTeamId(fixture, side) {
  var team = fixture && fixture[side];
  return team && (team.id || (team.team && team.team.id));
}

function fixtureArrays(value, found) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    if (value.some(function(item) { return item && item.status; })) found.push(value);
    return found;
  }
  Object.keys(value).forEach(function(key) { fixtureArrays(value[key], found); });
  return found;
}

function extractRecentForm(teamData, teamId) {
  var lists = fixtureArrays(teamData && teamData.fixtures, []);
  var fixtures = lists.sort(function(a, b) { return b.length - a.length; })[0] || [];
  var results = [], fixtureIds = [];

  fixtures.forEach(function(fixture) {
    if (results.length >= 5 || !fixture || !fixture.status || !fixture.status.finished) return;
    var score = scoreFromFixture(fixture);
    var homeId = fixtureTeamId(fixture, 'home');
    var awayId = fixtureTeamId(fixture, 'away');
    if (!score || (String(homeId) !== String(teamId) && String(awayId) !== String(teamId))) return;
    var isHome = String(homeId) === String(teamId);
    var goalsFor = isHome ? score.home : score.away;
    var goalsAgainst = isHome ? score.away : score.home;
    results.push(goalsFor > goalsAgainst ? 'W' : (goalsFor === goalsAgainst ? 'D' : 'L'));
    var fixtureId = fixture.id || fixture.matchId || fixture.fixture && fixture.fixture.id;
    if (fixtureId) fixtureIds.push(fixtureId);
  });

  if (results.length < 5) return null;
  var points = results.reduce(function(total, result) { return total + (result === 'W' ? 3 : (result === 'D' ? 1 : 0)); }, 0);
  return { matches: results.length, points: points, sequence: results.join(''), fixtureIds: fixtureIds };
}

async function fetchTeamRecentForm(teamId) {
  if (!teamId) return null;
  var cached = teamFormCache.get(teamId);
  if (cached && Date.now() - cached.createdAt < TEAM_FORM_CACHE_MS) return cached.form;
  var res = await httpGet('https://www.fotmob.com/api/data/teams?id=' + encodeURIComponent(teamId));
  if (res.status !== 200 || !res.data) return null;
  var form = extractRecentForm(res.data, teamId);
  // Cache an unavailable form too, so an upstream schema gap does not turn
  // into repeated calls on every five-minute live refresh.
  teamFormCache.set(teamId, { createdAt: Date.now(), form: form });
  return form;
}

function detailPriority(match) {
  var minute = Number(match.minute || 0);
  var homeGoals = Number(match.score && match.score.home) || 0;
  var awayGoals = Number(match.score && match.score.away) || 0;
  var totalGoals = homeGoals + awayGoals;
  var scoreGap = Math.abs(homeGoals - awayGoals);
  var priority = 0;

  // The selection rules only operate in the second half and most often on
  // close, low-scoring matches. Analyse those first when the live slate is
  // larger than the provider-safe detail cap.
  if (minute >= 50 && minute <= 85) priority += 100;
  else if (minute >= 45 && minute <= 90) priority += 40;
  if (totalGoals === 0) priority += 20;
  if (scoreGap <= 1) priority += 10;
  return priority;
}

async function scrapeLive() {
  if (isScraping) return liveCache;
  isScraping = true;

  try {
    var matches = await fetchFotMobLive();
    await enrichFinishedCornerResults();
    if (!matches.length) {
      if (liveCache && liveCache.matches && liveCache.matches.length) {
        console.log('[fotmob-live] Empty scrape, preserving', liveCache.matches.length, 'cached matches');
      } else {
        liveCache = { fetchedAt: new Date().toISOString(), matchCount: 0, matches: [] };
      }
      settleTips([], dailyMatchResults);
      isScraping = false;
      return liveCache;
    }

    var detailMatches = matches.slice().sort(function(a, b) {
      return detailPriority(b) - detailPriority(a);
    });
    var detailLimit = Math.min(detailMatches.length, MAX_FOTMOB_DETAIL_MATCHES);
    for (var i = 0; i < detailLimit; i++) {
      var m = detailMatches[i];
      if (i > 0 && i % 3 === 0) await new Promise(function (r) { setTimeout(r, FOTMOB_STATS_DELAY_MS); });
      var details = await fetchFotMobMatchDetails(m.matchId).catch(function () { return null; });
      if (details) {
        if (details.stats) m.fotmobStats = details.stats;
        if (details.h2h) m.h2h = details.h2h;
        if (details.redCards) m.redCards = details.redCards;
      }
    }

    // Form is deliberately limited and cached: it is a pre-match tie-breaker,
    // not a reason to multiply live provider calls or override live pressure.
    var formMatches = detailMatches.filter(function(match) { return match.fotmobStats; }).slice(0, MAX_FORM_MATCHES_PER_CYCLE);
    await Promise.all(formMatches.map(async function(match) {
      var forms = await Promise.all([
        fetchTeamRecentForm(match.homeId).catch(function() { return null; }),
        fetchTeamRecentForm(match.awayId).catch(function() { return null; })
      ]);
      if (forms[0] || forms[1]) match.recentForm = { home: forms[0], away: forms[1] };
    }));

    // Corner history is deliberately narrow and cached. It supplements live
    // pressure only when two recent fixtures per side and direct meetings are
    // available, avoiding speculative corner recommendations.
    var cornerMatches = formMatches.filter(function(match) { return match.h2h && match.h2h.fixtures; }).slice(0, MAX_CORNER_CONTEXT_MATCHES);
    for (var cornerIndex = 0; cornerIndex < cornerMatches.length; cornerIndex++) {
      await attachCornerContext(cornerMatches[cornerIndex]).catch(function() {});
    }

    var withStats = matches.filter(function (m) { return m.fotmobStats; }).length;
    var withH2h = matches.filter(function (m) { return m.h2h; }).length;
    var withForm = matches.filter(function (m) { return m.recentForm && m.recentForm.home && m.recentForm.away; }).length;

    // Attach h2hstats streak data to live matches.
    var streakData = await fetchTodayStreaks().catch(function () { return []; });
    var withStreak = 0;
    var withMatchStreak = 0;
    matches.forEach(function (m) {
      var homeStreak = findStreakForTeam(m.home, true);
      var awayStreak = findStreakForTeam(m.away, false);
      if (homeStreak || awayStreak) {
        m.winningStreak = { home: homeStreak, away: awayStreak };
        withStreak++;
      }
      var htOver15 = findMatchStreak(m.home, m.away, 'ht-over-1.5');
      var htOver05 = findMatchStreak(m.home, m.away, 'ht-over-0.5');
      var htDraw = findMatchStreak(m.home, m.away, 'ht-draw');
      if (htOver15 || htOver05 || htDraw) {
        m.matchStreaks = { 'ht-over-1.5': htOver15, 'ht-over-0.5': htOver05, 'ht-draw': htDraw };
        withMatchStreak++;
      }
    });

    matches.forEach(function(match) { match.corners = match.fotmobStats && match.fotmobStats.total ? match.fotmobStats.total.corners : null; });
    liveCache = { fetchedAt: new Date().toISOString(), matchCount: matches.length, detailedMatchCount: withStats, formMatchCount: withForm, streakMatchCount: withStreak, matchStreakCount: withMatchStreak, matches: matches };
    // Resolve previous entries before adding any tips from the latest scrape.
    settleTips(matches, dailyMatchResults);
    var currentTips = buildGoldenTips(liveCache);
    recordTips(currentTips, liveCache.fetchedAt);
    // Build the full active tips list: current qualifying tips + pending tips
    // from history that no longer qualify but haven't been settled yet.
    var liveById = new Map((matches || []).map(function(m) { return [String(m.matchId), m]; }));
    var currentKeys = {};
    currentTips.forEach(function(t) { currentKeys[String(t.fixtureId) + '|' + String(t.rule)] = true; });
    var pendingTips = getPendingTipsForDate();
    var activeTips = currentTips.slice();
    pendingTips.forEach(function(pt) {
      var key = String(pt.fixtureId) + '|' + String(pt.rule);
      if (currentKeys[key]) return;
      var live = liveById.get(String(pt.fixtureId));
      activeTips.push({
        fixtureId: pt.fixtureId,
        home: pt.home,
        away: pt.away,
        league: pt.league,
        minute: live && live.minute ? live.minute : pt.minute,
        score: pt.scoreAtTip ? (pt.scoreAtTip.home + ' - ' + pt.scoreAtTip.away) : (pt.score || '0 - 0'),
        market: pt.market,
        rule: pt.rule,
        signalScore: pt.signalScore,
        category: pt.category || 'MARKET',
        reason: pt.reason || 'Tip active and pending settlement.'
      });
    });
    liveCache.publishedTips = activeTips;
    console.log('[fotmob-live] Scraped', matches.length, 'live matches (' + withStats + ' stats, ' + withH2h + ' h2h, ' + withForm + ' form, ' + withStreak + ' win-streaks, ' + withMatchStreak + ' match-streaks)');
  } catch (e) {
    console.warn('[fotmob-live] Scrape failed:', e.message);
    if (!liveCache || !liveCache.matches || !liveCache.matches.length) {
      console.log('[fotmob-live] Retrying after failure...');
      try {
        var retryMatches = await fetchFotMobLive();
        if (retryMatches && retryMatches.length) {
          var retryDetail = retryMatches.slice().sort(function(a, b) { return detailPriority(b) - detailPriority(a); }).slice(0, MAX_FOTMOB_DETAIL_MATCHES);
          for (var ri = 0; ri < retryDetail.length; ri++) {
            var rm = retryDetail[ri];
            if (ri > 0 && ri % 3 === 0) await new Promise(function(r) { setTimeout(r, FOTMOB_STATS_DELAY_MS); });
            var rd = await fetchFotMobMatchDetails(rm.matchId).catch(function() { return null; });
            if (rd) {
              if (rd.stats) rm.fotmobStats = rd.stats;
              if (rd.h2h) rm.h2h = rd.h2h;
              if (rd.redCards) rm.redCards = rd.redCards;
            }
          }
          liveCache = { fetchedAt: new Date().toISOString(), matchCount: retryMatches.length, matches: retryMatches };
          settleTips(retryMatches, dailyMatchResults);
          liveCache.publishedTips = recordTips(buildGoldenTips(liveCache), liveCache.fetchedAt);
          console.log('[fotmob-live] Retry succeeded:', retryMatches.length, 'matches');
        }
      } catch (retryErr) {
        console.warn('[fotmob-live] Retry also failed:', retryErr.message);
      }
    }
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
