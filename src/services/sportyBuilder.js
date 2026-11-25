'use strict';

const fs = require('fs');
const path = require('path');
const { getAvailableMatches } = require('./bookingCodes/resolver');
const { createCodeFromLegs } = require('./bookingCodes/converter');
const { fetchTodayStreaks } = require('./h2hWinningStreaks');
const { watDate } = require('./twoOddsOfDay');

const SPORTYBUILDER_MARKETS = Object.freeze([
  '1x2', 'over15', 'over25', 'btts', 'highestscoringhalf', 'dnb', 'corners', 'basketball-total'
]);
const FOOTBALL_ONLY_MARKETS = Object.freeze(['over15', 'over25', 'btts', 'highestscoringhalf', 'dnb', 'corners']);
const HIGHER_ODDS_MARKETS = Object.freeze(['btts', 'highestscoringhalf', 'dnb', 'corners']);
const MIN_LEG_ODDS = 1.06;
const MIN_FILTER_ODDS = 1.06;
const MAX_FILTER_ODDS = 20;
const MAX_FILTER_ITEMS = 8;
const MAX_LEAGUE_LENGTH = 60;

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

function withinTargetWindow(dateStr, timeStr) {
  const k = kickoffString(dateStr, timeStr);
  if (!k) return true; // if time unknown, accept if date is today
  return k >= lagosNowString() && k <= lagosDateTimeString(36);
}

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united|club)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normaliseSportFilter(value) {
  const sport = String(value || '').toLowerCase().trim();
  return sport === 'football' || sport === 'basketball' ? sport : 'all';
}

const MARKET_ALIASES = {
  '1x2': '1x2', 'match result': '1x2', 'match winner': '1x2', 'double chance': '1x2',
  dc: '1x2', '1x': '1x2', x2: '1x2', moneyline: '1x2',
  over15: 'over15', 'over 1 5': 'over15', o15: 'over15',
  over25: 'over25', 'over 2 5': 'over25', o25: 'over25',
  btts: 'btts', 'btts yes': 'btts', 'both teams to score': 'btts', gg: 'btts',
  highestscoringhalf: 'highestscoringhalf', hsh: 'highestscoringhalf', 'highest scoring half': 'highestscoringhalf',
  dnb: 'dnb', 'draw no bet': 'dnb',
  corners: 'corners', corner: 'corners', 'over 9 5 corners': 'corners',
  'basketball-total': 'basketball-total', 'basketball total': 'basketball-total', 'points total': 'basketball-total'
};

function normaliseFilterText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normaliseFilterList(value, maxItems) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const seen = new Set();
  const result = [];
  for (const entry of raw) {
    if (result.length >= maxItems) break;
    const normalised = normaliseFilterText(entry);
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    result.push(normalised);
  }
  return result;
}

function optionalOdds(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validateSportyFilters(input) {
  const options = input || {};
  const errors = [];
  const sport = normaliseSportFilter(options.sport);

  const markets = [];
  for (const entry of normaliseFilterList(options.markets, MAX_FILTER_ITEMS)) {
    const key = entry.replace(/\s+/g, ' ');
    const canonical = MARKET_ALIASES[key] || (SPORTYBUILDER_MARKETS.includes(entry.replace(/\s+/g, '-')) ? entry.replace(/\s+/g, '-') : null);
    if (!canonical) errors.push(`Unsupported market: ${key}.`);
    else if (!markets.includes(canonical)) markets.push(canonical);
  }

  const leagues = normaliseFilterList(options.leagues, MAX_FILTER_ITEMS);
  for (const league of leagues) {
    if (league.length > MAX_LEAGUE_LENGTH) errors.push('League names must be 60 characters or fewer.');
  }

  const minOddsPerLeg = optionalOdds(options.minOddsPerLeg);
  const maxOddsPerLeg = optionalOdds(options.maxOddsPerLeg);
  if (minOddsPerLeg !== null && (minOddsPerLeg < MIN_FILTER_ODDS || minOddsPerLeg > MAX_FILTER_ODDS)) {
    errors.push(`Minimum odds per leg must be between ${MIN_FILTER_ODDS.toFixed(2)} and ${MAX_FILTER_ODDS}.`);
  }
  if (maxOddsPerLeg !== null && (maxOddsPerLeg < MIN_FILTER_ODDS || maxOddsPerLeg > MAX_FILTER_ODDS)) {
    errors.push(`Maximum odds per leg must be between ${MIN_FILTER_ODDS.toFixed(2)} and ${MAX_FILTER_ODDS}.`);
  }
  if (minOddsPerLeg !== null && Number.isFinite(minOddsPerLeg) &&
      maxOddsPerLeg !== null && Number.isFinite(maxOddsPerLeg) && maxOddsPerLeg <= minOddsPerLeg) {
    errors.push('Maximum odds per leg must be greater than minimum odds per leg.');
  }

  let numLegs = null;
  if (options.numLegs !== undefined && options.numLegs !== null && options.numLegs !== '') {
    numLegs = Number(options.numLegs);
    if (!Number.isInteger(numLegs) || numLegs < 2 || numLegs > 20) errors.push('Number of matches must be a whole number between 2 and 20.');
  }

  const straightWinsOnly = options.straightWinsOnly === true;

  if (sport === 'football' && markets.includes('basketball-total')) {
    errors.push('Basketball points totals need basketball or all sports.');
  }
  if (sport === 'basketball') {
    const footballOnly = markets.filter(m => FOOTBALL_ONLY_MARKETS.includes(m));
    if (footballOnly.length) errors.push('Football markets need football or all sports.');
  }
  if (straightWinsOnly && markets.length && markets.every(m => m === 'basketball-total')) {
    errors.push('Straight wins are not available on basketball points totals.');
  }
  if (numLegs !== null && Number.isInteger(numLegs) && minOddsPerLeg !== null &&
      Number.isFinite(minOddsPerLeg) && Math.pow(minOddsPerLeg, numLegs) > 50) {
    errors.push(`${numLegs} legs at ${minOddsPerLeg.toFixed(2)} odds each would exceed the 50x ticket limit. Lower the leg count or the minimum odds.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    filters: { sport, markets, leagues, minOddsPerLeg, maxOddsPerLeg, numLegs, straightWinsOnly }
  };
}

function matchesSportyFilters(candidate, filters) {
  if (!filters) return true;
  if (filters.markets && filters.markets.length && !filters.markets.includes(candidate.category)) return false;
  if (filters.leagues && filters.leagues.length) {
    const league = normaliseFilterText(candidate.league);
    if (!filters.leagues.some(l => league === l || league.indexOf(l) !== -1)) return false;
  }
  const odds = Number(candidate.odds);
  if (filters.minOddsPerLeg !== null && Number.isFinite(filters.minOddsPerLeg) && odds < filters.minOddsPerLeg) return false;
  if (filters.maxOddsPerLeg !== null && Number.isFinite(filters.maxOddsPerLeg) && odds > filters.maxOddsPerLeg) return false;
  if (filters.straightWinsOnly) {
    if (candidate.category === 'basketball-total') return false;
    if (candidate.category === '1x2' && candidate.tip !== '1' && candidate.tip !== '2') return false;
  }
  return true;
}

const TEAM_ALIASES = {
  taiwan: 'chinese taipei',
  'south korea': 'korea republic',
  iran: 'ir iran',
  'north korea': 'korea dpr',
  usa: 'united states',
  czechia: 'czech republic',
  'ivory coast': 'cote divoire',
  'dr congo': 'congo dr',
  'democratic republic of congo': 'congo dr',
  'democratic republic of the congo': 'congo dr',
  'cape verde': 'cabo verde',
  'bosnia and herzegovina': 'bosnia herzegovina',
  macedonia: 'north macedonia',
  kyrgyzstan: 'kyrgyz republic',
  syria: 'syrian arab republic',
  burma: 'myanmar',
  'comoro islands': 'comoros',
  'republic of the gambia': 'gambia'
};

function tokenSetMatch(nameA, nameB) {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;
  const tA = nameA.split(' ').filter(Boolean).sort().join(' ');
  const tB = nameB.split(' ').filter(Boolean).sort().join(' ');
  return tA === tB;
}

function isInvalidFixture(home, away) {
  const h = String(home || '').toLowerCase().trim();
  const a = String(away || '').toLowerCase().trim();
  if (!h || !a || h === a) return true;
  if (h === 'home' || a === 'away' || h === 'away' || a === 'home') return true;
  if (/special|corner|cards|penalt|substitut|offside/i.test(h) || /special|corner|cards|penalt|substitut|offside/i.test(a)) return true;
  return false;
}

function aliasTeam(name) {
  const base = normaliseTeam(name);
  return TEAM_ALIASES[base] || base;
}

function matchKey(home, away) {
  return `${aliasTeam(home)}|${aliasTeam(away)}`;
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

  const nh = aliasTeam(home);
  const na = aliasTeam(away);
  for (const [key, sm] of sportyByKey.entries()) {
    const smh = aliasTeam(sm.home);
    const sma = aliasTeam(sm.away);
    if ((smh === nh || tokenSetMatch(smh, nh)) && (sma === na || tokenSetMatch(sma, na))) {
      return sm;
    }
  }
  for (const [key, sm] of sportyByKey.entries()) {
    const smh = aliasTeam(sm.home);
    const sma = aliasTeam(sm.away);
    const hMatch = smh === nh || tokenSetMatch(smh, nh) || (nh.length > 4 && smh.includes(nh)) || (smh.length > 4 && nh.includes(smh));
    const aMatch = sma === na || tokenSetMatch(sma, na) || (na.length > 4 && sma.includes(na)) || (sma.length > 4 && na.includes(sma));
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
 * 7. Basketball moneyline (1X2) and points Over/Under — only short-price,
 *    high-implied-probability selections are admitted to the pool.
 */
async function buildSportyCandidatePool(options = {}) {
  const today = options.date || watDate();
  const filters = validateSportyFilters(options).filters;
  const sportFilter = filters.sport;
  const wantFootball = sportFilter === 'all' || sportFilter === 'football';
  const wantBasketball = sportFilter === 'all' || sportFilter === 'basketball';
  const matchRequests = [];
  if (wantFootball) matchRequests.push(getAvailableMatches('football'));
  if (wantBasketball) matchRequests.push(getAvailableMatches('basketball'));
  const matchLists = await Promise.all(matchRequests);
  const footballMatches = wantFootball && Array.isArray(matchLists[0]) ? matchLists[0] : [];
  const basketballMatches = wantBasketball && Array.isArray(matchLists[wantFootball ? 1 : 0]) ? matchLists[wantFootball ? 1 : 0] : [];
  const sportyMatches = footballMatches.concat(basketballMatches);

  if (!Array.isArray(sportyMatches) || !sportyMatches.length) {
    throw new Error('SportyBet schedule is currently unavailable. Please check back in a few moments.');
  }

  // Index SportyBet football matches by normalized match key. Basketball is
  // handled separately below (its teams and markets must not be cross-matched
  // with football predictions or website H2H/streak caches).
  const sportyByKey = new Map();
  for (const m of sportyMatches) {
    if (!m || !m.home || !m.away) continue;
    if ((m.sport || 'football') !== 'football') continue;
    if (isInvalidFixture(m.home, m.away)) continue;
    if (hasKickedOff(m.date, m.time)) continue;
    if (!withinTargetWindow(m.date, m.time)) continue;

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

  const targetOddsNum = parseFloat(options.targetOdds) || 2.0;
  const explicitMarkets = filters.markets || [];
  const hasExplicitMarkets = explicitMarkets.length > 0;
  const hasMinOdds = filters.minOddsPerLeg !== null;
  const minLegOdds = hasMinOdds ? Math.max(MIN_LEG_ODDS, filters.minOddsPerLeg) : MIN_LEG_ODDS;
  const defaultMaxLegOdds = targetOddsNum >= 20 ? 2.80 : targetOddsNum >= 10 ? 2.40 : targetOddsNum >= 5 ? 2.10 : 1.80;
  const maxLegOdds = filters.maxOddsPerLeg !== null
    ? Math.min(Math.max(defaultMaxLegOdds, minLegOdds), filters.maxOddsPerLeg)
    : Math.max(defaultMaxLegOdds, hasMinOdds ? Math.min(MAX_FILTER_ODDS, minLegOdds + 1.5) : defaultMaxLegOdds);
  const relaxedMaxLegOdds = Math.max(maxLegOdds, 2.60);

  function addCandidate(c) {
    if (!c || !c.match || !c.tip || !c.odds) return;
    const relaxHigherMarket = hasExplicitMarkets && explicitMarkets.includes(c.category) && HIGHER_ODDS_MARKETS.includes(c.category);
    const ceiling = relaxHigherMarket ? relaxedMaxLegOdds : maxLegOdds;
    if (c.odds < minLegOdds || c.odds > ceiling) return;
    const uid = `${matchKey(c.home, c.away)}|${c.category}|${c.tip}`;
    if (seenPicks.has(uid)) return;
    seenPicks.add(uid);
    candidates.push(c);
  }

  // 1 & 2: Process SportyBet live fixtures for Unbeaten streaks, H2H records & live market odds
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

    // 3a. Live 1X2 odds directly from SportyBet schedule — favourites as straight wins & DC
    if (sm.odds) {
      const hOdds = Number(sm.odds['1']);
      const aOdds = Number(sm.odds['2']);

      // Solid home favourites: straight win
      if (hOdds && hOdds >= 1.12 && hOdds <= 1.55) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: '1x2', tip: '1', odds: hOdds,
          confidence: Math.round(Math.min(94, (1 / hOdds) * 100 + 8)),
          qualityScore: 90 + (hOdds <= 1.35 ? 4 : 0),
          reason: `Strong home favourite (${hOdds.toFixed(2)})`,
          marketLabel: 'Home Win (1)'
        });
      }

      // Solid away favourites: straight win
      if (aOdds && aOdds >= 1.15 && aOdds <= 1.60) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: '1x2', tip: '2', odds: aOdds,
          confidence: Math.round(Math.min(92, (1 / aOdds) * 100 + 8)),
          qualityScore: 88 + (aOdds <= 1.35 ? 4 : 0),
          reason: `Strong away favourite (${aOdds.toFixed(2)})`,
          marketLabel: 'Away Win (2)'
        });
      }

      // Home favourites: DC 1X (covers win + draw)
      if (hOdds && hOdds >= 1.20 && hOdds <= 1.85) {
        const dcOdds = calculateDoubleChanceOdds(sm.odds, '1X');
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.70) {
          addCandidate({
            match: matchName, home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip: '1X', odds: dcOdds,
            confidence: Math.round(Math.min(93, (1 / hOdds) * 100 + 15)),
            qualityScore: 86 + (hOdds <= 1.40 ? 5 : 0),
            reason: `Strong home favourite (${hOdds.toFixed(2)}) — 1X cover`,
            marketLabel: 'Double Chance (1X)'
          });
        }
      }

      // Away favourites: DC X2 (covers win + draw)
      if (aOdds && aOdds >= 1.25 && aOdds <= 1.85) {
        const dcOdds = calculateDoubleChanceOdds(sm.odds, 'X2');
        if (dcOdds && dcOdds >= 1.08 && dcOdds <= 1.70) {
          addCandidate({
            match: matchName, home: sm.home, away: sm.away, league: sm.league,
            date: sm.date, time: sm.time,
            category: '1x2', tip: 'X2', odds: dcOdds,
            confidence: Math.round(Math.min(91, (1 / aOdds) * 100 + 15)),
            qualityScore: 84 + (aOdds <= 1.40 ? 5 : 0),
            reason: `Strong away favourite (${aOdds.toFixed(2)}) — X2 cover`,
            marketLabel: 'Double Chance (X2)'
          });
        }
      }
    }

    // 3b. Live schedule Over 1.5 Goals
    if (sm.goals && sm.goals.over15) {
      const o15 = Number(sm.goals.over15);
      if (o15 >= 1.10 && o15 <= 1.50) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: 'over15', tip: 'Over 1.5', odds: o15,
          confidence: 80, qualityScore: 88,
          reason: `High goal expectation (Over 1.5 @ ${o15.toFixed(2)})`,
          marketLabel: 'Over 1.5 Goals'
        });
      }
    }

    // 3c. Live schedule Over 2.5 Goals
    if (sm.goals && sm.goals.over25) {
      const o25 = Number(sm.goals.over25);
      if (o25 >= 1.28 && o25 <= 1.85) {
        addCandidate({
          match: matchName, home: sm.home, away: sm.away, league: sm.league,
          date: sm.date, time: sm.time,
          category: 'over25', tip: 'Over 2.5', odds: o25,
          confidence: 76, qualityScore: 84,
          reason: `Strong goal expectation (Over 2.5 @ ${o25.toFixed(2)})`,
          marketLabel: 'Over 2.5 Goals'
        });
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

  // 7. Higher Odds Markets (target >= 5.0, or explicitly requested by chat filters):
  // Integrates BTTS (Both Teams to Score) and Highest Scoring Half
  if (targetOddsNum >= 5.0 || explicitMarkets.some(m => HIGHER_ODDS_MARKETS.includes(m))) {
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

  // 8. Basketball — moneyline (1X2) and points Over/Under. Basketball has no
  // draw, so only the two moneyline sides are offered. By default only short
  // prices are admitted; when the chat asks for higher minimum odds the price
  // band widens and pick'em favouritism is no longer required. The exact
  // Sportradar selection ids are carried through so the booking code is minted
  // on the very same line the tip was scored against.
  const BASKETBALL_MIN_ODDS = Math.max(1.20, minLegOdds);
  const BASKETBALL_MAX_ODDS = Math.min(MAX_FILTER_ODDS, Math.max(1.30, maxLegOdds));
  const allowHigherBasketballOdds = minLegOdds > 1.30;
  const basketballPool = basketballMatches.filter(function (m) {
    return m && m.home && m.away && !isInvalidFixture(m.home, m.away) &&
      !hasKickedOff(m.date, m.time) && withinTargetWindow(m.date, m.time);
  });
  for (const sm of basketballPool) {
    const matchName = `${sm.home} - ${sm.away}`;
    const ml = sm.moneyline || {};
    const sides = [
      { key: 'home', tip: '1', label: 'Home', price: ml.home },
      { key: 'away', tip: '2', label: 'Away', price: ml.away }
    ];

    // Only back a clear favourite: a short price on both sides would mean a
    // pick'em game, which is exactly what a high-confidence ticket must avoid.
    for (const side of sides) {
      const price = side.price && Number(side.price.odds);
      if (!price || price < BASKETBALL_MIN_ODDS || price > BASKETBALL_MAX_ODDS) continue;
      const rival = sides.find(function (s) { return s !== side; });
      const rivalOdds = rival && rival.price && Number(rival.price.odds);
      if (!allowHigherBasketballOdds && rivalOdds && rivalOdds < 2.40) continue;
      addCandidate({
        match: matchName, home: sm.home, away: sm.away, league: sm.league || 'Basketball',
        date: sm.date, time: sm.time,
        sport: 'basketball',
        category: '1x2', tip: side.tip,
        odds: price,
        selection: {
          marketId: side.price.marketId || ml.marketId || '219',
          outcomeId: side.price.outcomeId,
          specifier: null
        },
        confidence: Math.min(88, Math.round(100 / price)),
        qualityScore: price > 1.50 ? 78 : 97,
        reason: `Basketball moneyline ${price > 1.50 ? 'selection' : 'favourite'} (${price.toFixed(2)} — ${Math.round(100 / price)}% implied probability)`,
        marketLabel: `Basketball Moneyline (${side.label})`
      });
    }

    // Points totals: deliberately extreme lines carry a very high hit rate
    // (e.g. Over 190.5 at 1.20). Keep only the three strongest per fixture.
    const qualifyingLines = [];
    for (const [total, line] of Object.entries(sm.totals || {})) {
      for (const side of ['over', 'under']) {
        const row = line && line[side];
        const price = row && Number(row.odds);
        if (!price || price < BASKETBALL_MIN_ODDS || price > BASKETBALL_MAX_ODDS) continue;
        qualifyingLines.push({ total: total, side: side, price: price, row: row });
      }
    }
    qualifyingLines.sort(function (a, b) { return a.price - b.price; });
    for (const line of qualifyingLines.slice(0, 3)) {
      const label = line.side === 'over' ? 'Over' : 'Under';
      addCandidate({
        match: matchName, home: sm.home, away: sm.away, league: sm.league || 'Basketball',
        date: sm.date, time: sm.time,
        sport: 'basketball',
        category: 'basketball-total', tip: `${label} ${line.total}`, total: line.total,
        odds: line.price,
        selection: {
          marketId: line.row.marketId,
          outcomeId: line.row.outcomeId,
          specifier: line.row.specifier || `total=${line.total}`
        },
        confidence: Math.min(90, Math.round(100 / line.price)),
        qualityScore: 96,
        reason: `Basketball ${label.toLowerCase()} ${line.total} points (${line.price.toFixed(2)} — ${Math.round(100 / line.price)}% implied probability)`,
        marketLabel: `${label} ${line.total} Points`
      });
    }
  }

  return candidates.filter(c => matchesSportyFilters(c, filters));
}

/**
 * Finds the optimal combination of candidates closest to targetOdds.
 * Supports avoidMatches, an exact requested leg count, and stochastic sampling
 * so multiple generations give varied tickets.
 */
function findOptimalCombination(candidates, targetOdds, options = {}) {
  // AI SportyBet Code Builder asks for at least one basketball leg whenever the pool has
  // one; other builders leave this off and keep their football-only behaviour.
  const requireBasketball = options.requireBasketball === true && candidates.some(function (c) { return c.sport === 'basketball'; });
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
  const requestedLegs = Number.isInteger(options.numLegs) && options.numLegs >= 2 && options.numLegs <= 20 ? options.numLegs : null;
  const minLegs = requestedLegs || 2;
  const maxLegs = requestedLegs || (targetOdds <= 3.0 ? 5 : targetOdds <= 5.0 ? 7 : targetOdds <= 10.0 ? 10 : targetOdds <= 25.0 ? 15 : 20);

  let bestCombo = null;
  let minDiff = Infinity;
  let closestAnywhere = null;
  let minDiffAnywhere = Infinity;
  let iterations = 0;
  const MAX_ITER = 40000;

  function backtrack(startIdx, currentLegs, currentOdds, hasBasketball) {
    if (iterations++ > MAX_ITER) return;

    if (currentLegs.length >= minLegs) {
      const diff = Math.abs(currentOdds - targetOdds);
      const sportOk = !requireBasketball || hasBasketball;
      if (sportOk && diff < minDiffAnywhere) {
        minDiffAnywhere = diff;
        closestAnywhere = currentLegs.slice();
      }
      if (sportOk && currentOdds >= minAcceptable && currentOdds <= maxAcceptable) {
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
      backtrack(i + 1, currentLegs, nextOdds, hasBasketball || pick.sport === 'basketball');
      currentLegs.pop();
    }
  }

  backtrack(0, [], 1.0, false);

  // If backtracking didn't find within tight tolerance, greedy approach geared towards selection
  if (!bestCombo || bestCombo.length < 2) {
    let accum = 1.0;
    const greedy = [];
    if (requireBasketball) {
      const firstBasketball = uniquePerFixture.find(function (c) { return c.sport === 'basketball'; });
      if (firstBasketball) {
        greedy.push(firstBasketball);
        accum *= firstBasketball.odds;
      }
    }
    for (const c of uniquePerFixture) {
      if (greedy.length >= maxLegs) break;
      if (greedy.indexOf(c) !== -1) continue;
      if (!requestedLegs && accum * c.odds > targetOdds * 1.18) continue;
      greedy.push(c);
      accum *= c.odds;
      if (greedy.length >= maxLegs) {
        bestCombo = greedy.slice();
        break;
      }
      if (!requestedLegs && accum >= targetOdds * 0.85 &&
          (!requireBasketball || greedy.some(function (l) { return l.sport === 'basketball'; }))) {
        bestCombo = greedy.slice();
        break;
      }
    }
    const greedyComplete = greedy.length >= 2 && (!requestedLegs || greedy.length === requestedLegs) &&
      (!requireBasketball || greedy.some(function (l) { return l.sport === 'basketball'; }));
    if (greedyComplete && (!bestCombo || bestCombo.length < 2)) bestCombo = greedy;
  }

  // Whatever is available: if still null, return the closest valid candidate set
  if ((!bestCombo || bestCombo.length < 2) && closestAnywhere && closestAnywhere.length >= 2 &&
      (!requestedLegs || closestAnywhere.length === requestedLegs)) {
    bestCombo = closestAnywhere;
  }

  // Fallback: take the leading fixtures, honouring an exact leg count when requested
  if (!bestCombo || bestCombo.length < 2) {
    if (uniquePerFixture.length >= 2) {
      let pool = uniquePerFixture;
      if (requireBasketball) {
        const firstBasketball = pool.find(function (c) { return c.sport === 'basketball'; });
        if (firstBasketball) pool = [firstBasketball].concat(pool.filter(function (c) { return c !== firstBasketball; }));
      }
      const fallbackSize = requestedLegs ? requestedLegs : Math.min(pool.length, targetOdds > 5 ? 4 : 2);
      if (pool.length >= fallbackSize) bestCombo = pool.slice(0, fallbackSize);
    }
  }

  return bestCombo;
}

/**
 * Main AI SportyBet Code Builder entry point:
 * Builds the ticket, auto-generates the SportyBet booking code, and auto-heals if any leg is rejected.
 */
async function generateSportyTicket(options = {}) {
  let targetOdds = parseFloat(options.targetOdds);
  if (!Number.isFinite(targetOdds) || targetOdds < 2.0) targetOdds = 2.0;
  if (targetOdds > 50.0) targetOdds = 50.0;

  const validation = validateSportyFilters(options);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const filters = validation.filters;
  const sport = filters.sport;
  const avoidMatches = Array.isArray(options.avoidMatches) ? options.avoidMatches : [];
  const allCandidates = await buildSportyCandidatePool({
    date: options.date, targetOdds: targetOdds, sport: sport,
    markets: filters.markets, leagues: filters.leagues,
    minOddsPerLeg: filters.minOddsPerLeg, maxOddsPerLeg: filters.maxOddsPerLeg,
    straightWinsOnly: filters.straightWinsOnly
  });

  const requestedLegs = filters.numLegs;
  const scopeLabel = filters.markets.length ? filters.markets.join(', ') : sport;
  const poolError = requestedLegs
    ? `Not enough upcoming ${scopeLabel} matches to build ${requestedLegs} legs. Try fewer matches or wider filters.`
    : sport === 'all'
      ? 'Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.'
      : `Not enough upcoming ${sport} matches found in the 24-hour window. Please try again shortly as more matches are priced.`;
  if (allCandidates.length < 2) {
    throw new Error(poolError);
  }
  if (requestedLegs) {
    const uniqueFixtures = new Set(allCandidates.map(c => matchKey(c.home, c.away)));
    if (uniqueFixtures.size < requestedLegs) {
      throw new Error(`Only ${uniqueFixtures.size} distinct ${scopeLabel} matches are available for ${requestedLegs} legs. Try fewer matches or wider filters.`);
    }
  }
  const hasBasketball = allCandidates.some(function (c) { return c.sport === 'basketball'; });

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
    throw new Error(poolError);
  }

  // Attempt up to 4 variations if SportyBet API rejects a specific leg
  let attempts = 0;
  let chosenLegs = null;
  let codeResult = null;
  let lastError = null;
  const rejectedLegs = [];

  while (attempts < 5 && !codeResult) {
    attempts++;
    // Keep a basketball leg in the ticket while basketball picks are available.
    // Only the final recovery attempt may drop it if SportyBet rejects those legs.
    const requireBasketball = hasBasketball && attempts < 5;
    // Pass empty avoidMatches — we already pre-filtered the pool above for shuffle.
    // rejectedLegs accumulates any legs SportyBet API rejects across retries.
    chosenLegs = findOptimalCombination(candidates, targetOdds, {
      avoidMatches: rejectedLegs,
      requireBasketball: requireBasketball,
      numLegs: requestedLegs
    });

    if (!chosenLegs || chosenLegs.length < 2) {
      // If the fresh pool failed, retry with full pool as last resort
      if (candidates !== allCandidates) {
        chosenLegs = findOptimalCombination(allCandidates, targetOdds, {
          avoidMatches: rejectedLegs,
          requireBasketball: requireBasketball,
          numLegs: requestedLegs
        });
      }
    }

    if (!chosenLegs || chosenLegs.length < 2) break;

    const requestLegs = chosenLegs.map(l => ({
      match: l.match,
      tip: l.tip,
      category: l.category,
      odds: l.odds,
      sport: l.sport || 'football',
      total: l.total || null,
      selection: l.selection || null
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
    sport: sport,
    filters: {
      sport: sport,
      markets: filters.markets,
      leagues: filters.leagues,
      minOddsPerLeg: filters.minOddsPerLeg,
      maxOddsPerLeg: filters.maxOddsPerLeg,
      numLegs: requestedLegs,
      straightWinsOnly: filters.straightWinsOnly
    },
    legCount: chosenLegs.length,
    legs: chosenLegs.map(l => ({
      match: l.match,
      home: l.home,
      away: l.away,
      league: l.league || (l.sport === 'basketball' ? 'Basketball' : 'Football'),
      sport: l.sport || 'football',
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
  findOptimalCombination,
  validateSportyFilters,
  matchesSportyFilters,
  SPORTYBUILDER_MARKETS
};
