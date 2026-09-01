'use strict';

const { betkingHeaders } = require('./http');
const axios = require('axios');

const BETKING_SHARE = 'https://m.betking.com/en-ng/sports/book-bet/';

function invalidError(message) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = 'INVALID_CODE';
  return err;
}

function numberOdds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// BetKing renders the booked coupon as JSON inside the server-rendered HTML.
// Extract the value of the top-level "bookedCoupon" key and parse it.
function extractBookedCoupon(html) {
  const key = '"bookedCoupon":';
  const start = html.indexOf(key);
  if (start < 0) return null;
  let objStart = start + key.length;
  while (objStart < html.length && /\s/.test(html[objStart])) objStart++;
  if (html[objStart] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = objStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.substring(objStart, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeSelection(sel) {
  return {
    eventId: String(sel.eventId || sel.matchId || ''),
    marketId: String(sel.marketId || ''),
    specifier: null,
    outcomeId: String(sel.selectionId || ''),
    eventName: sel.matchName || sel.eventName || '',
    marketName: sel.marketName || '',
    outcomeName: sel.selectionName || '',
    odds: numberOdds(sel.oddValue || sel.confirmedOddValue),
    startTime: sel.eventDate || '',
    competition: sel.tournamentName || '',
    sport: sel.sportName || '',
    providerEventId: sel.providerEventId || null
  };
}

async function decodeBetking(code) {
  const url = BETKING_SHARE + encodeURIComponent(String(code || '').toUpperCase());
  let data;
  try {
    const res = await axios.get(url, {
      headers: betkingHeaders(),
      timeout: 15000,
      validateStatus: function () { return true; }
    });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      const err = new Error('BetKing is unavailable right now (HTTP ' + res.status + '). Please try again shortly.');
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    data = res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    const wrapped = new Error('Could not reach BetKing. Please try again shortly.');
    wrapped.code = 'NETWORK_ERROR';
    throw wrapped;
  }

  const bookedCoupon = extractBookedCoupon(typeof data === 'string' ? data : String(data || ''));
  const odds = bookedCoupon && Array.isArray(bookedCoupon.odds) ? bookedCoupon.odds : [];
  if (!bookedCoupon || !odds.length) {
    throw invalidError('The BetKing code is invalid or has expired.');
  }
  return odds.map(normalizeSelection);
}

module.exports = { decodeBetking };
