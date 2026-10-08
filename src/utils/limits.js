// Shared free-tier prediction limits. Single source of truth used both by the
// GitHub Pages build (which bakes the limits into public/data/predictions.json
// and the generated category pages) and by the API (/api/predictions).
const FREE_LIMITS = {
  btts: 8,
  winstreak: 2,
  losestreak: 2,
  drawstreak: 2,
  teamtoscore: 4,
  teamtoscore2plus: 4,
  htft: 4,
  gg2plus: 4,
  bttsno: 4,
  corners: 4,
  cards: 4
};

// 1X2, Over 1.5, Over 2.5 and Under 2.5 are intentionally excluded: they are
// the always-visible free markets.
const LIMITED_KEYS = [
  { dataKey: 'bttsMatches', limitKey: 'btts' },
  { dataKey: 'winstreakMatches', limitKey: 'winstreak' },
  { dataKey: 'losestreakMatches', limitKey: 'losestreak' },
  { dataKey: 'drawstreakMatches', limitKey: 'drawstreak' },
  { dataKey: 'teamToScoreMatches', limitKey: 'teamtoscore' },
  { dataKey: 'teamToScore2PlusMatches', limitKey: 'teamtoscore2plus' },
  { dataKey: 'htftMatches', limitKey: 'htft' },
  { dataKey: 'gg2PlusMatches', limitKey: 'gg2plus' },
  { dataKey: 'bttsNoMatches', limitKey: 'bttsno' },
  { dataKey: 'cornersMatches', limitKey: 'corners' },
  { dataKey: 'cardsMatches', limitKey: 'cards' }
];

function applyLimits(data, isVip) {
  if (isVip) {
    return { ...data, isVip: true, isFreeLimited: false, limit: null, remaining: null };
  }
  var limited = { ...data, isVip: false, isFreeLimited: true, limit: FREE_LIMITS };
  LIMITED_KEYS.forEach(function (entry) {
    limited[entry.dataKey] = (data[entry.dataKey] || []).slice(0, FREE_LIMITS[entry.limitKey]);
  });
  return limited;
}

module.exports = { FREE_LIMITS, LIMITED_KEYS, applyLimits };