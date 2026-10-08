// Shared free-tier limits. Single source of truth used both by the
// GitHub Pages build (which bakes the limits into public/data/predictions.json
// and the generated category pages) and by the API (/api/predictions).
//
// Monetization model:
//  - FREE_MARKETS are fully visible to everyone (the home result/goals markets).
//  - GATED_MARKETS give free users a short teaser (FREE_VISIBLE picks) and the
//    pages render locked placeholder cards for the rest; Pro/VIP members get
//    every pick. Only the teaser rows are ever sent to a free client.
const FREE_VISIBLE = 3;

// Always-visible free markets: 1X2, Over 1.5, Over 2.5, Under 2.5, BTTS Yes
// and BTTS No. Nothing here is ever capped or sliced for free users.
const FREE_MARKETS = [
  'matches',
  'over15Matches',
  'over25Matches',
  'under25Matches',
  'bttsMatches',
  'bttsNoMatches'
];

// Gated markets: free users only ever receive the first FREE_VISIBLE rows.
const GATED_KEYS = [
  'winstreakMatches',
  'losestreakMatches',
  'drawstreakMatches',
  'teamToScoreMatches',
  'teamToScore2PlusMatches',
  'htftMatches',
  'gg2PlusMatches',
  'cornersMatches',
  'cardsMatches'
];

// Streak markets surface a fixture when either m.date (streak start) or
// m.nextMatchDate (the fixture being played) matches the selected day, so
// their per-date counts must consider both fields.
const STREAK_GATED_KEYS = ['winstreakMatches', 'losestreakMatches', 'drawstreakMatches'];

function perDateCounts(rows, streakLike) {
  var byDate = {};
  (rows || []).forEach(function (m) {
    if (!m) return;
    if (m.date) byDate[m.date] = (byDate[m.date] || 0) + 1;
    if (streakLike && m.nextMatchDate && m.nextMatchDate !== m.date) {
      byDate[m.nextMatchDate] = (byDate[m.nextMatchDate] || 0) + 1;
    }
  });
  return byDate;
}

function applyLimits(data, isVip) {
  if (isVip) {
    return { ...data, isVip: true, isFreeLimited: false, limit: null, remaining: null, marketCounts: null };
  }
  // Per-date totals for the gated markets, so pages can render locked
  // placeholder cards (with correct counts) without the picks ever reaching a
  // free client.
  var marketCounts = {};
  GATED_KEYS.forEach(function (key) {
    marketCounts[key] = perDateCounts(data[key], STREAK_GATED_KEYS.indexOf(key) !== -1);
  });

  var limited = {
    ...data,
    isVip: false,
    isFreeLimited: true,
    freeVisible: FREE_VISIBLE,
    marketCounts: marketCounts
  };
  GATED_KEYS.forEach(function (key) {
    limited[key] = (data[key] || []).slice(0, FREE_VISIBLE);
  });
  return limited;
}

module.exports = { FREE_MARKETS, FREE_VISIBLE, GATED_KEYS, applyLimits };