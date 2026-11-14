'use strict';

const { xbetHeaders, getJson, postJson } = require('./http');

// 1xBet (1xbet.ng) and the wider 1xBet family (22bet.ng, Betwinner, Melbet,
// Megapari, Paripesa, ...) share one sportsbook backend: the same GameIds, the
// same line feed and the same booking-code service. Booking codes are also
// valid across the family, so codes minted on 22bet.ng load on 1xbet.ng.
//
// 1xbet.ng sits behind a Cloudflare challenge for plain API clients, while
// 22bet.ng answers the same endpoints without one. We therefore talk to
// 22bet.ng for both the feed and the coupon service and hand the user a code
// that works on 1xbet.ng.
//
//   line (1X2 events):  GET  /service-api/LineFeed/Get1x2_Zip
//   event odds:         GET  /service-api/LineFeed/GetGameZip?id=<I>
//   booking code load:  POST /service-api/LiveBet/Open/GetCoupon
//   booking code mint:  POST /service-api/LiveBet/Open/SaveCoupon
//
// 1X2 selections use Kind 3 and Type 1 = Home, 2 = Draw, 3 = Away, which is
// exactly the shape SaveCoupon expects.

const BASE = process.env.XBET_BASE || 'https://22bet.ng';
const PARTNER = 159;
const LINE_URL = BASE + '/service-api/LineFeed/Get1x2_Zip?sports=1&count=50&lng=en&partner=' + PARTNER + '&getEmpty=true&gr=412&mode=3';
const GAME_URL = BASE + '/service-api/LineFeed/GetGameZip?id=';
const GET_COUPON_URL = BASE + '/service-api/LiveBet/Open/GetCoupon';
const SAVE_COUPON_URL = BASE + '/service-api/LiveBet/Open/SaveCoupon';

const MARKET_1X2_KIND = 3;
const OUTCOME_TO_TYPE = { H: 1, D: 2, A: 3 };
const TYPE_TO_OUTCOME = { 1: '1', 2: 'X', 3: '2' };
const OUTCOME_TO_SIGN = { '1': 'H', X: 'D', '2': 'A' };

const INDEX_TTL_MS = 5 * 60 * 1000;
const ODDS_TTL_MS = 3 * 60 * 1000;
const MAX_WINDOW_HOURS = 26;
const ODDS_CONCURRENCY = 8;

let indexCache = null;
let indexAt = 0;
let indexBuildPromise = null;
const oddsCache = new Map();

function errorWithCode(message, code) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = code || 'INVALID_CODE';
  return err;
}

function invalidError(message) {
  return errorWithCode(message || 'The code is invalid or has expired.', 'INVALID_CODE');
}

function upstreamError(message) {
  return errorWithCode(message || 'Could not reach 1xBet. Please try again shortly.', 'NETWORK_ERROR');
}

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united|club)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// SportyBet-style official names vs the shorter names 1xBet uses.
const TEAM_ALIASES = {
  taiwan: 'chinese taipei',
  'south korea': 'korea republic',
  iran: 'ir iran',
  'north korea': 'korea dpr',
  usa: 'united states',
  czechia: 'czech republic',
  'ivory coast': 'cote divoire'
};

function aliasTeam(name) {
  const base = normaliseTeam(name);
  return TEAM_ALIASES[base] || base;
}

function matchKey(home, away) {
  return normaliseTeam(home) + '|' + normaliseTeam(away);
}

function splitMatchName(match) {
  const parts = String(match || '').split(/\s+(?:-|vs)\s+/i).map(function (part) { return part.trim(); });
  return parts.length === 2 && parts[0] && parts[1] ? parts : [];
}

function lagosParts(timestamp) {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d);
  function get(type) {
    const f = parts.find(function (p) { return p.type === type; });
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: get('year') + '-' + get('month') + '-' + get('day'), time: hour + ':' + get('minute') };
}

function startFromEvent(event) {
  const raw = Number(event && (event.startTs || event.S));
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1e12 ? raw * 1000 : raw;
}

// --- feed ---

async function fetchLine() {
  let data;
  try {
    data = await getJson(LINE_URL, xbetHeaders(BASE), 20000);
  } catch (err) {
    throw upstreamError(err.message);
  }
  if (!data || data.Success === false || !Array.isArray(data.Value)) {
    throw upstreamError('1xBet did not return its schedule.');
  }
  return data.Value;
}

async function fetchOdds(gameId, force) {
  const key = String(gameId);
  const cached = oddsCache.get(key);
  if (cached && !force && Date.now() - cached.at < ODDS_TTL_MS) return cached.value;
  let data;
  try {
    data = await getJson(GAME_URL + encodeURIComponent(key) + '&lng=en&partner=' + PARTNER, xbetHeaders(BASE), 20000);
  } catch (err) {
    return cached ? cached.value : null;
  }
  const value = data && data.Value;
  if (!value) return cached ? cached.value : null;
  const odds = { H: null, D: null, A: null };
  for (const row of (Array.isArray(value.E) ? value.E : [])) {
    if (!row || Number(row.G) !== 1) continue;
    if (row.T === 1) odds.H = Number(row.C) || null;
    else if (row.T === 2) odds.D = Number(row.C) || null;
    else if (row.T === 3) odds.A = Number(row.C) || null;
  }
  const parsed = {
    gameId: Number(value.I || gameId),
    home: value.O1 || value.O1E || '',
    away: value.O2 || value.O2E || '',
    league: value.L || value.LE || '',
    startTime: startFromEvent(value),
    odds: odds
  };
  oddsCache.set(key, { at: Date.now(), value: parsed });
  return parsed;
}

async function buildIndex() {
  const games = await fetchLine();
  const now = Date.now();
  const max = now + MAX_WINDOW_HOURS * 3600 * 1000;
  const upcoming = [];
  const seen = new Set();
  for (const game of games) {
    const gameId = Number(game && game.I);
    if (!gameId || seen.has(gameId)) continue;
    const start = startFromEvent(game);
    if (start && (start < now - 5 * 60 * 1000 || start > max)) continue;
    seen.add(gameId);
    upcoming.push({
      gameId: gameId,
      home: game.O1 || game.O1E || '',
      away: game.O2 || game.O2E || '',
      league: game.L || game.LE || '',
      startTime: start
    });
  }

  const events = [];
  for (let i = 0; i < upcoming.length; i += ODDS_CONCURRENCY) {
    const batch = upcoming.slice(i, i + ODDS_CONCURRENCY);
    const rows = await Promise.all(batch.map(function (g) { return fetchOdds(g.gameId, false); }));
    for (const row of rows) {
      if (!row || !row.home || !row.away) continue;
      if (!row.odds.H && !row.odds.D && !row.odds.A) continue;
      events.push({
        gameId: row.gameId,
        home: row.home,
        away: row.away,
        league: row.league,
        startTime: row.startTime,
        key: matchKey(row.home, row.away),
        odds: row.odds
      });
    }
  }

  if (!events.length) {
    throw upstreamError('Could not load the 1xBet schedule, so the code was not created.');
  }
  indexCache = events;
  indexAt = Date.now();
  return events;
}

async function getXbetIndex() {
  if (indexCache && Date.now() - indexAt < INDEX_TTL_MS) return indexCache;
  if (indexBuildPromise) return indexBuildPromise;
  indexBuildPromise = buildIndex();
  try {
    return await indexBuildPromise;
  } finally {
    indexBuildPromise = null;
  }
}

function findEvent(events, home, away) {
  const nh = aliasTeam(home);
  const na = aliasTeam(away);
  if (!nh || !na) return null;
  for (const ev of events) {
    if (aliasTeam(ev.home) === nh && aliasTeam(ev.away) === na) return ev;
  }
  for (const ev of events) {
    const eh = aliasTeam(ev.home);
    const ea = aliasTeam(ev.away);
    const hMatch = eh === nh || (nh.length > 4 && eh.includes(nh)) || (eh.length > 4 && nh.includes(eh));
    const aMatch = ea === na || (na.length > 4 && ea.includes(na)) || (ea.length > 4 && na.includes(ea));
    if (hMatch && aMatch) return ev;
  }
  return null;
}

function findEventByTeams(events, home, away) {
  return findEvent(events, home, away);
}

// --- resolve a plain ticket leg into a 1xBet 1X2 selection ---

function signFromTip(tip) {
  const t = String(tip || '').trim();
  if (t === '1' || t === 'H' || t === 'h' || t === 'Home') return 'H';
  if (t === 'X' || t === 'x' || t === 'D' || t === 'd' || t === 'Draw') return 'D';
  if (t === '2' || t === 'A' || t === 'a' || t === 'Away') return 'A';
  return null;
}

function missingEventError(matchName) {
  return errorWithCode(
    'The match "' + (matchName || '') + '" was not found in the 1xBet schedule, so the code was not created. The event may not be offered, or the fixture may have been renamed or removed.',
    'UNRESOLVED_EVENT'
  );
}

function unsupportedMarketError(leg, detail) {
  return errorWithCode(
    detail || ('The "' + (leg && (leg.marketName || leg.tip) || 'selection') + '" market is not supported for 1xBet booking code creation, so the code was not created.'),
    'UNSUPPORTED_MARKET'
  );
}

async function resolveXbetLeg(leg) {
  if (!leg || !leg.match) throw missingEventError(leg && leg.match);
  const pair = splitMatchName(leg.match);
  if (pair.length !== 2) throw missingEventError(leg.match);
  const category = String(leg.category || '').toLowerCase();
  const tip = String(leg.tip || '').trim();
  if (category && category !== '1x2') {
    throw unsupportedMarketError(leg, '1xBet booking codes support 1X2 selections only. This leg is "' + (leg.match || '') + ' ' + tip + '", so the code was not created.');
  }
  const sign = signFromTip(tip);
  if (!sign) throw unsupportedMarketError(leg);

  const events = await getXbetIndex();
  const event = findEvent(events, pair[0], pair[1]);
  if (!event) throw missingEventError(leg.match);
  const odds = event.odds[sign];
  if (!Number.isFinite(odds) || odds <= 1) {
    throw unsupportedMarketError(leg, 'The 1X2 market is not offered for "' + (leg.match || '') + '", so the code was not created.');
  }
  const kickoff = lagosParts(event.startTime);
  return {
    gameId: event.gameId,
    outcomeType: OUTCOME_TO_TYPE[sign],
    odds: odds,
    eventName: event.home + ' - ' + event.away,
    marketName: '1X2',
    outcomeName: sign === 'H' ? '1' : sign === 'D' ? 'X' : '2',
    startTime: event.startTime,
    date: kickoff ? kickoff.date : '',
    time: kickoff ? kickoff.time : '',
    league: event.league || 'Football'
  };
}

// --- decode a booking code ---

function outcomeFromEvent(event) {
  const type = Number(event && event.Type);
  if (TYPE_TO_OUTCOME[type]) return TYPE_TO_OUTCOME[type];
  const market = String((event && event.MarketName) || '');
  if (market === 'W1') return '1';
  if (market === 'X') return 'X';
  if (market === 'W2') return '2';
  return '';
}

function normalizeCouponEvent(event) {
  const kickoff = lagosParts(startFromEvent(event));
  const kind = Number(event.Kind);
  const group = String(event.GroupName || '').toLowerCase();
  const outcomeName = outcomeFromEvent(event);
  return {
    eventId: String(event.GameId || ''),
    gameId: Number(event.GameId || 0),
    marketId: String(kind || (group === '1x2' ? MARKET_1X2_KIND : '')),
    specifier: null,
    outcomeId: String(event.Type || ''),
    eventName: (event.Opp1 && event.Opp2) ? (event.Opp1 + ' - ' + event.Opp2) : '',
    marketName: (kind === MARKET_1X2_KIND || group === '1x2') ? '1X2' : (event.MarketName || ''),
    outcomeName: outcomeName,
    odds: Number(event.Coef) || null,
    startTime: startFromEvent(event),
    competition: event.Liga || '',
    sport: event.SportId || 1,
    kind: kind
  };
}

async function decodeXbet(code) {
  const guid = String(code || '').trim().toUpperCase();
  if (!guid) throw invalidError();
  let data;
  try {
    data = await postJson(GET_COUPON_URL, { Guid: guid, Lng: 'en', partner: PARTNER }, xbetHeaders(BASE), 20000);
  } catch (err) {
    throw upstreamError(err.message);
  }
  const value = data && data.Value;
  const events = value && Array.isArray(value.Events) ? value.Events : [];
  if (!data || data.Success === false || !events.length) {
    throw invalidError('The booking code was not found on 1xBet. It may have expired.');
  }
  return events.map(normalizeCouponEvent);
}

// --- mint a booking code ---

function saveCouponEvent(resolved) {
  const gameId = Number(resolved && (resolved.gameId || resolved.eventId));
  if (!gameId) throw errorWithCode('One or more selections could not be mapped to a 1xBet event.', 'INVALID_SELECTIONS');
  let type = Number(resolved && resolved.outcomeType);
  if (!TYPE_TO_OUTCOME[type]) {
    const byOutcome = OUTCOME_TO_TYPE[String(resolved && resolved.outcomeName || '').trim()];
    const bySign = OUTCOME_TO_TYPE[String(resolved && resolved.outcomeName || '').trim().toUpperCase()];
    type = byOutcome || bySign;
  }
  if (!TYPE_TO_OUTCOME[type]) throw errorWithCode('One or more selections could not be mapped to a 1xBet outcome.', 'INVALID_SELECTIONS');
  const odds = Number(resolved && resolved.odds);
  if (!Number.isFinite(odds) || odds <= 1) throw errorWithCode('One or more selections have no live 1xBet price.', 'INVALID_SELECTIONS');
  return {
    GameId: gameId,
    Type: type,
    Coef: odds,
    Param: 0,
    PV: null,
    PlayerId: 0,
    Kind: MARKET_1X2_KIND,
    InstrumentId: 0,
    Seconds: 0,
    Price: 0,
    Expired: 0,
    PlayersDuel: []
  };
}

async function createXbetCode(resolved) {
  if (!Array.isArray(resolved) || !resolved.length) {
    throw errorWithCode('No selections were provided for the 1xBet code.', 'INVALID_SELECTIONS');
  }
  const payload = {
    notWait: true,
    CheckCf: 1,
    partner: PARTNER,
    AntiExpressCoef: 1,
    Summ: 1000,
    Events: resolved.map(saveCouponEvent),
    Vid: 0
  };
  let data;
  try {
    data = await postJson(SAVE_COUPON_URL, payload, xbetHeaders(BASE), 20000);
  } catch (err) {
    throw upstreamError(err.message);
  }
  if (!data || data.Success === false) {
    const message = String((data && (data.Error || data.ErrorCode)) || '');
    const err = new Error(
      /coef|cf|price|changed/i.test(message)
        ? 'One or more 1xBet prices changed before the code was created. Please try again.'
        : '1xBet did not accept the selections. Please try again shortly.'
    );
    err.code = /coef|cf|price|changed/i.test(message) ? 'ODDS_CHANGED' : 'INVALID_SELECTIONS';
    throw err;
  }
  const rawValue = data.Value;
  const code = rawValue && typeof rawValue === 'object'
    ? (rawValue.CouponCode || rawValue.Code)
    : rawValue;
  if (!code) throw errorWithCode('1xBet did not return a code.', 'NO_CODE');
  return String(code).toUpperCase();
}

module.exports = {
  BASE,
  MARKET_1X2_KIND,
  OUTCOME_TO_TYPE,
  OUTCOME_TO_SIGN,
  decodeXbet,
  createXbetCode,
  resolveXbetLeg,
  getXbetIndex,
  findEventByTeams,
  normaliseTeam
};
