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

// Calculate fair/vig-adjusted Double Chance odds from 1X2 prices
function calculateDoubleChanceOdds(odds, tip) {
  if (!odds) return null;
  const h = Number(odds['1']);
  const d = Number(odds['X']);
  const a = Number(odds['2']);

  if (tip === '1X') {
    if (h && d) {
      const prob = (1 / h) + (1 / d);
      return Number(Math.max(1.05, 1 / prob).toFixed(2));
    }
    if (h) {
      const prob = (1 / h) + (1 / 3.40);
      return Number(Math.max(1.05, 1 / prob).toFixed(2));
    }
  } else if (tip === 'X2') {
    if (a && d) {
      const prob = (1 / a) + (1 / d);
      return Number(Math.max(1.05, 1 / prob).toFixed(2));
    }
    if (a) {
      const prob = (1 / a) + (1 / 3.40);
      return Number(Math.max(1.05, 1 / prob).toFixed(2));
    }
  } else if (tip === '12') {
    if (h && a) {
      const prob = (1 / h) + (1 / a);
      return Number(Math.max(1.05, 1 / prob).toFixed(2));
    }
  }
  return null;
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

// Load Highest Scoring Half Cache
function loadHshCache(today) {
  const cachePath = path.join(process.cwd(), 'highest-scoring-half-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
      if (data && data.dates) {
        return data.dates[today] || [];
      }
    }
  } catch (e) {}
  return [];
}

// Load Corners Cache
function loadCornersCache() {
  const cachePath = path.join(process.cwd(), 'corners-cache.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
      return Array.isArray(data.matches) ? data.matches : [];
    }
  } catch (e) {}
  return [];
}

// Helper to locate a SportyBet match corresponding to home & away teams
function findSportyMatch(sportyByKey, home, away) {
  const directKey = matchKey(home, away);
  if (sportyByKey.has(directKey)) return sportyByKey.get(directKey);

  const nh = normaliseTeam(home);
  const na = normaliseTeam(away);
  for (const [key, sm] of sportyByKey.entries()) {
    const smh = normaliseTeam(sm.home);
    const sma = normaliseTeam(sm.away);
    const hMatch = smh === nh || (nh.length > 4 && smh.includes(nh)) || (smh.length > 4 && nh.includes(smh));
    const aMatch = sma === na || (na.length > 4 && sma.includes(na)) || (sma.length > 4 && na.includes(sma));
    if (hMatch && aMatch) {
      return sm;
    }
  }
  return null;
}

/**
 * Builds candidate pool combining:
 * 1. Unbeaten streaks & form (Double Chance 1X / X2)
 * 2. Convincing H2H records (Domination converted to safe Double Chance or heavy favorites)
 * 3. Website 1X2 predictions (Double Chance 1X / X2 to cover draw & ultra-heavy favorites)
 * 4. Website Over 1.5 Goals (Strictly from the website's Over 1.5 tab/page)
 * 5. Website Over 2.5 Goals (Strictly from the website's Over 2.5 tab/page with high confidence)
 * 6. Winning streaks / form (Double Chance 1X / X2)
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

  // Safe odds window: per-leg max 1.80, min 1.08.
  // DC selections (1X/X2) are safe even at 1.60-1.80 since they cover two outcomes.
  // Over 1.5 and Over 2.5 have tighter windows specified per-section below.
  function addCandidate(c) {
    if (!c || !c.match || !c.tip || !c.odds) return;
    if (c.odds < 1.08 || c.odds > 1.80) return;
    const uid = `${matchKey(c.home, c.away)}|${c.category}|${c.tip}`;
    if (seenPicks.has(uid)) return;
    seenPicks.add(uid);
    candidates.push(c);
  }

  // 1 & 2: Process SportyBet live fixtures for Unbeaten streaks & H2H records
  for (const [key, sm] of sportyByKey.entries()) {
    const matchName = `${sm.home} - ${sm.away}`;
    const unbeaten = unbeatenMap.get(key);

    // Build H2H signal from both live h2hMap and embedded sm.h2h summary
    const summary = sm.h2h || {};
    const hRecord = h2hMap.get(key);
    let h2hHomeWins = summary.homeWin || 0;
    let h2hAwayWins = summary.awayWin || 0;
    let h2hHomeUnbeaten = summary.homeUnbeaten || 0;
    let h2hAwayUnbeaten = summary.awayUnbeaten || 0;

    if (hRecord && hRecord.streaks && Array.isArray(hRecord.streaks.all)) {
      for (const rec of hRecord.streaks.all) {
        const side = rec.normal === normaliseTeam(sm.home) ? 'home'
          : rec.normal === normaliseTeam(sm.away) ? 'away' : null;
        if (!side) continue;
        if (rec.type === 'win')     { if (side === 'home') h2hHomeWins    = Math.max(h2hHomeWins,    rec.count || 0);
                                      else                  h2hAwayWins    = Math.max(h2hAwayWins,    rec.count || 0); }
        if (rec.type === 'unbeaten'){ if (side === 'home') h2hHomeUnbeaten= Math.max(h2hHomeUnbeaten,rec.count || 0);
                                      else                  h2hAwayUnbeaten= Math.max(h2hAwayUnbeaten,rec.count || 0); }
      }
    }

    // 1. Unbeaten streaks → Double Chance (covers draw, maximally safe)
    if (unbeaten && Array.isArray(unbeaten.streaks) && unbeaten.streaks.length) {
      const best = unbeaten.streaks[0];
      const count = Number(best.count) || 5;
      const isHome = best.team && normaliseTeam(best.team) === normaliseTeam(sm.home);
      const isAway = best.team && normaliseTeam(best.team) === normaliseTeam(sm.away);

      if (isHome || isAway) {
        const tip = isHome ? '1X' : 'X2';
        const dcOdds = calculateDoubleChanceOdds(sm.odds, tip);
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.75) {
          addCandidate({
            match: matchName,
            home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip,
            odds: dcOdds,
            confidence: Math.min(95, 80 + count * 2),
            qualityScore: 94 + Math.min(6, count),
            reason: `${best.team} unbeaten in ${count} matches — ${tip}`,
            marketLabel: `Double Chance (${tip})`
          });
        }
      }
    }

    // 2. Convincing H2H dominance → safe DC or straight win for ultra-heavy favorites
    if (h2hHomeWins >= 2 || h2hHomeUnbeaten >= 3) {
      const hOdds = sm.odds ? Number(sm.odds['1']) : null;
      if (hOdds && hOdds >= 1.10 && hOdds <= 1.35) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: '1x2', tip: '1', odds: hOdds,
          confidence: 86, qualityScore: 92,
          reason: `${sm.home} dominates H2H (${h2hHomeWins} wins / ${h2hHomeUnbeaten} unbeaten)`,
          marketLabel: 'Home Win (1)'
        });
      } else {
        const dcOdds = calculateDoubleChanceOdds(sm.odds, '1X');
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.75) {
          addCandidate({
            match: matchName, home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip: '1X', odds: dcOdds,
            confidence: 90, qualityScore: 95,
            reason: `${sm.home} H2H dominance — 1X cover`,
            marketLabel: 'Double Chance (1X)'
          });
        }
      }
    } else if (h2hAwayWins >= 2 || h2hAwayUnbeaten >= 3) {
      const dcOdds = calculateDoubleChanceOdds(sm.odds, 'X2');
      if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.75) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: '1x2', tip: 'X2', odds: dcOdds,
          confidence: 88, qualityScore: 93,
          reason: `${sm.away} dominates H2H (away) — X2 cover`,
          marketLabel: 'Double Chance (X2)'
        });
      }
    }

    // 3a. Live 1X2 odds from SportyBet schedule — heavy favorites → DC for safety
    if (sm.odds) {
      const hOdds = Number(sm.odds['1']);
      const aOdds = Number(sm.odds['2']);

      // Home strong favorites: DC 1X (covers win + draw)
      if (hOdds && hOdds >= 1.25 && hOdds <= 1.65) {
        const dcOdds = calculateDoubleChanceOdds(sm.odds, '1X');
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.70) {
          addCandidate({
            match: matchName, home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip: '1X', odds: dcOdds,
            confidence: Math.round(Math.min(93, (1 / hOdds) * 100 + 15)),
            qualityScore: 86 + (hOdds <= 1.40 ? 5 : 0),
            reason: `Strong home favorite (${hOdds.toFixed(2)}) — 1X cover`,
            marketLabel: 'Double Chance (1X)'
          });
        }
      }
      // Away favorites playing against weak homes: DC X2
      if (aOdds && aOdds >= 1.30 && aOdds <= 1.65) {
        const dcOdds = calculateDoubleChanceOdds(sm.odds, 'X2');
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.70) {
          addCandidate({
            match: matchName, home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip: 'X2', odds: dcOdds,
            confidence: Math.round(Math.min(91, (1 / aOdds) * 100 + 15)),
            qualityScore: 84 + (aOdds <= 1.40 ? 5 : 0),
            reason: `Strong away favorite (${aOdds.toFixed(2)}) — X2 cover`,
            marketLabel: 'Double Chance (X2)'
          });
        }
      }
    }
  }

  // 3. Website 1X2 Predictions with Double Chance
  const predMatches = predictions.matches || [];
  for (const p of predMatches) {
    if (!p || !p.match) continue;
    const sides = p.match.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
    if (!sm) continue;

    const prob = Number(p.probability) || 70;
    if (prob < 65) continue;

    const matchName = `${sm.home} - ${sm.away}`;
    if (p.tip === '1') {
      const hOdds = sm.odds ? Number(sm.odds['1']) : null;
      if (hOdds && hOdds >= 1.12 && hOdds <= 1.30 && prob >= 75) {
        // Heavy home favorite: safe straight win
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league || p.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: '1',
          odds: hOdds,
          confidence: prob,
          qualityScore: 90,
          reason: `Dominant home favorite (${prob}% site model win probability)`,
          marketLabel: 'Home Win (1)'
        });
      } else {
        // Use Double Chance 1X to cover draw and make it almost certain to win
        const dcOdds = calculateDoubleChanceOdds(sm.odds, '1X') || estimatedOdds(Math.min(0.92, (prob + 18) / 100));
        if (dcOdds >= 1.08 && dcOdds <= 1.75) {
          addCandidate({
            match: matchName,
            home: sm.home,
            away: sm.away,
            league: sm.league || p.league,
            date: sm.date,
            time: sm.time,
            category: '1x2',
            tip: '1X',
            odds: dcOdds,
            confidence: Math.min(94, prob + 16),
            qualityScore: 93,
            reason: `Site predicted home advantage (${prob}% win rate + Draw cover)`,
            marketLabel: 'Double Chance (1X)'
          });
        }
      }
    } else if (p.tip === '2') {
      // Away favorite: always use Double Chance X2 for safety
      const dcOdds = calculateDoubleChanceOdds(sm.odds, 'X2') || estimatedOdds(Math.min(0.90, (prob + 18) / 100));
      if (dcOdds >= 1.08 && dcOdds <= 1.75) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league || p.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: 'X2',
          odds: dcOdds,
          confidence: Math.min(92, prob + 16),
          qualityScore: 91,
          reason: `Site predicted away advantage (${prob}% win rate + Draw cover)`,
          marketLabel: 'Double Chance (X2)'
        });
      }
    } else if (p.tip === '1X' || p.tip === 'X2') {
      const dcOdds = calculateDoubleChanceOdds(sm.odds, p.tip) || estimatedOdds(Math.min(0.92, (prob + 10) / 100));
      if (dcOdds >= 1.08 && dcOdds <= 1.75) {
        addCandidate({
          match: matchName,
          home: sm.home,
          away: sm.away,
          league: sm.league || p.league,
          date: sm.date,
          time: sm.time,
          category: '1x2',
          tip: p.tip,
          odds: dcOdds,
          confidence: Math.min(94, prob + 12),
          qualityScore: 92,
          reason: `Site Double Chance prediction (${prob}% model probability)`,
          marketLabel: `Double Chance (${p.tip})`
        });
      }
    }
  }

  // 4. Over 1.5 Goals — STRICTLY FROM THE WEBSITE'S OVER 1.5 TAB/PAGE
  const predO15 = predictions.over15Matches || [];
  for (const p of predO15) {
    if (!p || !p.match) continue;
    const sides = p.match.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
    if (!sm) continue;

    const prob = Number(p.probability) || (p.probabilities && p.probabilities.over15) || 75;
    if (prob < 72) continue;
    const odds = Number((sm.goals && sm.goals.over15) || estimatedOdds(prob / 100));
    // Safe odds window for Over 1.5 (1.10 to 1.55)
    if (odds >= 1.10 && odds <= 1.55) {
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
        qualityScore: 92,
        reason: `Site Over 1.5 tab prediction (${prob}% model probability)`,
        marketLabel: 'Over 1.5 Goals'
      });
    }
  }

  // 5. Over 2.5 Goals — STRICTLY FROM THE WEBSITE'S OVER 2.5 TAB/PAGE
  const predO25 = predictions.over25Matches || [];
  for (const p of predO25) {
    if (!p || !p.match) continue;
    const sides = p.match.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
    if (!sm) continue;

    const prob = Number(p.probability) || (p.probabilities && p.probabilities.over25) || 75;
    // Over 2.5 is inherently more volatile, so only accept with very strong site backing (>= 74%)
    if (prob < 74) continue;
    const odds = Number((sm.goals && sm.goals.over25) || estimatedOdds(prob / 100));
    // Must be in safe range, not wild 1.80-2.20 coin tosses
    if (odds >= 1.25 && odds <= 1.75) {
      addCandidate({
        match: `${sm.home} - ${sm.away}`,
        home: sm.home,
        away: sm.away,
        league: sm.league || p.league,
        date: sm.date,
        time: sm.time,
        category: 'over25',
        tip: 'Over 2.5',
        odds: Number(odds.toFixed(2)),
        confidence: prob,
        qualityScore: 84, // Lower score than Double Chance and Over 1.5 to prioritize the safest bets
        reason: `Site Over 2.5 tab prediction (${prob}% model probability)`,
        marketLabel: 'Over 2.5 Goals'
      });
    }
  }

  // 6. Recent Form — Teams with outstanding winning streaks
  const winstreaks = predictions.winstreakMatches || [];
  for (const w of winstreaks) {
    if (!w || !w.streak || w.streak < 3) continue;
    const nextMatch = w.nextMatch || w.match;
    if (!nextMatch) continue;
    const sides = nextMatch.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
    if (!sm) continue;

    const isHome = normaliseTeam(w.match) === normaliseTeam(sm.home) || w.isHome === true;
    const tip = isHome ? '1X' : 'X2';
    const dcOdds = calculateDoubleChanceOdds(sm.odds, tip) || (isHome ? 1.18 : 1.22);
    if (dcOdds >= 1.08 && dcOdds <= 1.75) {
      addCandidate({
        match: `${sm.home} - ${sm.away}`,
        home: sm.home,
        away: sm.away,
        league: sm.league || w.league,
        date: sm.date,
        time: sm.time,
        category: '1x2',
        tip: tip,
        odds: dcOdds,
        confidence: Math.min(94, 82 + w.streak),
        qualityScore: 93 + Math.min(5, w.streak),
        reason: `Convincing form (${w.match} on a ${w.streak}-match winning streak)`,
        marketLabel: `Double Chance (${tip})`
      });
    }
  }

  // 7. Higher Odds Markets (Target Odds >= 5.0 only):
  // Integrates BTTS (Both Teams to Score) and Highest Scoring Half
  const targetOddsNum = parseFloat(options.targetOdds) || 2.0;
  if (targetOddsNum >= 5.0) {
    // 7a. BTTS (Both Teams To Score) from predictions tab
    const bttsList = predictions.bttsMatches || [];
    for (const b of bttsList) {
      if (!b || !b.match) continue;
      const prob = Number(b.probability) || (b.probabilities && b.probabilities.bttsYes) || 0;
      if (prob < 68) continue; // Only strong site predictions

      const sides = b.match.split(/\s+(?:-|vs)\s+/i);
      if (sides.length !== 2) continue;
      const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
      if (!sm) continue;

      const odds = estimatedOdds(prob / 100);
      if (odds >= 1.45 && odds <= 2.10) {
        addCandidate({
          match: `${sm.home} - ${sm.away}`,
          home: sm.home,
          away: sm.away,
          league: sm.league || b.league,
          date: sm.date,
          time: sm.time,
          category: 'btts',
          tip: 'BTTS YES',
          odds: odds,
          confidence: prob,
          qualityScore: 82, // Moderate quality score so it's included primarily for 5+ odds
          reason: `Site BTTS prediction (${prob}% model probability)`,
          marketLabel: 'Both Teams to Score (Yes)'
        });
      }
    }

    // 7b. Highest Scoring Half from Poisson race model
    const hshList = loadHshCache(today);
    for (const h of hshList) {
      if (!h || !h.home || !h.away || !h.hsh) continue;
      const prob = Math.round((h.hsh.prob || 0) * 100);
      if (prob < 60) continue; // Must beat 60% probability floor

      const sm = findSportyMatch(sportyByKey, h.home, h.away);
      if (!sm) continue;

      const tip = h.hsh.pick === '2H' ? '2nd Half' : '1st Half';
      const odds = estimatedOdds(h.hsh.prob);
      if (odds >= 1.50 && odds <= 2.30) {
        addCandidate({
          match: `${sm.home} - ${sm.away}`,
          home: sm.home,
          away: sm.away,
          league: sm.league || h.leagueName || h.league,
          date: sm.date,
          time: sm.time,
          category: 'highestscoringhalf',
          tip: tip,
          odds: odds,
          confidence: prob,
          qualityScore: 80,
          reason: h.hsh.reason || `Highest Scoring Half: ${tip} (${prob}% model probability)`,
          marketLabel: `Highest Scoring Half (${tip})`
        });
      }
    }
    // 7c. Draw No Bet (DNB) for higher odds
    // Convert strong home/away favorites to DNB which gives higher odds than Double Chance while still refunding on draw
    for (const [key, sm] of sportyByKey.entries()) {
      if (!sm || !sm.odds) continue;
      const hOdds = Number(sm.odds['1']);
      const aOdds = Number(sm.odds['2']);
      const dOdds = Number(sm.odds['X']);

      if (hOdds && dOdds && hOdds >= 1.40 && hOdds <= 1.95) {
        // Fair DNB odds: hOdds * (1 - 1/dOdds) roughly hOdds / (1 - hOdds/dOdds) or market price ~ 1.25 - 1.65
        const dnbHome = Number((hOdds * (1 - 1 / dOdds)).toFixed(2));
        if (dnbHome >= 1.20 && dnbHome <= 1.85) {
          addCandidate({
            match: `${sm.home} - ${sm.away}`,
            home: sm.home,
            away: sm.away,
            league: sm.league,
            date: sm.date,
            time: sm.time,
            category: 'dnb',
            tip: 'Home (1)',
            odds: dnbHome,
            confidence: Math.round(Math.min(90, (1 / hOdds) * 100 + 8)),
            qualityScore: 84,
            reason: `Home DNB (Draw Refund) — 1X2 favorite (${hOdds.toFixed(2)}) with push protection`,
            marketLabel: 'Draw No Bet (Home)'
          });
        }
      } else if (aOdds && dOdds && aOdds >= 1.45 && aOdds <= 2.05) {
        const dnbAway = Number((aOdds * (1 - 1 / dOdds)).toFixed(2));
        if (dnbAway >= 1.20 && dnbAway <= 1.90) {
          addCandidate({
            match: `${sm.home} - ${sm.away}`,
            home: sm.home,
            away: sm.away,
            league: sm.league,
            date: sm.date,
            time: sm.time,
            category: 'dnb',
            tip: 'Away (2)',
            odds: dnbAway,
            confidence: Math.round(Math.min(88, (1 / aOdds) * 100 + 8)),
            qualityScore: 82,
            reason: `Away DNB (Draw Refund) — 1X2 favorite (${aOdds.toFixed(2)}) with push protection`,
            marketLabel: 'Draw No Bet (Away)'
          });
        }
      }
    }

    // 7d. Corners from corners cache (Over corners)
    const cornersList = loadCornersCache();
    for (const c of cornersList) {
      if (!c || !c.match || !c.tip) continue;
      const prob = Number(c.probability) || 75;
      if (prob < 72) continue;

      const sides = c.match.split(/\s+(?:vs|-)\s+/i);
      if (sides.length !== 2) continue;
      const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
      if (!sm) continue;

      const odds = Number(c.odds) || estimatedOdds(prob / 100);
      if (odds >= 1.30 && odds <= 2.10) {
        addCandidate({
          match: `${sm.home} - ${sm.away}`,
          home: sm.home,
          away: sm.away,
          league: sm.league || c.league,
          date: sm.date,
          time: sm.time,
          category: 'corners',
          tip: c.tip,
          odds: odds,
          confidence: prob,
          qualityScore: 78,
          reason: `Corners statistical pick: ${c.tip} (${prob}% confidence)`,
          marketLabel: c.tip
        });
      }
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
    const jitter = (Math.random() - 0.5) * 8;
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

  const minAcceptable = Math.max(1.80, targetOdds * 0.82);
  const maxAcceptable = Math.min(60.00, targetOdds * 1.22);
  const minLegs = 2;
  const maxLegs = targetOdds <= 3.0 ? 5 : targetOdds <= 5.0 ? 7 : targetOdds <= 10.0 ? 10 : targetOdds <= 25.0 ? 15 : 20;

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
  if (targetOdds > 50.0) targetOdds = 50.0;

  const avoidMatches = Array.isArray(options.avoidMatches) ? options.avoidMatches : [];
  const allCandidates = await buildSportyCandidatePool({ date: options.date, targetOdds: targetOdds });

  if (allCandidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  // For shuffle: build a "fresh" pool that excludes previously selected matches.
  // Only fall back to full pool if the fresh pool is too small to build a ticket.
  let candidates = allCandidates;
  if (avoidMatches.length > 0) {
    const avoidSet = avoidMatches.map(normaliseTeam).filter(Boolean);
    const isAvoided = (c) => {
      const nm = normaliseTeam(c.match);
      const nh = normaliseTeam(c.home);
      const na = normaliseTeam(c.away);
      return avoidSet.some(a =>
        a === nh || a === na || nm.includes(a) ||
        (a.length > 4 && (nh.includes(a) || na.includes(a)))
      );
    };
    const fresh = allCandidates.filter(c => !isAvoided(c));
    // Use fresh pool if it has enough variety; otherwise use full pool
    candidates = fresh.length >= 4 ? fresh : allCandidates;
  }

  if (candidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  // Attempt up to 4 variations if SportyBet API rejects a specific leg
  let attempts = 0;
  let chosenLegs = null;
  let codeResult = null;
  let lastError = null;
  const rejectedLegs = [];

  while (attempts < 5 && !codeResult) {
    attempts++;
    // Pass empty avoidMatches — we already pre-filtered the pool above for shuffle.
    // rejectedLegs accumulates any legs SportyBet API rejects across retries.
    chosenLegs = findOptimalCombination(candidates, targetOdds, { avoidMatches: rejectedLegs });

    if (!chosenLegs || chosenLegs.length < 2) {
      // If the fresh pool failed, retry with full pool as last resort
      if (candidates !== allCandidates) {
        chosenLegs = findOptimalCombination(allCandidates, targetOdds, { avoidMatches: rejectedLegs });
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
        rejectedLegs.push(rejectedMatch[1]);
      } else if (chosenLegs.length > 0) {
        rejectedLegs.push(chosenLegs[0].match);
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
