const { normalizeTeamName } = require('../data/leagues');

function getDateRange() {
  const dates = [];
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  today.setHours(0, 0, 0, 0);
  for (let i = -1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

function getLocalDateStr() {
  const now = new Date();
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
