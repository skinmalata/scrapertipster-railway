const test = require('node:test');
const assert = require('node:assert/strict');

const chat = require('../public/sportybuilder-chat.js');
const { validateSportyFilters, matchesSportyFilters, withinTargetWindow, HSH_LOOKAHEAD_HOURS } = require('../src/services/sportyBuilder.js');

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

test('parses easy football markets without mixing btts sides', () => {
  const under = chat.parseIntent('book 5 under 2.5 football matches');
  assert.equal(under.recognized, true);
  assert.deepEqual(under.intent.markets, ['under25']);
  assert.equal(under.intent.numLegs, 5);

  const no = chat.parseIntent('4 btts no matches min 1.30');
  assert.deepEqual(no.intent.markets, ['bttsno']);
  assert.equal(no.intent.minOddsPerLeg, 1.3);
  assert.equal(no.intent.numLegs, 4);

  const dc = chat.parseIntent('dc 12 premier league');
  assert.deepEqual(dc.intent.markets, ['dc12']);
  assert.deepEqual(dc.intent.leagues, ['premier league']);

  const over = chat.parseIntent('over 3.5 target 6x');
  assert.deepEqual(over.intent.markets, ['over35']);
  assert.equal(over.intent.targetOdds, 6);
  assert.equal(over.intent.numLegs, null);
});

test('does not confuse max odds with a match count', () => {
  const result = chat.parseIntent('min 3 max 2 football');

  assert.equal(result.intent.numLegs, null);
  assert.equal(result.intent.minOddsPerLeg, 3);
  assert.equal(result.intent.maxOddsPerLeg, 2);
  assert.match(result.errors.join(' '), /Maximum odds per leg must be greater/);
});

test('uses realistic target odds for highest scoring half legs', () => {
  const result = chat.parseIntent('5 highest scoring half matches');

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.intent.markets, ['highestscoringhalf']);
  assert.equal(result.intent.numLegs, 5);
  assert.equal(result.intent.suggestedTargetOdds, 3.71);
});

test('parses natural count phrasings without mistaking them for target odds', () => {
  const straight = chat.parseIntent('give me five straight wins with min 1.40');
  assert.equal(straight.intent.numLegs, 5);
  assert.deepEqual(straight.intent.markets, ['1x2']);
  assert.equal(straight.intent.straightWinsOnly, true);
  assert.equal(straight.intent.minOddsPerLeg, 1.4);

  const accumulator = chat.parseIntent('3 x over 2.5 football');
  assert.equal(accumulator.intent.numLegs, 3);
  assert.deepEqual(accumulator.intent.markets, ['over25']);
  assert.equal(accumulator.intent.targetOdds, null);

  const legs = chat.parseIntent('4-leg btts no');
  assert.equal(legs.intent.numLegs, 4);
  assert.deepEqual(legs.intent.markets, ['bttsno']);

  const oneXTwo = chat.parseIntent('5 x 1x2 football');
  assert.equal(oneXTwo.intent.numLegs, 5);
  assert.deepEqual(oneXTwo.intent.markets, ['1x2']);
  assert.equal(oneXTwo.intent.targetOdds, null);
});

test('parses btts no aliases and spaced total lines', () => {
  const phrase = chat.parseIntent('both teams to score no with min 1.30');
  assert.deepEqual(phrase.intent.markets, ['bttsno']);
  assert.equal(phrase.intent.minOddsPerLeg, 1.3);

  const alias = chat.parseIntent('bttsng football');
  assert.deepEqual(alias.intent.markets, ['bttsno']);

  const totals = chat.parseIntent('o2 5 and u1 5 football');
  assert.deepEqual(totals.intent.markets, ['over25', 'under15']);
  assert.equal(totals.intent.numLegs, null);
});

test('parses natural odds phrasing, NBA shorthand and half qualifiers', () => {
  const odds = chat.parseIntent('odds at least 1.5 and odds at most 3 football');
  assert.equal(odds.intent.minOddsPerLeg, 1.5);
  assert.equal(odds.intent.maxOddsPerLeg, 3);

  const nba = chat.parseIntent('NBA moneyline accumulator odds 6 five legs');
  assert.equal(nba.intent.sport, 'basketball');
  assert.deepEqual(nba.intent.markets, ['1x2']);
  assert.equal(nba.intent.numLegs, 5);
  assert.equal(nba.intent.targetOdds, 6);

  const half = chat.parseIntent('2nd half over 1.5 football');
  assert.deepEqual(half.intent.markets, ['over15']);
});

test('highest scoring half fixtures use a longer lookahead than the default window', () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(Date.now() + 48 * 3600 * 1000));
  const value = type => parts.find(p => p.type === type).value;
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  const time = `${value('hour') === '24' ? '00' : value('hour')}:${value('minute')}`;

  assert.equal(withinTargetWindow(date, time), false);
  assert.equal(withinTargetWindow(date, time, HSH_LOOKAHEAD_HOURS), true);
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

test('backend accepts the easy market aliases', () => {
  const result = validateSportyFilters({
    sport: 'football',
    markets: ['btts no', 'under 2 5', 'over 3 5', 'double chance 12']
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.filters.markets, ['bttsno', 'under25', 'over35', 'dc12']);
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
