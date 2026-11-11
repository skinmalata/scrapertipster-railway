'use strict';

const fs = require('fs');
const path = require('path');
const { getAvailableMatches } = require('./bookingCodes/resolver');
const { createCodeFromLegs } = require('./bookingCodes/converter');
const { fetchTodayStreaks } = require('./h2hWinningStreaks');
const { watDate } = require('./twoOddsOfDay');

function estimatedOdds(prob) {
  const p = Math.max(0.01, Math.min(0.95, prob));
  return Number((1 / p * 0.95).toFixed(2));
}

// Helper to get Lagos local time formatted as 'YYYY-MM-DD HH:MM'
function lagosNowString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  function get(type) {
    const f = parts.find(p => p.type === type);
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

function lagosDateTimeString(offsetHours) {
  const d = new Date(Date.now() + (offsetHours || 0) * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d);
  function get(type) {
    const f = parts.find(p => p.type === type);
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

function kickoffString(dateStr, timeStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = String(timeStr || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const bits = t.split(':');
  return `${dateStr} ${(bits[0].length === 1 ? '0' + bits[0] : bits[0])}:${bits[1]}`;
}

function hasKickedOff(dateStr, timeStr) {
  const k = kickoffString(dateStr, timeStr);
  if (!k) return false;
  return k < lagosNowString();
}

function withinNext24Hours(dateStr, timeStr) {
  const k = kickoffString(dateStr, timeStr);
  if (!k) return true; // if time unknown, accept if date is today
  return k >= lagosNowString() && k <= lagosDateTimeString(26);
}

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united|club)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function matchKey(home, away) {
  return `${normaliseTeam(home)}|${normaliseTeam(away)}`;
}

// Load Unbeaten streak cache
function loadUnbeatenCache(today) {
  const cachePath = path.join(process.cwd(), 'h2h-unbeaten-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (data && data.dates) {
        return data.dates[today] || [];
      }
    }
  } catch (e) {}
  return [];
}

// Load Predictions Cache
function loadPredictionsCache() {
  const cachePath = path.join(process.cwd(), 'predictions-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
    }
  } catch (e) {}
  return {};
}

/**
 * Builds candidate pool combining:
 * 1. Unbeaten streaks (Double chance 1X / X2)
 * 2. Head-to-Head (H2H records and streaks)
 * 3. Over 1.5 Goals
 * 4. 1X2 Match Winners (strong favorites & form)
 * 5. Over 2.5 Goals
 */
async function buildSportyCandidatePool(options = {}) {
  const today = options.date || watDate();
  const sportyMatches = await getAvailableMatches();

  if (!Array.isArray(sportyMatches) || !sportyMatches.length) {
    throw new Error('SportyBet schedule is currently unavailable. Please check back in a few moments.');
  }

  // Index SportyBet matches by normalized match key
  const sportyByKey = new Map();
  for (const m of sportyMatches) {
    if (!m || !m.home || !m.away) continue;
    if (hasKickedOff(m.date, m.time)) continue;
    if (!withinNext24Hours(m.date, m.time)) continue;

    const key = matchKey(m.home, m.away);
    sportyByKey.set(key, m);
  }

  const h2hStreaks = await fetchTodayStreaks().catch(() => []);
  const h2hMap = new Map();
  for (const h of h2hStreaks) {
    if (h && h.home && h.away) {
      h2hMap.set(matchKey(h.home, h.away), h);
    }
  }

  const unbeatenList = loadUnbeatenCache(today);
  const unbeatenMap = new Map();
  for (const u of unbeatenList) {
    if (u && u.match) {
      const parts = u.match.split(/\s+(?:-|vs)\s+/i);
      if (parts.length === 2) {
        unbeatenMap.set(matchKey(parts[0], parts[1]), u);
      }
    }
  }

  const predictions = loadPredictionsCache();
  const candidates = [];
  const seenPicks = new Set();

  function addCandidate(c) {
    if (!c || !c.match || !c.tip || !c.odds || c.odds < 1.10 || c.odds > 2.80) return;
    const uid = `${matchKey(c.home, c.away)}|${c.category}|${c.tip}`;
    if (seenPicks.has(uid)) return;
    seenPicks.add(uid);
    candidates.push(c);
  }

  // Iterate over SportyBet's active fixtures that are kicking off today/next 24h
  for (const [key, sm] of sportyByKey.entries()) {
    const matchName = `${sm.home} - ${sm.away}`;
    const h2h = h2hMap.get(key) || (sm.h2h ? { streaks: { all: [] } } : null);
    const unbeaten = unbeatenMap.get(key);

    // 1. Unbeaten Market (Double Chance 1X / X2)
    if (unbeaten && Array.isArray(unbeaten.streaks) && unbeaten.streaks.length) {
      const best = unbeaten.streaks[0];
      const count = Number(best.count) || 5;
      const isHome = best.team && normaliseTeam(best.team) === normaliseTeam(sm.home);
      const isAway = best.team && normaliseTeam(best.team) === normaliseTeam(sm.away);

      if (isHome || isAway) {
        const tip = isHome ? '1X' : 'X2';
        let dcOdds = 1.25;
        if (sm.odds) {
          const homeOdds = sm.odds['1'];
          const drawOdds = sm.odds['X'];
          const awayOdds = sm.odds['2'];
          if (isHome && homeOdds && drawOdds) {
            dcOdds = Number((1 / ((1 / homeOdds) + (1 / drawOdds))).toFixed(2));
          } else if (isAway && awayOdds && drawOdds) {
            dcOdds = Number((1 / ((1 / awayOdds) + (1 / drawOdds))).toFixed(2));
          }
        }
        if (dcOdds >= 1.10 && dcOdds <= 1.85) {
          addCandidate({
            match: matchName,
            home: sm.home,
            away: sm.away,
            league: sm.league,
            date: sm.date,
            time: sm.time,
            category: '1x2',
            tip: tip,
            odds: dcOdds,
            confidence: Math.min(92, 70 + count * 2),
            qualityScore: 92 + Math.min(10, count),
            reason: `${best.team} unbeaten in ${count} matches`,
            marketLabel: `Double Chance (${tip})`
          });
        }
      }
    }

    // 2. H2H Dominance Market (1X2)
    if (h2h && h2h.streaks) {
      const summary = sm.h2h || {};
      if (summary.homeWin >= 2 && sm.odds && sm.odds['1'] && sm.odds['1'] <= 2.20) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: '1',
          odds: sm.odds['1'],
          confidence: 76,
          qualityScore: 88,
          reason: `Strong H2H record (${sm.home} dominates head-to-head)`,
          marketLabel: 'Home Win (1)'
        });
      } else if (summary.awayWin >= 2 && sm.odds && sm.odds['2'] && sm.odds['2'] <= 2.20) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: '2',
          odds: sm.odds['2'],
          confidence: 74,
          qualityScore: 86,
          reason: `Strong H2H record (${sm.away} dominates head-to-head)`,
          marketLabel: 'Away Win (2)'
        });
      }
    }

    // 3. 1X2 Match Winner (Favorites with high probability)
    if (sm.odds) {
      const hOdds = Number(sm.odds['1']);
      const aOdds = Number(sm.odds['2']);
      if (hOdds && hOdds >= 1.25 && hOdds <= 1.75) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: '1',
          odds: hOdds,
          confidence: Math.round(100 / hOdds * 0.95),
          qualityScore: 82 + (hOdds <= 1.50 ? 5 : 0),
          reason: `Top home form & favorite (${hOdds.toFixed(2)} odds)`,
          marketLabel: 'Home Win (1)'
        });
      } else if (aOdds && aOdds >= 1.30 && aOdds <= 1.80) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: '2',
          odds: aOdds,
          confidence: Math.round(100 / aOdds * 0.95),
          qualityScore: 80 + (aOdds <= 1.50 ? 5 : 0),
          reason: `Strong away form & favorite (${aOdds.toFixed(2)} odds)`,
          marketLabel: 'Away Win (2)'
        });
      }
    }

    // 4. Over 1.5 Goals Market
    if (sm.goals && sm.goals.over15) {
      const o15Odds = Number(sm.goals.over15);
      if (o15Odds >= 1.15 && o15Odds <= 1.45) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: 'over15',
          tip: 'Over 1.5',
          odds: o15Odds,
          confidence: 82,
          qualityScore: 88,
          reason: 'Consistently high-scoring fixture (Over 1.5)',
          marketLabel: 'Over 1.5 Goals'
        });
      }
    }

    // 5. Over 2.5 Goals Market
    if (sm.goals && sm.goals.over25) {
      const o25Odds = Number(sm.goals.over25);
      if (o25Odds >= 1.45 && o25Odds <= 2.15) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league,
          date: sm.date,
          time: sm.time,
          category: 'over25',
          tip: 'Over 2.5',
          odds: o25Odds,
          confidence: 68,
          qualityScore: 78,
          reason: 'Attacking matchup with strong goal trends',
          marketLabel: 'Over 2.5 Goals'
        });
      }
    }
  }

  // Also pull in any verified high-probability Over 1.5 / Over 2.5 from predictions-cache
  // if they match SportyBet's available fixtures
  const predO15 = predictions.over15Matches || [];
  for (const p of predO15) {
    if (!p || !p.match) continue;
    const sides = p.match.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = sportyByKey.get(matchKey(sides[0], sides[1]));
    if (!sm) continue;

    const prob = Number(p.probability) || 75;
    if (prob < 72) continue;
    const odds = (sm.goals && sm.goals.over15) || estimatedOdds(prob / 100);
    if (odds >= 1.15 && odds <= 1.45) {
      addCandidate({
        match: `${sm.home} - ${sm.away}`,
        home: sm.home,
        away: sm.away,
        league: sm.league || p.league,
        date: sm.date,
        time: sm.time,
        category: 'over15',
        tip: 'Over 1.5',
        odds: Number(odds.toFixed(2)),
        confidence: prob,
        qualityScore: 85,
        reason: `${prob}% model probability for Over 1.5`,
        marketLabel: 'Over 1.5 Goals'
      });
    }
  }

  return candidates;
}

/**
 * Finds the optimal combination of 2 to 5 candidates closest to targetOdds (2.0 to 10.0).
 * Supports avoidMatches and stochastic sampling so multiple generations give varied tickets!
 */
function findOptimalCombination(candidates, targetOdds, options = {}) {
  const avoidList = (options.avoidMatches || []).map(normaliseTeam).filter(Boolean);
  const isAvoided = (c) => {
    if (!avoidList.length) return false;
    const nh = normaliseTeam(c.home);
    const na = normaliseTeam(c.away);
    const nm = normaliseTeam(c.match);
    return avoidList.some(a => a === nm || a === nh || a === na || nm.includes(a) || (a.length > 3 && nh.includes(a)));
  };

  // Score and jitter candidates so multiple generation clicks yield varied tickets
  const scored = candidates.map(c => {
    let score = c.qualityScore || 80;

    // If this match was in the previous generation, penalize it heavily so completely fresh matches are picked
    if (isAvoided(c)) {
      score -= 200;
    }

    // Dynamic jitter introduces variation on every click while keeping high-confidence games at the top
    const jitter = (Math.random() - 0.5) * 30;
    return {
      candidate: c,
      sortKey: score + jitter,
      fixtureKey: matchKey(c.home, c.away)
    };
  });

  scored.sort((a, b) => b.sortKey - a.sortKey);

  // Deduplicate by fixture so we only ever have ONE bet per match
  const uniquePerFixture = [];
  const fixtureMap = new Set();
  for (const item of scored) {
    if (!fixtureMap.has(item.fixtureKey)) {
      fixtureMap.add(item.fixtureKey);
      uniquePerFixture.push(item.candidate);
    }
  }

  const minAcceptable = Math.max(1.85, targetOdds * 0.85);
  const maxAcceptable = Math.min(10.50, targetOdds * 1.20);
  const minLegs = 2;
  const maxLegs = targetOdds <= 3.5 ? 4 : targetOdds <= 6 ? 6 : 8;

  let bestCombo = null;
  let minDiff = Infinity;
  let closestAnywhere = null;
  let minDiffAnywhere = Infinity;
  let iterations = 0;
  const MAX_ITER = 40000;

  function backtrack(startIdx, currentLegs, currentOdds) {
    if (iterations++ > MAX_ITER) return;

    if (currentLegs.length >= minLegs) {
      const diff = Math.abs(currentOdds - targetOdds);
      if (diff < minDiffAnywhere) {
        minDiffAnywhere = diff;
        closestAnywhere = currentLegs.slice();
      }
      if (currentOdds >= minAcceptable && currentOdds <= maxAcceptable) {
        if (diff < minDiff) {
          minDiff = diff;
          bestCombo = currentLegs.slice();
          if (diff < 0.05) return; // tight match
        }
      }
    }

    if (currentLegs.length >= maxLegs) return;

    for (let i = startIdx; i < uniquePerFixture.length; i++) {
      if (iterations > MAX_ITER) return;
      const pick = uniquePerFixture[i];
      const nextOdds = currentOdds * pick.odds;
      if (nextOdds > Math.max(maxAcceptable * 1.25, targetOdds * 1.35)) continue;

      currentLegs.push(pick);
      backtrack(i + 1, currentLegs, nextOdds);
      currentLegs.pop();
    }
  }

  backtrack(0, [], 1.0);

  // If backtracking didn't find within tight tolerance, greedy approach geared towards selection
  if (!bestCombo || bestCombo.length < 2) {
    let accum = 1.0;
    const greedy = [];
    for (const c of uniquePerFixture) {
      if (greedy.length >= maxLegs) break;
      if (accum * c.odds <= targetOdds * 1.18) {
        greedy.push(c);
        accum *= c.odds;
        if (accum >= targetOdds * 0.85) {
          bestCombo = greedy;
          break;
        }
      }
    }
    if (greedy.length >= 2 && (!bestCombo || bestCombo.length < 2)) {
      bestCombo = greedy;
    }
  }

  // Whatever is available: if still null, return the closest valid candidate set
  if ((!bestCombo || bestCombo.length < 2) && closestAnywhere && closestAnywhere.length >= 2) {
    bestCombo = closestAnywhere;
  }

  // Fallback: take top 2 to 3 available matches geared towards selection
  if (!bestCombo || bestCombo.length < 2) {
    if (uniquePerFixture.length >= 2) {
      bestCombo = uniquePerFixture.slice(0, Math.min(uniquePerFixture.length, targetOdds > 5 ? 4 : 2));
    }
  }

  return bestCombo;
}

/**
 * Main SportyBuilder entry point:
 * Builds the ticket, auto-generates the SportyBet booking code, and auto-heals if any leg is rejected.
 */
async function generateSportyTicket(options = {}) {
  let targetOdds = parseFloat(options.targetOdds);
  if (!Number.isFinite(targetOdds) || targetOdds < 2.0) targetOdds = 2.0;
  if (targetOdds > 10.0) targetOdds = 10.0;

  const avoidMatches = Array.isArray(options.avoidMatches) ? options.avoidMatches : [];
  const candidates = await buildSportyCandidatePool({ date: options.date });

  if (candidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  // Attempt up to 4 variations if SportyBet API rejects a specific leg
  let attempts = 0;
  let chosenLegs = null;
  let codeResult = null;
  let lastError = null;
  const currentAvoidList = [...avoidMatches];

  while (attempts < 5 && !codeResult) {
    attempts++;
    chosenLegs = findOptimalCombination(candidates, targetOdds, { avoidMatches: currentAvoidList });

    if (!chosenLegs || chosenLegs.length < 2) {
      // If avoidMatches was too strict, loosen it
      if (currentAvoidList.length > 0) {
        currentAvoidList.length = 0;
        chosenLegs = findOptimalCombination(candidates, targetOdds, { avoidMatches: [] });
      }
    }

    if (!chosenLegs || chosenLegs.length < 2) break;

    const requestLegs = chosenLegs.map(l => ({
      match: l.match,
      tip: l.tip,
      category: l.category,
      odds: l.odds
    }));

    try {
      codeResult = await createCodeFromLegs({
        bookmaker: 'sportybet',
        legs: requestLegs
      });
    } catch (err) {
      lastError = err;
      const rejectedMatch = /(?:for|match)\s+"([^"]+)"/i.exec(err.message);
      if (rejectedMatch && rejectedMatch[1]) {
        currentAvoidList.push(rejectedMatch[1]);
      } else if (chosenLegs.length > 0) {
        currentAvoidList.push(chosenLegs[0].match);
      }
    }
  }

  if (!codeResult || !codeResult.code) {
    throw new Error(lastError ? lastError.message : 'Could not generate a SportyBet booking code for the selected odds. Please try another odds range (e.g. 2 to 5 odds).');
  }

  const finalTotalOdds = Number(chosenLegs.reduce((acc, l) => acc * l.odds, 1.0).toFixed(2));

  return {
    success: true,
    code: codeResult.code,
    bookmaker: 'sportybet',
    bookmakerName: 'SportyBet',
    totalOdds: finalTotalOdds,
    targetOdds: targetOdds,
    legCount: chosenLegs.length,
    legs: chosenLegs.map(l => ({
      match: l.match,
      home: l.home,
      away: l.away,
      league: l.league || 'Football',
      date: l.date,
      time: l.time || 'Today',
      category: l.category,
      tip: l.tip,
      marketLabel: l.marketLabel,
      odds: l.odds,
      confidence: l.confidence,
      reason: l.reason
    })),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateSportyTicket,
  buildSportyCandidatePool,
  findOptimalCombination
};
