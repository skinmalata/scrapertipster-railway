'use strict';

const { resolveExtid, resolveEidFromExtid } = require('./bet9ja');
const { getPawaIndex, findEventBySrId, normaliseTeam } = require('./betpawa');

const BOOKMAKERS = ['sportybet', 'msport', 'betway', 'bet9ja', 'betking', 'bangbet', 'betpawa'];

function isSportradar(bookmaker) {
  return bookmaker === 'sportybet' || bookmaker === 'msport';
}

function isBetway(bookmaker) {
  return bookmaker === 'betway';
}

function isBet9ja(bookmaker) {
  return bookmaker === 'bet9ja';
}

function isBetking(bookmaker) {
  return bookmaker === 'betking';
}

function isBangbet(bookmaker) {
  return bookmaker === 'bangbet';
}

function isBetpawa(bookmaker) {
  return bookmaker === 'betpawa';
}

// All four bookmakers resolve a match to the same Sportradar numeric event id
// (SportyBet/MSport: sr:match:<id>, Betway: sportEvent.eventId, Bet9ja: EXTID,
// which the coupon decode exposes only as the internal E_ID, so Bet9ja legs are
// resolved E_ID -> EXTID during canonicalization and EXTID -> E_ID when
// rebuilding a Bet9ja code).
// For 1X2 the sign maps to per-bookmaker outcome ids as:
//   SportyBet/MSport outcomeId: 1 = Home, 2 = Draw, 3 = Away
//   Betway outcomeId suffix:    1 = Home, 2 = Draw, 3 = Away
//   Bet9ja SGN:                 1 = Home, X = Draw, 2 = Away
// The matcher reduces every leg to { eventId, sign } and rebuilds the native
// ids for the target bookmaker, which keeps cross-family codes exact.

const SIGN = { H: 'H', D: 'D', A: 'A' };
const SR_OUTCOME = { H: '1', D: '2', A: '3' };
const BETWAY_INDEX = { H: '1', D: '2', A: '3' };
const BET9JA_SIGN = { H: '1', D: 'X', A: '2' };

function unresolvedEventError(detail) {
  const err = new Error(
    'The match for "' + detail + '" could not be found on the target bookmaker, so the code was not created. The event may have been removed or renamed.'
  );
  err.code = 'UNRESOLVED_EVENT';
  return err;
}

function unsupportedMarketError(leg) {
  const err = new Error(
    'Only 1X2 selections can be converted across these bookmakers right now. The "' +
      (leg.marketName || leg.M_NAME || leg.outcomeName || 'selection') +
      '" market in this code is not supported for cross-bookmaker conversion, so the code was not created.'
  );
  err.code = 'UNSUPPORTED_MARKET';
  return err;
}

// --- extraction of the canonical { eventId, sign } from each bookmaker's leg ---

function numericEventId(eventId) {
  if (typeof eventId === 'number') return String(eventId);
  const str = String(eventId || '').trim();
  const m = /^(?:sr:match:)?(\d+)$/.exec(str);
  return m ? m[1] : null;
}

function canonicalizeSportradar(leg) {
  const eventId = numericEventId(leg.eventId);
  if (!eventId) return null;
  if (String(leg.marketId) !== '1') return null; // 1X2 only
  const outcomeId = String(leg.outcomeId);
  if (!/^[123]$/.test(outcomeId)) return null;
  const sign = outcomeId === '1' ? SIGN.H : outcomeId === '2' ? SIGN.D : SIGN.A;
  return { eventId: eventId, sign: sign };
}

function canonicalizeBetway(leg) {
  const eventId = numericEventId(leg.eventId);
  if (!eventId) return null;
  const marketTypeCName = (leg.market && leg.market.marketTypeCName) || leg.marketTypeCName || '';
  if (marketTypeCName && marketTypeCName !== 'win-draw-win') return null;
  const outcomeId = String(leg.outcomeId || '');
  const idx = outcomeId.slice(-1);
  if (!/^[123]$/.test(idx)) return null;
  const sign = idx === '1' ? SIGN.H : idx === '2' ? SIGN.D : SIGN.A;
  return { eventId: eventId, sign: sign };
}

// Bet9ja legs carry the internal E_ID, so resolving to the shared EXTID is an
// async call (cached inside bet9ja.js).
async function canonicalizeBet9ja(leg) {
  const sgn = String(leg.SGN || '');
  let sign = null;
  if (sgn === '1') sign = SIGN.H;
  else if (sgn === 'X') sign = SIGN.D;
  else if (sgn === '2') sign = SIGN.A;
  if (!sign) return null;
  const extid = await resolveExtid(leg.E_ID);
  if (!extid) throw unresolvedEventError(leg.E_NAME || String(leg.E_ID));
  return { eventId: extid, sign: sign };
}

// BetKing legs carry the Sportradar match id in providerEventId and 1X2
// selectionName "1"=Home / "2"=Draw / "3"=Away (same naming as Sportradar).
function canonicalizeBetking(leg) {
  const eventId = numericEventId(leg.providerEventId);
  if (!eventId) return null;
  if ((leg.marketName || '').toUpperCase() !== '1X2' && !(leg.marketTypeId === 110)) return null;
  const outcomeName = String(leg.outcomeName || '');
  let sign = null;
  if (outcomeName === '1') sign = SIGN.H;
  else if (outcomeName === '2') sign = SIGN.D;
  else if (outcomeName === '3') sign = SIGN.A;
  if (!sign) return null;
  return { eventId: eventId, sign: sign };
}

// Bangbet runs on the same Sportradar platform as SportyBet/MSport, so its
// legs already carry sr:match:<id> event ids and the same 1X2 market/outcome
// ids (marketId "1", outcomeId "1"/"2"/"3"). Reuse the Sportradar rule.
function canonicalizeBangbet(leg) {
  return canonicalizeSportradar(leg);
}

// betPawa is a native platform, not Sportradar. Its decoded legs carry the
// betPawa event id and a 1X2 selection named like the price ("1" = Home,
// "X" = Draw, "2" = Away). The 1X2 - FT market type id is "3743". The shared
// Sportradar match id is recovered by matching the teams against the live
// betPawa events feed, which also embeds a SPORTRADAR widget id per event.
async function canonicalizeBetpawa(leg) {
  const sign = { '1': SIGN.H, X: SIGN.D, '2': SIGN.A }[String(leg.outcomeName || '').trim()];
  if (!sign) return null;
  if (String(leg.marketId) !== '3743') return null;
  const pair = String(leg.eventName || '').split(/\s+(?:-|vs)\s+/i).map(function (part) { return part.trim(); });
  if (pair.length !== 2) return null;
  let event = null;
  try {
    const index = await getPawaIndex();
    const key = normaliseTeam(pair[0]) + '|' + normaliseTeam(pair[1]);
    for (const ev of index) {
      if (ev.key === key) { event = ev; break; }
    }
  } catch (e) {
    return null;
  }
  if (!event || !event.srId) return null;
  return { eventId: event.srId, sign: sign };
}

async function canonicalize(bookmaker, leg) {
  if (isSportradar(bookmaker)) return canonicalizeSportradar(leg);
  if (isBetway(bookmaker)) return canonicalizeBetway(leg);
  if (isBet9ja(bookmaker)) return canonicalizeBet9ja(leg);
  if (isBetking(bookmaker)) return canonicalizeBetking(leg);
  if (isBangbet(bookmaker)) return canonicalizeBangbet(leg);
  if (isBetpawa(bookmaker)) return canonicalizeBetpawa(leg);
  return null;
}

// --- rebuilding native selections for the target bookmaker ---

function toSportradarSelection(canonical) {
  return {
    eventId: 'sr:match:' + canonical.eventId,
    marketId: '1',
    outcomeId: SR_OUTCOME[canonical.sign],
    specifier: null
  };
}

// Bangbet uses the same Sportradar ids and 1X2 outcome ids as SportyBet/MSport,
// but its /share API also needs the odds for each selection.
function toBangbetSelection(canonical) {
  return {
    eventId: 'sr:match:' + canonical.eventId,
    marketId: '1',
    specifiers: '',
    outcomeId: SR_OUTCOME[canonical.sign],
    odds: Number(canonical.odds) > 0 ? Number(canonical.odds) : 1
  };
}

function toBetwayOutcome(canonical) {
  const marketId = canonical.eventId + '1';
  return {
    outcomeId: marketId + BETWAY_INDEX[canonical.sign],
    eventId: Number(canonical.eventId),
    marketId: marketId
  };
}

// Bet9ja's BookABetV2 expects the internal E_ID, not the Sportradar EXTID, so
// each canonical match is resolved back to its Bet9ja event before building.
async function toBet9jaGame(canonical) {
  const resolved = await resolveEidFromExtid(canonical.eventId);
  if (!resolved) throw unresolvedEventError(canonical.eventName || canonical.eventId);
  const sign = BET9JA_SIGN[canonical.sign];
  const sid = 'S_1X2_' + sign;
  return {
    SGN: sign,
    M_NAME: '1X2',
    V: Number(canonical.odds) > 0 ? Number(canonical.odds) : 1,
    E_ID: Number(resolved.eid),
    E_NAME: resolved.name || canonical.eventName || '',
    SPORT_ID: Number(resolved.sportId || 1),
    id: resolved.eid + '$' + sid
  };
}

// betPawa minting needs the live price id for each canonical leg. Resolve the
// Sportradar match id to the betPawa event (the feed embeds a SPORTRADAR widget
// id), then pick the price whose sign matches the canonical 1X2 pick.
const PAWA_PRICE_NAME = { H: '1', D: 'X', A: '2' };

async function toBetpawaSelection(canonical) {
  if (!canonical || !canonical.eventId) throw unresolvedEventError(canonical && (canonical.eventName || canonical.eventId));
  let event = null;
  try {
    const index = await getPawaIndex();
    event = findEventBySrId(index, canonical.eventId);
  } catch (e) {
    throw unresolvedEventError(canonical.eventName || canonical.eventId);
  }
  if (!event) throw unresolvedEventError(canonical.eventName || canonical.eventId);
  const price = event.prices[PAWA_PRICE_NAME[canonical.sign]];
  if (!price) throw unsupportedMarketError(canonical);
  return {
    priceId: price.priceId,
    odds: Number(canonical.odds) > 0 ? Number(canonical.odds) : 1,
    eventName: event.home + ' - ' + event.away,
    marketName: '1X2',
    outcomeName: PAWA_PRICE_NAME[canonical.sign]
  };
}

async function buildLegs(bookmaker, canonicals) {
  if (isSportradar(bookmaker)) return canonicals.map(toSportradarSelection);
  if (isBetway(bookmaker)) return canonicals.map(toBetwayOutcome);
  if (isBet9ja(bookmaker)) {
    const games = [];
    for (const canonical of canonicals) {
      games.push(await toBet9jaGame(canonical));
    }
    return games;
  }
  if (isBetking(bookmaker)) {
    throw new Error('BetKing booking code creation is not supported yet.');
  }
  if (isBangbet(bookmaker)) {
    return canonicals.map(toBangbetSelection);
  }
  if (isBetpawa(bookmaker)) {
    const resolved = [];
    for (const canonical of canonicals) {
      resolved.push(await toBetpawaSelection(canonical));
    }
    return resolved;
  }
  throw new Error('Unknown target bookmaker "' + bookmaker + '".');
}

module.exports = {
  BOOKMAKERS,
  isSportradar,
  isBetway,
  isBet9ja,
  isBetking,
  isBangbet,
  isBetpawa,
  canonicalize,
  buildLegs,
  unsupportedMarketError
};
