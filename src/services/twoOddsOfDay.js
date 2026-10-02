'use strict';

// 2 Odds of the Day -- accumulator pipeline.
//
// This replaces the previous engine, which could not produce a ticket at all.
// It enumerated every combination of up to 4 legs and kept any whose combined
// price landed in 2.50-4.00, but it priced legs from the resident model:
//
//     estimatedOdds(p) = 1 / min(0.92, p + 0.03)
//
// With a 0.70 confidence floor that caps a leg at 1.37, and the live data only
// ever produced 1.09-1.32. The best achievable 4-leg ticket was 2.48, so the
// count of in-band combinations was exactly zero on every day. The route was not
// broken, it was arithmetically incapable of succeeding.
//
// The rewrite drops the site model from the ticket entirely. The predicted
// fixtures and the odds provider's fixtures barely overlap (the scraper leaves
// `league` blank for most rows, and the European leagues are on an international
// break), so a model-ranked accumulator would have had nothing to price. Legs
// come from real bookmaker offers and are ranked on de-vigged implied
// probability -- the market's own consensus -- which means a ticket can be
// published on any day the bookmakers are quoting.
//
// Selection rule: among every accumulator whose combined odds fall in
// 2.50-4.00, publish the one most likely to win.

const { fetchAccumulatorLegs } = require('./oddsComparison');

const TWO_ODDS_MIN = 2.5;
const TWO_ODDS_MAX = 4.0;
const MIN_LEGS = 2;
const MAX_LEGS = 4;
const MIN_LEG_PROBABILITY = 0.4; // consensus floor: below this a leg is a coin flip
const MAX_LEGS_PER_LEAGUE = 2; // never stack more than two legs from one competition
const CORRELATION_PENALTY = 0.94; // applied per extra leg sharing a league
const NODE_CAP = 400000;

function watDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value ? new Date(value) : new Date());
  const result = {};
  parts.forEach(function(part) { result[part.type] = part.value; });
  return result.year + '-' + result.month + '-' + result.day;
}

function eventKey(home, away) {
  return [String(home || ''), String(away || '')]
    .map(function(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, ''); })
    .sort().join('|');
}

function scoreCombo(legs) {
  let combinedOdds = 1;
  let probabilityProduct = 1;
  const perLeague = new Map();

  legs.forEach(function(leg) {
    combinedOdds *= leg.price;
    probabilityProduct *= leg.implied;
    const key = leg.league || 'unknown';
    perLeague.set(key, (perLeague.get(key) || 0) + 1);
  });

  // Legs from the same competition, and more than one kickoff day, are not
  // independent. The ticket is still published, but its stated probability is
  // discounted so the number on the page is not a fiction.
  let penalty = 1;
  perLeague.forEach(function(count) {
    for (let i = 1; i < count; i++) penalty *= CORRELATION_PENALTY;
  });

  return {
    // Copy the array: the search reuses one `chosen` buffer across the whole
    // recursion and pops it on the way back out, so storing the reference would
    // leave `best.legs` empty by the time the search returns.
    legs: legs.slice(),
    combinedOdds: Number(combinedOdds.toFixed(2)),
    adjustedProbability: Number((probabilityProduct * penalty).toFixed(4)),
    priceType: 'verified'
  };
}

function isEligible(ticket) {
  if (ticket.combinedOdds < TWO_ODDS_MIN || ticket.combinedOdds > TWO_ODDS_MAX) return false;
  if (ticket.legs.length < MIN_LEGS || ticket.legs.length > MAX_LEGS) return false;
  return true;
}

// Best-first depth-first search. Legs are ordered by consensus probability so
// strong tickets surface early, and every branch is pruned on two bounds: the
// running product can never fall back below the band once it passes 4.00, and
// the optimistic ceiling for a branch can never beat the incumbent. This
// replaces the old blind enumeration of ~867k combinations.
function searchBest(legs) {
  if (legs.length < MIN_LEGS) return null;

  const ordered = legs.slice().sort(function(a, b) {
    if (b.implied !== a.implied) return b.implied - a.implied;
    return b.price - a.price;
  });

  let best = null;
  let nodes = 0;

  function walk(start, chosen, product, probability, leaguesUsed) {
    if (nodes++ > NODE_CAP) return;

    if (chosen.length >= MIN_LEGS) {
      const ticket = scoreCombo(chosen);
      if (isEligible(ticket) && (!best || ticket.adjustedProbability > best.adjustedProbability)) {
        best = ticket;
      }
    }
    if (chosen.length === MAX_LEGS || product >= TWO_ODDS_MAX) return;

    for (let i = start; i < ordered.length; i++) {
      const leg = ordered[i];
      const nextProduct = product * leg.price;
      if (nextProduct > TWO_ODDS_MAX) continue;

      const leagueCount = (leaguesUsed.get(leg.league) || 0) + 1;
      if (leagueCount > MAX_LEGS_PER_LEAGUE) continue;

      // Optimistic ceiling: even if every remaining leg hit consensus 1.0 with
      // no correlation penalty, this branch cannot beat the incumbent.
      if (best) {
        let ceiling = probability;
        for (let k = i; k < ordered.length; k++) ceiling *= ordered[k].implied;
        if (ceiling < best.adjustedProbability) return;
      }

      chosen.push(leg);
      leaguesUsed.set(leg.league, leagueCount);
      walk(i + 1, chosen, nextProduct, probability * leg.implied, leaguesUsed);
      leaguesUsed.set(leg.league, leagueCount - 1);
      chosen.pop();
    }
  }

  walk(0, [], 1, 1, new Map());
  return best;
}

// The provider is swept separately and cached for 6h; a provider outage yields
// an empty pool and a no-ticket response rather than a failed request.
async function buildTwoOddsOfDay(options) {
  const opts = options || {};
  const date = opts.date || watDate();
  const generatedAt = new Date().toISOString();

  let pool = { legs: [], sports: 0, errors: [] };
  try {
    pool = await fetchAccumulatorLegs(opts.window);
  } catch (error) {
    pool = { legs: [], sports: 0, errors: [error.message] };
  }

  // Only legs kicking off on the requested WAT day may be used. The provider
  // pool spans ~72h, so without this the search happily mixes tomorrow and the
  // day after into a ticket that is labelled with today's date.
  const legs = (pool.legs || []).filter(function(leg) {
    if (!leg || !(leg.price > 1) || !(Number(leg.price) <= TWO_ODDS_MAX)) return false;
    if (!(leg.implied >= MIN_LEG_PROBABILITY)) return false;
    if (leg.day !== date) return false;
    if (leg.kickoffMs && leg.kickoffMs < Date.now()) return false; // already kicked off
    return true;
  });

  if (legs.length < MIN_LEGS) {
    return {
      available: false, date: date, generatedAt: generatedAt,
      reason: pool.errors && pool.errors.length
        ? 'Live bookmaker prices are temporarily unavailable. Please check again shortly.'
        : 'No bookmaker prices are currently available for a qualifying accumulator.',
      ticket: null, candidateCount: legs.length
    };
  }

  const ticket = searchBest(legs);
  if (!ticket) {
    return {
      available: false, date: date, generatedAt: generatedAt,
      reason: 'No combination of today\'s live prices landed between 2.50 and 4.00 combined odds.',
      ticket: null, candidateCount: legs.length
    };
  }

  ticket.legs = ticket.legs.slice().sort(function(a, b) { return b.implied - a.implied; }).map(function(leg) {
    return {
      match: leg.match,
      league: leg.league,
      kickoff: leg.kickoff,
      market: leg.market,
      selection: leg.selection,
      price: leg.price,
      bookmaker: leg.bookmaker,
      priceStatus: leg.priceStatus,
      implied: leg.implied,
      evidence: [
        'Market consensus ' + Math.round(leg.implied * 100) + '%',
        'Best price ' + leg.price.toFixed(2) + ' at ' + leg.bookmaker
      ]
    };
  });

  return {
    available: true, date: date, generatedAt: generatedAt, reason: null, ticket: ticket,
    candidateCount: legs.length,
    methodology: 'Live bookmaker prices on all ' + ticket.legs.length +
      ' legs, published only inside the 2.50-4.00 combined-odds band.'
  };
}

function publicPreview(payload) {
  const ticket = payload && payload.ticket;
  return {
    available: Boolean(ticket), date: payload && payload.date, generatedAt: payload && payload.generatedAt,
    reason: payload && payload.reason, methodology: payload && payload.methodology,
    ticket: ticket ? {
      legCount: ticket.legs.length, combinedOdds: ticket.combinedOdds, priceType: ticket.priceType,
      adjustedProbability: ticket.adjustedProbability, locked: true
    } : null
  };
}

module.exports = {
  buildTwoOddsOfDay, publicPreview, watDate, eventKey, scoreCombo, isEligible, searchBest,
  TWO_ODDS_MIN, TWO_ODDS_MAX, MIN_LEGS, MAX_LEGS, MIN_LEG_PROBABILITY
};
