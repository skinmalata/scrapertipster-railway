const {
  watDate, candidateFrom, allCandidates, applyOdds,
  applyH2HSupport, selectPerFixture, combinations, evaluateTicket,
  MIN_PROBABILITY
} = require('./twoOddsOfDay');

var CATEGORY_MAP = {
  '1x2': '1x2',
  'over15': 'over15',
  'over25': 'over25',
  'btts': 'btts',
  'bttsNo': 'bttsNo',
  'corners': 'corners',
  'cards': 'cards',
  'teamScore': 'teamScore'
};

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

  var generatedAt = new Date().toISOString();
  var date = requestedDate || watDate();

  if (!predictions || !Array.isArray(predictions.matches)) {
    return { available: false, date: date, generatedAt: generatedAt, reason: 'Pre-match data is not available yet.', ticket: null, tickets: [] };
  }

  var availableDates = (predictions.dates || []).slice().sort().reverse();
  if (!availableDates.includes(date) && availableDates.length) {
    date = availableDates[0];
  }

  var candidates = allCandidates(predictions, date);

  if (Array.isArray(markets) && markets.length > 0) {
    var validCategories = markets.filter(function(m) { return CATEGORY_MAP[m]; }).map(function(m) { return CATEGORY_MAP[m]; });
    candidates = candidates.filter(function(c) { return validCategories.includes(c.category); });
  }

  if (safeOnly) {
    candidates = candidates.filter(function(c) { return c.sourceProbability >= 0.8; });
  }

  applyH2HSupport(candidates, h2hMatches);
  applyOdds(candidates, oddsResponse);
  var selections = selectPerFixture(candidates);

  var filtered = selections.filter(function(s) { return s.price >= minOddsPerLeg && s.price <= maxOddsPerLeg; });
  if (filtered.length < 2) {
    return { available: false, date: date, generatedAt: generatedAt, reason: 'Not enough selections match the criteria. Try adjusting market filters or odds range.', ticket: null, tickets: [], candidateCount: selections.length };
  }

  var combos = combinations(filtered, numLegs).filter(function(c) { return c.length === numLegs; });
  var scored = combos.map(evaluateTicket).filter(function(t) { return t.combinedOdds <= maxOdds; });

  scored.sort(function(a, b) {
    var aDiff = Math.abs(a.combinedOdds - targetOdds);
    var bDiff = Math.abs(b.combinedOdds - targetOdds);
    if (aDiff !== bDiff) return aDiff - bDiff;
    var typeRank = { verified: 3, mixed: 2, model: 1 };
    if (typeRank[b.priceType] !== typeRank[a.priceType]) return typeRank[b.priceType] - typeRank[a.priceType];
    return b.adjustedProbability - a.adjustedProbability;
  });

  return {
    available: scored.length > 0,
    date: date,
    generatedAt: generatedAt,
    reason: scored.length > 0 ? null : 'No ticket met the specified criteria. Try adjusting the number of legs or target odds.',
    ticket: scored[0] || null,
    tickets: scored.slice(0, 10),
    candidateCount: selections.length
  };
}

module.exports = { buildTicket };
