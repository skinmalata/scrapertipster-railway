'use strict';

// Resolves a plain ticket selection ({ match: "Team A - Team B", tip, category })
// into a native selection object the bookmaker's share/coupon API accepts, so the
// ticket builder can mint real booking codes on SportyBet and Betway.
//
// SportyBet and Betway are both Sportradar platform bookmakers. The ticket builder
// only knows team names, so we resolve the match against SportyBet's server-rendered
// pre-match feed (https://www.sportybet.com/ng/lite/preMatch) which lists every
// today's football event with its sr:match:<id> and team names. The numeric part of
// that id is the same Sportradar event id Betway uses, so the same match lookup
// feeds both bookmakers.
//
// Supported markets:
//   1X2           -> marketId "1", outcomeId 1 = Home, 2 = Draw, 3 = Away
//   Double Chance -> marketId "10", outcomeId 9 = 1X, 10 = 12, 11 = X2
//   Over 1.5/2.5  -> marketId "18" (Over/Under), outcomeId 12 = Over, 13 = Under,
//                    specifier "total=1.5" / "total=2.5"
// Betway codes only support 1X2 (its outcome-id scheme is only validated for that
// market family). Double Chance and Over/Under legs are rejected for Betway with a
// clear error.

const cheerio = require('cheerio');
const { sportradarHeaders, getJson } = require('./http');

const SPORTY_LITE = 'https://www.sportybet.com/ng/lite/preMatch?sportId=sr:sport:1&productId=3&timeId=1';
const SPORTY_DETAIL = 'https://www.sportybet.com/ng/lite/preMatch/detail?sportId=sr:sport:1&productId=3&marketGroupsName=Main&eventId=';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;

let eventIndexCache = null;
let eventIndexAt = 0;
const detailCache = new Map();
const resolutionCache = new Map();

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(map, key, value) {
  if (map.size >= CACHE_MAX) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { at: Date.now(), value: value });
}

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

function unresolvedEventError(matchName) {
  const err = new Error(
    'The match "' + (matchName || '') + '" was not found in the bookmaker\'s schedule, so the code was not created. The event may not be offered, or the fixture may have been renamed or removed.'
  );
  err.code = 'UNRESOLVED_EVENT';
  return err;
}

function unsupportedMarketError(leg, detail) {
  const err = new Error(
    detail || ('The "' + (leg.marketName || leg.tip || 'selection') + '" market is not supported for booking code creation, so the code was not created.')
  );
  err.code = 'UNSUPPORTED_MARKET';
  return err;
}

// --- SportyBet pre-match feed (today's football events) ---

function parseEventIndex(html) {
  const $ = cheerio.load(html);
  const events = [];
  $('.m-event').each(function () {
    const node = $(this);
    const time = node.find('.m-event-time').first().text().trim();
    const home = node.find('.m-home-team .m-team-name').first().text().trim();
    const away = node.find('.m-away-team .m-team-name').first().text().trim();
    const href = node.find('.m-event-left').first().attr('href') || '';
    const m = /eventId=(sr:match:\d+)/.exec(href);
    if (m && home && away) {
      events.push({ eventId: m[1], home: home, away: away, time: time });
    }
  });
  return events;
}

async function getEventIndex() {
  if (eventIndexCache && Date.now() - eventIndexAt < CACHE_TTL_MS) return eventIndexCache;
  const html = await getJson(SPORTY_LITE, sportradarHeaders('https://www.sportybet.com'), 20000);
  eventIndexCache = parseEventIndex(html);
  eventIndexAt = Date.now();
  return eventIndexCache;
}

function findEvent(events, home, away) {
  const nh = normaliseTeam(home);
  const na = normaliseTeam(away);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (normaliseTeam(ev.home) === nh && normaliseTeam(ev.away) === na) return ev;
  }
  return null;
}

// --- SportyBet event detail page (extra markets, used for Over/Under) ---

function parseEventMarkets(html) {
  const $ = cheerio.load(html);
  const overUnder = {};
  const doubleChance = {};
  $('.m-market-item').each(function () {
    const title = $(this).find('.m-market-item-title').first().text().trim().toLowerCase();
    if (title === 'over/under') {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        const mSpec = /specifier=total%3D([0-9.]+)/.exec(href);
        if (!mMarket || !mOut || !mSpec) return;
        const total = mSpec[1];
        const isOver = mOut[1] === '12'; // 12 = Over, 13 = Under
        const specifier = 'total=' + total;
        overUnder[specifier] = overUnder[specifier] || {};
        overUnder[specifier][isOver ? 'over' : 'under'] = {
          marketId: mMarket[1],
          outcomeId: mOut[1],
          specifier: specifier
        };
      });
      return;
    }
    if (title === 'double chance') {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        if (!mMarket || !mOut) return;
        const desc = $(this).find('.m-desc').first().text().trim();
        const sign = doubleChanceSign(desc);
        if (sign) {
          doubleChance[sign] = { marketId: mMarket[1], outcomeId: mOut[1] };
        }
      });
    }
  });
  return { overUnder: overUnder, doubleChance: doubleChance };
}

function doubleChanceSign(desc) {
  const text = String(desc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (text === 'homeordraw' || text === '1x') return '1X';
  if (text === 'homeoraway' || text === '12') return '12';
  if (text === 'draworaway' || text === 'x2') return 'X2';
  return null;
}

async function getEventMarkets(eventId) {
  const cached = cacheGet(detailCache, eventId);
  if (cached) return cached;
  const html = await getJson(SPORTY_DETAIL + encodeURIComponent(eventId), sportradarHeaders('https://www.sportybet.com'), 20000);
  const markets = parseEventMarkets(html);
  cacheSet(detailCache, eventId, markets);
  return markets;
}

// --- native selection builders ---

const SR_OUTCOME = { '1': '1', X: '2', '2': '3' };
const DC_TIPS = { '1X': true, '12': true, X2: true };

const OVER_TOTAL_BY_CATEGORY = { over15: '1.5', over25: '2.5' };

async function sportybetSelection(event, leg) {
  const category = String(leg.category || '').toLowerCase();
  const tip = String(leg.tip || '').trim();

  if (category === '1x2' && SR_OUTCOME[tip]) {
    return { eventId: event.eventId, marketId: '1', outcomeId: SR_OUTCOME[tip], specifier: null };
  }

  if (category === '1x2' && DC_TIPS[tip]) {
    const markets = await getEventMarkets(event.eventId);
    const row = markets.doubleChance[tip];
    if (!row) throw unsupportedMarketError(leg, 'Double Chance is not offered for "' + leg.match + '", so the code was not created.');
    return { eventId: event.eventId, marketId: row.marketId, outcomeId: row.outcomeId, specifier: null };
  }

  const total = OVER_TOTAL_BY_CATEGORY[category];
  if (total) {
    if (!/^over /i.test(tip)) throw unsupportedMarketError(leg, 'Only Over selections can be turned into a code for the Over/Under market.');
    const specifier = 'total=' + total;
    const markets = await getEventMarkets(event.eventId);
    const row = markets.overUnder[specifier];
    if (!row || !row.over) {
      throw unsupportedMarketError(leg, 'Over ' + total + ' is not offered for "' + leg.match + '", so the code was not created.');
    }
    return { eventId: event.eventId, marketId: row.over.marketId, outcomeId: row.over.outcomeId, specifier: row.over.specifier };
  }

  throw unsupportedMarketError(leg);
}

function betwaySelection(event, leg) {
  const category = String(leg.category || '').toLowerCase();
  const tip = String(leg.tip || '').trim();

  if (category !== '1x2' || !SR_OUTCOME[tip]) {
    throw unsupportedMarketError(leg, 'Betway booking codes support plain 1X2 selections only. This leg is "' + (leg.match || '') + ' ' + tip + '", so the code was not created.');
  }

  const id = event.eventId.replace(/^sr:match:/, '');
  const marketId = id + '1';
  return {
    outcomeId: marketId + SR_OUTCOME[tip],
    eventId: Number(id),
    marketId: marketId
  };
}

// --- public API ---

// Currently available (upcoming) football events in the bookmaker's schedule,
// used by the ticket builder to drop matches that have already started or are
// not offered at all, so tickets are as likely as possible to resolve.
async function getAvailableMatches() {
  const events = await getEventIndex();
  return events.map(function (e) {
    return { home: e.home, away: e.away, time: e.time };
  });
}

async function resolveLeg(leg, bookmaker) {
  if (!leg || !leg.match) throw unresolvedEventError(leg && leg.match);
  const pair = splitMatchName(leg.match);
  if (pair.length !== 2) throw unresolvedEventError(leg.match);

  const cacheKey = bookmaker + '|' + String(leg.match).toLowerCase() + '|' + String(leg.tip || '').toLowerCase() + '|' + String(leg.category || '').toLowerCase();
  const cached = cacheGet(resolutionCache, cacheKey);
  if (cached) return cached;

  const events = await getEventIndex();
  const event = findEvent(events, pair[0], pair[1]);
  if (!event) throw unresolvedEventError(leg.match);

  const selection = bookmaker === 'sportybet'
    ? await sportybetSelection(event, leg)
    : betwaySelection(event, leg);

  cacheSet(resolutionCache, cacheKey, selection);
  return selection;
}

module.exports = { resolveLeg, getAvailableMatches };
