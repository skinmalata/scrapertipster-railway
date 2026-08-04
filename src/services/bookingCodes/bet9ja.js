'use strict';

const { bet9jaHeaders, bet9jaSportsHeaders, getJson, postForm } = require('./http');

const BET9JA_GET = 'https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCoupon';
const BET9JA_CREATE = 'https://apigw.bet9ja.com/sportsbook/placebet/BookABetV2';
const BET9JA_EVENT = 'https://sports.bet9ja.com/desktop/feapi/PalimpsestAjax/GetEvent';
const BET9JA_SPORTS = 'https://sports.bet9ja.com/desktop/feapi/PalimpsestAjax/GetSports?DISP=1000';
const CACHE_VERSION = '1.295.4.219';

// The coupon API returns Bet9ja's internal event id (E_ID). The Sportradar
// match id that SportyBet/MSport/Betway use is the EXTID field on GetEvent.
// These resolvers bridge the two, with a short cache so repeated conversions
// do not re-hit Bet9ja for the same event.
const EXTID_CACHE_TTL_MS = 10 * 60 * 1000;
const EXTID_CACHE_MAX = 500;
const eidToExtidCache = new Map();
const extidToEidCache = new Map();
let sportsIndexCache = null;
let sportsIndexAt = 0;

function cacheCleanup(map) {
  if (map.size < EXTID_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now - entry.at > EXTID_CACHE_TTL_MS) map.delete(key);
  }
  if (map.size >= EXTID_CACHE_MAX) map.clear();
}

async function resolveExtid(eid) {
  const key = String(eid || '').trim();
  if (!key) return null;
  const cached = eidToExtidCache.get(key);
  if (cached && Date.now() - cached.at < EXTID_CACHE_TTL_MS) return cached.value;
  const url = BET9JA_EVENT + '?EVENTID=' + encodeURIComponent(key);
  const data = await getJson(url, bet9jaSportsHeaders(), 15000);
  const extid = data && data.D && data.D.EXTID ? String(data.D.EXTID) : null;
  cacheCleanup(eidToExtidCache);
  eidToExtidCache.set(key, { at: Date.now(), value: extid });
  if (extid) {
    cacheCleanup(extidToEidCache);
    extidToEidCache.set(extid, { at: Date.now(), value: { eid: key, name: data.D.DS || '', gid: data.D.GID, sgid: data.D.SGID, sportId: data.D.SID || 1, gn: data.D.GN || '' } });
  }
  return extid;
}

// Bet9ja's GetSports feed carries EXTID per event, so an EXTID (Sportradar id)
// can be resolved back to Bet9ja's internal E_ID. The feed is a curated subset;
// the index is cached for a few minutes.
async function getSportsIndex() {
  if (sportsIndexCache && Date.now() - sportsIndexAt < 10 * 60 * 1000) return sportsIndexCache;
  const data = await getJson(BET9JA_SPORTS, bet9jaSportsHeaders(), 20000);
  const pal = data && data.D && data.D.PAL ? data.D.PAL : {};
  const index = new Map();
  for (const sport of Object.values(pal)) {
    for (const sg of Object.values((sport && sport.SG) || {})) {
      for (const g of Object.values((sg && sg.G) || {})) {
        for (const [eid, ev] of Object.entries((g && g.E) || {})) {
          if (ev && ev.EXTID) {
            index.set(String(ev.EXTID), {
              eid: eid,
              name: ev.N || '',
              gn: g.N || '',
              sg: sg.N || '',
              gid: g.GID || eid,
              sgid: sg.SGID || '',
              sportId: (sg.SPORT_ID || g.SPORT_ID || 1)
            });
          }
        }
      }
    }
  }
  sportsIndexCache = index;
  sportsIndexAt = Date.now();
  return index;
}

async function resolveEidFromExtid(extid) {
  const key = String(extid || '').trim();
  if (!key) return null;
  const cached = extidToEidCache.get(key);
  if (cached && Date.now() - cached.at < EXTID_CACHE_TTL_MS) return cached.value;
  const index = await getSportsIndex();
  const found = index.get(key) || null;
  cacheCleanup(extidToEidCache);
  extidToEidCache.set(key, { at: Date.now(), value: found });
  return found;
}

function invalidError(message) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = 'INVALID_CODE';
  return err;
}

function toGame(id, game) {
  return {
    id: String(id || ''),
    E_ID: Number(game.E_ID || 0),
    E_C: game.E_C || '',
    E_NAME: game.E_NAME || '',
    SGN: game.SGN || '',
    M_NAME: game.M_NAME || '',
    V: game.V || '1.0',
    GID: game.GID || '',
    SGID: game.SGID || '',
    SPORT_ID: Number(game.SPORT_ID || 1),
    odds_display: Number(game.V || 1),
    eventName: game.E_NAME || '',
    marketName: game.M_NAME || '',
    outcomeName: String(game.SGN || ''),
    odds: Number(game.V || 1)
  };
}

async function decodeBet9ja(code) {
  const url = BET9JA_GET + '?couponCode=' + encodeURIComponent(code) + '&v_cache_version=' + CACHE_VERSION;
  const data = await getJson(url, bet9jaHeaders(), 15000);
  if (!data || data.R !== 'OK') {
    throw invalidError(data && data.D && data.D.ERROR_MESSAGE ? data.D.ERROR_MESSAGE : null);
  }
  const games = data.D && data.D.O ? data.D.O : {};
  const entries = Object.keys(games).map(function (key) {
    return toGame(key, games[key] || {});
  });
  if (!entries.length) {
    throw invalidError('No games were found in this booking code.');
  }
  return entries;
}

function marketKey(sign) {
  return 'S_1X2_' + sign;
}

// Bet9ja's BookABet re-encode API is only validated here for the 1X2 market
// family (the legacy coupon path used by createBet9jaCode). Decoding keeps any
// market, but re-creating a code with an unsupported market would silently
// produce a wrong slip, so those legs are rejected with a clear error instead.
const ONE_X_TWO_SIGNS = { '1': 1, 'X': 1, '2': 1 };

async function createBet9jaCode(games) {
  const betlines = {};
  const oddsDict = {};
  let oddsMin = 1;

  for (const game of games) {
    const sign = String(game.SGN || '1');
    if (!ONE_X_TWO_SIGNS[sign]) {
      const err = new Error('Only 1X2 selections can be converted into a Bet9ja code right now. The "' + (game.M_NAME || game.marketName || 'selection') + '" market in this code is not supported yet, so the code was not created.');
      err.code = 'UNSUPPORTED_MARKET';
      throw err;
    }
    const sid = marketKey(sign);
    const gameId = String(game.id || game.E_ID + '$' + sid);
    const odd = Number(game.V || 1);

    betlines[gameId] = {
      eventId: String(game.E_ID),
      eventName: game.E_NAME,
      market: 'S_1X2',
      marketName: '1X2 ' + sign,
      marketNameNoSign: '1X2',
      sign: sign,
      sid: sid,
      sportId: Number(game.SPORT_ID || 1),
      id: gameId
    };
    oddsDict[gameId] = odd;
    oddsMin *= odd;
  }

  const bets = [{
    BSTYPE: 0,
    TAB: 0,
    NUMLINES: games.length,
    COMB: 1,
    TYPE: games.length,
    STAKE: 0,
    POTWINMIN: 0,
    POTWINMAX: 0,
    BONUSMIN: 0,
    BONUSMAX: 0,
    ODDMIN: oddsMin,
    ODDMAX: oddsMin,
    ODDS: oddsDict,
    FIXED: {}
  }];

  const betslip = {
    BETS: bets,
    EVS: betlines,
    IMPERSONIZE: 0
  };

  const url = BET9JA_CREATE + '?source=desktop&v_cache_version=' + CACHE_VERSION;
  const data = await postForm(url, { BETSLIP: JSON.stringify(betslip) }, bet9jaHeaders(), 20000);

  if (!data || data.status !== 1) {
    const err = new Error((data && data.error && data.error.message) || 'Failed to create the Bet9ja code.');
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }

  const code = data.data && data.data[0] && data.data[0].RIS;
  if (!code) {
    const err = new Error('Bet9ja did not return a code.');
    err.code = 'NO_CODE';
    throw err;
  }
  return String(code);
}

module.exports = { decodeBet9ja, createBet9jaCode, resolveExtid, resolveEidFromExtid };
