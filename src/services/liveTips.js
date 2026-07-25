function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value || '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function statValue(statistics, type) {
  const target = normalise(type);
  return asNumber((statistics || []).find(function(stat) {
    return normalise(stat.type) === target;
  })?.value);
}

function summariseStatistics(response) {
  const teams = Array.isArray(response) ? response : [];
  return teams.reduce(function(total, entry) {
    const statistics = entry.statistics || [];
    total.shotsOnGoal += statValue(statistics, 'Shots on Goal');
    total.shotsOffGoal += statValue(statistics, 'Shots off Goal');
    total.corners += statValue(statistics, 'Corner Kicks');
    total.dangerousAttacks += statValue(statistics, 'Dangerous Attacks');
    return total;
  }, { shotsOnGoal: 0, shotsOffGoal: 0, corners: 0, dangerousAttacks: 0 });
}

function teamStatistics(response, teamId) {
  const entry = (response || []).find(function(item) { return item.team?.id === teamId; });
  const statistics = entry?.statistics || [];
  return {
    shotsOnGoal: statValue(statistics, 'Shots on Goal'),
    shotsOffGoal: statValue(statistics, 'Shots off Goal'),
    corners: statValue(statistics, 'Corner Kicks')
  };
}

function findMarketOdds(oddsEntry, marketNames, acceptedValues) {
  if (!oddsEntry || oddsEntry.status?.blocked || oddsEntry.status?.stopped || oddsEntry.status?.finished) return null;
  const expectedMarkets = marketNames.map(normalise);
  const expectedValues = acceptedValues.map(normalise);
  const bookmakers = Array.isArray(oddsEntry.bookmakers) ? oddsEntry.bookmakers : [];
  for (const bookmaker of bookmakers) {
    for (const bet of bookmaker.bets || []) {
      if (!expectedMarkets.includes(normalise(bet.name))) continue;
      const value = (bet.values || []).find(function(candidate) {
        return expectedValues.includes(normalise(candidate.value)) && candidate.main !== false;
      });
      const odds = asNumber(value?.odd);
      if (odds > 1) return { odds: Number(odds.toFixed(2)), bookmaker: bookmaker.name || 'Live market' };
    }
  }
  return null;
}

function findOverHalfGoalOdds(oddsEntry) {
  return findMarketOdds(oddsEntry, ['Goals Over/Under', 'Over/Under'], ['Over 0.5']);
}

function headToHeadSummary(fixture, history) {
  const homeId = fixture.teams?.home?.id;
  const awayId = fixture.teams?.away?.id;
  const summary = { meetings: 0, home: { wins: 0, scored: 0 }, away: { wins: 0, scored: 0 } };
  (history || []).forEach(function(match) {
    const homeGoals = match.goals?.home;
    const awayGoals = match.goals?.away;
    if (homeGoals == null || awayGoals == null) return;
    const historicalHomeId = match.teams?.home?.id;
    const currentHomeWasHome = historicalHomeId === homeId;
    const currentHomeGoals = currentHomeWasHome ? asNumber(homeGoals) : asNumber(awayGoals);
    const currentAwayGoals = currentHomeWasHome ? asNumber(awayGoals) : asNumber(homeGoals);
    summary.meetings++;
    if (currentHomeGoals > currentAwayGoals) summary.home.wins++;
    if (currentAwayGoals > currentHomeGoals) summary.away.wins++;
    if (currentHomeGoals > 0) summary.home.scored++;
    if (currentAwayGoals > 0) summary.away.scored++;
  });
  return summary;
}

function buildTip(fixture, elapsed, homeGoals, awayGoals, market, liveOdds, signalScore, reason, rule) {
  return {
    fixtureId: fixture.fixture?.id,
    league: fixture.league?.name || 'Football',
    home: fixture.teams?.home?.name || 'Home team',
    away: fixture.teams?.away?.name || 'Away team',
    minute: elapsed,
    score: homeGoals + ' - ' + awayGoals,
    market,
    odds: liveOdds.odds,
    bookmaker: liveOdds.bookmaker,
    // This is a rule-strength score, not a probability of winning.
    signalScore,
    reason,
    rule
  };
}

function buildOpportunities(fixtures, oddsByFixture, statisticsByFixture, headToHeadByFixture) {
  const opportunities = [];
  (fixtures || []).forEach(function(fixture) {
    const fixtureId = fixture.fixture?.id;
    const elapsed = asNumber(fixture.fixture?.status?.elapsed);
    const homeGoals = asNumber(fixture.goals?.home);
    const awayGoals = asNumber(fixture.goals?.away);
    const statisticsResponse = statisticsByFixture.get(fixtureId);
    const statistics = summariseStatistics(statisticsResponse);
    const oddsEntry = oddsByFixture.get(fixtureId);
    const liveOdds = findOverHalfGoalOdds(oddsEntry);

    // A deliberately narrow first rule: a goalless match in the final third
    // with sustained attacking activity and an available, unblocked market.
    const qualifies = elapsed >= 65 && elapsed <= 82 && homeGoals === 0 && awayGoals === 0 &&
      statistics.shotsOnGoal >= 5 && (statistics.shotsOnGoal + statistics.shotsOffGoal) >= 12 &&
      statistics.corners >= 5 && liveOdds && liveOdds.odds >= 1.25;
    if (qualifies) {
      const pressureScore = Math.min(99, 42 + statistics.shotsOnGoal * 2.5 + statistics.shotsOffGoal * 1 + statistics.corners * 2);
      opportunities.push(buildTip(fixture, elapsed, homeGoals, awayGoals, 'Over 0.5 Match Goals', liveOdds, pressureScore,
        statistics.shotsOnGoal + ' shots on target, ' + statistics.corners + ' corners and ' +
        (statistics.shotsOnGoal + statistics.shotsOffGoal) + ' total attempts in a 0-0 match.', 'late-goal-pressure'));
    }

    const h2h = headToHeadSummary(fixture, headToHeadByFixture.get(fixtureId));
    if (elapsed < 51 || elapsed > 75 || h2h.meetings < 4) return;
    const teams = [
      { side: 'home', id: fixture.teams?.home?.id, name: fixture.teams?.home?.name, code: '1', stats: teamStatistics(statisticsResponse, fixture.teams?.home?.id) },
      { side: 'away', id: fixture.teams?.away?.id, name: fixture.teams?.away?.name, code: '2', stats: teamStatistics(statisticsResponse, fixture.teams?.away?.id) }
    ];

    // H2H winner rule: a historically dominant team in a second-half draw.
    if (homeGoals === awayGoals) teams.forEach(function(team) {
      const record = h2h[team.side];
      if (record.wins < 3 || record.wins / h2h.meetings < 0.75) return;
      const winnerOdds = findMarketOdds(oddsEntry, ['Match Winner'], [team.name, team.side, team.code]);
      if (!winnerOdds) return;
      opportunities.push(buildTip(fixture, elapsed, homeGoals, awayGoals, team.name + ' to Win', winnerOdds,
        Math.min(95, 55 + record.wins * 8), 'Head-to-head: ' + team.name + ' won ' + record.wins + ' of the last ' + h2h.meetings +
        ' meetings. The match is still level in the second half.', 'h2h-dominant-winner'));
    });

    // H2H scorer rule: a team that reliably scores in this matchup and is pressing now.
    teams.forEach(function(team) {
      const opponent = teams.find(function(item) { return item.side !== team.side; });
      const record = h2h[team.side];
      const attempts = team.stats.shotsOnGoal + team.stats.shotsOffGoal;
      const opponentAttempts = opponent.stats.shotsOnGoal + opponent.stats.shotsOffGoal;
      const pressing = team.stats.shotsOnGoal >= 3 && attempts >= 6 && attempts > opponentAttempts;
      if (record.scored < 3 || record.scored / h2h.meetings < 0.75 || !pressing) return;
      const scorerOdds = findMarketOdds(oddsEntry, ['Next Goal'], [team.name, team.side, team.code]);
      if (!scorerOdds) return;
      opportunities.push(buildTip(fixture, elapsed, homeGoals, awayGoals, team.name + ' Next Goal', scorerOdds,
        Math.min(95, 52 + record.scored * 7 + team.stats.shotsOnGoal * 3), 'Head-to-head: ' + team.name + ' scored in ' +
        record.scored + ' of the last ' + h2h.meetings + ' meetings and currently lead the pressure with ' + attempts + ' attempts.', 'h2h-consistent-scorer'));
    });
  });
  return opportunities.sort(function(a, b) {
    return b.signalScore - a.signalScore || b.odds - a.odds;
  });
}

module.exports = { asNumber, buildOpportunities, summariseStatistics, findOverHalfGoalOdds, headToHeadSummary };
