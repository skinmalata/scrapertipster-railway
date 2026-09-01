'use strict';

const { bangbetHeaders } = require('./http');
const axios = require('axios');

const BANGBET_BOOKING = 'https://bet-api.bangbet.com/api/bet/bookingV2';
const BANGBET_SHARE = 'https://bet-api.bangbet.com/api/bet/share';

function invalidError(message) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = 'INVALID_CODE';
  return err;
}

function networkError(message) {
  const err = new Error(message || 'Could not reach Bangbet. Please try again shortly.');
  err.code = 'NETWORK_ERROR';
  return err;
}

function numberOdds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanSpecifier(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSelection(item) {
  return {
    eventId: String(item.eventId || ''),
    marketId: String(item.marketId || ''),
    specifier: cleanSpecifier(item.specifiers),
    outcomeId: String(item.outcomeId || ''),
    eventName: item.teamName || item.eventName || [item.homeTeamName, item.awayTeamName].filter(Boolean).join(' vs. '),
    marketName: item.marketName || '',
    outcomeName: item.outcomeName || '',
    odds: numberOdds(item.odds != null ? item.odds : item.bestOdds),
    startTime: item.eventDate || item.startTime || '',
    competition: item.leagueName || item.tournamentName || '',
    sport: item.sportId || item.sportName || ''
  };
}

async function decodeBangbet(code) {
  const params = new URLSearchParams();
  params.append('bookingCode', String(code || '').trim().toUpperCase());

  let data;
  try {
    const res = await axios.post(BANGBET_BOOKING, params.toString(), {
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, bangbetHeaders()),
      timeout: 15000,
      validateStatus: function () { return true; }
    });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      throw networkError('Bangbet is unavailable right now (HTTP ' + res.status + '). Please try again shortly.');
    }
    data = res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    throw networkError();
  }

  if (!data || data.result !== 1 || !data.data || !Array.isArray(data.data.items)) {
    const msg = data && data.info ? String(data.info) : '';
    throw invalidError(msg || 'The Bangbet code is invalid or has expired.');
  }
  const items = data.data.items;
  if (!items.length) throw invalidError('The Bangbet code has no active selections.');
  return items.map(normalizeSelection);
}

async function createBangbetCode(legs) {
  const items = (legs || []).map(function (leg) {
    return {
      eventId: String(leg.eventId || ''),
      marketId: String(leg.marketId || '1'),
      specifiers: leg.specifiers || leg.specifier || '',
      outcomeId: String(leg.outcomeId || ''),
      odds: Number(leg.odds) > 0 ? Number(leg.odds) : 1
    };
  });
  if (!items.length) throw new Error('Cannot create a Bangbet booking code without selections.');

  let data;
  try {
    const res = await axios.post(BANGBET_SHARE, items, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, bangbetHeaders()),
      timeout: 15000,
      validateStatus: function () { return true; }
    });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      throw networkError('Bangbet is unavailable right now (HTTP ' + res.status + '). Please try again shortly.');
    }
    data = res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    throw networkError();
  }

  if (!data || data.result !== 1 || !data.data) {
    const msg = data && data.info ? String(data.info) : '';
    const err = new Error(msg || 'Bangbet could not create a booking code for these selections.');
    err.code = 'INVALID_SELECTIONS';
    throw err;
  }
  return String(data.data);
}

module.exports = { decodeBangbet, createBangbetCode };
