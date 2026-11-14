'use strict';

const fs = require('fs');
const path = require('path');
const { getAvailableMatches } = require('./bookingCodes/resolver');
const { getXbetIndex, resolveXbetLeg, createXbetCode } = require('./bookingCodes/1xbet');
const { loadUnbeatenCacheForToday } = require('./h2hWinningStreaks');
const { findOptimalCombination } = require('./sportyBuilder');

// 1xBet booking codes support 1X2 selections only, so the builder generates
// straight home/away win legs from the 1xBet family line feed. The feed is the
// source of truth for fixture names and prices, so every selected leg can be
// resolved and minted by the public SaveCoupon service.

function lagosNowString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  function get(type) {
    const f = parts.find(function (p) { return p.type === type; });
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return get('year') + '-' + get('month') + '-' + get('day') + ' ' + hour + ':' + get('minute');
}

function lagosDateTimeString(offsetHours) {
  const d = new Date(Date.now() + (offsetHours || 0) * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d);
  function get(type) {
    const f = parts.find(function (p) { return p.type === type; });
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return get('year') + '-' + get('month') + '-' + get('day') + ' ' + hour + ':' + get('minute');
}

function lagosPartsFromMs(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d);
  function get(type) {
    const f = parts.find(function (p) { return p.type === type; });
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: get('year') + '-' + get('month') + '-' + get('day'), time: hour + ':' + get('minute') };
}

function kickoffString(dateStr, timeStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const t = String(timeStr || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const bits = t.split(':');
  return dateStr + ' ' + (bits[0].length === 1 ? '0' + bits[0] : bits[0]) + ':' + bits[1];
}

function hasKickedOff(dateStr, timeStr) {
  const k = kickoffString(dateStr, timeStr);
  return k ? k < lagosNowString() : false;
}

function withinNext24Hours(dateStr, timeStr) {
  const k = kickoffString(dateStr, timeStr);
  if (!k) return true;
  return k >= lagosNowString() && k <= lagosDateTimeString(26);
}

function normaliseTeam(value) {
  return String(value || '').toLowerCase()
    .replace(/\b(fc|afc|cf|sc|ac|the|united|club)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function matchKey(home, away) {
  return normaliseTeam(home) + '|' + normaliseTeam(away);
}

function loadJsonCache(fileName) {
  try {
    const cachePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
  } catch (e) {}
  return {};
}

function loadPredictionsCache() {
  return loadJsonCache('predictions-cache.json');
}

function leagueBoost(league) {
  const l = String(league || '').toLowerCase();
  if (/reserve|u19|u20|u21|youth|women|friendly/.test(l)) return -12;
  if (/premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|eredivisie|primeira liga|super lig|pro league|mls|brasileirao|copa libertadores/.test(l)) return 8;
  return 0;
}

function findSportyMatch(sportyByKey, home, away) {
  const directKey = matchKey(home, away);
  if (sportyByKey.has(directKey)) return sportyByKey.get(directKey);
  const nh = normaliseTeam(home);
  const na = normaliseTeam(away);
  for (const sm of sportyByKey.values()) {
    const smh = normaliseTeam(sm.home);
    const sma = normaliseTeam(sm.away);
    const hMatch = smh === nh || (nh.length > 4 && smh.includes(nh)) || (smh.length > 4 && nh.includes(smh));
    const aMatch = sma === na || (na.length > 4 && sma.includes(na)) || (sma.length > 4 && na.includes(sma));
    if (hMatch && aMatch) return sm;
  }
  return null;
}

function findXbetFor(sportyByKey, xbetByKey, home, away) {
  const direct = xbetByKey.get(matchKey(home, away));
  if (direct) return direct;
  // Fallback: locate the SportyBet fixture, then match 1xBet to that name.
  const sm = findSportyMatch(sportyByKey, home, away);
  if (sm) {
    const found = xbetByKey.get(matchKey(sm.home, sm.away));
    if (found) return found;
  }
  return null;
}

async function buildXbetCandidatePool(options) {
  const targetOdds = parseFloat(options && options.targetOdds) || 3.0;

  let xbetEvents;
  try {
    xbetEvents = await getXbetIndex();
  } catch (e) {
    throw new Error('The 1xBet schedule is currently unavailable. Please check back in a few moments.');
  }
  if (!Array.isArray(xbetEvents) || !xbetEvents.length) {
    throw new Error('The 1xBet schedule is currently unavailable. Please check back in a few moments.');
  }

  const now = Date.now();
  const xbetUpcoming = [];
  const xbetByKey = new Map();
  for (const ev of xbetEvents) {
    if (!ev || !ev.home || !ev.away || !ev.odds) continue;
    const startMs = Number(ev.startTime);
    if (!Number.isFinite(startMs) || startMs < now - 5 * 60 * 1000) continue;
    if (startMs > now + 26 * 3600 * 1000) continue;
    xbetUpcoming.push(ev);
    xbetByKey.set(matchKey(ev.home, ev.away), ev);
  }
  if (!xbetUpcoming.length) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  let sportyMatches = [];
  try {
    sportyMatches = await getAvailableMatches();
  } catch (e) {
    sportyMatches = [];
  }
  const sportyByKey = new Map();
  for (const m of sportyMatches) {
    if (!m || !m.home || !m.away) continue;
    if (hasKickedOff(m.date, m.time)) continue;
    if (!withinNext24Hours(m.date, m.time)) continue;
    sportyByKey.set(matchKey(m.home, m.away), m);
  }

  const unbeatenList = loadUnbeatenCacheForToday();
  const unbeatenMap = new Map();
  for (const u of unbeatenList) {
    if (u && u.home && u.away) unbeatenMap.set(matchKey(u.home, u.away), u);
  }

  const predictions = loadPredictionsCache();
  const candidates = [];
  const seenPicks = new Set();
  const seenFixtures = new Set();

  const minLegOdds = 1.10;
  const maxLegOdds = targetOdds >= 10 ? 3.20 : targetOdds >= 5 ? 2.80 : 2.40;

  function addCandidate(c) {
    if (!c || !c.match || !c.tip || !c.odds) return;
    if (!(c.tip === '1' || c.tip === '2')) return;
    if (c.odds < minLegOdds || c.odds > maxLegOdds) return;
    const uid = matchKey(c.home, c.away) + '|' + c.tip;
    if (seenPicks.has(uid)) return;
    seenPicks.add(uid);
    seenFixtures.add(matchKey(c.home, c.away));
    candidates.push(c);
  }

  function addXbetCandidate(ev, tip, prob, confidence, qualityScore, reason) {
    const odds = ev.odds && ev.odds[tip === '1' ? 'H' : 'A'];
    if (!Number.isFinite(odds) || odds <= 1) return;
    const kickoff = lagosPartsFromMs(ev.startTime);
    addCandidate({
      match: ev.home + ' - ' + ev.away,
      home: ev.home,
      away: ev.away,
      league: ev.league || '',
      date: kickoff ? kickoff.date : '',
      time: kickoff ? kickoff.time : '',
      category: '1x2',
      tip: tip,
      odds: Number(odds.toFixed(2)),
      confidence: confidence,
      qualityScore: qualityScore + leagueBoost(ev.league),
      reason: reason,
      marketLabel: tip === '1' ? 'Home Win (1)' : 'Away Win (2)',
      xbetGameId: ev.gameId
    });
  }

  function addStraightWin(sm, tip, prob, confidence, qualityScore, reason) {
    const ev = findXbetFor(sportyByKey, xbetByKey, sm.home, sm.away);
    if (!ev) return;
    addXbetCandidate(ev, tip, prob, confidence, qualityScore, reason);
  }

  // 1 & 2: unbeaten runs and convincing H2H dominance, as straight wins.
  for (const [key, sm] of sportyByKey.entries()) {
    const summary = sm.h2h || {};
    const h2hHomeWins = summary.homeWin || 0;
    const h2hAwayWins = summary.awayWin || 0;
    const h2hHomeUnbeaten = summary.homeUnbeaten || 0;
    const h2hAwayUnbeaten = summary.awayUnbeaten || 0;

    const unbeaten = unbeatenMap.get(key);
    if (unbeaten && unbeaten.streaks && Array.isArray(unbeaten.streaks.all)) {
      let best = null;
      for (const rec of unbeaten.streaks.all) {
        if (!rec || !rec.count) continue;
        const side = rec.normal === unbeaten.homeNormal ? 'home'
          : rec.normal === unbeaten.awayNormal ? 'away' : null;
        if (!side) continue;
        if (!best || rec.count > best.count) best = { count: rec.count, team: rec.team || '', side: side };
      }
      if (best) {
        const count = best.count;
        if (best.side === 'home') {
          addStraightWin(sm, '1', Math.min(90, 78 + count * 2), Math.min(93, 80 + count * 2), 92,
            best.team + ' unbeaten in ' + count + ' matches');
        } else {
          addStraightWin(sm, '2', Math.min(88, 76 + count * 2), Math.min(91, 78 + count * 2), 90,
            best.team + ' unbeaten in ' + count + ' matches');
        }
      }
    }

    if (h2hHomeWins >= 2 || h2hHomeUnbeaten >= 3) {
      addStraightWin(sm, '1', 86, 86, 91,
        sm.home + ' dominates H2H (' + h2hHomeWins + ' wins / ' + h2hHomeUnbeaten + ' unbeaten)');
    } else if (h2hAwayWins >= 2 || h2hAwayUnbeaten >= 3) {
      addStraightWin(sm, '2', 84, 84, 89,
        sm.away + ' dominates H2H (' + h2hAwayWins + ' wins / ' + h2hAwayUnbeaten + ' unbeaten)');
    }

    // 3. Strong 1X2 favourites straight from the live 1xBet price feed.
    const ev = findXbetFor(sportyByKey, xbetByKey, sm.home, sm.away);
    if (ev && ev.odds) {
      const hOdds = Number(ev.odds.H);
      const aOdds = Number(ev.odds.A);
      if (hOdds && hOdds >= 1.12 && hOdds <= 1.95) {
        addStraightWin(sm, '1', Math.min(92, (1 / hOdds) * 100 + 12), Math.round(Math.min(90, (1 / hOdds) * 100 + 15)), 88,
          'Home favourite at ' + hOdds.toFixed(2));
      }
      if (aOdds && aOdds >= 1.15 && aOdds <= 2.00) {
        addStraightWin(sm, '2', Math.min(90, (1 / aOdds) * 100 + 12), Math.round(Math.min(88, (1 / aOdds) * 100 + 15)), 86,
          'Away favourite at ' + aOdds.toFixed(2));
      }
    }
  }

  // 4. Website 1X2 model picks (straight home/away wins only).
  const predMatches = predictions.matches || [];
  for (const p of predMatches) {
    if (!p || !p.match) continue;
    if (p.tip !== '1' && p.tip !== '2') continue;
    const sides = p.match.split(/\s+(?:-|vs)\s+/i);
    if (sides.length !== 2) continue;
    const sm = findSportyMatch(sportyByKey, sides[0], sides[1]);
    if (!sm) continue;
    const prob = Number(p.probability) || 0;
    if (prob < 65) continue;
    addStraightWin(sm, p.tip, prob, Math.min(94, prob + 8), 90,
      'Site model gives the ' + (p.tip === '1' ? 'home side' : 'away side') + ' a ' + prob + '% win probability');
  }

  // 5. Teams on convincing winning runs, mapped to the side they play next.
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
    addStraightWin(sm, isHome ? '1' : '2', Math.min(92, 78 + w.streak), Math.min(94, 82 + w.streak), 90,
      w.match + ' on a ' + w.streak + '-match winning streak');
  }

  // 6. Fallback: one favourite per 1xBet fixture with no model signal, so the
  // builder still works when the SportyBet schedule or caches are unavailable.
  for (const ev of xbetUpcoming) {
    const key = matchKey(ev.home, ev.away);
    if (seenFixtures.has(key)) continue;
    const o1 = Number(ev.odds && ev.odds.H);
    const o2 = Number(ev.odds && ev.odds.A);
    let tip = null;
    let odds = null;
    if (Number.isFinite(o1) && Number.isFinite(o2)) {
      if (o1 <= o2) { tip = '1'; odds = o1; } else { tip = '2'; odds = o2; }
    } else if (Number.isFinite(o1)) {
      tip = '1'; odds = o1;
    } else if (Number.isFinite(o2)) {
      tip = '2'; odds = o2;
    }
    if (!tip || !odds) continue;
    addXbetCandidate(ev, tip, Math.min(90, (1 / odds) * 100 + 8), Math.round(Math.min(88, (1 / odds) * 100 + 10)), 66,
      '1xBet favourite at ' + odds.toFixed(2));
  }

  return candidates;
}

async function generateXbetTicket(options) {
  options = options || {};
  let targetOdds = parseFloat(options.targetOdds);
  if (!Number.isFinite(targetOdds) || targetOdds < 2.0) targetOdds = 2.0;
  if (targetOdds > 50.0) targetOdds = 50.0;

  const avoidMatches = Array.isArray(options.avoidMatches) ? options.avoidMatches : [];
  const allCandidates = await buildXbetCandidatePool({ targetOdds: targetOdds });

  if (allCandidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  let candidates = allCandidates;
  if (avoidMatches.length > 0) {
    const avoidSet = avoidMatches.map(normaliseTeam).filter(Boolean);
    const isAvoided = function (c) {
      const nm = normaliseTeam(c.match);
      const nh = normaliseTeam(c.home);
      const na = normaliseTeam(c.away);
      return avoidSet.some(function (a) {
        return a === nh || a === na || nm.includes(a) || (a.length > 4 && (nh.includes(a) || na.includes(a)));
      });
    };
    const fresh = allCandidates.filter(function (c) { return !isAvoided(c); });
    candidates = fresh.length >= 4 ? fresh : allCandidates;
  }

  if (candidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  let attempts = 0;
  let chosenLegs = null;
  let resolvedLegs = null;
  let code = null;
  let lastError = null;
  const rejectedLegs = [];

  while (attempts < 6 && !code) {
    attempts++;
    const usable = candidates.filter(function (c) {
      const nh = normaliseTeam(c.home);
      const na = normaliseTeam(c.away);
      const nm = normaliseTeam(c.match);
      return !rejectedLegs.some(function (r) {
        const a = normaliseTeam(r);
        return a === nh || a === na || nm.includes(a) || (a.length > 4 && (nh.includes(a) || na.includes(a)));
      });
    });
    const pool = usable.length >= 2 ? usable : candidates;

    chosenLegs = findOptimalCombination(pool, targetOdds, { avoidMatches: rejectedLegs });
    if ((!chosenLegs || chosenLegs.length < 2) && candidates !== allCandidates) {
      chosenLegs = findOptimalCombination(allCandidates, targetOdds, { avoidMatches: rejectedLegs });
    }
    if (!chosenLegs || chosenLegs.length < 2) break;

    try {
      resolvedLegs = [];
      for (const leg of chosenLegs) {
        resolvedLegs.push(await resolveXbetLeg({
          match: leg.match,
          tip: leg.tip,
          category: leg.category,
          odds: leg.odds
        }));
      }
      code = await createXbetCode(resolvedLegs);
    } catch (err) {
      lastError = err;
      code = null;
      const rejectedMatch = /(?:for|match)\s+"([^"]+)"/i.exec(err.message || '');
      if (rejectedMatch && rejectedMatch[1]) rejectedLegs.push(rejectedMatch[1]);
      else if (chosenLegs.length) rejectedLegs.push(chosenLegs[0].match);
    }
  }

  if (!code) {
    throw new Error(lastError ? lastError.message : 'Could not generate a 1xBet booking code for the selected odds. Please try another odds range (e.g. 2 to 5 odds).');
  }

  const finalTotalOdds = Number(resolvedLegs.reduce(function (acc, l) { return acc * l.odds; }, 1.0).toFixed(2));

  return {
    success: true,
    code: code,
    bookmaker: '1xbet',
    bookmakerName: '1xBet',
    totalOdds: finalTotalOdds,
    targetOdds: targetOdds,
    legCount: chosenLegs.length,
    legs: chosenLegs.map(function (l) {
      return {
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
      };
    }),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateXbetTicket,
  buildXbetCandidatePool
};
