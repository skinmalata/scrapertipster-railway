'use strict';

const { decodeSportybet, decodeMsport, createSportybetCode, createMsportCode } = require('./sportradar');
const { decodeBet9ja, createBet9jaCode } = require('./bet9ja');
const { decodeBetway, createBetwayCode } = require('./betway');
const { decodeBetking } = require('./betking');
const { decodeBangbet, createBangbetCode } = require('./bangbet');
const { BOOKMAKERS, isSportradar, canonicalize, buildLegs, unsupportedMarketError } = require('./matcher');
const { resolveLeg, getAvailableMatches } = require('./resolver');

const MAX_LEGS = 30;

// Short in-memory cache so the same code is not re-sent to the bookmaker on
// every click. 5 minutes TTL keeps returned odds current enough for a preview.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const resultCache = new Map();

function cacheGet(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (resultCache.size >= CACHE_MAX) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
  resultCache.set(key, { at: Date.now(), value: value });
}

// Passive provider health: remembers the last upstream failure per bookmaker so
// /api/converter/status can report when a provider is unreachable.
const providerHealth = {};
function recordProviderFailure(bookmaker, err) {
  if (!bookmaker || !err) return;
  const isUpstream = err.code === 'NETWORK_ERROR' || err.code === 'NO_CODE' || err.code === 'UPSTREAM_ERROR';
  if (isUpstream) providerHealth[bookmaker] = Date.now();
}
function providerStatus() {
  const now = Date.now();
  return BOOKMAKERS.map(function (b) {
    const last = providerHealth[b];
    return {
      bookmaker: b,
      bookmakerName: LABELS[b],
      healthy: !last || (now - last) > 60 * 1000,
      lastFailureAt: last ? new Date(last).toISOString() : null
    };
  });
}

const DECODERS = {
  sportybet: decodeSportybet,
  msport: decodeMsport,
  betway: decodeBetway,
  bet9ja: decodeBet9ja,
  betking: decodeBetking,
  bangbet: decodeBangbet
};

const LABELS = {
  sportybet: 'SportyBet',
  msport: 'MSport',
  betway: 'Betway',
  bet9ja: 'Bet9ja',
  betking: 'BetKing',
  bangbet: 'Bangbet'
};

function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_REQUEST';
  return err;
}

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function assertBookmaker(bookmaker) {
  if (!BOOKMAKERS.includes(bookmaker)) {
    throw badRequest('Unknown bookmaker "' + bookmaker + '". Choose sportybet, msport, betway, bet9ja, betking or bangbet.');
  }
}

function totalOdds(legs) {
  let product = 1;
  let hasOdds = false;
  for (const leg of legs) {
    const odd = Number(leg.odds);
    if (Number.isFinite(odd) && odd > 0) {
      product *= odd;
      hasOdds = true;
    }
  }
  return hasOdds ? Number(product.toFixed(2)) : null;
}

async function decodeCode(input) {
  const code = normalizeCode(input && input.code);
  const bookmaker = input && input.bookmaker;
  if (!code) throw badRequest('Please enter a booking code.');
  assertBookmaker(bookmaker);

  const cacheKey = 'd:' + bookmaker + ':' + code;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const legs = await DECODERS[bookmaker](code);
    if (legs.length > MAX_LEGS) {
      const err = new Error('Booking codes with more than ' + MAX_LEGS + ' selections are not supported.');
      err.code = 'TOO_MANY_LEGS';
      throw err;
    }

    const result = {
      code: code,
      bookmaker: bookmaker,
      bookmakerName: LABELS[bookmaker],
      legs: legs,
      legCount: legs.length,
      totalOdds: totalOdds(legs)
    };
    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    recordProviderFailure(bookmaker, err);
    throw err;
  }
}

function keepLegsFilter(legs, keepLegs) {
  if (!Array.isArray(keepLegs) || !keepLegs.length) return legs;
  const indices = keepLegs.map(Number).filter(function (n) { return Number.isFinite(n); });
  const kept = legs.filter(function (leg, index) { return indices.includes(index); });
  if (!kept.length) throw badRequest('None of the selected legs are part of this code.');
  return kept;
}

async function createCode(bookmaker, legs) {
  if (bookmaker === 'bet9ja') return createBet9jaCode(legs);
  if (bookmaker === 'msport') return createMsportCode(legs);
  if (bookmaker === 'betway') return createBetwayCode(legs);
  if (bookmaker === 'betking') {
    const err = new Error('BetKing booking code creation is not supported yet.');
    err.code = 'INVALID_SELECTIONS';
    throw err;
  }
  if (bookmaker === 'bangbet') {
    return createBangbetCode(legs);
  }
  return createSportybetCode(legs);
}

// Build a booking code from plain ticket selections ({ match, tip, category }).
// Used by the ticket builder: legs are resolved to the bookmaker's native ids
// (SportyBet: 1X2 + Double Chance + Over 1.5/2.5, Betway: 1X2 only) and then
// minted through the same public share API as the converter.
async function createCodeFromLegs(input) {
  const bookmaker = input && input.bookmaker;
  const legs = input && Array.isArray(input.legs) ? input.legs : [];
  if (!bookmaker || !legs.length) throw badRequest('Please provide a bookmaker and at least one selection.');
  assertBookmaker(bookmaker);
  if (bookmaker !== 'sportybet' && bookmaker !== 'betway') {
    throw badRequest('Booking code creation is supported for sportybet and betway only.');
  }
  if (legs.length > MAX_LEGS) {
    const err = new Error('Booking codes with more than ' + MAX_LEGS + ' selections are not supported.');
    err.code = 'TOO_MANY_LEGS';
    throw err;
  }

  const resolved = [];
  for (const leg of legs) {
    resolved.push(await resolveLeg(leg, bookmaker));
  }

  const code = bookmaker === 'betway'
    ? await createBetwayCode(resolved)
    : await createSportybetCode(resolved);

  return {
    code: code,
    bookmaker: bookmaker,
    bookmakerName: LABELS[bookmaker],
    legCount: resolved.length
  };
}

function sameFamily(from, to) {
  return from === to || (isSportradar(from) && isSportradar(to));
}

// Cross-bookmaker conversion reduces every leg to its Sportradar event id and
// 1X2 sign (all four bookmakers share the numeric id), then rebuilds native
// ids for the target. Same-family conversions (SportyBet <-> MSport) keep the
// original platform ids so any market passes through unchanged.
async function convertCode(input) {
  const code = normalizeCode(input && input.code);
  const from = input && input.from;
  const to = input && input.to;
  if (!code) throw badRequest('Please enter a booking code.');
  assertBookmaker(from);
  assertBookmaker(to);

  const keepLegs = (input && input.keepLegs) || [];
  const cacheKey = 'c:' + from + ':' + to + ':' + code + ':' + keepLegs.join(',');
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const source = await decodeCode({ code: code, bookmaker: from });
    let legs = source.legs;
    legs = keepLegsFilter(legs, keepLegs);

    let newCode;
    if (sameFamily(from, to)) {
      newCode = await createCode(to, legs);
    } else {
      const canonicals = [];
      for (const leg of legs) {
        const canonical = await canonicalize(from, leg);
        if (!canonical) throw unsupportedMarketError(leg);
        canonical.eventName = leg.eventName || leg.E_NAME || '';
        canonical.marketName = leg.marketName || leg.M_NAME || '';
        canonical.outcomeName = leg.outcomeName || leg.SGN || '';
        canonical.odds = Number(leg.odds || leg.V || 0);
        canonicals.push(canonical);
      }
      newCode = await createCode(to, await buildLegs(to, canonicals));
    }

    const result = {
      code: newCode,
      from: from,
      fromName: LABELS[from],
      to: to,
      toName: LABELS[to],
      legCount: legs.length,
      totalOdds: totalOdds(legs)
    };
    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    recordProviderFailure(from, err);
    recordProviderFailure(to, err);
    throw err;
  }
}

module.exports = { decodeCode, convertCode, createCodeFromLegs, providerStatus, getAvailableMatches, BOOKMAKERS, LABELS, MAX_LEGS };
