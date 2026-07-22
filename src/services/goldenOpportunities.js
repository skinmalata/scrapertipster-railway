const { asNumber } = require('./liveTips');

function getStats(match) {
  return match.fotmobStats || match.apiStats || null;
}

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

function homeAway(score) {
  return { home: asNumber(score.home), away: asNumber(score.away) };
}

function checkLateGoalStorm(match) {
  var stats = getStats(match);
  if (!stats) return null;
  if (!isGoalless(match.score)) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 65 || elapsed > 88) return null;

  var total = stats.total || {};
  var shotsOn = asNumber(total.shotsOnGoal);
  var corners = asNumber(total.corners);
  var totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 4 || totalShots < 10 || corners < 4) return null;

  var statsScore = shotsOn * 2 + corners * 1.5 + totalShots * 0.3;
  var confidence = Math.min(95, 52 + statsScore * 0.15 + timePressureFactor(elapsed) * 5);

  return {
    rule: 'late-goal-storm',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'High-pressure 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots.'
  };
}

function checkBTTSPressure(match) {
  var stats = getStats(match);
  if (!stats) return null;
  if (!isGoalless(match.score)) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 45 || elapsed > 80) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);

  if (homeShotsOn < 2 || awayShotsOn < 2) return null;
  if (homeShotsTotal + awayShotsTotal < 8) return null;

  var confidence = Math.min(95, 45 + (homeShotsOn + awayShotsOn) * 3.5 + timePressureFactor(elapsed) * 3);

  return {
    rule: 'btts-pressure',
    market: 'BTTS - Yes',
    confidence: Math.round(confidence),
    reason: 'Both teams creating chances in a 0-0: ' + match.home + ' (' + homeShotsOn + ' on target), ' + match.away + ' (' + awayShotsOn + ' on target). Total ' + (homeShotsTotal + awayShotsTotal) + ' attempts at minute ' + elapsed + '.'
  };
}

function checkDominantPressure(match) {
  var stats = getStats(match);
  if (!stats) return null;
  if (!isGoalless(match.score)) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 50 || elapsed > 85) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  var homeCorners = asNumber(homeStats.corners);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);
  var awayCorners = asNumber(awayStats.corners);

  var dominantName, dominantShots, dominatedShots, dominantCorners;
  if (homeShotsTotal > awayShotsTotal && homeShotsTotal - awayShotsTotal >= 3) {
    dominantName = match.home;
    dominantShots = homeShotsTotal;
    dominatedShots = awayShotsTotal;
    dominantCorners = homeCorners;
  } else if (awayShotsTotal > homeShotsTotal && awayShotsTotal - homeShotsTotal >= 3) {
    dominantName = match.away;
    dominantShots = awayShotsTotal;
    dominatedShots = homeShotsTotal;
    dominantCorners = awayCorners;
  } else {
    return null;
  }

  if (dominantShots < 8) return null;

  var gap = dominantShots - dominatedShots;
  var confidence = Math.min(95, 48 + gap * 1.5 + dominantCorners * 1.2 + timePressureFactor(elapsed) * 4);

  return {
    rule: 'dominant-pressure',
    market: dominantName + ' to Score Next',
    confidence: Math.round(confidence),
    reason: dominantName + ' dominating with ' + dominantShots + ' shots (' + dominatedShots + ' for opponent) and ' + dominantCorners + ' corners at minute ' + elapsed + '.'
  };
}

function checkHighVolumeNoGoal(match) {
  var stats = getStats(match);
  if (!stats) return null;
  if (!isGoalless(match.score)) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 55 || elapsed > 85) return null;

  var total = stats.total || {};
  var shotsOn = asNumber(total.shotsOnGoal);
  var corners = asNumber(total.corners);
  var totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 6 || totalShots < 12 || corners < 5) return null;

  var confidence = Math.min(95, 50 + shotsOn * 1.8 + corners * 1.2 + timePressureFactor(elapsed) * 4);

  return {
    rule: 'high-volume-no-goal',
    market: 'Over 0.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'Exceptional attacking pressure in a 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots. Goal is statistically overdue.'
  };
}

function checkComebackMomentum(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var s = homeAway(match.score);
  var elapsed = asNumber(match.minute);
  if (elapsed < 50 || elapsed > 80) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  var homePossession = asNumber(homeStats.possession);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);
  var awayPossession = asNumber(awayStats.possession);

  var trailingTeam, trailingName, leaderName, scoreDeficit, trailShotsTotal, leadShotsTotal, trailPossession, leadPossession;
  if (s.home < s.away) {
    trailingTeam = 'home';
    trailingName = match.home;
    leaderName = match.away;
    scoreDeficit = s.away - s.home;
    trailShotsTotal = homeShotsTotal;
    leadShotsTotal = awayShotsTotal;
    trailPossession = homePossession;
    leadPossession = awayPossession;
  } else if (s.away < s.home) {
    trailingTeam = 'away';
    trailingName = match.away;
    leaderName = match.home;
    scoreDeficit = s.home - s.away;
    trailShotsTotal = awayShotsTotal;
    leadShotsTotal = homeShotsTotal;
    trailPossession = awayPossession;
    leadPossession = homePossession;
  } else {
    return null;
  }

  if (scoreDeficit > 2) return null;
  if (trailShotsTotal <= leadShotsTotal) return null;
  if (trailShotsTotal < 8) return null;

  var gap = trailShotsTotal - leadShotsTotal;
  var confidence = Math.min(95, 44 + gap * 2 + timePressureFactor(elapsed) * 3);

  return {
    rule: 'comeback-momentum',
    market: trailingName + ' to Score Next',
    confidence: Math.round(confidence),
    reason: trailingName + ' trailing ' + s.home + '-' + s.away + ' but dominating with ' + trailShotsTotal + ' shots (' + leadShotsTotal + ' for ' + leaderName + ') at minute ' + elapsed + '. Comeback building.'
  };
}

function checkGoalFest(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var s = homeAway(match.score);
  var totalGoals = s.home + s.away;
  if (totalGoals < 2) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 55 || elapsed > 85) return null;

  var total = stats.total || {};
  var shotsOn = asNumber(total.shotsOnGoal);
  var corners = asNumber(total.corners);
  var totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (shotsOn < 5 || totalShots < 12) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);

  if (homeShotsOn < 2 || awayShotsOn < 2) return null;

  var confidence = Math.min(95, 50 + shotsOn * 1.5 + totalGoals * 2 + timePressureFactor(elapsed) * 2);

  return {
    rule: 'goal-fest',
    market: 'Over ' + totalGoals + '.5 Match Goals',
    confidence: Math.round(confidence),
    reason: 'Open match at ' + s.home + '-' + s.away + ' with ' + shotsOn + ' shots on target and ' + corners + ' corners at minute ' + elapsed + '. Both teams attacking.'
  };
}

function checkSecondHalfPush(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var s = homeAway(match.score);
  var elapsed = asNumber(match.minute);
  if (elapsed < 60 || elapsed > 85) return null;

  var total = stats.total || {};
  var shotsOn = asNumber(total.shotsOnGoal);
  var totalShots = asNumber(total.totalShots) || shotsOn + asNumber(total.shotsOffGoal);

  if (totalShots < 10) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var homePossession = asNumber(homeStats.possession);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayPossession = asNumber(awayStats.possession);

  if (homeShotsOn + awayShotsOn < 4) return null;

  var dominatedTeam, dominatedName, dominatorName, domShots, domPossession;
  if (homeShotsOn > awayShotsOn && homePossession >= 52) {
    dominatorName = match.home;
    dominatedName = match.away;
    domShots = homeShotsOn;
    domPossession = homePossession;
  } else if (awayShotsOn > homeShotsOn && awayPossession >= 52) {
    dominatorName = match.away;
    dominatedName = match.home;
    domShots = awayShotsOn;
    domPossession = awayPossession;
  } else {
    return null;
  }

  var confidence = Math.min(95, 45 + domShots * 3 + (domPossession - 50) * 0.5 + timePressureFactor(elapsed) * 3);

  return {
    rule: 'second-half-push',
    market: dominatorName + ' to Score Next',
    confidence: Math.round(confidence),
    reason: dominatorName + ' controlling the second half with ' + domPossession + '% possession and ' + domShots + ' shots on target at minute ' + elapsed + '.'
  };
}

function buildGoldenTips(liveData) {
  if (!liveData || !liveData.matches) return [];

  var opportunities = [];

  liveData.matches.forEach(function (match) {
    var checks = [
      checkLateGoalStorm(match),
      checkBTTSPressure(match),
      checkDominantPressure(match),
      checkHighVolumeNoGoal(match),
      checkComebackMomentum(match),
      checkGoalFest(match),
      checkSecondHalfPush(match)
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
        edge: null
      });
    });
  });

  var byFixture = {};
  opportunities.forEach(function (tip) {
    var key = tip.fixtureId;
    if (!byFixture[key] || tip.confidence > byFixture[key].confidence) {
      byFixture[key] = tip;
    }
  });

  return Object.keys(byFixture).map(function (k) { return byFixture[k]; })
    .sort(function (a, b) { return b.confidence - a.confidence; });
}

module.exports = {
  buildGoldenTips,
  checkLateGoalStorm,
  checkBTTSPressure,
  checkDominantPressure,
  checkHighVolumeNoGoal,
  checkComebackMomentum,
  checkGoalFest,
  checkSecondHalfPush
};
