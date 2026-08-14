var https = require('https');
var fs = require('fs');
var path = require('path');
var HTTP_TIMEOUT_MS = 10000;
var MAX_MATCHES = 80;
var DETAIL_CONCURRENCY = 3;
var DETAIL_DELAY_MS = 500;
var MIN_CONFIDENCE = 55;
var DATA_DIR = process.env.AUTHOR_PICKS_DATA_DIR || path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || __dirname,
  '../../data/author-picks'
);

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

function fotMobDateStr(dayOffset) {
  var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  var values = {};
  parts.forEach(function (p) { values[p.type] = p.value; });
  var d = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  d.setUTCDate(d.getUTCDate() + (dayOffset || 0));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function todayStr() { return fotMobDateStr(0); }

function lagosDateStr(utcTime) {
  if (!utcTime) return '';
  var d = new Date(utcTime);
  if (isNaN(d.getTime())) return '';
  var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  var v = {};
  parts.forEach(function (p) { v[p.type] = p.value; });
  return v.year + '-' + v.month + '-' + v.day;
}

function parseScore(status) {
  if (!status || !status.scoreStr) return null;
  var m = String(status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}

function httpGet(url) {
  return new Promise(function (resolve, reject) {
    var req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: HTTP_TIMEOUT_MS
    }, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('timeout', function () { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function extractH2H(matchDetails) {
  if (!matchDetails || !matchDetails.content || !matchDetails.content.h2h) return null;
  var h2h = matchDetails.content.h2h;
  if (!h2h.summary) return null;
  var summary = h2h.summary;
  var pastMatches = (h2h.matches || []).filter(function (m) { return m.status && m.status.started && m.status.finished; });
  var homeWins = summary[0] || 0;
  var draws = summary[1] || 0;
  var awayWins = summary[2] || 0;
  var total = homeWins + draws + awayWins;
  if (total === 0) return null;

  var goalsHome = 0, goalsAway = 0, bttsCount = 0, totalGoals = 0, matchCount = 0;
  pastMatches.forEach(function (m) {
    var score = parseScore(m.status);
    if (score) {
      matchCount++;
      goalsHome += score.home;
      goalsAway += score.away;
      totalGoals += score.home + score.away;
      if (score.home > 0 && score.away > 0) bttsCount++;
    }
  });

  return {
    homeWins: homeWins, draws: draws, awayWins: awayWins, total: total,
    homeWinPct: Math.round((homeWins / total) * 100),
    awayWinPct: Math.round((awayWins / total) * 100),
    drawPct: Math.round((draws / total) * 100),
    avgGoals: matchCount > 0 ? (totalGoals / matchCount) : null,
    bttsPct: matchCount > 0 ? Math.round((bttsCount / matchCount) * 100) : null,
    matchCount: matchCount,
    fixtures: pastMatches.map(function (m) { return m.id; }).filter(Boolean)
  };
}

function extractRecentForm(teamData, teamId) {
  if (!teamData || !teamData.fixtures) return null;
  var lists = [];
  (function findLists(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { if (v.some(function (i) { return i && i.status; })) lists.push(v); return; }
    Object.keys(v).forEach(function (k) { findLists(v[k]); });
  })(teamData.fixtures);
  var fixtures = lists.sort(function (a, b) { return b.length - a.length; })[0] || [];
  var results = [], fixtureIds = [];
  fixtures.forEach(function (f) {
    if (results.length >= 5 || !f || !f.status || !f.status.finished) return;
    var score = parseScore(f.status);
    var homeId = f.home && f.home.id;
    var awayId = f.away && f.away.id;
    if (!score || (String(homeId) !== String(teamId) && String(awayId) !== String(teamId))) return;
    var isHome = String(homeId) === String(teamId);
    var gf = isHome ? score.home : score.away;
    var ga = isHome ? score.away : score.home;
    results.push({ goalsFor: gf, goalsAgainst: ga, won: gf > ga, drew: gf === ga });
    if (f.id) fixtureIds.push(f.id);
  });
  if (results.length < 3) return null;
  var points = results.reduce(function (sum, r) { return sum + (r.won ? 3 : r.drew ? 1 : 0); }, 0);
  var gf = results.reduce(function (s, r) { return s + r.goalsFor; }, 0);
  var ga = results.reduce(function (s, r) { return s + r.goalsAgainst; }, 0);
  return { matches: results.length, points: points, ppg: points / results.length, gf: gf, ga: ga, avgGF: gf / results.length, avgGA: ga / results.length, fixtureIds: fixtureIds };
}

async function fetchTeamForm(teamId) {
  if (!teamId) return null;
  var res = await httpGet('https://www.fotmob.com/api/data/teams?id=' + encodeURIComponent(teamId)).catch(function () { return null; });
  if (!res || res.status !== 200 || !res.data) return null;
  return extractRecentForm(res.data, teamId);
}

function predict1X2(h2h, homeForm, awayForm) {
  var homeScore = h2h.homeWinPct * 0.6;
  var awayScore = h2h.awayWinPct * 0.6;
  var drawScore = h2h.drawPct * 0.6;

  if (homeForm && awayForm) {
    var ppgGap = (homeForm.ppg || 0) - (awayForm.ppg || 0);
    homeScore += Math.max(0, ppgGap) * 10;
    awayScore += Math.max(0, -ppgGap) * 10;
    drawScore += (5 - Math.abs(ppgGap) * 2);
  }

  var total = homeScore + awayScore + drawScore;
  if (total === 0) return null;

  var homeConf = Math.round((homeScore / total) * 100);
  var awayConf = Math.round((awayScore / total) * 100);
  var drawConf = Math.round((drawScore / total) * 100);

  if (homeConf >= Math.max(awayConf, drawConf)) {
    return { tip: '1', market: 'Match Winner', selection: 'Home Win', confidence: Math.max(homeConf, MIN_CONFIDENCE), reason: 'H2H record + recent form favors home side' };
  }
  if (awayConf >= Math.max(homeConf, drawConf)) {
    return { tip: '2', market: 'Match Winner', selection: 'Away Win', confidence: Math.max(awayConf, MIN_CONFIDENCE), reason: 'H2H record + recent form favors away side' };
  }
  return { tip: 'X', market: 'Match Winner', selection: 'Draw', confidence: Math.max(drawConf, MIN_CONFIDENCE), reason: 'Evenly matched based on H2H and recent form' };
}

function predictDNB(h2h, homeForm, awayForm) {
  var homeEdge = h2h.homeWinPct - h2h.awayWinPct;
  if (homeForm && awayForm) homeEdge += ((homeForm.ppg || 0) - (awayForm.ppg || 0)) * 10;
  var absEdge = Math.max(Math.abs(homeEdge), 5);
  var conf = Math.min(90, Math.max(MIN_CONFIDENCE, Math.round(50 + absEdge * 1.2)));
  var tip = homeEdge > 0 ? 'Home (DNB)' : 'Away (DNB)';
  return { tip: tip, market: 'Draw No Bet', selection: tip, confidence: conf, reason: 'Win edge favors ' + (homeEdge > 0 ? 'home' : 'away') + ' side' };
}

function predictOverUnder(h2h, homeForm, awayForm) {
  var avg = h2h.avgGoals;
  if (avg === null) {
    if (homeForm && awayForm) avg = (homeForm.avgGF + homeForm.avgGA + awayForm.avgGF + awayForm.avgGA) / 2;
    else return null;
  }
  if (homeForm && awayForm) avg = (avg * 0.5) + ((homeForm.avgGF + awayForm.avgGF + homeForm.avgGA + awayForm.avgGA) / 4) * 0.5;

  var market, tip, conf, reason;
  if (avg > 3.5) {
    conf = Math.min(95, Math.max(MIN_CONFIDENCE, Math.round(55 + (avg - 3.5) * 10)));
    return { tip: 'Over 3.5', market: 'Goals Over/Under', selection: 'Over 3.5', confidence: conf, reason: 'Average ' + avg.toFixed(1) + ' goals in meetings and recent form' };
  }
  if (avg > 2.8) {
    conf = Math.min(95, Math.max(MIN_CONFIDENCE, Math.round(55 + (avg - 2.8) * 8)));
    return { tip: 'Over 2.5', market: 'Goals Over/Under', selection: 'Over 2.5', confidence: conf, reason: 'Average ' + avg.toFixed(1) + ' goals per meeting' };
  }
  if (avg > 2.0) {
    conf = Math.min(90, Math.max(MIN_CONFIDENCE, Math.round(50 + (avg - 2.0) * 10)));
    return { tip: 'Over 1.5', market: 'Goals Over/Under', selection: 'Over 1.5', confidence: conf, reason: 'Average ' + avg.toFixed(1) + ' goals — likely to see goals' };
  }
  if (avg < 1.5) {
    conf = Math.min(85, Math.max(MIN_CONFIDENCE, Math.round(50 + (1.5 - avg) * 15)));
    return { tip: 'Under 2.5', market: 'Goals Over/Under', selection: 'Under 2.5', confidence: conf, reason: 'Low-scoring pattern: ' + avg.toFixed(1) + ' goals average' };
  }
  conf = Math.min(90, Math.max(MIN_CONFIDENCE, Math.round(50 + (avg - 1.5) * 8)));
  return { tip: 'Over 1.5', market: 'Goals Over/Under', selection: 'Over 1.5', confidence: conf, reason: 'Average ' + avg.toFixed(1) + ' goals — likely to see goals' };
}

function predictBTTS(h2h, homeForm, awayForm) {
  var bttsPct = h2h.bttsPct;
  if (bttsPct === null) {
    if (h2h.avgGoals !== null) bttsPct = h2h.avgGoals > 2.5 ? 55 : 40;
    else return null;
  }
  var boost = 0;
  if (homeForm && awayForm) {
    if (homeForm.avgGF > 1.2 && awayForm.avgGF > 1.2) boost = 10;
    if (homeForm.avgGA > 1.0 && awayForm.avgGA > 1.0) boost += 5;
  }
  var adjusted = bttsPct + boost;
  if (adjusted >= 50) {
    var conf = Math.min(90, Math.max(MIN_CONFIDENCE, Math.round(50 + (adjusted - 50) * 0.6)));
    return { tip: 'BTTS Yes', market: 'Both Teams Score', selection: 'BTTS Yes', confidence: conf, reason: adjusted + '% of recent meetings had both teams scoring' };
  }
  var conf = Math.min(85, Math.max(MIN_CONFIDENCE, Math.round(50 + (50 - adjusted) * 0.6)));
  return { tip: 'BTTS No', market: 'Both Teams Score', selection: 'BTTS No', confidence: conf, reason: 'Only ' + adjusted + '% of meetings saw both teams score' };
}

function extractMatchCorners(matchDetails) {
  try {
    var stats = matchDetails.content.stats.Periods.All.stats;
    var total = null;
    stats.forEach(function (group) {
      if (total !== null) return;
      (group.stats || []).forEach(function (s) {
        if (s.key === 'corners') total = (parseFloat(s.stats[0]) || 0) + (parseFloat(s.stats[1]) || 0);
      });
    });
    return total;
  } catch (e) { return null; }
}

function extractMatchCards(matchDetails) {
  try {
    var stats = matchDetails.content.stats.Periods.All.stats;
    var yellows = 0;
    stats.forEach(function (group) {
      (group.stats || []).forEach(function (s) {
        if (s.key === 'yellow_cards') yellows += (parseFloat(s.stats[0]) || 0) + (parseFloat(s.stats[1]) || 0);
      });
    });
    var header = matchDetails && matchDetails.header && matchDetails.header.status;
    var reds = header ? (header.numberOfHomeRedCards || 0) + (header.numberOfAwayRedCards || 0) : 0;
    return yellows + reds;
  } catch (e) { return null; }
}

async function fetchH2HStats(fixtureIdSets) {
  var seen = new Set();
  var ids = [];
  (fixtureIdSets || []).forEach(function (set) {
    (set || []).forEach(function (id) {
      if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    });
  });
  ids = ids.slice(0, 10);
  var corners = [], cards = [];
  for (var i = 0; i < ids.length; i += 3) {
    var batch = ids.slice(i, i + 3);
    var results = await Promise.all(batch.map(function (id) {
      return httpGet('https://www.fotmob.com/api/data/matchDetails?matchId=' + encodeURIComponent(id))
        .then(function (res) { return (res && res.status === 200 && res.data) ? res.data : null; })
        .catch(function () { return null; });
    }));
    results.forEach(function (data) {
      if (data) {
        var c = extractMatchCorners(data);
        if (c !== null) corners.push(c);
        var cd = extractMatchCards(data);
        if (cd !== null) cards.push(cd);
      }
    });
    if (i + 3 < ids.length) await new Promise(function (r) { setTimeout(r, 300); });
  }
  return { corners: corners, cards: cards };
}

function predictCorners(cornerValues) {
  if (!cornerValues || cornerValues.length < 3) return null;
  var total = cornerValues.reduce(function (a, b) { return a + b; }, 0);
  var avg = total / cornerValues.length;
  var conf = Math.min(90, Math.max(MIN_CONFIDENCE, 65 + Math.round(avg * 1.5)));
  return { tip: 'Over 8.5 Corners', market: 'Corners', selection: 'Over 8.5 Corners', confidence: conf, reason: 'Averaging ' + avg.toFixed(1) + ' corners across ' + cornerValues.length + ' recent meetings' };
}

function predictCards(cardValues) {
  if (!cardValues || cardValues.length < 3) return null;
  var total = cardValues.reduce(function (a, b) { return a + b; }, 0);
  var avg = total / cardValues.length;
  var conf = Math.min(85, Math.max(MIN_CONFIDENCE, 60 + Math.round(avg * 2)));
  return { tip: 'Over 3.5 Cards', market: 'Cards', selection: 'Over 3.5 Cards', confidence: conf, reason: 'Averaging ' + avg.toFixed(1) + ' cards across ' + cardValues.length + ' recent meetings' };
}

var MARKET_PRIORITY = {
  'Match Winner': 6,
  'Draw No Bet': 5,
  'Goals Over/Under': 4,
  'Both Teams Score': 3,
  'Corners': 2,
  'Cards': 1
};

function pickBestTip(tips) {
  if (!tips || !tips.length) return null;
  tips.sort(function (a, b) {
    var pa = MARKET_PRIORITY[a.market] || 0;
    var pb = MARKET_PRIORITY[b.market] || 0;
    if (pa !== pb) return pb - pa;
    return b.confidence - a.confidence;
  });
  return tips[0];
}

function extractAllFixtures(data, requestedDate) {
  var fixtures = [];
  if (!data || !data.leagues) return fixtures;
  var seen = new Set();
  data.leagues.forEach(function (league) {
    (league.matches || []).forEach(function (m) {
      if (!m || !m.id || !m.home || !m.away) return;
      if (m.status && m.status.finished && !m.status.ongoing) return;
      if (/friendly|friendlies|u\d{2}|reserve|reserves|women/i.test(String(league.name || ''))) return;
      var id = String(m.id);
      if (seen.has(id)) return;
      seen.add(id);
      var kickoff = m.status && m.status.utcTime ? m.status.utcTime : null;
      // FotMob buckets the date param by venue-local time, which can leak matches
      // that are "yesterday" (or "tomorrow") by the Lagos clock. Keep only fixtures
      // whose Lagos-local kickoff date matches the requested YYYYMMDD date.
      if (requestedDate && lagosDateStr(kickoff).replace(/-/g, '') !== requestedDate) return;
      var isLive = m.status && m.status.started && m.status.ongoing && !m.status.finished;
      fixtures.push({
        matchId: id,
        home: m.home.name,
        away: m.away.name,
        homeId: m.home.id,
        awayId: m.away.id,
        league: league.name,
        leagueId: league.id,
        isLive: isLive,
        kickoff: kickoff,
        score: isLive ? parseScore(m.status) : null,
        minute: isLive ? (m.status.liveTime ? m.status.liveTime.short : null) : null
      });
    });
  });
  return fixtures;
}

async function enrichFixture(match) {
  var res = await httpGet('https://www.fotmob.com/api/data/matchDetails?matchId=' + match.matchId).catch(function () { return null; });
  if (!res || res.status !== 200 || !res.data) return null;
  var h2h = extractH2H(res.data);
  if (!h2h || h2h.total < 3) return null;
  var homeForm = await fetchTeamForm(match.homeId);
  var awayForm = await fetchTeamForm(match.awayId);
  if (!homeForm && !awayForm) return null;

  var h2hStats = await fetchH2HStats([h2h.fixtures, homeForm && homeForm.fixtureIds, awayForm && awayForm.fixtureIds]);

  var tips = [];
  var t1 = predict1X2(h2h, homeForm, awayForm);
  var t2 = predictOverUnder(h2h, homeForm, awayForm);
  var t3 = predictBTTS(h2h, homeForm, awayForm);
  var t4 = predictDNB(h2h, homeForm, awayForm);
  var t5 = predictCorners(h2hStats.corners);
  var t6 = predictCards(h2hStats.cards);
  if (t1) tips.push(t1);
  if (t2) tips.push(t2);
  if (t3) tips.push(t3);
  if (t4) tips.push(t4);
  if (t5) tips.push(t5);
  if (t6) tips.push(t6);

  var best = pickBestTip(tips);
  if (!best) return null;

  return {
    matchId: match.matchId,
    home: match.home,
    away: match.away,
    league: match.league,
    isLive: match.isLive,
    kickoff: match.kickoff,
    score: match.score,
    minute: match.minute,
    h2h: { total: h2h.total, homeWins: h2h.homeWins, draws: h2h.draws, awayWins: h2h.awayWins },
    form: {
      home: homeForm ? { ppg: homeForm.ppg, avgGF: homeForm.avgGF, avgGA: homeForm.avgGA } : null,
      away: awayForm ? { ppg: awayForm.ppg, avgGF: awayForm.avgGF, avgGA: awayForm.avgGA } : null
    },
    tip: best
  };
}

var buildPromise = null;

async function buildGiantPool() {
  var date = todayStr();
  var filePath = path.join(DATA_DIR, date + '.json');

  // Serve from today's file if it exists — once per day, AND every match is
  // actually for today. The pre-fix build could merge yesterday's fixtures into
  // today's file, so never serve a contaminated pool — rebuild instead.
  try {
    var saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (saved && saved.matches && saved.matches.length) {
      var allToday = saved.matches.every(function (m) {
        return lagosDateStr(m.kickoff).replace(/-/g, '') === date;
      });
      if (allToday) {
        console.log('[author-picks] Serving from saved file for', date);
        return { matches: saved.matches, totalFixtures: saved.totalFixtures || saved.matches.length, analyzedFixtures: saved.matches.length, generatedAt: saved.generatedAt };
      }
      console.warn('[author-picks] Saved file for', date, 'contains non-today matches; rebuilding');
    }
  } catch (e) {}

  // Share an in-flight build so concurrent visitors don't each trigger the heavy work
  if (buildPromise) {
    console.log('[author-picks] Reusing in-flight build for', date);
    return buildPromise;
  }

  buildPromise = doBuild(date).finally(function () { buildPromise = null; });
  return buildPromise;
}

async function doBuild(date) {
  var filePath = path.join(DATA_DIR, date + '.json');
  var res = await httpGet('https://www.fotmob.com/api/data/matches?date=' + date);
  if (!res || res.status !== 200 || !res.data) return { matches: [], generatedAt: new Date().toISOString(), totalFixtures: 0 };

  var allFixtures = extractAllFixtures(res.data, date);
  console.log('[author-picks] Total fixtures for', date, ':', allFixtures.length);

  var limited = allFixtures.slice(0, MAX_MATCHES);
  var enriched = [];

  for (var i = 0; i < limited.length; i += DETAIL_CONCURRENCY) {
    var batch = limited.slice(i, i + DETAIL_CONCURRENCY);
    var results = await Promise.all(batch.map(function (m) { return enrichFixture(m).catch(function () { return null; }); }));
    results.forEach(function (r) { if (r) enriched.push(r); });
    if (i + DETAIL_CONCURRENCY < limited.length) await new Promise(function (r) { setTimeout(r, DETAIL_DELAY_MS); });
  }

  enriched.sort(function (a, b) {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return b.tip.confidence - a.tip.confidence;
  });

  var result = { matches: enriched, totalFixtures: allFixtures.length, analyzedFixtures: enriched.length, generatedAt: new Date().toISOString() };
  if (enriched.length > 0) {
    try { fs.writeFileSync(filePath, JSON.stringify({ matches: enriched, generatedAt: result.generatedAt }), 'utf8'); } catch (e) {}
    console.log('[author-picks] Built and saved', enriched.length, 'of', limited.length, 'fixtures for', date);
  } else {
    console.warn('[author-picks] Build returned no picks for', date, '— not caching, next visit will retry');
  }
  return result;
}

function evaluateTip(tip, score, matchDetails) {
  if (!score || typeof score.home !== 'number') return 'pending';
  var total = score.home + score.away;
  var tipStr = String(tip.tip || '');
  var sel = String(tip.selection || '');

  if (tipStr === '1' || sel === 'Home Win') return score.home > score.away ? 'won' : 'lost';
  if (tipStr === '2' || sel === 'Away Win') return score.away > score.home ? 'won' : 'lost';
  if (tipStr === 'X' || sel === 'Draw') return score.home === score.away ? 'won' : 'lost';

  if (tipStr === 'Home (DNB)') return score.home > score.away ? 'won' : (score.home === score.away ? 'push' : 'lost');
  if (tipStr === 'Away (DNB)') return score.away > score.home ? 'won' : (score.home === score.away ? 'push' : 'lost');

  if (/^Over (\d+\.?\d*)$/.test(tipStr) && !/Corners|Cards/.test(tip.market)) { var ov = parseFloat(RegExp.$1); return total > ov ? 'won' : 'lost'; }
  if (/^Under (\d+\.?\d*)$/.test(tipStr)) { var uv = parseFloat(RegExp.$1); return total < uv ? 'won' : 'lost'; }
  if (tipStr === 'BTTS Yes') return score.home > 0 && score.away > 0 ? 'won' : 'lost';
  if (tipStr === 'BTTS No') return score.home === 0 || score.away === 0 ? 'won' : 'lost';

  if (/^Over (\d+\.?\d*) Corners$/.test(tipStr)) {
    var ct = parseFloat(RegExp.$1);
    if (matchDetails) { var c = extractMatchCorners(matchDetails); if (c !== null) return c > ct ? 'won' : 'lost'; }
    return 'pending';
  }
  if (/^Over (\d+\.?\d*) Cards$/.test(tipStr)) {
    var cdt = parseFloat(RegExp.$1);
    if (matchDetails) { var cd = extractMatchCards(matchDetails); if (cd !== null) return cd > cdt ? 'won' : 'lost'; }
    return 'pending';
  }

  return 'pending';
}

function formatDate(dateStr) {
  var y = dateStr.slice(0, 4), m = dateStr.slice(4, 6), d = dateStr.slice(6, 8);
  return y + '-' + m + '-' + d;
}

function isoTodateStr(isoStr) {
  return isoStr ? isoStr.slice(0, 10).replace(/-/g, '') : '';
}

async function getGiantPoolHistory(days) {
  days = days || 2;
  var results = [];
  var today = todayStr();

  for (var offset = 1; offset <= days; offset++) {
    var date = fotMobDateStr(-offset);
    var dateNice = formatDate(date);
    var filePath = path.join(DATA_DIR, date + '.json');
    var predictions = null;
    try { predictions = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) {}

    var matches = [];
    var res = await httpGet('https://www.fotmob.com/api/data/matches?date=' + date).catch(function () { return null; });

    if (res && res.status === 200 && res.data && res.data.leagues) {
      var resultsByMatchId = {};
      res.data.leagues.forEach(function (league) {
        (league.matches || []).forEach(function (m) {
          if (m.status && m.status.finished) {
            var score = parseScore(m.status);
            if (score) resultsByMatchId[String(m.id)] = score;
          }
        });
      });

      if (predictions && predictions.matches) {
        var needsDetail = predictions.matches.filter(function (m) {
          return m.tip && (/Corners|Cards/.test(m.tip.market || '') || /Corners|Cards/.test(m.tip.tip || ''));
        });
        var detailCache = {};
        for (var di = 0; di < needsDetail.length; di++) {
          var detRes = await httpGet('https://www.fotmob.com/api/data/matchDetails?matchId=' + encodeURIComponent(needsDetail[di].matchId)).catch(function () { return null; });
          if (detRes && detRes.status === 200 && detRes.data) detailCache[needsDetail[di].matchId] = detRes.data;
        }

        predictions.matches.forEach(function (m) {
          var score = resultsByMatchId[String(m.matchId)];
          var details = detailCache[m.matchId] || null;
          var outcome = score ? evaluateTip(m.tip, score, details) : 'pending';
          matches.push({
            matchId: m.matchId, home: m.home, away: m.away, league: m.league,
            tip: m.tip, score: score, outcome: outcome
          });
        });
      } else {
        // No saved predictions; evaluate from fixture list + fresh enrichment
        var allFixtures = [];
        res.data.leagues.forEach(function (league) {
          (league.matches || []).forEach(function (m) {
            if (!m || !m.id || !m.home || !m.away || !m.status || !m.status.finished) return;
            if (/friendly|friendlies|u\d{2}|reserve|reserves|women/i.test(String(league.name || ''))) return;
            var score = parseScore(m.status);
            if (!score) return;
            allFixtures.push({
              matchId: String(m.id), home: m.home.name, away: m.away.name,
              league: league.name, score: score
            });
          });
        });
        allFixtures.forEach(function (f) {
          matches.push({
            matchId: f.matchId, home: f.home, away: f.away, league: f.league,
            tip: null, score: f.score, outcome: 'unanalyzed'
          });
        });
      }
    }

    // Count outcomes
    var won = 0, lost = 0, push = 0, pending = 0, unanalyzed = 0;
    matches.forEach(function (m) {
      if (m.outcome === 'won') won++;
      else if (m.outcome === 'lost') lost++;
      else if (m.outcome === 'push') push++;
      else if (m.outcome === 'pending') pending++;
      else if (m.outcome === 'unanalyzed') unanalyzed++;
    });

    results.push({
      date: dateNice,
      total: matches.length,
      won: won, lost: lost, push: push, pending: pending, unanalyzed: unanalyzed,
      matches: matches
    });
  }

  return results;
}

module.exports = { buildGiantPool, getGiantPoolHistory };
