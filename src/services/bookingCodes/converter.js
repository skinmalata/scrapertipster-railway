'use strict';

const { decodeSportybet, decodeMsport, createSportybetCode, createMsportCode } = require('./sportradar');
const { decodeBet9ja, createBet9jaCode } = require('./bet9ja');
const { decodeBetway, createBetwayCode } = require('./betway');
const { decodeBetking } = require('./betking');
const { decodeBangbet, createBangbetCode } = require('./bangbet');
const { decodeBetPawa, createBetPawaCode, resolvePawaLeg } = require('./betpawa');
const { BOOKMAKERS, isSportradar, canonicalize, buildLegs, unsupportedMarketError } = require('./matcher');
const { resolveLeg, getAvailableMatches } = require('./resolver');

const MAX_LEGS = 30;
const MAX_CODES = 20;

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
  bangbet: decodeBangbet,
  betpawa: decodeBetPawa
};

const LABELS = {
  sportybet: 'SportyBet',
  msport: 'MSport',
  betway: 'Betway',
  bet9ja: 'Bet9ja',
  betking: 'BetKing',
  bangbet: 'Bangbet',
  betpawa: 'betPawa'
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
    throw badRequest('Unknown bookmaker "' + bookmaker + '". Choose sportybet, msport, betway, bet9ja, betking, bangbet or betpawa.');
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
  if (bookmaker === 'betpawa') return createBetPawaCode(legs);
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
// (SportyBet: 1X2 + Double Chance + Over 1.5/2.5, Betway: 1X2 only, betPawa:
// 1X2 only) and then minted through the same public share API as the converter.
async function createCodeFromLegs(input) {
  const bookmaker = input && input.bookmaker;
  const legs = input && Array.isArray(input.legs) ? input.legs : [];
  if (!bookmaker || !legs.length) throw badRequest('Please provide a bookmaker and at least one selection.');
  assertBookmaker(bookmaker);
  if (bookmaker !== 'sportybet' && bookmaker !== 'betway' && bookmaker !== 'betpawa') {
    throw badRequest('Booking code creation is supported for sportybet, betway and betpawa only.');
  }
  if (legs.length > MAX_LEGS) {
    const err = new Error('Booking codes with more than ' + MAX_LEGS + ' selections are not supported.');
    err.code = 'TOO_MANY_LEGS';
    throw err;
  }

  const resolved = [];
  if (bookmaker === 'betpawa') {
    for (const leg of legs) {
      resolved.push(await resolvePawaLeg(leg));
    }
  } else {
    for (const leg of legs) {
      resolved.push(await resolveLeg(leg, bookmaker));
    }
  }

  let code;
  if (bookmaker === 'betway') {
    code = await createBetwayCode(resolved);
  } else if (bookmaker === 'betpawa') {
    code = await createBetPawaCode(resolved);
  } else {
    code = await createSportybetCode(resolved);
  }

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

// Maps decoded source legs onto the target bookmaker's native ids. Same-family
// bookmakers (SportyBet <-> MSport) pass through untouched so any market
// survives; everything else is reduced to the shared Sportradar event id and
// rebuilt for the target.
async function toTargetLegs(from, to, legs) {
  if (sameFamily(from, to)) return legs;
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
  return buildLegs(to, canonicals);
}

// Identity of a single selection, used to collapse duplicate legs when codes
// are merged. Bet9ja legs arrive with Bet9ja field names, so both shapes are
// accepted.
function legIdentity(leg) {
  const event = leg.eventId || leg.E_ID || leg.eventName || leg.E_NAME || '';
  const market = leg.marketId || leg.GID || leg.marketName || leg.M_NAME || '';
  const outcome = leg.outcomeId || leg.SGID || leg.SGN || leg.outcomeName || '';
  return [event, market, outcome].join('|');
}

function chunkLegs(legs, size) {
  const chunks = [];
  for (let i = 0; i < legs.length; i += size) {
    chunks.push(legs.slice(i, i + size));
  }
  return chunks;
}

function legCountError(count) {
  const err = new Error('That would need ' + count + ' selections, but a single SportyBet booking code holds at most ' + MAX_LEGS + '. Reduce the number of selections and try again.');
  err.code = 'TOO_MANY_LEGS';
  return err;
}

// Split one booking code into several codes for the target bookmaker (default
// SportyBet). The caller chooses how many selections go into each code.
async function splitCode(input) {
  const from = input && input.from;
  const to = (input && input.to) || 'sportybet';
  const perCode = Number(input && input.perCode);
  assertBookmaker(from);
  assertBookmaker(to);

  if (!Number.isInteger(perCode) || perCode < 2 || perCode > MAX_LEGS) {
    throw badRequest('Choose how many selections go into each code (between 2 and ' + MAX_LEGS + ').');
  }

  const supplied = input && Array.isArray(input.legs) ? input.legs : null;
  if (supplied && !supplied.length) throw badRequest('No selections were found in this booking code.');

  const source = supplied
    ? { code: normalizeCode(input.code) || '', bookmaker: from, legs: supplied, legCount: supplied.length }
    : await decodeCode({ code: input.code, bookmaker: from });

  const targetLegs = await toTargetLegs(from, to, source.legs);
  if (targetLegs.length < 2) {
    throw badRequest('This code has a single selection, so there is nothing to split.');
  }
  if (perCode >= targetLegs.length) {
    throw badRequest('This code has ' + targetLegs.length + ' selections, which already fits in one SportyBet code. Choose ' + targetLegs.length + ' or fewer selections per code to split it.');
  }

  const parts = [];
  for (const chunk of chunkLegs(targetLegs, perCode)) {
    const code = await createCode(to, chunk);
    parts.push({
      code: code,
      legCount: chunk.length,
      totalOdds: totalOdds(chunk),
      legs: chunk
    });
  }

  return {
    from: from,
    fromName: LABELS[from],
    to: to,
    toName: LABELS[to],
    sourceCode: source.code,
    totalSelections: targetLegs.length,
    perCode: perCode,
    partCount: parts.length,
    parts: parts
  };
}

// Merge several booking codes into a single code for the target bookmaker
// (default SportyBet). Duplicate selections are collapsed into one leg.
async function mergeCodes(input) {
  const to = (input && input.to) || 'sportybet';
  assertBookmaker(to);

  const raw = Array.isArray(input && input.codes) ? input.codes : [];
  if (raw.length < 2) throw badRequest('Add at least two booking codes to merge.');
  if (raw.length > MAX_CODES) {
    throw badRequest('Merge at most ' + MAX_CODES + ' booking codes at a time. You entered ' + raw.length + '.');
  }

  const entries = raw.map(function (item, index) {
    if (item && typeof item === 'object') {
      const bookmaker = item.bookmaker;
      assertBookmaker(bookmaker);
      if (Array.isArray(item.legs) && item.legs.length) {
        return { bookmaker: bookmaker, legs: item.legs, code: normalizeCode(item.code) || '' };
      }
      if (!item.code) throw badRequest('Booking code ' + (index + 1) + ' is empty.');
      return { bookmaker: bookmaker, code: String(item.code) };
    }
    throw badRequest('Could not read booking code ' + (index + 1) + '.');
  });

  const sources = [];
  const targetLegs = [];
  for (const entry of entries) {
    const decoded = entry.legs
      ? { code: entry.code || '', bookmaker: entry.bookmaker, legs: entry.legs, legCount: entry.legs.length }
      : await decodeCode({ code: entry.code, bookmaker: entry.bookmaker });
    sources.push({
      code: decoded.code,
      bookmaker: entry.bookmaker,
      bookmakerName: LABELS[entry.bookmaker],
      legCount: decoded.legs.length
    });
    for (const leg of await toTargetLegs(entry.bookmaker, to, decoded.legs)) {
      targetLegs.push(leg);
    }
  }

  if (!targetLegs.length) throw badRequest('The booking codes you entered contain no selections.');

  const seen = new Set();
  const unique = [];
  let duplicatesMerged = 0;
  for (const leg of targetLegs) {
    const key = legIdentity(leg);
    if (seen.has(key)) {
      duplicatesMerged++;
      continue;
    }
    seen.add(key);
    unique.push(leg);
  }

  if (!unique.length) throw badRequest('Every selection in these codes is a duplicate, so there is nothing to merge.');
  if (unique.length > MAX_LEGS) throw legCountError(unique.length);

  const code = await createCode(to, unique);

  return {
    code: code,
    to: to,
    toName: LABELS[to],
    legCount: unique.length,
    totalOdds: totalOdds(unique),
    sourceCount: sources.length,
    sources: sources,
    duplicatesMerged: duplicatesMerged,
    legs: unique
  };
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
    const legs = keepLegsFilter(source.legs, keepLegs);

    const newCode = await createCode(to, await toTargetLegs(from, to, legs));

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

module.exports = {
  decodeCode,
  convertCode,
  splitCode,
  mergeCodes,
  createCodeFromLegs,
  providerStatus,
  getAvailableMatches,
  BOOKMAKERS,
  LABELS,
  MAX_LEGS,
  MAX_CODES
};
