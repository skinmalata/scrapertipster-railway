const { asNumber } = require('./liveTips');

function impliedProbability(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 1) return 0;
  return Number(((1 / decimalOdds) * 100).toFixed(1));
}

function probabilityEdge(forebetProb, bookmakerOdds) {
  const implied = impliedProbability(bookmakerOdds);
  if (implied <= 0) return 0;
  return Number((forebetProb - implied).toFixed(1));
}

function scoreTotal(score) {
  if (!score) return null;
  return asNumber(score.home) + asNumber(score.away);
}

function isGoalless(score) {
  return scoreTotal(score) === 0;
}

function minutesRemaining(elapsed) {
  const addedTime = elapsed >= 90 ? 6 : elapsed >= 45 ? 5 : 0;
  return Math.max(0, 90 - elapsed + addedTime);
}

function timePressureFactor(elapsed) {
  if (elapsed < 60) return 0;
  if (elapsed <= 70) return 1;
  if (elapsed <= 80) return 2;
  return 3;
}

function checkModelStatsMismatch(forebet, apiStats) {
  if (!forebet || !apiStats) return null;
  if (!isGoalless(forebet.score)) return null;
  const elapsed = asNumber(forebet.minute);
  if (elapsed < 55 || elapsed > 82) return null;

  const bestProb = Math.max(forebet.probabilities.home, forebet.probabilities.draw, forebet.probabilities.away);
  if (bestProb < 55) return null;

  const shotsOn = asNumber(apiStats.shotsOnGoal);
  const totalShots = asNumber(apiStats.shotsOnGoal) + asNumber(apiStats.shotsOffGoal);
  const corners = asNumber(apiStats.corners);

  if (shotsOn < 4 || totalShots < 10 || corners < 4) return null;

  const overOdds = forebet.preMatchOdds?.over25 || forebet.preMatchOdds?.home;
  const bookOdds = forebet.liveOdds?.over05 || overOdds;
  const edge = probabilityEdge(forebet.avgGoals >= 2.5 ? 70 : 55, bookOdds);

  const statsPressure = shotsOn * 3 + corners * 2 + totalShots;
  const pressureThreshold = 35;
  if (statsPressure < pressureThreshold) return null;

  const confidence = Math.min(99, 50 + statsPressure * 0.3 + edge * 0.5 + timePressureFactor(elapsed) * 5);

  return {
    rule: 'model-stats-mismatch',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'Forebet model gives ' + bestProb + '% win probability but match is 0-0 at minute ' + elapsed + '. ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total attempts. Avg goals: ' + forebet.avgGoals + '.',
    edge: edge > 0 ? edge : null
  };
}

function checkProbabilitySurge(forebet) {
  if (!forebet) return null;
  if (!forebet.preMatchOdds?.home && !forebet.preMatchOdds?.away) return null;

  const elapsed = asNumber(forebet.minute);
  if (elapsed < 45 || elapsed > 80) return null;
  if (isGoalless(forebet.score)) return null;

  const bestProb = Math.max(forebet.probabilities.home, forebet.probabilities.away);
  if (bestProb < 70) return null;

  const bestSide = forebet.probabilities.home >= forebet.probabilities.away ? 'home' : 'away';
  const preMatchOdds = forebet.preMatchOdds[bestSide];
  const preMatchImplied = impliedProbability(preMatchOdds);
  const liveEdge = bestProb - preMatchImplied;

  if (liveEdge < 12) return null;

  const winnerOdds = forebet.liveOdds?.winner;
  const currentEdge = winnerOdds ? probabilityEdge(bestProb, winnerOdds) : liveEdge;

  const confidence = Math.min(99, 58 + liveEdge * 0.8 + timePressureFactor(elapsed) * 4);

  const teamName = bestSide === 'home' ? forebet.home : forebet.away;

  return {
    rule: 'probability-surge',
    market: teamName + ' to Win',
    confidence: Math.round(confidence),
    reason: teamName + ' probability surged to ' + bestProb + '% (was ' + Math.round(preMatchImplied) + '% pre-match). Score: ' + forebet.score.home + '-' + forebet.score.away + ' at minute ' + elapsed + '.',
    edge: currentEdge > 0 ? currentEdge : liveEdge
  };
}

function checkDrawTrap(forebet, apiStats, h2hSummary) {
  if (!forebet || !h2hSummary) return null;
  if (!isGoalless(forebet.score) && scoreTotal(forebet.score) !== 1) return null;
  if (forebet.probabilities.draw > 35) return null;

  const elapsed = asNumber(forebet.minute);
  if (elapsed < 55 || elapsed > 80) return null;

  const bestProb = Math.max(forebet.probabilities.home, forebet.probabilities.away);
  if (bestProb < 50) return null;

  const bestSide = forebet.probabilities.home >= forebet.probabilities.away ? 'home' : 'away';
  const dominantWins = h2hSummary[bestSide]?.wins || 0;
  const meetings = h2hSummary.meetings || 0;

  if (meetings < 3 || dominantWins < 2) return null;
  const h2hRate = dominantWins / meetings;
  if (h2hRate < 0.6) return null;

  if (!apiStats) return null;
  const stats = apiStats[bestSide] || {};
  const teamShots = asNumber(stats.shotsOnGoal) + asNumber(stats.shotsOffGoal);
  const opponentShots = asNumber((apiStats[bestSide === 'home' ? 'away' : 'home'] || {}).shotsOnGoal) + asNumber((apiStats[bestSide === 'home' ? 'away' : 'home'] || {}).shotsOffGoal);

  if (teamShots <= opponentShots) return null;

  const teamName = bestSide === 'home' ? forebet.home : forebet.away;
  const confidence = Math.min(99, 52 + h2hRate * 15 + (teamShots - opponentShots) * 2 + timePressureFactor(elapsed) * 4);

  return {
    rule: 'draw-trap',
    market: teamName + ' to Win',
    confidence: Math.round(confidence),
    reason: 'Level at ' + forebet.score.home + '-' + forebet.score.away + ' but ' + teamName + ' dominated H2H (' + dominantWins + '/' + meetings + ' wins) and currently lead the pressure (' + teamShots + ' vs ' + opponentShots + ' attempts).',
    edge: null
  };
}

function checkBTTSPressure(forebet, apiStats) {
  if (!forebet || !apiStats) return null;
  if (!isGoalless(forebet.score)) return null;

  const elapsed = asNumber(forebet.minute);
  if (elapsed < 50 || elapsed > 75) return null;

  const homeStats = apiStats.home || {};
  const awayStats = apiStats.away || {};
  const homeShotsOn = asNumber(homeStats.shotsOnGoal);
  const awayShotsOn = asNumber(awayStats.shotsOnGoal);
  const homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  const awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);

  if (homeShotsOn < 2 || awayShotsOn < 2) return null;
  if (homeShotsTotal + awayShotsTotal < 12) return null;

  const bttsProb = Math.min(75, 40 + (homeShotsOn + awayShotsOn) * 3 + (homeShotsTotal + awayShotsTotal) * 0.5);
  const confidence = Math.min(99, 48 + (homeShotsOn + awayShotsOn) * 4 + timePressureFactor(elapsed) * 3);

  return {
    rule: 'btts-pressure',
    market: 'BTTS - Yes',
    confidence: Math.round(confidence),
    reason: 'Both teams creating chances in a 0-0: ' + forebet.home + ' (' + homeShotsOn + ' on target), ' + forebet.away + ' (' + awayShotsOn + ' on target). Total ' + (homeShotsTotal + awayShotsTotal) + ' attempts at minute ' + elapsed + '.',
    edge: null
  };
}

function checkLateGoalStorm(forebet, apiStats) {
  if (!forebet) return null;
  if (!isGoalless(forebet.score)) return null;

  const elapsed = asNumber(forebet.minute);
  if (elapsed < 70 || elapsed > 85) return null;

  const bestProb = Math.max(forebet.probabilities.home, forebet.probabilities.away);
  if (bestProb < 60) return null;
  if (forebet.avgGoals < 2.0) return null;

  if (!apiStats) return null;
  const total = apiStats.total || {};
  const shotsOn = asNumber(total.shotsOnGoal);
  const corners = asNumber(total.corners);
  const totalShots = shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 6 || totalShots < 15 || corners < 6) return null;

  const statsScore = shotsOn * 2 + corners * 1.5 + totalShots * 0.3;
  const confidence = Math.min(99, 55 + statsScore * 0.2 + (forebet.avgGoals - 2) * 8 + timePressureFactor(elapsed) * 5);

  return {
    rule: 'late-goal-storm',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'High-pressure 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots. Forebet avg goals: ' + forebet.avgGoals + ', best probability: ' + bestProb + '%.',
    edge: null
  };
}

function findOddsMatch(forebet, market) {
  if (!forebet) return null;
  if (market === 'home') return forebet.preMatchOdds?.home || null;
  if (market === 'away') return forebet.preMatchOdds?.away || null;
  return null;
}

function buildGoldenTips(forebetData, apiData, h2hData) {
  if (!forebetData || !forebetData.matches) return [];

  const opportunities = [];

  forebetData.matches.forEach(function (match) {
    const apiStats = apiData ? apiData.get(match.matchId) : null;
    const h2h = h2hData ? h2hData.get(match.matchId) : null;

    const checks = [
      checkModelStatsMismatch(match, apiStats),
      checkProbabilitySurge(match),
      checkDrawTrap(match, apiStats ? {
        home: apiStats.homeTeam,
        away: apiStats.awayTeam
      } : null, h2h),
      checkBTTSPressure(match, apiStats ? {
        home: apiStats.homeTeam,
        away: apiStats.awayTeam
      } : null),
      checkLateGoalStorm(match, apiStats ? {
        total: apiStats.total
      } : null)
    ];

    checks.forEach(function (tip) {
      if (!tip) return;
      opportunities.push({
        fixtureId: match.matchId,
        home: match.home,
        away: match.away,
        league: match.league,
        country: match.country,
        minute: match.minute,
        score: match.score ? match.score.home + ' - ' + match.score.away : '0 - 0',
        htScore: match.htScore ? '(' + match.htScore.home + ' - ' + match.htScore.away + ')' : '',
        forebetProbabilities: match.probabilities,
        avgGoals: match.avgGoals,
        rule: tip.rule,
        market: tip.market,
        confidence: tip.confidence,
        reason: tip.reason,
        edge: tip.edge
      });
    });
  });

  return opportunities.sort(function (a, b) {
    return b.confidence - a.confidence || (b.edge || 0) - (a.edge || 0);
  });
}

module.exports = {
  buildGoldenTips,
  impliedProbability,
  probabilityEdge,
  checkModelStatsMismatch,
  checkProbabilitySurge,
  checkDrawTrap,
  checkBTTSPressure,
  checkLateGoalStorm
};
