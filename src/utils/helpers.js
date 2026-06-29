const { normalizeTeamName } = require('../data/leagues');

function getDateRange() {
  const dates = [];
  const now = new Date();
  const todayStr = getLocalDateStr();
  const todayDate = new Date(todayStr + 'T12:00:00');
  for (const offset of [0, -1, 1]) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() + offset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

function getLocalDateStr() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return formatter.format(new Date());
}

function findMatchingResult(matchKey, resultsMap) {
  const normalizedMatch = matchKey.toLowerCase();
  const parts = normalizedMatch.split(' - ');
  if (parts.length !== 2) return null;
  
  const [homeNorm, awayNorm] = parts.map(p => normalizeTeamName(p));
  
  let bestMatch = null;
  let bestScore = 0;
  
  const resultsEntries = resultsMap instanceof Map ? Array.from(resultsMap.entries()) : Object.entries(resultsMap);
  
  for (const [resultKey, score] of resultsEntries) {
    const resultNorm = resultKey.toLowerCase();
    const resultParts = resultNorm.split(' - ');
    if (resultParts.length !== 2) continue;
    
    const [resHome, resAway] = resultParts.map(p => normalizeTeamName(p));
    
    const homeMatch = resHome.includes(homeNorm) || homeNorm.includes(resHome);
    const awayMatch = resAway.includes(awayNorm) || awayNorm.includes(resAway);
    
    if (homeMatch && awayMatch) {
      const matchLength = resHome.length + resAway.length;
      if (matchLength > bestScore) {
        bestScore = matchLength;
        bestMatch = score;
      }
    }
  }
  return bestMatch;
}

module.exports = {
  getDateRange,
  getLocalDateStr,
  findMatchingResult
};
