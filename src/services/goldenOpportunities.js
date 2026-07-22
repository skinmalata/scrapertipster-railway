const { asNumber } = require('./liveTips');

function getStats(match) {
  return match.fotmobStats || null;
}

function getH2H(match) {
  return match.h2h || null;
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

function goalTimeFactor(elapsed) {
  if (elapsed < 60) return 1;
  if (elapsed <= 70) return 0.5;
  if (elapsed <= 80) return 0;
  return -1;
}

function homeAway(score) {
  return { home: asNumber(score.home), away: asNumber(score.away) };
}

function h2hDrawBoost(h2h) {
  if (!h2h || !h2h.total) return 0;
  if (h2h.drawPct >= 35) return 2;
  if (h2h.drawPct >= 25) return 1;
  return 0;
}

function h2hDominanceBoost(h2h, isHomeTeam) {
  if (!h2h || !h2h.total) return 0;
  var pct = isHomeTeam ? h2h.homeWinPct : h2h.awayWinPct;
  if (pct >= 55) return 3;
  if (pct >= 45) return 1;
  return 0;
}

function h2hTightMatchBoost(h2h) {
  if (!h2h || !h2h.total) return 0;
  var maxPct = Math.max(h2h.homeWinPct, h2h.awayWinPct);
  if (maxPct <= 40) return 2;
  if (maxPct <= 45) return 1;
  return 0;
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

  var h2h = getH2H(match);
  var h2hBoost = h2hTightMatchBoost(h2h) + h2hDrawBoost(h2h);

  var signalScore = Math.min(95, 52 + shotsOn * 2 + corners * 1.5 + totalShots * 0.3 + goalTimeFactor(elapsed) * 5 + h2hBoost * 2);

  return {
    category: 'market',
    rule: 'late-goal-storm',
    market: 'Over 0.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'High-pressure 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots.' + (h2hBoost > 0 ? ' H2H history supports a tight, goal-rich fixture.' : '')
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

  var h2h = getH2H(match);
  var h2hBoost = h2hTightMatchBoost(h2h);

  var signalScore = Math.min(95, 45 + (homeShotsOn + awayShotsOn) * 3.5 + goalTimeFactor(elapsed) * 3 + h2hBoost * 2);

  return {
    category: 'market',
    rule: 'btts-pressure',
    market: 'BTTS - Yes',
    signalScore: Math.round(signalScore),
    reason: 'Both teams creating chances in a 0-0: ' + match.home + ' (' + homeShotsOn + ' on target), ' + match.away + ' (' + awayShotsOn + ' on target). Total ' + (homeShotsTotal + awayShotsTotal) + ' attempts at minute ' + elapsed + '.' + (h2hBoost > 0 ? ' H2H record suggests both teams tend to score.' : '')
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

  var h2h = getH2H(match);
  var h2hBoost = h2hTightMatchBoost(h2h) + h2hDrawBoost(h2h);

  var signalScore = Math.min(95, 50 + shotsOn * 1.8 + corners * 1.2 + goalTimeFactor(elapsed) * 4 + h2hBoost * 2);

  return {
    category: 'market',
    rule: 'high-volume-no-goal',
    market: 'Over 0.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'Exceptional attacking pressure in a 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots. Goal is statistically overdue.' + (h2hBoost > 0 ? ' H2H history supports goal action.' : '')
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

  var h2h = getH2H(match);
  var h2hBoost = h2hTightMatchBoost(h2h);

  var signalScore = Math.min(95, 50 + shotsOn * 1.5 + totalGoals * 2 + goalTimeFactor(elapsed) * 2 + h2hBoost * 2);

  return {
    category: 'market',
    rule: 'goal-fest',
    market: 'Over ' + totalGoals + '.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'Open match at ' + s.home + '-' + s.away + ' with ' + shotsOn + ' shots on target and ' + corners + ' corners at minute ' + elapsed + '. Both teams attacking.' + (h2hBoost > 0 ? ' H2H history suggests open, competitive fixtures.' : '')
  };
}

function checkDominantPressure(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 50 || elapsed > 85) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  var homeCorners = asNumber(homeStats.corners);
  var homePossession = asNumber(homeStats.possession);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);
  var awayCorners = asNumber(awayStats.corners);
  var awayPossession = asNumber(awayStats.possession);

  var dominantName, dominatedName, dominantShots, dominatedShots, dominantCorners, domPossession, isHomeDominant;
  if (homeShotsTotal > awayShotsTotal && homeShotsTotal - awayShotsTotal >= 3) {
    dominantName = match.home;
    dominatedName = match.away;
    dominantShots = homeShotsTotal;
    dominatedShots = awayShotsTotal;
    dominantCorners = homeCorners;
    domPossession = homePossession;
    isHomeDominant = true;
  } else if (awayShotsTotal > homeShotsTotal && awayShotsTotal - homeShotsTotal >= 3) {
    dominantName = match.away;
    dominatedName = match.home;
    dominantShots = awayShotsTotal;
    dominatedShots = homeShotsTotal;
    dominantCorners = awayCorners;
    domPossession = awayPossession;
    isHomeDominant = false;
  } else {
    return null;
  }

  if (dominantShots < 8) return null;

  var h2h = getH2H(match);
  var h2hBoost = h2hDominanceBoost(h2h, isHomeDominant);

  var gap = dominantShots - dominatedShots;
  var signalScore = Math.min(95, 48 + gap * 1.5 + dominantCorners * 1.2 + timePressureFactor(elapsed) * 4 + h2hBoost * 2);

  return {
    category: 'team',
    rule: 'dominant-pressure',
    market: dominantName + ' to Score Next',
    signalScore: Math.round(signalScore),
    reason: dominantName + ' dominating with ' + dominantShots + ' shots (' + dominatedShots + ' for opponent), ' + dominantCorners + ' corners' + (domPossession ? ', ' + domPossession + '% possession' : '') + ' at minute ' + elapsed + '.' + (h2hBoost > 0 ? ' H2H history favors ' + dominantName + '.' : '')
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
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);

  var trailingName, leaderName, scoreDeficit, trailShotsTotal, leadShotsTotal, isTrailingHome;
  if (s.home < s.away) {
    trailingName = match.home;
    leaderName = match.away;
    scoreDeficit = s.away - s.home;
    trailShotsTotal = homeShotsTotal;
    leadShotsTotal = awayShotsTotal;
    isTrailingHome = true;
  } else if (s.away < s.home) {
    trailingName = match.away;
    leaderName = match.home;
    scoreDeficit = s.home - s.away;
    trailShotsTotal = awayShotsTotal;
    leadShotsTotal = homeShotsTotal;
    isTrailingHome = false;
  } else {
    return null;
  }

  if (scoreDeficit > 2) return null;
  if (trailShotsTotal <= leadShotsTotal) return null;
  if (trailShotsTotal < 8) return null;

  var h2h = getH2H(match);
  var h2hBoost = h2hDominanceBoost(h2h, isTrailingHome);

  var gap = trailShotsTotal - leadShotsTotal;
  var signalScore = Math.min(95, 44 + gap * 2 + timePressureFactor(elapsed) * 3 + h2hBoost * 2);

  return {
    category: 'team',
    rule: 'comeback-momentum',
    market: trailingName + ' to Score Next',
    signalScore: Math.round(signalScore),
    reason: trailingName + ' trailing ' + s.home + '-' + s.away + ' but dominating with ' + trailShotsTotal + ' shots (' + leadShotsTotal + ' for ' + leaderName + ') at minute ' + elapsed + '. Comeback building.' + (h2hBoost > 0 ? ' H2H history favors ' + trailingName + '.' : '')
  };
}

function checkSecondHalfPush(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 60 || elapsed > 85) return null;

  var total = stats.total || {};
  var totalShots = asNumber(total.totalShots) || asNumber(total.shotsOnGoal) + asNumber(total.shotsOffGoal);

  if (totalShots < 10) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var homePossession = asNumber(homeStats.possession);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var awayPossession = asNumber(awayStats.possession);

  if (homeShotsOn + awayShotsOn < 4) return null;

  var dominatorName, domShots, domPossession, isHomeDominant;
  if (homeShotsOn > awayShotsOn && homePossession >= 52) {
    dominatorName = match.home;
    domShots = homeShotsOn;
    domPossession = homePossession;
    isHomeDominant = true;
  } else if (awayShotsOn > homeShotsOn && awayPossession >= 52) {
    dominatorName = match.away;
    domShots = awayShotsOn;
    domPossession = awayPossession;
    isHomeDominant = false;
  } else {
    return null;
  }

  var h2h = getH2H(match);
  var h2hBoost = h2hDominanceBoost(h2h, isHomeDominant);

  var signalScore = Math.min(95, 45 + domShots * 3 + (domPossession - 50) * 0.5 + timePressureFactor(elapsed) * 3 + h2hBoost * 2);

  return {
    category: 'team',
    rule: 'second-half-push',
    market: dominatorName + ' to Score Next',
    signalScore: Math.round(signalScore),
    reason: dominatorName + ' controlling the second half with ' + domPossession + '% possession and ' + domShots + ' shots on target at minute ' + elapsed + '.' + (h2hBoost > 0 ? ' H2H history favors ' + dominatorName + '.' : '')
  };
}

var MARKET_RULES = [checkLateGoalStorm, checkBTTSPressure, checkHighVolumeNoGoal, checkGoalFest];
var TEAM_RULES = [checkDominantPressure, checkComebackMomentum, checkSecondHalfPush];

function pickBest(rules, match) {
  var best = null;
  for (var i = 0; i < rules.length; i++) {
    var tip = rules[i](match);
    if (tip && (!best || tip.signalScore > best.signalScore)) {
      best = tip;
    }
  }
  return best;
}

function buildGoldenTips(liveData) {
  if (!liveData || !liveData.matches) return [];

  var opportunities = [];

  liveData.matches.forEach(function (match) {
    var marketTip = pickBest(MARKET_RULES, match);
    var teamTip = pickBest(TEAM_RULES, match);

    [marketTip, teamTip].forEach(function (tip) {
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
        category: tip.category,
        rule: tip.rule,
        market: tip.market,
        signalScore: tip.signalScore,
        reason: tip.reason,
        edge: null
      });
    });
  });

  return opportunities.sort(function (a, b) {
    return b.signalScore - a.signalScore;
  });
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
