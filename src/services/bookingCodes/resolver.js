'use strict';

// Resolves a plain ticket selection ({ match: "Team A - Team B", tip, category })
// into a native selection object the bookmaker's share/coupon API accepts, so the
// ticket builder can mint real booking codes on SportyBet and Betway.
//
// SportyBet and Betway are both Sportradar platform bookmakers. The ticket builder
// only knows team names, so we resolve the match against SportyBet's server-rendered
// pre-match feed, which lists every football event with its sr:match:<id> and team
// names. The numeric part of that id is the same Sportradar event id Betway uses,
// so the same match lookup feeds both bookmakers.
//
// The aggregate /ng/lite/preMatch page only surfaces a small featured subset of
// leagues, so the index is instead built from every per-league /ng/lite/events page
// (the league list comes from /ng/lite/condition/league). Each per-league page uses
// the same markup as the aggregate page, so one parser serves both.
//
// Supported markets:
//   1X2           -> marketId "1", outcomeId 1 = Home, 2 = Draw, 3 = Away
//   Double Chance -> marketId "10", outcomeId 9 = 1X, 10 = 12, 11 = X2
//   Over 1.5/2.5  -> marketId "18" (Over/Under), outcomeId 12 = Over, 13 = Under,
//                    specifier "total=1.5" / "total=2.5"
// Betway codes only support 1X2 (its outcome-id scheme is only validated for that
// market family). Double Chance and Over/Under legs are rejected for Betway with a
// clear error.
//
// getAvailableMatches() additionally surfaces the Over/Under prices collected from
// each league's marketId=18 page (m.goals) and a compact H2H streak summary
// (m.h2h) derived from the same h2hstats feed the rest of the site uses, so the
// schedule fallback can check head-to-head form before choosing a pick.

const cheerio = require('cheerio');
const { sportradarHeaders, getJson } = require('./http');
const { fetchTodayStreaks, normaliseName } = require('../h2hWinningStreaks');

const SPORTY_LEAGUE_LIST = 'https://www.sportybet.com/ng/lite/condition/league?timeId=1&sportId=sr:sport:1';
// Each league page is fetched twice per refresh: once for the 1X2 market
// (marketId=1, the outcome prices) and once for Over/Under (marketId=18) so
// the schedule fallback can build Over 1.5/2.5 legs straight from real odds.
const SPORTY_LEAGUE_EVENTS_1X2 = 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:1&timeId=1&marketId=1&tournamentId=';
const SPORTY_LEAGUE_EVENTS_OU = 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:1&timeId=1&marketId=18&tournamentId=';
const SPORTY_DETAIL = 'https://www.sportybet.com/ng/lite/preMatch/detail?sportId=sr:sport:1&productId=3&marketGroupsName=Main&eventId=';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;

// The league list changes rarely, so cache it for a day. The event index itself
// is rebuilt every LEAGUE_REFRESH_MS from all per-league pages, with a
// stale-while-revalidate pattern so the API never blocks on a slow cold build.
const LEAGUE_LIST_TTL_MS = 24 * 60 * 60 * 1000;
const LEAGUE_REFRESH_MS = 20 * 60 * 1000;
// Over/Under prices are far more stable than 1X2 and only feed the last-resort
// schedule fallback, so they refresh every hour instead of every index build.
// That keeps the doubled upstream traffic (~2 requests per league) down to a
// sustained load close to the original 1X2-only schedule.
const OU_REFRESH_MS = 60 * 60 * 1000;
const LEAGUE_CONCURRENCY = 8;
const NEAR_DAYS = 3;

let eventIndexCache = null;
let eventIndexAt = 0;
let leagueListCache = null;
let leagueListAt = 0;
let goalsCache = null;
let goalsAt = 0;
let indexBuildPromise = null;
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

// The lite preMatch page lists each league as .m-event-list-item with one or
// more .m-day-header day titles (e.g. "08/08 Saturday") and then the .m-event
// rows under them. Each .m-event carries the live 1X2 prices in its outcome
// links as odds=... alongside marketId/outcomeId, so we can read real odds
// straight from the schedule. Day and league are carried down to each event.

function lagosTodayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  function get(type) {
    const f = parts.find(function (p) { return p.type === type; });
    return f ? f.value : '00';
  }
  return get('year') + '-' + get('month') + '-' + get('day');
}

function parseDayTitle(text) {
  // SportyBet renders the day as "DD/MM Weekday" (e.g. "09/08 Sunday").
  const m = /(\d{2})\/(\d{2})/.exec(String(text || '').trim());
  if (!m) return null;
  return { day: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

function dayToDate(day) {
  if (!day) return '';
  const today = lagosTodayDate();
  const todayNum = Number(today.replace(/-/g, ''));
  let year = Number(today.slice(0, 4));
  let base = year * 10000 + day.month * 100 + day.day;
  if (base < todayNum) {
    year += 1;
    base = year * 10000 + day.month * 100 + day.day;
  }
  const ymd = String(base);
  return ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8);
}

const OUTCOME_SIGN = { '1': '1', '2': 'X', '3': '2' };

function parseEventIndex(html) {
  const $ = cheerio.load(html);
  const events = [];
  $('.m-event-list-item').each(function () {
    const league = $(this).find('.m-item-title').first().text().trim();
    let currentDay = '';
    $(this).find('.m-day-title, .m-event').each(function () {
      if ($(this).hasClass('m-day-title')) {
        currentDay = dayToDate(parseDayTitle($(this).text()));
        return;
      }
      const node = $(this);
      const time = node.find('.m-event-time').first().text().trim();
      const home = node.find('.m-home-team .m-team-name').first().text().trim();
      const away = node.find('.m-away-team .m-team-name').first().text().trim();
      const href = node.find('.m-event-left').first().attr('href') || '';
      const m = /eventId=(sr:match:\d+)/.exec(href);
      if (!(m && home && away)) return;
      const odds = {};
      node.find('.m-outcome').each(function () {
        const h = $(this).attr('href') || '';
        const mOut = /outcomeId=(\d+)/.exec(h);
        const mOdds = /odds=([0-9.]+)/.exec(h);
        const sign = OUTCOME_SIGN[mOut && mOut[1]];
        if (sign && mOdds) odds[sign] = Number(mOdds[1]);
      });
      events.push({
        eventId: m[1],
        home: home,
        away: away,
        time: time,
        date: currentDay,
        league: league,
        odds: odds
      });
    });
  });
  return events;
}

// The Over/Under league page (marketId=18) lists the same .m-event rows as the
// 1X2 page, but its outcome links carry Over/Under totals. We only keep the Over
// prices for 1.5 and 2.5 totals, which the schedule fallback uses for its
// Over-goal legs.
function parseGoalMarkets(html) {
  const $ = cheerio.load(html);
  const goals = {};
  $('.m-event').each(function () {
    const node = $(this);
    const href = node.find('.m-event-left').first().attr('href') || '';
    const m = /eventId=(sr:match:\d+)/.exec(href);
    if (!m) return;
    let over15 = 0;
    let over25 = 0;
    node.find('.m-outcome').each(function () {
      const h = $(this).attr('href') || '';
      const mMarket = /marketId=(\d+)/.exec(h);
      const mOut = /outcomeId=(\d+)/.exec(h);
      const mSpec = /specifier=total%3D([0-9.]+)/.exec(h);
      const mOdds = /odds=([0-9.]+)/.exec(h);
      if (!(mMarket && mOut && mSpec && mOdds)) return;
      if (mMarket[1] !== '18' || mOut[1] !== '12') return; // 12 = Over
      const total = Number(mSpec[1]);
      const odd = Number(mOdds[1]);
      if (total === 1.5 && odd > 1) over15 = odd;
      else if (total === 2.5 && odd > 1) over25 = odd;
    });
    const g = {};
    if (over15 > 1) g.over15 = over15;
    if (over25 > 1) g.over25 = over25;
    if (g.over15 || g.over25) goals[m[1]] = g;
  });
  return goals;
}

async function getEventIndex() {
  if (eventIndexCache && Date.now() - eventIndexAt < LEAGUE_REFRESH_MS) return eventIndexCache;
  if (indexBuildPromise) {
    return eventIndexCache || indexBuildPromise;
  }
  indexBuildPromise = buildEventIndex();
  if (eventIndexCache) {
    // Stale-while-revalidate: serve the previous index right away and let the
    // refresh finish in the background, so an expired cache never blocks a
    // request (the frontend times out around 8s, a cold build takes ~14s).
    indexBuildPromise.catch(function () {}).finally(function () { indexBuildPromise = null; });
    return eventIndexCache;
  }
  try {
    return await indexBuildPromise;
  } finally {
    indexBuildPromise = null;
  }
}

async function buildEventIndex() {
  const leagues = await getLeagueList();
  const needGoals = !goalsCache || Date.now() - goalsAt >= OU_REFRESH_MS;
  let newGoals = {};
  const all = [];
  let done = 0;
  let failed = 0;
  const workers = [];
  for (let w = 0; w < LEAGUE_CONCURRENCY; w++) {
    workers.push((async function () {
      for (let i = w; i < leagues.length; i += LEAGUE_CONCURRENCY) {
        const league = leagues[i];
        try {
          const html = await getJson(SPORTY_LEAGUE_EVENTS_1X2 + encodeURIComponent(league.tid), sportradarHeaders('https://www.sportybet.com'), 20000);
          const parsed = parseEventIndex(html);
          if (needGoals) {
            try {
              const ouHtml = await getJson(SPORTY_LEAGUE_EVENTS_OU + encodeURIComponent(league.tid), sportradarHeaders('https://www.sportybet.com'), 20000);
              const goalsMap = parseGoalMarkets(ouHtml);
              for (const k in goalsMap) newGoals[k] = goalsMap[k];
            } catch (e) {
              // Missing Over/Under feed just means no Over-goal legs for this league.
            }
          }
          for (let k = 0; k < parsed.length; k++) all.push(parsed[k]);
        } catch (e) {
          failed++;
        }
        done++;
      }
    })());
  }
  await Promise.all(workers);
  if (done && failed === done) {
    const err = new Error('Could not load the bookmaker schedule, so the code was not created.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  if (needGoals) {
    goalsCache = newGoals;
    goalsAt = Date.now();
  }
  for (let k = 0; k < all.length; k++) {
    const g = goalsCache && goalsCache[all[k].eventId];
    if (g) all[k].goals = g;
  }
  eventIndexCache = filterNearTerm(all);
  eventIndexAt = Date.now();
  return eventIndexCache;
}

async function getLeagueList() {
  if (leagueListCache && Date.now() - leagueListAt < LEAGUE_LIST_TTL_MS) return leagueListCache;
  const html = await getJson(SPORTY_LEAGUE_LIST, sportradarHeaders('https://www.sportybet.com'), 20000);
  const $ = cheerio.load(html);
  const leagues = [];
  const seen = new Set();
  $('a[href]').each(function () {
    const href = $(this).attr('href') || '';
    const m = /tournamentId=(sr:tournament:\d+)/.exec(href);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      leagues.push({ tid: m[1], name: $(this).text().trim().replace(/\s+/g, ' ') });
    }
  });
  if (!leagues.length) {
    const err = new Error('Could not load the bookmaker league list, so the code was not created.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  leagueListCache = leagues;
  leagueListAt = Date.now();
  return leagues;
}

// Per-league pages list the league's whole upcoming round (some leagues play in
// two weeks), so keep only events inside a short Lagos window: the ticket is for
// today, and far-future fixtures would never be used by the builder anyway.
function filterNearTerm(events) {
  const startNum = Number(lagosTodayDate().replace(/-/g, ''));
  const maxNum = new Date();
  maxNum.setDate(maxNum.getDate() + NEAR_DAYS);
  const endNum = Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(maxNum).replace(/-/g, ''));
  return events.filter(function (e) {
    const dateNum = Number(String(e.date || '').replace(/-/g, ''));
    if (!dateNum) return false;
    return dateNum >= startNum && dateNum <= endNum;
  });
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

// Compact H2H signal for the schedule fallback: strongest qualifying streak
// count per signal (0 when the feed has no streak for the side). The client
// boosts picks the streaks support and drops picks a strong result streak
// directly contradicts, matching how the server paths use H2H confidence.
function h2hSummary(entry) {
  const s = { homeWin: 0, awayWin: 0, homeUnbeaten: 0, awayUnbeaten: 0, goals: 0 };
  (entry.streaks.all || []).forEach(function (rec) {
    const side = rec.normal === entry.homeNormal ? 'home' : (rec.normal === entry.awayNormal ? 'away' : '');
    if (!side) return;
    if (rec.type === 'win') s[side + 'Win'] = Math.max(s[side + 'Win'], rec.count);
    if (rec.type === 'unbeaten') s[side + 'Unbeaten'] = Math.max(s[side + 'Unbeaten'], rec.count);
    if (rec.family === 'goals' || rec.type === 'ht-over-1.5' || rec.type === 'ht-over-0.5' || rec.type === 'btts-yes') {
      s.goals = Math.max(s.goals, rec.count);
    }
  });
  return s;
}

// Currently available (upcoming) football events in the bookmaker's schedule,
// used by the ticket builder to drop matches that have already started or are
// not offered at all, so tickets are as likely as possible to resolve. Also
// carries the live 1X2 odds, the Over/Under prices and kickoff date/time so the
// schedule fallback can build a ticket straight from the bookmaker's own prices,
// plus the H2H streak summary for the fixtures the h2hstats feed covers.
async function getAvailableMatches() {
  const events = await getEventIndex();
  const h2hIndex = {};
  try {
    (await fetchTodayStreaks()).forEach(function (m) {
      const key = normaliseName(m.home) + '|' + normaliseName(m.away);
      if (!h2hIndex[key]) h2hIndex[key] = m;
    });
  } catch (e) {
    // H2H is a bonus signal; its absence must never break the schedule feed.
  }
  return events.map(function (e) {
    const entry = h2hIndex[normaliseName(e.home) + '|' + normaliseName(e.away)];
    return {
      home: e.home, away: e.away, time: e.time, date: e.date || '', league: e.league || '',
      odds: e.odds || {}, goals: e.goals || {},
      h2h: entry ? h2hSummary(entry) : null
    };
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

// Fire the first index build without waiting so the schedule is warm before any
// request needs it. Called at server boot; safe to call again (getEventIndex
// deduplicates concurrent builds).
function warmEventIndex() {
  getEventIndex().catch(function (e) {
    console.error('[resolver] warm event index failed:', e.message);
  });
}

module.exports = { resolveLeg, getAvailableMatches, warmEventIndex };
