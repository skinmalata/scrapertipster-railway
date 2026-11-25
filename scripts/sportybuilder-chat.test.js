const test = require('node:test');
const assert = require('node:assert/strict');

const chat = require('../public/sportybuilder-chat.js');
const { validateSportyFilters, matchesSportyFilters } = require('../src/services/sportyBuilder.js');

test('parses winning basketball request with minimum odds', () => {
  const result = chat.parseIntent('book 10 winning basketball matches with at least 2 odds each');

  assert.equal(result.recognized, true);
  assert.equal(result.intent.sport, 'basketball');
  assert.equal(result.intent.numLegs, 10);
  assert.equal(result.intent.minOddsPerLeg, 2);
  assert.equal(result.intent.straightWinsOnly, true);
  assert.match(result.errors.join(' '), /exceed the 50x ticket limit/);
});

test('parses winning corner matches without applying straight-win filter', () => {
  const result = chat.parseIntent('book 5 winning corner matches today');

  assert.equal(result.recognized, true);
  assert.deepEqual(result.intent.markets, ['corners']);
  assert.equal(result.intent.numLegs, 5);
  assert.equal(result.intent.straightWinsOnly, false);
  assert.equal(result.intent.suggestedTargetOdds, 7.59);
  assert.deepEqual(result.errors, []);
});

test('parses league, market and bare minimum odds', () => {
  const result = chat.parseIntent('EPL and La Liga BTTS with min 1.50');

  assert.equal(result.recognized, true);
  assert.deepEqual(result.intent.markets, ['btts']);
  assert.deepEqual(result.intent.leagues, ['premier league', 'la liga']);
  assert.equal(result.intent.minOddsPerLeg, 1.5);
});

test('does not confuse max odds with a match count', () => {
  const result = chat.parseIntent('min 3 max 2 football');

  assert.equal(result.intent.numLegs, null);
  assert.equal(result.intent.minOddsPerLeg, 3);
  assert.equal(result.intent.maxOddsPerLeg, 2);
  assert.match(result.errors.join(' '), /Maximum odds per leg must be greater/);
});

test('backend accepts valid chat filters', () => {
  const result = validateSportyFilters({
    sport: 'basketball',
    markets: ['1x2'],
    minOddsPerLeg: 2,
    numLegs: 3,
    straightWinsOnly: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.filters.markets, ['1x2']);
  assert.equal(result.filters.numLegs, 3);
  assert.equal(result.filters.straightWinsOnly, true);
});

test('backend rejects unsupported sport/market combinations', () => {
  const result = validateSportyFilters({
    sport: 'basketball',
    markets: ['corners'],
    numLegs: 21,
    minOddsPerLeg: 0.5
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Football markets need football or all sports/);
  assert.match(result.errors.join(' '), /Number of matches must be a whole number between 2 and 20/);
  assert.match(result.errors.join(' '), /Minimum odds per leg must be between 1.06 and 20/);
});

test('backend rejects impossible leg count at minimum odds', () => {
  const result = validateSportyFilters({ numLegs: 10, minOddsPerLeg: 2 });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /exceed the 50x ticket limit/);
});

test('matchesSportyFilters enforces straight wins and minimum odds', () => {
  const filters = validateSportyFilters({
    markets: ['1x2'],
    minOddsPerLeg: 1.5,
    straightWinsOnly: true
  }).filters;

  const homeWin = { category: '1x2', tip: '1', odds: 1.8, league: 'Premier League' };
  const doubleChance = { category: '1x2', tip: '1X', odds: 1.8, league: 'Premier League' };
  const lowOdds = { category: '1x2', tip: '2', odds: 1.2, league: 'Premier League' };

  assert.equal(matchesSportyFilters(homeWin, filters), true);
  assert.equal(matchesSportyFilters(doubleChance, filters), false);
  assert.equal(matchesSportyFilters(lowOdds, filters), false);
});
