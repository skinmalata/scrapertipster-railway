const { watDate, candidateFrom, allCandidates, applyOdds, applyH2HSupport, selectPerFixture, evaluateTicket, MIN_PROBABILITY, fixtureKey } = require('./twoOddsOfDay');
const { buildPool, applyLiveOdds } = require('./dailyPool');
const fs = require('fs');
const path = require('path');

var CATEGORY_MAP = {
  '1x2': '1x2',
  'over15': 'over15',
  'over25': 'over25',
  'btts': 'btts',
  'bttsNo': 'bttsNo',
  'corners': 'corners',
  'cards': 'cards',
  'teamScore': 'teamScore',
  'winStreak': 'winStreak',
  'lossStreak': 'lossStreak',
  'drawStreak': 'drawStreak',
  'unbeaten': 'unbeaten'
};

function loadUnbeatenData() {
  var cachePath = path.join(__dirname, '../../h2h-unbeaten-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      var data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      var dates = data.dates;
      if (!dates && data.date && Array.isArray(data.matches)) {
        dates = { [data.date]: data.matches };
      }
      return dates || {};
    }
  } catch (e) {}
  return {};
}

function getUnbeatenForDate(unbeatenDates, date) {
  if (!unbeatenDates || !date) return [];
  if (unbeatenDates[date]) return unbeatenDates[date];
  var sorted = Object.keys(unbeatenDates).sort().reverse();
  return sorted.length ? unbeatenDates[sorted[0]] : [];
}

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function splitMatchName(match) {
  var parts = String(match || '').split(/\s+(?:-|vs)\s+/i).map(function(p) { return p.trim(); });
  return parts.length === 2 && parts[0] && parts[1] ? parts : [];
}

// Selections that can be turned into a real booking code (SportyBet: 1X2,
// Double Chance 1X/X2/12 and Over 1.5/2.5; Betway: plain 1X2).
var BOOKING_CODE_MIN_PROB = 0.55;
var BOOKING_CODE_MIN_ODDS = 1.05;
var BOOKING_CODE_TIPS = {
  '1x2': ['1', 'X', '2', '1X', 'X2', '12'],
  'over15': ['Over 1.5'],
  'over25': ['Over 2.5']
};
function bookingCodeEligible(category, tip) {
  var allowed = BOOKING_CODE_TIPS[category];
  if (!allowed) return false;
  return allowed.indexOf(String(tip || '').trim()) !== -1;
}

function buildTicket(predictions, options) {
  options = options || {};
  var requestedDate = options.date;
  var oddsResponse = options.oddsResponse;
  var h2hMatches = options.h2hMatches;
  var markets = options.markets;
  var safeOnly = options.safeOnly || false;
  var numLegs = options.numLegs || 3;
  var maxOdds = options.maxOdds || 500;
  var minOddsPerLeg = options.minOddsPerLeg || 1.0;
  var maxOddsPerLeg = options.maxOddsPerLeg || 100;
  var targetOdds = options.targetOdds || 20;
  var maxTickets = options.maxTickets || 8;
  var bookingCodeMode = options.bookingCodeMode === true;
  var timeWindowHours = Number(options.timeWindowHours) > 0 ? Number(options.timeWindowHours) : 0;

  // Booking-code legs are valid from ~1.05, so high-confidence picks that
  // estimate below the UI's 1.20 floor are not thrown away.
  if (bookingCodeMode && minOddsPerLeg > BOOKING_CODE_MIN_ODDS) {
    minOddsPerLeg = BOOKING_CODE_MIN_ODDS;
  }

  var generatedAt = new Date().toISOString();
  var date = requestedDate || watDate();

  if (!predictions || !Array.isArray(predictions.matches)) {
    return { available: false, date: date, generatedAt: generatedAt, reason: 'Pre-match data is not available yet.', ticket: null, tickets: [] };
  }

  var availableDates = (predictions.dates || []).slice().sort().reverse();
  if (!availableDates.includes(date) && availableDates.length) {
    date = availableDates[0];
  }

  var unbeatenDates = loadUnbeatenData();
  var unbeatenForDate = getUnbeatenForDate(unbeatenDates, date);

  var poolResult = buildPool(predictions, {
    date: date,
    oddsResponse: oddsResponse,
    h2hMatches: h2hMatches,
    unbeatenData: unbeatenForDate,
    safeOnly: safeOnly,
    minProbability: options.bookingCodeMode === true ? BOOKING_CODE_MIN_PROB : MIN_PROBABILITY,
    minOddsPerLeg: minOddsPerLeg,
    maxOddsPerLeg: maxOddsPerLeg,
    markets: markets,
    maxEntries: 200,
    timeWindowHours: timeWindowHours,
    bookingCodeMode: options.bookingCodeMode === true,
    availableMatches: options.availableMatches
  });

  var pool = poolResult.pool;

  if (Array.isArray(markets) && markets.length > 0) {
    pool = pool.filter(function(p) { return markets.includes(p.category); });
  }

  if (options.bookingCodeMode) {
    pool = pool.filter(function(p) { return bookingCodeEligible(p.category, p.tip); });
  }

  applyLiveOdds(pool, oddsResponse);

  var filtered = pool.filter(function(p) { return p.odds >= minOddsPerLeg && p.odds <= maxOddsPerLeg; });
  if (filtered.length < 2) {
    return {
      available: false, date: date, generatedAt: generatedAt,
      reason: options.bookingCodeMode === true
        ? 'Not enough upcoming matches for a booking code. Matches that have already kicked off or are not offered by the bookmaker were excluded. Try again when the next fixtures are available, or adjust your target odds.'
        : 'Not enough selections match the criteria. Try adjusting market filters or odds range.',
      ticket: null, tickets: [], pool: poolResult
    };
  }

  var minTicketOdds = targetOdds * 0.8;
  var maxTicketOdds = targetOdds * 1.2;
  if (maxOdds && maxTicketOdds > maxOdds) maxTicketOdds = maxOdds;

  var usedPerFixture = new Map();
  var onePerFixture = [];
  filtered.forEach(function(p) {
    var key = p.fixtureKey;
    var existing = usedPerFixture.get(key);
    if (!existing || p.sourceProbability > existing.sourceProbability) {
      usedPerFixture.set(key, p);
    }
  });
  onePerFixture = Array.from(usedPerFixture.values());
  var poolForCombos = onePerFixture.length > 50 ? onePerFixture : filtered;

  // When a kickoff time window is active, combine only the highest-confidence
  // picks from that window so the ticket is built from the best winning
  // outcomes rather than every marginal pick above the probability floor.
  var TOP_PICKS_IN_WINDOW = 15;
  if (timeWindowHours > 0 && poolForCombos.length > TOP_PICKS_IN_WINDOW) {
    var bestInWindow = poolForCombos.slice().sort(function(a, b) { return b.sourceProbability - a.sourceProbability; }).slice(0, TOP_PICKS_IN_WINDOW);
    if (bestInWindow.length >= 2) poolForCombos = bestInWindow;
  }

  if (options.shuffle) {
    poolForCombos.sort(function() { return Math.random() - 0.5; });
  } else {
    poolForCombos.sort(function(a, b) { return a.odds - b.odds; });
  }

  var tickets = [];
  var seenKeys = new Set();
  var MAX_ITER = 50000;
  var iterations = 0;

  function matchIdentity(match) {
    var teams = splitMatchName(match).map(normaliseTeam).filter(Boolean);
    return teams.length === 2 ? teams.sort().join('|') : normaliseTeam(match);
  }

  function backtrack(start, current, product, usedMatches) {
    if (iterations >= MAX_ITER) return;
    if (current.length >= 2 && product >= minTicketOdds) {
      iterations++;
      var key = current.map(function(s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); }).sort().join('||');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        tickets.push({
          selections: current.slice(),
          totalOdds: Number(product.toFixed(2)),
          diff: Math.abs(product - targetOdds)
        });
      }
    }
    if (current.length >= numLegs) return;
    for (var j = start; j < poolForCombos.length; j++) {
      if (iterations >= MAX_ITER) return;
      var p = poolForCombos[j];
      var matchId = matchIdentity(p.match);
      if (usedMatches.has(matchId)) continue;
      var newProduct = product * p.odds;
      if (newProduct > maxTicketOdds) break;
      usedMatches.add(matchId);
      current.push(p);
      backtrack(j + 1, current, newProduct, usedMatches);
      current.pop();
      usedMatches.delete(matchId);
    }
  }

  backtrack(0, [], 1, new Set());

  if (tickets.length === 0) {
    return {
      available: false, date: date, generatedAt: generatedAt,
      reason: 'No ticket met the specified criteria. Try adjusting the number of legs, target odds, or odds range.',
      ticket: null, tickets: [], pool: poolResult
    };
  }

  tickets.sort(function(a, b) { return a.diff - b.diff; });

  var top = [];
  var usedPairs = new Set();
  var usedMatchIds = new Set();
  var taken = new Set();

  for (var round = 0; round < maxTickets; round++) {
    var bestIdx = -1;
    for (var pass = 0; pass < 2 && bestIdx === -1; pass++) {
      var bestScore = -Infinity;
      for (var ti = 0; ti < tickets.length; ti++) {
        if (taken.has(ti)) continue;
        var pairs = tickets[ti].selections.map(function(s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); });
        var matchIds = tickets[ti].selections.map(function(s) { return matchIdentity(s.match); });
        if (pairs.some(function(pair) { return usedPairs.has(pair); })) continue;
        if (pass === 0 && matchIds.some(function(matchId) { return usedMatchIds.has(matchId); })) continue;
        var freshCount = matchIds.filter(function(mId) { return !usedMatchIds.has(mId); }).length;
        var sc = freshCount * 100 - tickets[ti].diff;
        if (sc > bestScore) { bestScore = sc; bestIdx = ti; }
      }
    }
    if (bestIdx === -1) break;
    var t = tickets[bestIdx];
    taken.add(bestIdx);
    top.push(t);
    var tpairs = t.selections.map(function(s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); });
    tpairs.forEach(function(pair) { usedPairs.add(pair); });
    t.selections.forEach(function(s) { usedMatchIds.add(matchIdentity(s.match)); });
  }

  return {
    available: top.length > 0,
    date: date,
    generatedAt: generatedAt,
    reason: top.length > 0 ? null : 'No ticket met the specified criteria.',
    ticket: top[0] || null,
    tickets: top,
    pool: poolResult,
    candidateCount: poolResult.total
  };
}

module.exports = { buildTicket };
