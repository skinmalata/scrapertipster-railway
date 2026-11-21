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
// each league's marketId=18 page (m.goals / m.totals) and a compact H2H streak
// summary (m.h2h) derived from the same h2hstats feed the rest of the site uses,
// so the schedule fallback can check head-to-head form before choosing a pick.
//
// Basketball uses a different Sportradar market layout: the moneyline is
// marketId=219 (outcomeId 4 = home, 5 = away) and points totals are marketId=18
// (main line) plus marketId=225 (alternate lines). Its detail pages are read for
// the strongest Over/Under prices, which AI SportyBet Code Builder turns into high-confidence
// legs with the exact market/outcome ids needed to mint a real code.

const cheerio = require('cheerio');
const { sportradarHeaders, getJson } = require('./http');
const { fetchTodayStreaks, normaliseName } = require('../h2hWinningStreaks');

const SPORTS = {
  football: {
    leagueList: 'https://www.sportybet.com/ng/lite/condition/league?timeId=1&sportId=sr:sport:1',
    eventsMain: 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:1&timeId=1&marketId=1&tournamentId=',
    eventsOu: 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:1&timeId=1&marketId=18&tournamentId=',
    detail: 'https://www.sportybet.com/ng/lite/preMatch/detail?sportId=sr:sport:1&productId=3&marketGroupsName=Main&eventId='
  },
  basketball: {
    leagueList: 'https://www.sportybet.com/ng/lite/condition/league?timeId=1&sportId=sr:sport:2',
    // Basketball has no marketId=1 feed; the bare events page carries the
    // moneyline (marketId=219) prices.
    eventsMain: 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:2&timeId=1&tournamentId=',
    eventsOu: 'https://www.sportybet.com/ng/lite/events?sportId=sr:sport:2&timeId=1&marketId=18&tournamentId=',
    detail: 'https://www.sportybet.com/ng/lite/preMatch/detail?sportId=sr:sport:2&productId=3&marketGroupsName=Main&eventId='
  }
};
const SPORT_NAMES = ['football', 'basketball'];

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
const LEAGUE_CONCURRENCY = 16;
const NEAR_DAYS = 3;
// Basketball alternate totals only need a bounded slice of the upcoming fixtures:
// reading detail pages for every league would double a cold-index build for legs
// that are far outside the builder's 36-hour window anyway.
const BASKETBALL_DETAIL_LIMIT = 60;
const BASKETBALL_DETAIL_CONCURRENCY = 10;

let eventIndexCache = null;
let eventIndexAt = 0;
const leagueListCache = {};
const leagueListAt = {};
const goalsCache = {};
const goalsAt = {};
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

const FOOTBALL_OUTCOME_SIGN = { '1': '1', '2': 'X', '3': '2' };
// Basketball moneyline (marketId=219): 4 = home, 5 = away. Some basketball
// feeds still expose the generic 1/2 ids, so accept those as a fallback.
const BASKETBALL_OUTCOME_SIGN = { '4': '1', '5': '2', '1': '1', '3': '2' };

function parseEventIndex(html, sport) {
  const $ = cheerio.load(html);
  const outcomeSign = sport === 'basketball' ? BASKETBALL_OUTCOME_SIGN : FOOTBALL_OUTCOME_SIGN;
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
        const sign = outcomeSign[mOut && mOut[1]];
        if (sign && mOdds) odds[sign] = Number(mOdds[1]);
      });
      events.push({
        eventId: m[1],
        home: home,
        away: away,
        time: time,
        date: currentDay,
        league: league,
        odds: odds,
        sport: sport
      });
    });
  });
  return events;
}

// The Over/Under league page (marketId=18) lists the same .m-event rows as the
// main market page, but its outcome links carry total lines. Football keeps the
// 1.5/2.5 goal prices (m.goals); basketball keeps every points line with its
// exact market/outcome ids (m.totals) so a tip can be minted without guessing.
function parseTotalsMarkets(html) {
  const $ = cheerio.load(html);
  const totals = {};
  $('.m-event').each(function () {
    const node = $(this);
    const href = node.find('.m-event-left').first().attr('href') || '';
    const m = /eventId=(sr:match:\d+)/.exec(href);
    if (!m) return;
    node.find('.m-outcome').each(function () {
      const h = $(this).attr('href') || '';
      const mMarket = /marketId=(\d+)/.exec(h);
      const mOut = /outcomeId=(\d+)/.exec(h);
      const mSpec = /specifier=total%3D([0-9.]+)/.exec(h);
      const mOdds = /odds=([0-9.]+)/.exec(h);
      if (!(mMarket && mOut && mSpec && mOdds)) return;
      const outcomeId = mOut[1];
      if (outcomeId !== '12' && outcomeId !== '13') return; // 12 = Over, 13 = Under
      const total = mSpec[1];
      const odds = Number(mOdds[1]);
      if (!(odds > 1)) return;
      const specifier = 'total=' + total;
      totals[m[1]] = totals[m[1]] || {};
      totals[m[1]][total] = totals[m[1]][total] || {};
      const row = { marketId: mMarket[1], outcomeId: outcomeId, specifier: specifier, odds: odds };
      const key = outcomeId === '12' ? 'over' : 'under';
      const existing = totals[m[1]][total][key];
      // The main market (18) is the one priced on the schedule page.
      if (!existing || existing.marketId !== '18') totals[m[1]][total][key] = row;
    });
  });
  return totals;
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
  const all = [];
  for (const sport of SPORT_NAMES) {
    const config = SPORTS[sport];
    const leagues = await getLeagueList(sport);
    const needTotals = !goalsCache[sport] || Date.now() - goalsAt[sport] >= OU_REFRESH_MS;
    const newTotals = {};
    let done = 0;
    let failed = 0;
    const workers = [];
    for (let w = 0; w < LEAGUE_CONCURRENCY; w++) {
      workers.push((async function () {
        for (let i = w; i < leagues.length; i += LEAGUE_CONCURRENCY) {
          const league = leagues[i];
          try {
            const html = await getJson(config.eventsMain + encodeURIComponent(league.tid), sportradarHeaders('https://www.sportybet.com'), 20000);
            const parsed = parseEventIndex(html, sport);
            if (needTotals) {
              try {
                const ouHtml = await getJson(config.eventsOu + encodeURIComponent(league.tid), sportradarHeaders('https://www.sportybet.com'), 20000);
                const totalsMap = parseTotalsMarkets(ouHtml);
                for (const k in totalsMap) newTotals[k] = totalsMap[k];
              } catch (e) {
                // Missing Over/Under feed just means no totals legs for this league.
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
      // A single sport being down must not wipe out the other sport's schedule.
      continue;
    }
    if (needTotals) {
      goalsCache[sport] = newTotals;
      goalsAt[sport] = Date.now();
    }
    for (let k = 0; k < all.length; k++) {
      const ev = all[k];
      if (ev.sport !== sport) continue;
      const totals = goalsCache[sport] && goalsCache[sport][ev.eventId];
      if (!totals) continue;
      if (sport === 'basketball') {
        ev.totals = totals;
      } else {
        const g = {};
        if (totals['1.5'] && totals['1.5'].over) g.over15 = totals['1.5'].over.odds;
        if (totals['2.5'] && totals['2.5'].over) g.over25 = totals['2.5'].over.odds;
        if (g.over15 || g.over25) ev.goals = g;
      }
    }
  }

  const upcomingBasketball = all
    .filter(function (e) { return e.sport === 'basketball'; })
    .map(function (e) {
      const prices = [e.odds && e.odds['1'], e.odds && e.odds['2']].filter(function (v) { return Number(v) > 1; });
      e.bestOdds = prices.length ? Math.min.apply(null, prices) : 99;
      return e;
    })
    .sort(function (a, b) {
      // Spend the detail-page budget on the clearest moneyline favourites first;
      // those are the fixtures most likely to yield a high-confidence tip.
      if (a.bestOdds !== b.bestOdds) return a.bestOdds - b.bestOdds;
      return String(a.date + ' ' + a.time).localeCompare(String(b.date + ' ' + b.time));
    })
    .slice(0, BASKETBALL_DETAIL_LIMIT);
  if (upcomingBasketball.length) {
    const marketsAt = {};
    const workers = [];
    for (let w = 0; w < BASKETBALL_DETAIL_CONCURRENCY; w++) {
      workers.push((async function () {
        for (let i = w; i < upcomingBasketball.length; i += BASKETBALL_DETAIL_CONCURRENCY) {
          const ev = upcomingBasketball[i];
          try {
            const markets = await getEventMarkets(ev.eventId, 'basketball');
            marketsAt[ev.eventId] = markets;
          } catch (e) {
            // The schedule moneyline/totals are still usable without the detail page.
          }
        }
      })());
    }
    await Promise.all(workers);
    for (let k = 0; k < all.length; k++) {
      const ev = all[k];
      if (ev.sport !== 'basketball') continue;
      const markets = marketsAt[ev.eventId];
      if (markets && markets.moneyline) ev.moneyline = markets.moneyline;
      if (markets && markets.overUnder) {
        ev.totals = Object.assign({}, ev.totals || {});
        for (const key in markets.overUnder) {
          // The detail parser keys lines as "total=164.5"; the schedule parser
          // uses "164.5". Normalise so AI SportyBet Code Builder can label and resolve both
          // with the same plain numeric total.
          const numeric = key.indexOf('total=') === 0 ? key.slice(6) : key;
          ev.totals[numeric] = markets.overUnder[key];
        }
      }
      if (!ev.moneyline && ev.odds) {
        ev.moneyline = {
          marketId: '219',
          home: ev.odds['1'] ? { marketId: '219', outcomeId: '4', odds: ev.odds['1'], specifier: null } : null,
          away: ev.odds['2'] ? { marketId: '219', outcomeId: '5', odds: ev.odds['2'], specifier: null } : null
        };
      }
    }
  }

  eventIndexCache = filterNearTerm(all);
  eventIndexAt = Date.now();
  return eventIndexCache;
}

async function getLeagueList(sport) {
  if (leagueListCache[sport] && Date.now() - leagueListAt[sport] < LEAGUE_LIST_TTL_MS) return leagueListCache[sport];
  const html = await getJson(SPORTS[sport].leagueList, sportradarHeaders('https://www.sportybet.com'), 20000);
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
  leagueListCache[sport] = leagues;
  leagueListAt[sport] = Date.now();
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

function findEvent(events, home, away, sport) {
  const nh = normaliseTeam(home);
  const na = normaliseTeam(away);
  const wanted = sport || 'football';
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if ((ev.sport || 'football') !== wanted) continue;
    if (normaliseTeam(ev.home) === nh && normaliseTeam(ev.away) === na) return ev;
  }
  return null;
}

// --- SportyBet event detail page (extra markets, used for Over/Under) ---

function parseEventMarkets(html, sport) {
  const $ = cheerio.load(html);
  const overUnder = {};
  const moneyline = {};
  const doubleChance = {};
  const btts = {};
  const highestScoringHalf = {};
  const drawNoBet = {};

  $('.m-market-item').each(function () {
    const title = $(this).find('.m-market-item-title').first().text().trim().toLowerCase();
    if (title.indexOf('over/under') === 0) {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        const mSpec = /specifier=total%3D([0-9.]+)/.exec(href);
        const mOdds = /odds=([0-9.]+)/.exec(href);
        if (!mMarket || !mOut || !mSpec) return;
        const total = mSpec[1];
        const isOver = mOut[1] === '12'; // 12 = Over, 13 = Under
        const specifier = 'total=' + total;
        overUnder[specifier] = overUnder[specifier] || {};
        const row = {
          marketId: mMarket[1],
          outcomeId: mOut[1],
          specifier: specifier,
          odds: mOdds ? Number(mOdds[1]) : null
        };
        const key = isOver ? 'over' : 'under';
        const existing = overUnder[specifier][key];
        // Prefer the main market (18) over alternate totals markets (e.g. 225).
        if (!existing || (existing.marketId !== '18' && row.marketId === '18')) {
          overUnder[specifier][key] = row;
        }
      });
      return;
    }
    if (sport === 'basketball' && title.indexOf('winner') === 0) {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        const mOdds = /odds=([0-9.]+)/.exec(href);
        if (!(mMarket && mOut && mOdds)) return;
        const side = mOut[1] === '4' ? 'home' : (mOut[1] === '5' ? 'away' : null);
        if (!side) return;
        moneyline.marketId = mMarket[1];
        moneyline[side] = { marketId: mMarket[1], outcomeId: mOut[1], odds: Number(mOdds[1]), specifier: null };
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
      return;
    }
    if (title === 'gg/ng') {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        if (!mMarket || !mOut) return;
        const desc = $(this).find('.m-desc').first().text().trim().toLowerCase();
        if (desc === 'yes') {
          btts.yes = { marketId: mMarket[1], outcomeId: mOut[1] };
        } else if (desc === 'no') {
          btts.no = { marketId: mMarket[1], outcomeId: mOut[1] };
        }
      });
      return;
    }
    if (title === 'highest scoring half') {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        if (!mMarket || !mOut) return;
        const desc = $(this).find('.m-desc').first().text().trim().toLowerCase();
        if (desc.includes('1st')) {
          highestScoringHalf['1H'] = { marketId: mMarket[1], outcomeId: mOut[1] };
        } else if (desc.includes('2nd')) {
          highestScoringHalf['2H'] = { marketId: mMarket[1], outcomeId: mOut[1] };
        } else if (desc.includes('equal') || desc.includes('draw')) {
          highestScoringHalf['equal'] = { marketId: mMarket[1], outcomeId: mOut[1] };
        }
      });
      return;
    }
    if (title === 'draw no bet') {
      $(this).find('a.m-outcome').each(function () {
        const href = $(this).attr('href') || '';
        const mMarket = /marketId=(\d+)/.exec(href);
        const mOut = /outcomeId=(\d+)/.exec(href);
        if (!mMarket || !mOut) return;
        const desc = $(this).find('.m-desc').first().text().trim().toLowerCase();
        if (desc === 'home' || desc === '1') {
          drawNoBet['1'] = { marketId: mMarket[1], outcomeId: mOut[1] };
        } else if (desc === 'away' || desc === '2') {
          drawNoBet['2'] = { marketId: mMarket[1], outcomeId: mOut[1] };
        }
      });
      return;
    }
  });
  return { overUnder, moneyline, doubleChance, btts, highestScoringHalf, drawNoBet };
}

function doubleChanceSign(desc) {
  const text = String(desc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (text === 'homeordraw' || text === '1x') return '1X';
  if (text === 'homeoraway' || text === '12') return '12';
  if (text === 'draworaway' || text === 'x2') return 'X2';
  return null;
}

async function getEventMarkets(eventId, sport) {
  const cached = cacheGet(detailCache, eventId);
  if (cached) return cached;
  const config = SPORTS[sport] || SPORTS.football;
  const html = await getJson(config.detail + encodeURIComponent(eventId), sportradarHeaders('https://www.sportybet.com'), 20000);
  const markets = parseEventMarkets(html, sport);
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

  if (event.sport === 'basketball') {
    // AI SportyBet Code Builder carries the exact ids read off the bookmaker's detail page,
    // so the minted code uses the same line/price the tip was scored against.
    const picked = leg.selection;
    if (picked && picked.marketId && picked.outcomeId) {
      return {
        eventId: event.eventId,
        marketId: String(picked.marketId),
        outcomeId: String(picked.outcomeId),
        specifier: picked.specifier || null
      };
    }

    if (category === '1x2' && (tip === '1' || tip === '2')) {
      let side = null;
      let marketId = '219';
      if (event.moneyline && event.moneyline[tip === '1' ? 'home' : 'away']) {
        side = event.moneyline[tip === '1' ? 'home' : 'away'];
        marketId = event.moneyline.marketId || marketId;
      } else {
        const markets = await getEventMarkets(event.eventId, 'basketball');
        side = markets.moneyline[tip === '1' ? 'home' : 'away'];
        marketId = markets.moneyline.marketId || marketId;
      }
      if (!side || !side.outcomeId) throw unsupportedMarketError(leg, 'Basketball moneyline is not offered for "' + leg.match + '", so the code was not created.');
      return { eventId: event.eventId, marketId: String(side.marketId || marketId), outcomeId: String(side.outcomeId), specifier: null };
    }

    const total = leg.total;
    const isOver = /^over\b/i.test(tip);
    const isUnder = /^under\b/i.test(tip);
    if (total && (isOver || isUnder)) {
      let row = event.totals && event.totals[total] && event.totals[total][isOver ? 'over' : 'under'];
      if (!row) {
        const markets = await getEventMarkets(event.eventId, 'basketball');
        const lines = markets.overUnder['total=' + total];
        row = lines && lines[isOver ? 'over' : 'under'];
      }
      if (!row) throw unsupportedMarketError(leg, 'The ' + (isOver ? 'Over' : 'Under') + ' ' + total + ' points line is not offered for "' + leg.match + '", so the code was not created.');
      return { eventId: event.eventId, marketId: String(row.marketId), outcomeId: String(row.outcomeId), specifier: row.specifier || 'total=' + total };
    }

    throw unsupportedMarketError(leg, 'Only basketball moneyline (1X2) and points Over/Under selections can be turned into a code.');
  }

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

  // BTTS (Both Teams To Score / GG)
  if (category === 'btts' || category === 'gg') {
    const isYes = /yes|btts\s*yes|^gg$/i.test(tip);
    const sideKey = isYes ? 'yes' : 'no';
    const markets = await getEventMarkets(event.eventId);
    const row = markets.btts && markets.btts[sideKey];
    if (!row) throw unsupportedMarketError(leg, 'GG/NG (Both Teams to Score) is not offered for "' + leg.match + '", so the code was not created.');
    return { eventId: event.eventId, marketId: row.marketId, outcomeId: row.outcomeId, specifier: null };
  }

  // Highest Scoring Half (1H / 2H)
  if (category === 'highestscoringhalf' || category === 'hsh') {
    let halfKey = null;
    if (/1st|1h|first/i.test(tip)) halfKey = '1H';
    else if (/2nd|2h|second/i.test(tip)) halfKey = '2H';
    else if (/equal|draw/i.test(tip)) halfKey = 'equal';
    const markets = await getEventMarkets(event.eventId);
    const row = markets.highestScoringHalf && markets.highestScoringHalf[halfKey];
    if (!row) throw unsupportedMarketError(leg, 'Highest Scoring Half is not offered for "' + leg.match + '", so the code was not created.');
    return { eventId: event.eventId, marketId: row.marketId, outcomeId: row.outcomeId, specifier: null };
  }

  // Draw No Bet (DNB)
  if (category === 'dnb' || category === 'drawnobet') {
    let dnbKey = '1';
    if (/away|^2$/i.test(tip)) dnbKey = '2';
    const markets = await getEventMarkets(event.eventId);
    const row = markets.drawNoBet && markets.drawNoBet[dnbKey];
    if (!row) throw unsupportedMarketError(leg, 'Draw No Bet is not offered for "' + leg.match + '", so the code was not created.');
    return { eventId: event.eventId, marketId: row.marketId, outcomeId: row.outcomeId, specifier: null };
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

// Currently available (upcoming) events in the bookmaker's schedule, used by the
// ticket builders to drop matches that have already started or are not offered
// at all. Defaults to football so the other builders keep their existing feed;
// AI SportyBet Code Builder asks for both sports. Basketball entries carry points totals and
// moneyline selections with exact ids, football entries keep goals and H2H.
async function getAvailableMatches(sport) {
  const events = await getEventIndex();
  const wanted = sport || 'football';
  const selected = wanted === 'all'
    ? events
    : events.filter(function (e) { return (e.sport || 'football') === wanted; });
  const h2hIndex = {};
  if (wanted === 'football' || wanted === 'all') {
    try {
      (await fetchTodayStreaks()).forEach(function (m) {
        const key = normaliseName(m.home) + '|' + normaliseName(m.away);
        if (!h2hIndex[key]) h2hIndex[key] = m;
      });
    } catch (e) {
      // H2H is a bonus signal; its absence must never break the schedule feed.
    }
  }
  return selected.map(function (e) {
    const entry = h2hIndex[normaliseName(e.home) + '|' + normaliseName(e.away)];
    return {
      home: e.home, away: e.away, time: e.time, date: e.date || '', league: e.league || '',
      sport: e.sport || 'football',
      odds: e.odds || {}, goals: e.goals || {},
      totals: e.totals || {}, moneyline: e.moneyline || null,
      h2h: entry ? h2hSummary(entry) : null
    };
  });
}

async function resolveLeg(leg, bookmaker) {
  if (!leg || !leg.match) throw unresolvedEventError(leg && leg.match);
  const pair = splitMatchName(leg.match);
  if (pair.length !== 2) throw unresolvedEventError(leg.match);

  const cacheKey = bookmaker + '|' + (leg.sport || 'football') + '|' + String(leg.match).toLowerCase() + '|' + String(leg.tip || '').toLowerCase() + '|' + String(leg.category || '').toLowerCase() + '|' + String(leg.total || '');
  const cached = cacheGet(resolutionCache, cacheKey);
  if (cached) return cached;

  const events = await getEventIndex();
  const event = findEvent(events, pair[0], pair[1], leg.sport === 'basketball' ? 'basketball' : 'football');
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

function hasEventIndex() {
  return !!eventIndexCache;
}

module.exports = { resolveLeg, getAvailableMatches, getEventIndex, warmEventIndex, hasEventIndex };
