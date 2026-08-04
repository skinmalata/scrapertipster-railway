'use strict';

const { betwayHeaders, postJson } = require('./http');

const BETWAY_FIND = 'https://www.betway.com.ng/appsynapse/bet-api-sr/v2/Betting/FindBookABet';
const BETWAY_CREATE = 'https://www.betway.com.ng/appsynapse/bet-api-sr/v2/Betting/BookABet';

function invalidError(message) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = 'INVALID_CODE';
  return err;
}

function noCodeError(message) {
  const err = new Error(message || 'Betway did not return a code.');
  err.code = 'NO_CODE';
  return err;
}

function numberOdds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSelection(sel) {
  const market = sel.market || {};
  const outcome = sel.outcome || {};
  const sportEvent = sel.sportEvent || {};
  const price = sel.price || {};
  return {
    eventId: String(sel.eventId || sportEvent.eventId || ''),
    marketId: String(sel.marketId || market.marketId || ''),
    specifier: null,
    outcomeId: String(sel.outcomeId || outcome.outcomeId || ''),
    eventName: sel.eventName || sportEvent.name || '',
    marketName: sel.marketName || market.displayName || market.name || '',
    outcomeName: sel.outcomeName || outcome.displayName || outcome.name || '',
    odds: numberOdds(sel.priceDecimal || price.priceDecimal),
    competition: sel.league || sportEvent.league || '',
    sport: sel.sportId || sportEvent.sportId || '',
    marketTypeCName: market.marketTypeCName || ''
  };
}

async function decodeBetway(code) {
  const data = await postJson(BETWAY_FIND, {
    countryCode: 'NG',
    bookingCode: String(code || '').toUpperCase(),
    cultureCode: 'en-US'
  }, betwayHeaders(), 15000);
  if (data && (data.errorCode || data.errorMessage)) {
    throw invalidError(data.errorMessage || data.errorCode);
  }
  const selections = data && Array.isArray(data.selections) ? data.selections : [];
  if (!selections.length) {
    throw invalidError(data && (data.message || data.errorMessage));
  }
  return selections.map(normalizeSelection);
}

async function createBetwayCode(selections) {
  const outcomes = (selections || []).map(function (sel) {
    return {
      outcomeId: String(sel.outcomeId),
      eventId: Number(sel.eventId),
      marketId: String(sel.marketId),
      payment: 1,
      value: 100,
      selected: true
    };
  });
  if (!outcomes.length) throw invalidError('No selections were found to create a Betway code.');

  const data = await postJson(BETWAY_CREATE, {
    cultureCode: 'en-US',
    countryCode: 'NG',
    isSingleBet: outcomes.length === 1,
    outcomes: outcomes
  }, betwayHeaders(), 15000);

  if (data && (data.errorCode || data.errorMessage)) {
    const err = new Error(data.errorMessage || 'Betway could not create a code for these selections.');
    err.code = 'INVALID_SELECTIONS';
    throw err;
  }
  const code = data && data.bookingCode;
  if (!code) throw noCodeError(data && (data.message || data.errorMessage));
  return String(code);
}

module.exports = { decodeBetway, createBetwayCode };
