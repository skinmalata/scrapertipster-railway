'use strict';

const { sportradarHeaders, getJson, postJson } = require('./http');

const SPORTYBET_SHARE = 'https://www.sportybet.com/api/ng/orders/share';
const MSPORT_SHARE = 'https://www.msport.com/api/ng/orders/real-sports/order/share';

function cleanSpecifier(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOdds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function invalidError(message) {
  const err = new Error(message || 'The code is invalid or has expired.');
  err.code = 'INVALID_CODE';
  return err;
}

function normalizeSportybetOutcome(outcome) {
  const market = (outcome && outcome.markets && outcome.markets[0]) || {};
  const selection = (market.outcomes && market.outcomes[0]) || {};
  return {
    eventId: String(outcome.eventId || ''),
    marketId: String(market.id || ''),
    specifier: cleanSpecifier(market.specifier),
    outcomeId: String(selection.id || ''),
    eventName: outcome.name || outcome.eventName || '',
    marketName: market.name || market.englishName || '',
    outcomeName: selection.name || '',
    odds: numberOdds(selection.odds),
    startTime: outcome.startTime || outcome.eventStartTime || '',
    competition: outcome.competitionName || (outcome.competition && outcome.competition.name) || '',
    sport: outcome.sportId || outcome.sport || ''
  };
}

function normalizeMsportOutcome(outcome) {
  const event = outcome.event || {};
  const market = outcome.market || {};
  const selection = outcome.outcome || {};
  return {
    eventId: String(event.eventId || ''),
    marketId: String(market.id || ''),
    specifier: cleanSpecifier(market.specifiers),
    outcomeId: String(selection.id || ''),
    eventName: event.name || event.eventName || '',
    marketName: market.name || '',
    outcomeName: selection.name || '',
    odds: numberOdds(selection.odds),
    startTime: event.startTime || '',
    competition: event.competition || event.competitionName || '',
    sport: event.sportId || event.sport || ''
  };
}

async function decodeSportybet(code) {
  const data = await getJson(SPORTYBET_SHARE + '/' + encodeURIComponent(code), sportradarHeaders('https://www.sportybet.com'));
  const msg = String(data.innerMsg || '').toLowerCase();
  const outcomes = data && data.data && Array.isArray(data.data.outcomes) ? data.data.outcomes : [];
  if (msg.includes('invalid') || !outcomes.length) {
    throw invalidError(data.message);
  }
  return outcomes.map(normalizeSportybetOutcome);
}

async function decodeMsport(code) {
  const data = await getJson(MSPORT_SHARE + '/' + encodeURIComponent(code), sportradarHeaders('https://www.msport.com'));
  const msg = String(data.innerMsg || '').toLowerCase();
  const slip = data && data.data && Array.isArray(data.data.bettableBetSlip) ? data.data.bettableBetSlip : [];
  if (msg !== 'success' || !slip.length) {
    throw invalidError(data.message);
  }
  return slip.map(normalizeMsportOutcome);
}

function toCreateSelection(leg) {
  return {
    eventId: leg.eventId,
    marketId: String(leg.marketId),
    specifier: leg.specifier || null,
    outcomeId: String(leg.outcomeId)
  };
}

function createSelectionsError(message) {
  const err = new Error(message || 'One or more selections are not available on this bookmaker.');
  err.code = 'INVALID_SELECTIONS';
  return err;
}

function noCodeError(message) {
  const err = new Error(message || 'The bookmaker did not return a code.');
  err.code = 'NO_CODE';
  return err;
}

async function createSportybetCode(selections) {
  const data = await postJson(SPORTYBET_SHARE, { selections: selections.map(toCreateSelection) }, sportradarHeaders('https://www.sportybet.com'));
  if (String(data.innerMsg || '').toLowerCase() === 'invalid') {
    throw createSelectionsError(data.message);
  }
  const code = data && data.data && data.data.shareCode;
  if (!code) throw noCodeError(data.message);
  return String(code);
}

async function createMsportCode(selections) {
  const data = await postJson(MSPORT_SHARE, { selections: selections.map(toCreateSelection) }, sportradarHeaders('https://www.msport.com'));
  if (String(data.innerMsg || '').toLowerCase() === 'invalid') {
    throw createSelectionsError(data.message);
  }
  const code = data && data.data && data.data.shareCode;
  if (!code) throw noCodeError(data.message);
  return String(code);
}

module.exports = { decodeSportybet, decodeMsport, createSportybetCode, createMsportCode };
