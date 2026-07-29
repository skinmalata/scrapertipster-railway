const { watDate, fixtureKey, estimatedOdds, MIN_PROBABILITY } = require('./twoOddsOfDay');

var UNBEATEN_MIN_PROB = 0.42;
var UNBEATEN_MAX_PROB = 0.85;

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

function buildPool(predictions, options) {
  options = options || {};
  var date = options.date || watDate();
  var oddsResponse = options.oddsResponse;
  var h2hMatches = options.h2hMatches;
  var unbeatenData = options.unbeatenData;
  var safeOnly = options.safeOnly || false;
  var minProbability = options.minProbability || MIN_PROBABILITY;
  var minOdds = options.minOddsPerLeg || 1.0;
  var maxOdds = options.maxOddsPerLeg || 100;
  var markets = options.markets;
  var maxEntries = options.maxEntries;

  if (!predictions || !Array.isArray(predictions.matches)) {
    return { pool: [], date: date, total: 0 };
  }

  var availableDates = (predictions.dates || []).slice().sort().reverse();
  if (!availableDates.includes(date) && availableDates.length) {
    date = availableDates[0];
  }

  var pool = [];
  var seen = new Set();

  function pickKey(match, tip, pickDate) {
    return fixtureKey(match) + '|' + String(tip || '').trim().toLowerCase() + '|' + (pickDate || date);
  }

  function addPicks(category, matches, tipMap, probabilityFn) {
    if (!Array.isArray(matches)) return;
    if (Array.isArray(markets) && markets.length > 0 && !markets.includes(category)) return;

    matches.forEach(function(source) {
      var matchName = source.nextMatch || source.match;
      if (!matchName) return;

      var tip = typeof tipMap === 'function' ? tipMap(source) : (source.tip || '');
      if (!tip) return;

      var rawProb = probabilityFn ? probabilityFn(source) : Number(source.probability);
      var prob = Number.isFinite(rawProb) && rawProb > 0 ? (rawProb > 1 ? rawProb / 100 : rawProb) : 0;
      if (prob < minProbability) return;

      var pickDate = source.date || date;
      if (pickDate !== date) return;

      var key = pickKey(matchName, tip, pickDate);
      if (seen.has(key)) return;
      seen.add(key);

      var p = Math.min(0.92, prob);
      var odds = estimatedOdds(p);

      if (odds < minOdds || odds > maxOdds) return;

      pool.push({
        match: matchName,
        tip: tip,
        odds: odds,
        probability: Math.round(prob * 100),
        date: pickDate,
        time: source.time || '',
        league: source.league || '',
        category: category,
        sourceProbability: prob,
        fixtureKey: fixtureKey(matchName),
        streak: source.streak || null,
        oddsSource: 'estimated',
        bookmaker: '',
        evidence: []
      });
    });
  }

  addPicks('1x2', predictions.matches);
  addPicks('over15', predictions.over15Matches);
  addPicks('over25', predictions.over25Matches);
  addPicks('btts', predictions.bttsMatches);
  addPicks('bttsNo', predictions.bttsNoMatches);
  addPicks('corners', predictions.cornersMatches);
  addPicks('cards', predictions.cardsMatches);
  addPicks('teamScore', predictions.teamToScore2PlusMatches);

  addPicks('winStreak', predictions.winstreakMatches);
  addPicks('lossStreak', predictions.losestreakMatches);
  addPicks('drawStreak', predictions.drawstreakMatches);

  if (unbeatenData && Array.isArray(unbeatenData)) {
    if (!Array.isArray(markets) || markets.length === 0 || markets.includes('unbeaten')) {
      unbeatenData.forEach(function(item) {
        if (!item.match || !Array.isArray(item.streaks)) return;
        (item.streaks || []).forEach(function(s) {
          var tipText = (s.team || '') + ' or Draw';
          if (!tipText) return;

          var rawProb = Math.min(UNBEATEN_MAX_PROB, Math.max(UNBEATEN_MIN_PROB, 0.50 + (Number(s.count) || 0) * 0.02));
          var prob = Math.min(0.92, rawProb);
          if (prob < minProbability) return;

          var odds = estimatedOdds(prob);
          if (odds < minOdds || odds > maxOdds) return;

          var key = pickKey(item.match, tipText, date);
          if (seen.has(key)) return;
          seen.add(key);

          pool.push({
            match: item.match,
            tip: tipText,
            odds: odds,
            probability: Math.round(prob * 100),
            date: date,
            time: item.time || '',
            league: item.league || '',
            category: 'Unbeaten',
            sourceProbability: prob,
            fixtureKey: fixtureKey(item.match),
            streak: null,
            oddsSource: 'estimated',
            bookmaker: '',
            evidence: []
          });
        });
      });
    }
  }

  if (safeOnly) {
    pool = pool.filter(function(p) { return p.sourceProbability >= 0.8; });
  }

  if (maxEntries && pool.length > maxEntries) {
    pool.sort(function(a, b) { return b.sourceProbability - a.sourceProbability; });
    pool = pool.slice(0, maxEntries);
  }

  return {
    pool: pool,
    date: date,
    total: pool.length
  };
}

function applyLiveOdds(pool, oddsResponse) {
  if (!oddsResponse || !Array.isArray(oddsResponse)) return pool;
  var fixtures = oddsResponse;

  var CATEGORY_MARKET_MAP = {
    '1x2': { market: 'Match Winner', valueMap: { '1': ['1', 'home'], 'X': ['x', 'draw'], '2': ['2', 'away'] } },
    'over15': { market: 'Goals Over/Under' },
    'over25': { market: 'Goals Over/Under' },
    'btts': { market: 'Both Teams Score', valueMap: { yes: ['yes'], no: ['no'] } },
    'bttsNo': { market: 'Both Teams Score', valueMap: { yes: ['yes'], no: ['no'] } },
    'corners': { market: 'Corners Over/Under' },
    'cards': { market: 'Cards Over/Under' }
  };

  pool.forEach(function(pick) {
    var pair = splitMatchName(pick.match).map(normaliseTeam);
    if (pair.length !== 2) return;

    var fixture = fixtures.find(function(f) {
      return normaliseTeam(f.teams && f.teams.home && f.teams.home.name) === pair[0] &&
        normaliseTeam(f.teams && f.teams.away && f.teams.away.name) === pair[1];
    });
    if (!fixture) return;

    var catMap = CATEGORY_MARKET_MAP[pick.category];
    if (!catMap) return;

    var bookmakers = Array.isArray(fixture.bookmakers) ? fixture.bookmakers : [];
    var preferredId = Number(process.env.PRIMARY_ODDS_BOOKMAKER_ID);
    var ordered = bookmakers.slice().sort(function(a, b) {
      return Number(b.id === preferredId) - Number(a.id === preferredId);
    });

    for (var bi = 0; bi < ordered.length; bi++) {
      var bets = Array.isArray(ordered[bi].bets) ? ordered[bi].bets : [];
      for (var mi = 0; mi < bets.length; mi++) {
        var bet = bets[mi];
        if (normaliseTeam(bet.name) !== normaliseTeam(catMap.market)) continue;

        var targetValue = catMap.valueMap ? catMap.valueMap[pick.tip] : [pick.tip.toLowerCase()];
        if (!targetValue) targetValue = [pick.tip.toLowerCase()];

        var value = (bet.values || []).find(function(v) {
          return targetValue.some(function(tv) { return normaliseTeam(v.value) === normaliseTeam(tv); });
        });
        var price = value && Number.parseFloat(value.odd);
        if (Number.isFinite(price) && price > 1) {
          pick.odds = Number(price.toFixed(2));
          pick.oddsSource = 'verified';
          pick.bookmaker = ordered[bi].name || 'API-Football';
          return;
        }
      }
    }
  });

  return pool;
}

function applyH2HConfidence(pool, h2hMatches) {
  if (!Array.isArray(h2hMatches)) return pool;
  pool.forEach(function(pick) {
    var entry = h2hMatches.find(function(item) { return fixtureKey(item.match) === pick.fixtureKey; });
    if (!entry || !Array.isArray(entry.streaks)) return;
    var streaks = entry.streaks;
    var strongest = streaks.slice().sort(function(a, b) { return Number(b.count || 0) - Number(a.count || 0); })[0];
    if (strongest) {
      var boost = Math.min(4, Math.max(1, Number(strongest.count || 0) - 5));
      pick.confidence = Math.min(95, (pick.sourceProbability * 100) + boost);
    }
  });
  return pool;
}

module.exports = { buildPool, applyLiveOdds, applyH2HConfidence, normaliseTeam, splitMatchName };
