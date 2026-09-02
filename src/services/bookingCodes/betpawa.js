'use strict';

const { betpawaHeaders, getJson, postJson } = require('./http');

// betPawa (www.betpawa.ng) is a native sportsbook platform, NOT Sportradar.
// It exposes a brand-aware JSON gateway at the same origin as the web app:
//   events list: GET  /api/sportsbook/v4/events/lists/by-queries?q=<json>
//   event detail: GET /api/sportsbook/v4/events/{id}
//   booking code load: GET  /api/sportsbook/v3/booking-number/{code}
//   booking code mint: POST /api/sportsbook/v3/booking-number
// The mint (booking-number) returns a share code without a login, so codes can
// be created from plain { match, tip } legs the same way SportyBet codes are.
//
// The events feed is paginated with take<=100 (bigger take values are rejected).
// Each upcoming football event embeds the popular markets, including 1X2 - FT
// (marketType id 3743) with the price ids the mint payload needs, plus a
// SPORTRADAR widget id that equals the Sportradar match id used by the other
// providers, which is what canonical conversion keys on.

const BASE = 'https://www.betpawa.ng';
const BRAND = 'betpawa-nigeria';
const EVENTS_URL = BASE + '/api/sportsbook/v4/events/lists/by-queries';
const BOOKING_NUMBER = BASE + '/api/sportsbook/v3/booking-number';
const MARKET_1X2_TYPE = '3743';
const CATEGORY_FOOTBALL = '2';

const INDEX_TTL_MS = 5 * 60 * 1000;
const PAGE_TAKE = 100;
const MAX_PAGES = 20;
const INDEX_MAX_EVENTS = 3000;

let indexCache = null;
let indexAt = 0;
let indexBuildPromise = null;

function errorWithCode(message, code) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = code || 'INVALID_CODE';
  return err;
}

function invalidError(message) {
  return errorWithCode(message || 'The code is invalid or has expired.', 'INVALID_CODE');
}

function upstreamError(message) {
  return errorWithCode(message || 'Could not reach betPawa. Please try again shortly.', 'NETWORK_ERROR');
}

// --- team name helpers (mirror resolver.js) ---

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function splitMatchName(match) {
  const parts = String(match || '').split(/\s+(?:-|vs)\s+/i).map(function (part) { return part.trim(); });
  return parts.length === 2 && parts[0] && parts[1] ? parts : [];
}

// --- event index ---

function eventsQuery(skip, take) {
  return {
    queries: [{
      query: { eventType: 'UPCOMING', categories: [CATEGORY_FOOTBALL], hasOdds: true },
      view: {},
      skip: skip,
      take: take
    }]
  };
}

// Extract team names from the event (participants win; fall back to the "Home -
// Away" name) and the 1X2 prices with their price ids and odds.
function parsePawaEvent(ev) {
  const participants = Array.isArray(ev.participants) ? ev.participants : [];
  const home = (participants.find(function (p) { return p.position === 1; }) || {}).name || '';
  const away = (participants.find(function (p) { return p.position === 2; }) || {}).name || '';
  const srWidget = (Array.isArray(ev.widgets) ? ev.widgets : [])
    .find(function (w) { return w && w.type === 'SPORTRADAR'; });
  const srId = srWidget ? String(srWidget.id) : '';
  const market = (Array.isArray(ev.markets) ? ev.markets : [])
    .find(function (m) { return m && m.marketType && String(m.marketType.id) === MARKET_1X2_TYPE; });
  const row = market && Array.isArray(market.row) ? market.row[0] : null;
  const prices = Array.isArray(row && row.prices) ? row.prices : [];
  const pricesBySign = {};
  for (const price of prices) {
    const name = String(price.name || price.displayName || '').trim();
    if (name === '1' || name === 'X' || name === '2') {
      const id = String(price.id || '');
      const odds = Number(price.odds);
      if (id && Number.isFinite(odds) && odds > 0) {
        pricesBySign[name] = { priceId: id, odds: odds };
      }
    }
  }
  return {
    betpawaId: String(ev.id || ''),
    srId: srId,
    home: home,
    away: away,
    key: normaliseTeam(home) + '|' + normaliseTeam(away),
    competition: (ev.competition && ev.competition.name) || '',
    startTime: ev.startTime || '',
    prices: pricesBySign
  };
}

function fetchPage(skip) {
  const q = encodeURIComponent(JSON.stringify(eventsQuery(skip, PAGE_TAKE)));
  return getJson(EVENTS_URL + '?q=' + q, betpawaHeaders(BRAND), 20000);
}

function flattenEvents(data) {
  const out = [];
  const responses = (data && data.responses) || [];
  for (const r of responses) {
    const inner = (r && r.responses) || [];
    for (const ev of inner) {
      const parsed = parsePawaEvent(ev);
      if (parsed.betpawaId && parsed.key && Object.keys(parsed.prices).length) {
        out.push(parsed);
      }
    }
  }
  return out;
}

async function buildIndex() {
  const events = [];
  for (let skip = 0; skip < INDEX_MAX_EVENTS; skip += PAGE_TAKE) {
    let data;
    try {
      data = await fetchPage(skip);
    } catch (err) {
      throw upstreamError(err.message);
    }
    const page = flattenEvents(data);
    if (!page.length) break;
    events.push.apply(events, page);
    if (page.length < PAGE_TAKE || events.length >= INDEX_MAX_EVENTS) break;
    if ((skip / PAGE_TAKE) + 1 >= MAX_PAGES) break;
  }
  if (!events.length) {
    const err = new Error('Could not load the betPawa schedule, so the code was not created.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  indexCache = events;
  indexAt = Date.now();
  return events;
}

async function getIndex() {
  if (indexCache && Date.now() - indexAt < INDEX_TTL_MS) return indexCache;
  if (indexBuildPromise) {
    return indexCache || indexBuildPromise;
  }
  indexBuildPromise = buildIndex();
  if (indexCache) {
    indexBuildPromise.catch(function () {}).finally(function () { indexBuildPromise = null; });
    return indexCache;
  }
  try {
    return await indexBuildPromise;
  } finally {
    indexBuildPromise = null;
  }
}

function findEvent(events, home, away) {
  const key = normaliseTeam(home) + '|' + normaliseTeam(away);
  for (const ev of events) {
    if (ev.key === key) return ev;
  }
  return null;
}

function findEventBySrId(events, srId) {
  const want = String(srId || '').trim();
  if (!want) return null;
  for (const ev of events) {
    if (ev.srId === want) return ev;
  }
  return null;
}

function missingEventError(matchName) {
  return errorWithCode(
    'The match "' + (matchName || '') + '" was not found in the betPawa schedule, so the code was not created. The event may not be offered, or the fixture may have been renamed or removed.',
    'UNRESOLVED_EVENT'
  );
}

function unsupportedMarketError(leg, detail) {
  return errorWithCode(
    detail || ('The "' + (leg.marketName || leg.tip || 'selection') + '" market is not supported for betPawa booking code creation, so the code was not created.'),
    'UNSUPPORTED_MARKET'
  );
}

// --- resolve a plain ticket leg ({ match, tip, category }) into a price id ---

function signFromTip(tip) {
  const t = String(tip || '').trim();
  if (t === '1' || t === 'H' || t === 'h') return '1';
  if (t === 'X' || t === 'x' || t === 'D' || t === 'd') return 'X';
  if (t === '2' || t === 'A' || t === 'a') return '2';
  return null;
}

async function resolvePawaLeg(leg) {
  if (!leg || !leg.match) throw missingEventError(leg && leg.match);
  const pair = splitMatchName(leg.match);
  if (pair.length !== 2) throw missingEventError(leg.match);
  const category = String(leg.category || '').toLowerCase();
  const tip = String(leg.tip || '').trim();
  if (category !== '1x2') {
    throw unsupportedMarketError(leg, 'betPawa booking codes support 1X2 selections only. This leg is "' + (leg.match || '') + ' ' + tip + '", so the code was not created.');
  }
  const sign = signFromTip(tip);
  if (!sign) throw unsupportedMarketError(leg);

  const events = await getIndex();
  const event = findEvent(events, pair[0], pair[1]);
  if (!event) throw missingEventError(leg.match);
  const price = event.prices[sign];
  if (!price) {
    throw unsupportedMarketError(leg, 'The 1X2 market is not offered for "' + (leg.match || '') + '", so the code was not created.');
  }
  return {
    priceId: price.priceId,
    odds: price.odds,
    eventName: leg.match,
    marketName: '1X2',
    outcomeName: sign
  };
}

// --- decode a booking code ---

function normalizeItem(item) {
  const eventInfo = item.eventInfo || {};
  const selection = (Array.isArray(item.selections) ? item.selections : [])[0] || {};
  const market = selection.market || {};
  const info = selection.selectionInfo || {};
  const participants = Array.isArray(eventInfo.participants) ? eventInfo.participants : [];
  const home = (participants.find(function (p) { return p.position === 1; }) || {}).name || '';
  const away = (participants.find(function (p) { return p.position === 2; }) || {}).name || '';
  return {
    eventId: String(eventInfo.id || ''),
    marketId: String(market.typeId || ''),
    specifier: null,
    outcomeId: String(info.id || ''),
    eventName: (home && away) ? (home + ' - ' + away) : (eventInfo.name || ''),
    marketName: market.displayName || market.name || '',
    outcomeName: String(info.displayName || info.name || ''),
    odds: Number(item.odds && item.odds.price) || null,
    startTime: eventInfo.startTime || '',
    competition: (eventInfo.competition && eventInfo.competition.name) || '',
    sport: (eventInfo.category && eventInfo.category.id) || ''
  };
}

async function decodeBetPawa(code) {
  let data;
  try {
    data = await getJson(BOOKING_NUMBER + '/' + encodeURIComponent(code), betpawaHeaders(BRAND), 20000);
  } catch (err) {
    throw upstreamError(err.message);
  }
  if (!data || data.error) {
    throw invalidError(data && data.error ? 'The booking code was not found on betPawa. It may have expired.' : null);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw invalidError('No selections were found in this betPawa booking code.');
  return items.map(normalizeItem);
}

// --- mint a booking code from resolved price ids ---

async function createBetPawaCode(resolved) {
  if (!Array.isArray(resolved) || !resolved.length) {
    throw errorWithCode('No selections were provided for the betPawa code.', 'INVALID_SELECTIONS');
  }
  const priceIds = [];
  for (const r of resolved) {
    const id = r && (r.priceId || r.selectionId);
    if (!id) throw errorWithCode('One or more selections could not be mapped to a betPawa price.', 'INVALID_SELECTIONS');
    priceIds.push(String(id));
  }
  const payload = {
    selections: {
      selections: priceIds.length === 1
        ? [{ type: 'SINGLE', selections: priceIds }]
        : [{ type: 'COMBO', selections: priceIds }]
    }
  };
  let data;
  try {
    data = await postJson(BOOKING_NUMBER, payload, betpawaHeaders(BRAND), 20000);
  } catch (err) {
    throw upstreamError(err.message);
  }
  if (!data || data.error) {
    const err = new Error(
      data && data.error === 'SPORTSBOOK_WRONG_SELECTION'
        ? 'One or more selections are not available on betPawa right now.'
        : 'betPawa did not accept the selections. Please try again shortly.'
    );
    err.code = data && data.error === 'SPORTSBOOK_WRONG_SELECTION' ? 'INVALID_SELECTIONS' : 'UPSTREAM_ERROR';
    throw err;
  }
  const code = data.code;
  if (!code) {
    throw errorWithCode('betPawa did not return a code.', 'NO_CODE');
  }
  return String(code);
}

// Expose the index for the matcher (canonical sr:match <-> betPawa event).
module.exports = {
  decodeBetPawa,
  createBetPawaCode,
  resolvePawaLeg,
  getPawaIndex: getIndex,
  findEventBySrId,
  normaliseTeam,
  MAX_1X2_MARKET_TYPE: MARKET_1X2_TYPE
};