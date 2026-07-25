const { asNumber } = require('./liveTips');

function getStats(match) {
  return match.fotmobStats || null;
}

function getH2H(match) {
  return match.h2h || null;
}

function getRecentForm(match) {
  return match.recentForm || null;
}

function getWinningStreak(match) {
  return match.winningStreak || null;
}

function getMatchStreak(match, streakType) {
  if (!match.matchStreaks) return null;
  return match.matchStreaks[streakType] || null;
}

function getCornerContext(match) {
  return match.cornerContext || null;
}

function hasRedCards(match, isHome) {
  if (!match.redCards) return false;
  return isHome ? match.redCards.home > 0 : match.redCards.away > 0;
}

function scoreTotal(score) {
  if (!score) return null;
  return asNumber(score.home) + asNumber(score.away);
}

function goalMarketForMinute(match, elapsed) {
  var goals = scoreTotal(match.score);
  if (goals === null) return null;
  // Before (and including) minute 30, use a two-goal line. From minute 60,
  // use a one-goal line. The 31-59 minute window emits no in-play tips.
  var line = goals + (elapsed <= 30 ? 1.5 : 0.5);
  return 'Over ' + line.toFixed(1) + ' Match Goals';
}

function isGoalless(score) {
  return scoreTotal(score) === 0;
}

function isBttsMarket(market) {
  return /\bbtts\b/i.test(String(market || ''));
}

function nextGoalTimeFactor(elapsed) {
  if (elapsed < 60) return 0;
  if (elapsed <= 70) return -0.5;
  if (elapsed <= 80) return -1;
  return -2;
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

function h2hDominanceBoost(h2h, isHomeTeam) {
  // Direct meetings are only a minor tie-breaker. Small or partial samples
  // are too noisy to influence a live recommendation.
  if (!h2h || h2h.total < 5 || h2h.recentCount < 5) return 0;
  var pct = isHomeTeam ? h2h.homeWinPct : h2h.awayWinPct;
  if (pct >= 55) return 3;
  if (pct >= 45) return 1;
  return 0;
}

function formBoost(recentForm, isHomeTeam) {
  if (!recentForm || !recentForm.home || !recentForm.away) return 0;
  var team = isHomeTeam ? recentForm.home : recentForm.away;
  var opponent = isHomeTeam ? recentForm.away : recentForm.home;
  if (team.matches < 5 || opponent.matches < 5) return 0;
  var pointsPerMatchGap = (team.points / team.matches) - (opponent.points / opponent.matches);
  if (pointsPerMatchGap >= 1) return 2;
  if (pointsPerMatchGap >= 0.5) return 1;
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

  var signalScore = Math.min(95, 52 + shotsOn * 2 + corners * 1.5 + totalShots * 0.3 + goalTimeFactor(elapsed) * 5);

  return {
    category: 'market',
    rule: 'late-goal-storm',
    market: 'Over 0.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'High-pressure 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots.'
  };
}

function checkBTTSPressure(match) {
  var stats = getStats(match);
  if (!stats) return null;
  if (!isGoalless(match.score)) return null;

  var elapsed = asNumber(match.minute);
  // BTTS is only offered in the first half, while there is still enough time
  // for the market to develop before the interval.
  if (elapsed < 10 || elapsed > 30) return null;

  var homeStats = stats.homeTeam || {};
  var awayStats = stats.awayTeam || {};
  var homeShotsOn = asNumber(homeStats.shotsOnGoal);
  var awayShotsOn = asNumber(awayStats.shotsOnGoal);
  var homeShotsTotal = homeShotsOn + asNumber(homeStats.shotsOffGoal);
  var awayShotsTotal = awayShotsOn + asNumber(awayStats.shotsOffGoal);

  if (homeShotsOn < 2 || awayShotsOn < 2) return null;
  if (homeShotsTotal + awayShotsTotal < 8) return null;

  var signalScore = Math.min(95, 45 + (homeShotsOn + awayShotsOn) * 3.5 + goalTimeFactor(elapsed) * 3);

  return {
    category: 'market',
    rule: 'btts-pressure',
    market: 'BTTS - Yes',
    signalScore: Math.round(signalScore),
    reason: 'Both teams creating chances in a 0-0: ' + match.home + ' (' + homeShotsOn + ' on target), ' + match.away + ' (' + awayShotsOn + ' on target). Total ' + (homeShotsTotal + awayShotsTotal) + ' attempts at minute ' + elapsed + '.'
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

  var signalScore = Math.min(95, 50 + shotsOn * 1.8 + corners * 1.2 + goalTimeFactor(elapsed) * 4);

  return {
    category: 'market',
    rule: 'high-volume-no-goal',
    market: 'Over 0.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'Exceptional attacking pressure in a 0-0 at minute ' + elapsed + ': ' + shotsOn + ' shots on target, ' + corners + ' corners, ' + totalShots + ' total shots. Goal is statistically overdue.'
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

  var signalScore = Math.min(95, 50 + shotsOn * 1.5 + totalGoals * 2 + goalTimeFactor(elapsed) * 2);

  return {
    category: 'market',
    rule: 'goal-fest',
    market: 'Over ' + totalGoals + '.5 Match Goals',
    signalScore: Math.round(signalScore),
    reason: 'Open match at ' + s.home + '-' + s.away + ' with ' + shotsOn + ' shots on target and ' + corners + ' corners at minute ' + elapsed + '. Both teams attacking.'
  };
}

function checkDominantPressure(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 60 || elapsed > 85) return null;

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
  var recentForm = getRecentForm(match);
  var recentFormBoost = formBoost(recentForm, isHomeDominant);

  var gap = dominantShots - dominatedShots;
  var signalScore = Math.min(95, 48 + gap * 1.5 + dominantCorners * 1.2 + nextGoalTimeFactor(elapsed) * 4 + h2hBoost * 2 + recentFormBoost * 2);

  return {
    category: 'market',
    rule: 'dominant-pressure',
    market: goalMarketForMinute(match, elapsed),
    signalScore: Math.round(signalScore),
    reason: dominantName + ' dominating with ' + dominantShots + ' shots (' + dominatedShots + ' for opponent), ' + dominantCorners + ' corners' + (domPossession ? ', ' + domPossession + '% possession' : '') + ' at minute ' + elapsed + '.' + (h2hBoost > 0 ? ' H2H history favors ' + dominantName + '.' : '') + (recentFormBoost > 0 ? ' Recent form favors ' + dominantName + '.' : '')
  };
}

function checkComebackMomentum(match) {
  var stats = getStats(match);
  if (!stats) return null;

  var s = homeAway(match.score);
  var elapsed = asNumber(match.minute);
  if (elapsed < 60 || elapsed > 80) return null;

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
  var recentForm = getRecentForm(match);
  var recentFormBoost = formBoost(recentForm, isTrailingHome);

  var gap = trailShotsTotal - leadShotsTotal;
  var signalScore = Math.min(95, 44 + gap * 2 + nextGoalTimeFactor(elapsed) * 3 + h2hBoost * 2 + recentFormBoost * 2);

  return {
    category: 'market',
    rule: 'comeback-momentum',
    market: goalMarketForMinute(match, elapsed),
    signalScore: Math.round(signalScore),
    reason: trailingName + ' trailing ' + s.home + '-' + s.away + ' but dominating with ' + trailShotsTotal + ' shots (' + leadShotsTotal + ' for ' + leaderName + ') at minute ' + elapsed + '. Comeback building.' + (h2hBoost > 0 ? ' H2H history favors ' + trailingName + '.' : '') + (recentFormBoost > 0 ? ' Recent form favors ' + trailingName + '.' : '')
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
  var recentForm = getRecentForm(match);
  var recentFormBoost = formBoost(recentForm, isHomeDominant);

  var signalScore = Math.min(95, 45 + domShots * 3 + (domPossession - 50) * 0.5 + nextGoalTimeFactor(elapsed) * 3 + h2hBoost * 2 + recentFormBoost * 2);

  return {
    category: 'market',
    rule: 'second-half-push',
    market: goalMarketForMinute(match, elapsed),
    signalScore: Math.round(signalScore),
    reason: dominatorName + ' controlling the second half with ' + domPossession + '% possession and ' + domShots + ' shots on target at minute ' + elapsed + '.' + (h2hBoost > 0 ? ' H2H history favors ' + dominatorName + '.' : '') + (recentFormBoost > 0 ? ' Recent form favors ' + dominatorName + '.' : '')
  };
}

function checkH2HDrawWinner(match) {
  var s = homeAway(match.score);
  if (s.home !== s.away) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 46 || elapsed > 85) return null;

  var h2h = getH2H(match);
  // Require a meaningful set of recent meetings. The H2H summary is aligned
  // to the current home/away teams by the live-data provider.
  if (!h2h || h2h.total < 4 || h2h.recentCount < 4) return null;

  var homeQualifies = h2h.homeWinPct > 75 && !hasRedCards(match, true);
  var awayQualifies = h2h.awayWinPct > 75 && !hasRedCards(match, false);
  if (!homeQualifies && !awayQualifies) return null;

  var isHome = homeQualifies && (!awayQualifies || h2h.homeWinPct >= h2h.awayWinPct);
  var teamName = isHome ? match.home : match.away;
  var winPct = isHome ? h2h.homeWinPct : h2h.awayWinPct;
  var signalScore = Math.min(95, 58 + (winPct - 75) * 1.5 + nextGoalTimeFactor(elapsed) * 3);

  return {
    category: 'team',
    rule: 'h2h-draw-winner',
    market: teamName + ' to Win',
    signalScore: Math.round(signalScore),
    reason: teamName + ' has won ' + winPct + '% of the last ' + h2h.recentCount + ' head-to-head meetings. The match is level ' + s.home + '-' + s.away + ' at minute ' + elapsed + ' and ' + teamName + ' has no red card.'
  };
}

function checkCornerPressure(match) {
  var stats = getStats(match);
  var context = getCornerContext(match);
  if (!stats || !context || !context.h2h || !context.recent) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed < 20 || elapsed > 75) return null;

  var total = stats.total || {};
  var currentCorners = asNumber(total.corners);
  var totalShots = asNumber(total.totalShots) || asNumber(total.shotsOnGoal) + asNumber(total.shotsOffGoal);
  var cornerRate = elapsed ? currentCorners / elapsed : 0;
  var h2hCorners = asNumber(context.h2h.average);
  var homeRecent = asNumber(context.recent.home && context.recent.home.average);
  var awayRecent = asNumber(context.recent.away && context.recent.away.average);

  // Require all three evidence groups: current pressure, direct-meeting
  // history, and each team's recent corner environment.
  if (context.h2h.sample < 2 || context.recent.home.sample < 2 || context.recent.away.sample < 2) return null;
  if (currentCorners < 3 || totalShots < 7 || cornerRate < 0.07) return null;
  if (h2hCorners < 8 || homeRecent < 8 || awayRecent < 8) return null;

  // Pace can spike early, so blend it with the historical corner environment
  // instead of projecting the raw rate through to full time.
  var historicalAverage = (h2hCorners + homeRecent + awayRecent) / 3;
  var paceAdditional = Math.round(cornerRate * (90 - elapsed) * 0.5);
  var historicalHeadroom = Math.max(2, Math.round(historicalAverage - currentCorners));
  var projectedAdditional = Math.max(2, Math.min(paceAdditional, historicalHeadroom));
  var line = currentCorners + projectedAdditional - 0.5;
  var signalScore = Math.min(95, 48 + currentCorners * 2 + totalShots * 0.7 + Math.min(8, cornerRate * 90) * 2 +
    (h2hCorners - 8) * 1.2 + (homeRecent + awayRecent - 16) * 0.8);

  return {
    category: 'corners',
    rule: 'corner-pressure-history',
    market: 'Over ' + line.toFixed(1) + ' Match Corners',
    signalScore: Math.round(signalScore),
    cornerCount: currentCorners,
    reason: currentCorners + ' corners by minute ' + elapsed + ' (' + (cornerRate * 90).toFixed(1) + ' per 90) with ' + totalShots +
      ' total shots. H2H averages ' + h2hCorners.toFixed(1) + ' corners; recent team averages are ' + homeRecent.toFixed(1) + ' and ' + awayRecent.toFixed(1) + '.'
  };
}

var MARKET_RULES = [checkLateGoalStorm, checkBTTSPressure, checkHighVolumeNoGoal, checkGoalFest];
var TEAM_RULES = [checkDominantPressure, checkComebackMomentum, checkSecondHalfPush, checkH2HDrawWinner];
var CORNER_RULES = [checkCornerPressure];

function checkHTOver15Streak(match) {
  var streak = getMatchStreak(match, 'ht-over-1.5');
  if (!streak) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed > 30) return null;

  var totalGoals = scoreTotal(match.score);
  if (totalGoals === null) return null;

  var signalScore = Math.min(95, 62 + (streak.count - 5) * 1.5);

  return {
    category: 'market',
    rule: 'ht-over-15-streak',
    market: goalMarketForMinute(match, elapsed),
    signalScore: Math.round(signalScore),
    reason: match.home + ' vs ' + match.away + ' has ' + streak.count + ' consecutive first halves with 2+ goals. Strong pattern for early goals.'
  };
}

function checkHTOver05Streak(match) {
  var streak = getMatchStreak(match, 'ht-over-0.5');
  if (!streak) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed > 30) return null;

  var totalGoals = scoreTotal(match.score);
  if (totalGoals === null) return null;

  var signalScore = Math.min(95, 58 + (streak.count - 5) * 1.5);

  return {
    category: 'market',
    rule: 'ht-over-05-streak',
    market: goalMarketForMinute(match, elapsed),
    signalScore: Math.round(signalScore),
    reason: match.home + ' vs ' + match.away + ' has ' + streak.count + ' consecutive first halves with a goal. Expecting an early breakthrough.'
  };
}

function checkHTDrawStreak(match) {
  var streak = getMatchStreak(match, 'ht-draw');
  if (!streak) return null;

  var elapsed = asNumber(match.minute);
  if (elapsed > 40) return null;

  var signalScore = Math.min(95, 56 + (streak.count - 5) * 1.5);

  return {
    category: 'market',
    rule: 'ht-draw-streak',
    market: 'HT Draw',
    signalScore: Math.round(signalScore),
    reason: match.home + ' vs ' + match.away + ' has ' + streak.count + ' consecutive first halves ending level. Tight opening expected.'
  };
}

var KICKOFF_RULES = [checkHTOver15Streak, checkHTOver05Streak, checkHTDrawStreak];

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

function hasAtLeastFifteenMinutesRemaining(match) {
  var elapsed = asNumber(match && match.minute);

  // A match at minute 30 or 75 has exactly 15 minutes remaining in that half.
  // Do not publish once it moves beyond either cutoff.
  return elapsed <= 30 || (elapsed >= 45 && elapsed <= 75);
}

function buildGoldenTips(liveData) {
  if (!liveData || !liveData.matches) return [];

  var opportunities = [];

  liveData.matches.forEach(function (match) {
    // Never publish a tip with fewer than 15 minutes remaining in either half.
    if (!hasAtLeastFifteenMinutesRemaining(match)) return;
    // Skip matches with 3+ goals already scored (over 2.5)
    var totalGoals = scoreTotal(match.score);
    if (totalGoals !== null && totalGoals >= 3) return;
    var marketTip = pickBest(MARKET_RULES, match);
    var teamTip = pickBest(TEAM_RULES, match);
    var cornerTip = pickBest(CORNER_RULES, match);

    var kickoffTip = pickBest(KICKOFF_RULES, match);

    [marketTip, teamTip, cornerTip, kickoffTip].forEach(function (tip) {
      if (!tip) return;
      // Keep this at the publishing boundary so a future BTTS rule cannot
      // accidentally introduce second-half BTTS recommendations.
      if (isBttsMarket(tip.market) && asNumber(match.minute) >= 45) return;
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
        cornerCount: tip.cornerCount,
        reason: tip.reason,
        edge: null
      });
    });
  });

  // Different rules can arrive at the same market for one fixture. Present
  // that recommendation once, using the strongest qualifying signal.
  var uniqueOpportunities = new Map();
  opportunities.forEach(function(opportunity) {
    var key = String(opportunity.fixtureId) + '|' + String(opportunity.market || '').toLowerCase();
    var existing = uniqueOpportunities.get(key);
    if (!existing || opportunity.signalScore > existing.signalScore) uniqueOpportunities.set(key, opportunity);
  });

  return Array.from(uniqueOpportunities.values()).sort(function (a, b) {
    return b.signalScore - a.signalScore;
  });
}

module.exports = {
  buildGoldenTips,
  hasAtLeastFifteenMinutesRemaining,
  isBttsMarket,
  checkLateGoalStorm,
  checkBTTSPressure,
  checkDominantPressure,
  checkHighVolumeNoGoal,
  checkComebackMomentum,
  checkGoalFest,
  checkSecondHalfPush,
  checkH2HDrawWinner,
  checkHTOver15Streak,
  checkHTOver05Streak,
  checkHTDrawStreak,
  checkCornerPressure
};
