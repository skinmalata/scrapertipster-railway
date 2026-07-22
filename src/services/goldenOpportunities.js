const { asNumber } = require('./liveTips');

function scoreTotal(score) {
  if (!score) return null;
  return asNumber(score.home) + asNumber(score.away);
}

function isGoalless(score) {
  return scoreTotal(score) === 0;
}

function timePressureFactor(elapsed) {
  if (elapsed < 60) return 0;
  if (elapsed <= 70) return 1;
  if (elapsed <= 80) return 2;
  return 3;
}

function checkLateGoalStorm(match, stats) {
  if (!match || !stats) return null;
  if (!isGoalless(match.score)) return null;

  const elapsed = asNumber(match.minute);
  if (elapsed < 70 || elapsed > 85) return null;

  const total = stats.total || {};
  const shotsOn = asNumber(total.shotsOnGoal);
  const corners = asNumber(total.corners);
  const totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 6 || totalShots < 15 || corners < 6) return null;

  const statsScore = shotsOn * 2 + corners * 1.5 + totalShots * 0.3;
  const confidence = Math.min(99, 55 + statsScore * 0.2 + timePressureFactor(elapsed) * 5);

  return {
    rule: 'late-goal-storm',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'High-pressure 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots.',
    edge: null
  };
}

function checkBTTSPressure(match, stats) {
  if (!match || !stats) return null;
  if (!isGoalless(match.score)) return null;

  const elapsed = asNumber(match.minute);
  if (elapsed < 50 || elapsed > 75) return null;

  const homeStats = stats.homeTeam || {};
  const awayStats = stats.awayTeam || {};
  const homeShotsOn = asNumber(homeStats.shotsOnGoal);
  const awayShotsOn = asNumber(awayStats.shotsOnGoal);
  const homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  const awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);

  if (homeShotsOn < 2 || awayShotsOn < 2) return null;
  if (homeShotsTotal + awayShotsTotal < 12) return null;

  const confidence = Math.min(99, 48 + (homeShotsOn + awayShotsOn) * 4 + timePressureFactor(elapsed) * 3);

  return {
    rule: 'btts-pressure',
    market: 'BTTS - Yes',
    confidence: Math.round(confidence),
    reason: 'Both teams creating chances in a 0-0: ' + match.home + ' (' + homeShotsOn + ' on target), ' + match.away + ' (' + awayShotsOn + ' on target). Total ' + (homeShotsTotal + awayShotsTotal) + ' attempts at minute ' + elapsed + '.',
    edge: null
  };
}

function checkDominantPressure(match, stats) {
  if (!match || !stats) return null;
  if (!isGoalless(match.score)) return null;

  const elapsed = asNumber(match.minute);
  if (elapsed < 55 || elapsed > 82) return null;

  const homeStats = stats.homeTeam || {};
  const awayStats = stats.awayTeam || {};
  const homeShotsOn = asNumber(homeStats.shotsOnGoal);
  const homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  const homeCorners = asNumber(homeStats.corners);
  const awayShotsOn = asNumber(awayStats.shotsOnGoal);
  const awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);
  const awayCorners = asNumber(awayStats.corners);

  let dominantSide, dominantName, dominatedShots, dominantShots, dominatedCorners, dominantCorners;
  if (homeShotsTotal > awayShotsTotal && homeShotsTotal - awayShotsTotal >= 5) {
    dominantSide = 'home';
    dominantName = match.home;
    dominantShots = homeShotsTotal;
    dominatedShots = awayShotsTotal;
    dominantCorners = homeCorners;
    dominatedCorners = awayCorners;
  } else if (awayShotsTotal > homeShotsTotal && awayShotsTotal - homeShotsTotal >= 5) {
    dominantSide = 'away';
    dominantName = match.away;
    dominantShots = awayShotsTotal;
    dominatedShots = homeShotsTotal;
    dominantCorners = awayCorners;
    dominatedCorners = homeCorners;
  } else {
    return null;
  }

  if (dominantShots < 12) return null;

  const gap = dominantShots - dominatedShots;
  const confidence = Math.min(99, 50 + gap * 1.5 + dominantCorners * 1.5 + timePressureFactor(elapsed) * 4);

  return {
    rule: 'dominant-pressure',
    market: dominantName + ' to Score Next',
    confidence: Math.round(confidence),
    reason: dominantName + ' dominating with ' + dominantShots + ' shots (' + dominatedShots + ' for opponent) and ' + dominantCorners + ' corners at minute ' + elapsed + '. Match is goalless but pressure is building.',
    edge: null
  };
}

function checkHighVolumeNoGoal(match, stats) {
  if (!match || !stats) return null;
  if (!isGoalless(match.score)) return null;

  const elapsed = asNumber(match.minute);
  if (elapsed < 60 || elapsed > 80) return null;

  const total = stats.total || {};
  const shotsOn = asNumber(total.shotsOnGoal);
  const corners = asNumber(total.corners);
  const totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 8 || totalShots < 18 || corners < 7) return null;

  const confidence = Math.min(99, 52 + shotsOn * 2 + corners * 1.5 + timePressureFactor(elapsed) * 4);

  return {
    rule: 'high-volume-no-goal',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'Exceptional attacking pressure in a 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots. Goal is statistically overdue.',
    edge: null
  };
}

function buildGoldenTips(liveData) {
  if (!liveData || !liveData.matches) return [];

  const opportunities = [];

  liveData.matches.forEach(function (match) {
    const stats = match.apiStats || null;

    const checks = [
      checkLateGoalStorm(match, stats),
      checkBTTSPressure(match, stats),
      checkDominantPressure(match, stats),
      checkHighVolumeNoGoal(match, stats)
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
        rule: tip.rule,
        market: tip.market,
        confidence: tip.confidence,
        reason: tip.reason,
        edge: tip.edge
      });
    });
  });

  return opportunities.sort(function (a, b) {
    return b.confidence - a.confidence;
  });
}

module.exports = {
  buildGoldenTips,
  checkLateGoalStorm,
  checkBTTSPressure,
  checkDominantPressure,
  checkHighVolumeNoGoal
};
