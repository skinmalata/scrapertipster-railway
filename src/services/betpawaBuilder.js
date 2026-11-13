'use strict';

const fs = require('fs');
const path = require('path');
const { getAvailableMatches } = require('./bookingCodes/resolver');
const { createCodeFromLegs } = require('./bookingCodes/converter');
const { getPawaIndex, normaliseTeam: normalisePawaTeam } = require('./bookingCodes/betpawa');
const { loadUnbeatenCacheForToday } = require('./h2hWinningStreaks');
const { findOptimalCombination } = require('./sportyBuilder');

// betPawa booking-code creation supports 1X2 selections only, so this builder
// generates straight home/away win legs. The betPawa schedule is the source of
// truth for fixture names and prices: candidates are keyed to betPawa's own
// event names, so every selected leg can always be resolved and minted by the
// public betPawa booking-number API.

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

function lagosPartsFromIso(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d);
  function get(type) {
    const f = parts.find(p => p.type === type);
    return f ? f.value : '00';
  }
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`
  };
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
  return `${normaliseTeam(home)}|${normaliseTeam(away)}`;
}

function loadJsonCache(fileName) {
  try {
    const cachePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8')) || {};
    }
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

function pawaKey(home, away) {
  return `${normalisePawaTeam(home)}|${normalisePawaTeam(away)}`;
}

function findPawaMatch(pawaEvents, pawaByKey, home, away) {
  const directKey = pawaKey(home, away);
  if (pawaByKey.has(directKey)) return pawaByKey.get(directKey);

  const nh = normalisePawaTeam(home);
  const na = normalisePawaTeam(away);
  for (const ev of pawaEvents) {
    const eh = normalisePawaTeam(ev.home);
    const ea = normalisePawaTeam(ev.away);
    const hMatch = eh === nh || (nh.length > 4 && eh.includes(nh)) || (eh.length > 4 && nh.includes(eh));
    const aMatch = ea === na || (na.length > 4 && ea.includes(na)) || (ea.length > 4 && na.includes(ea));
    if (hMatch && aMatch) return ev;
  }
  return null;
}

async function buildBetpawaCandidatePool(options = {}) {
  const targetOdds = parseFloat(options.targetOdds) || 3.0;

  let pawaEvents;
  try {
    pawaEvents = await getPawaIndex();
  } catch (e) {
    throw new Error('The betPawa schedule is currently unavailable. Please check back in a few moments.');
  }
  if (!Array.isArray(pawaEvents) || !pawaEvents.length) {
    throw new Error('The betPawa schedule is currently unavailable. Please check back in a few moments.');
  }

  const now = Date.now();
  const upcoming = [];
  const pawaByKey = new Map();
  for (const ev of pawaEvents) {
    if (!ev || !ev.home || !ev.away || !ev.prices) continue;
    const start = Date.parse(ev.startTime);
    if (!Number.isFinite(start)) continue;
    if (start < now - 5 * 60 * 1000) continue;
    if (start > now + 26 * 3600 * 1000) continue;
    upcoming.push(ev);
    pawaByKey.set(pawaKey(ev.home, ev.away), ev);
  }

  if (!upcoming.length) {
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

  // Straight 1X2 legs: minimum 1.10, and a higher ceiling for bigger targets so
  // the combination engine has enough priced selections to reach 10x-50x.
  const minLegOdds = 1.10;
  const maxLegOdds = targetOdds >= 10 ? 3.20 : targetOdds >= 5 ? 2.80 : 2.40;

  function addCandidate(c) {
    if (!c || !c.match || !c.tip || !c.odds) return;
    if (!(c.tip === '1' || c.tip === '2')) return;
    if (c.odds < minLegOdds || c.odds > maxLegOdds) return;
    const uid = `${pawaKey(c.home, c.away)}|${c.tip}`;
    if (seenPicks.has(uid)) return;
    seenPicks.add(uid);
    seenFixtures.add(pawaKey(c.home, c.away));
    candidates.push(c);
  }

  function addPawaCandidate(ev, tip, prob, confidence, qualityScore, reason) {
    const price = ev.prices && ev.prices[tip];
    if (!price) return;
    const priceOdds = Number(price.odds);
    if (!Number.isFinite(priceOdds) || priceOdds <= 0) return;

    const kickoff = lagosPartsFromIso(ev.startTime);
    addCandidate({
      match: `${ev.home} - ${ev.away}`,
      home: ev.home,
      away: ev.away,
      league: ev.competition || '',
      date: kickoff ? kickoff.date : '',
      time: kickoff ? kickoff.time : '',
      category: '1x2',
      tip: tip,
      odds: Number(priceOdds.toFixed(2)),
      confidence: confidence,
      qualityScore: qualityScore + leagueBoost(ev.competition),
      reason: reason,
      marketLabel: tip === '1' ? 'Home Win (1)' : 'Away Win (2)'
    });
  }

  function addStraightWin(sm, tip, prob, confidence, qualityScore, reason) {
    const ev = findPawaMatch(upcoming, pawaByKey, sm.home, sm.away);
    if (!ev) return;
    addPawaCandidate(ev, tip, prob, confidence, qualityScore, reason);
  }

  // 1 & 2: Unbeaten runs and convincing H2H dominance, as straight wins.
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
        if (!best || rec.count > best.count) {
          best = { count: rec.count, team: rec.team || '', side: side };
        }
      }
      if (best) {
        const count = best.count;
        if (best.side === 'home') {
          addStraightWin(sm, '1', Math.min(90, 78 + count * 2), Math.min(93, 80 + count * 2), 92,
            `${best.team} unbeaten in ${count} matches`);
        } else {
          addStraightWin(sm, '2', Math.min(88, 76 + count * 2), Math.min(91, 78 + count * 2), 90,
            `${best.team} unbeaten in ${count} matches`);
        }
      }
    }

    if (h2hHomeWins >= 2 || h2hHomeUnbeaten >= 3) {
      addStraightWin(sm, '1', 86, 86, 91,
        `${sm.home} dominates H2H (${h2hHomeWins} wins / ${h2hHomeUnbeaten} unbeaten)`);
    } else if (h2hAwayWins >= 2 || h2hAwayUnbeaten >= 3) {
      addStraightWin(sm, '2', 84, 84, 89,
        `${sm.away} dominates H2H (${h2hAwayWins} wins / ${h2hAwayUnbeaten} unbeaten)`);
    }

    // 3. Strong 1X2 favourites straight from the live price feed.
    if (sm.odds) {
      const hOdds = Number(sm.odds['1']);
      const aOdds = Number(sm.odds['2']);
      if (hOdds && hOdds >= 1.12 && hOdds <= 1.95) {
        addStraightWin(sm, '1', Math.min(92, (1 / hOdds) * 100 + 12), Math.round(Math.min(90, (1 / hOdds) * 100 + 15)), 88,
          `Home favourite at ${hOdds.toFixed(2)}`);
      }
      if (aOdds && aOdds >= 1.15 && aOdds <= 2.00) {
        addStraightWin(sm, '2', Math.min(90, (1 / aOdds) * 100 + 12), Math.round(Math.min(88, (1 / aOdds) * 100 + 15)), 86,
          `Away favourite at ${aOdds.toFixed(2)}`);
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
    const tip = p.tip;
    addStraightWin(sm, tip, prob, Math.min(94, prob + 8), 90,
      `Site model gives the ${tip === '1' ? 'home side' : 'away side'} a ${prob}% win probability`);
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
      `${w.match} on a ${w.streak}-match winning streak`);
  }

  // 6. Fallback: one favourite per betPawa fixture that had no model signal, so
  // the builder still works when the SportyBet schedule or caches are unavailable.
  for (const ev of upcoming) {
    if (seenFixtures.has(pawaKey(ev.home, ev.away))) continue;
    const o1 = ev.prices && ev.prices['1'] ? Number(ev.prices['1'].odds) : null;
    const o2 = ev.prices && ev.prices['2'] ? Number(ev.prices['2'].odds) : null;
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

    addPawaCandidate(ev, tip, Math.min(90, (1 / odds) * 100 + 8), Math.round(Math.min(88, (1 / odds) * 100 + 10)), 66,
      `betPawa favourite at ${odds.toFixed(2)}`);
  }

  return candidates;
}

async function generateBetpawaTicket(options = {}) {
  let targetOdds = parseFloat(options.targetOdds);
  if (!Number.isFinite(targetOdds) || targetOdds < 2.0) targetOdds = 2.0;
  if (targetOdds > 50.0) targetOdds = 50.0;

  const avoidMatches = Array.isArray(options.avoidMatches) ? options.avoidMatches : [];
  const allCandidates = await buildBetpawaCandidatePool({ date: options.date, targetOdds: targetOdds });

  if (allCandidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

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
    candidates = fresh.length >= 4 ? fresh : allCandidates;
  }

  if (candidates.length < 2) {
    throw new Error('Not enough upcoming matches found in the 24-hour window. Please try again shortly as more matches are priced.');
  }

  let attempts = 0;
  let chosenLegs = null;
  let codeResult = null;
  let lastError = null;
  const rejectedLegs = [];

  while (attempts < 6 && !codeResult) {
    attempts++;
    const usable = candidates.filter(c => {
      const nh = normaliseTeam(c.home);
      const na = normaliseTeam(c.away);
      const nm = normaliseTeam(c.match);
      return !rejectedLegs.some(r => {
        const a = normaliseTeam(r);
        return a === nh || a === na || nm.includes(a) || (a.length > 4 && (nh.includes(a) || na.includes(a)));
      });
    });
    const pool = usable.length >= 2 ? usable : candidates;

    chosenLegs = findOptimalCombination(pool, targetOdds, { avoidMatches: rejectedLegs });
    if (!chosenLegs || chosenLegs.length < 2) {
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
      codeResult = await createCodeFromLegs({ bookmaker: 'betpawa', legs: requestLegs });
    } catch (err) {
      lastError = err;
      const rejectedMatch = /(?:for|match)\s+"([^"]+)"/i.exec(err.message || '');
      if (rejectedMatch && rejectedMatch[1]) {
        rejectedLegs.push(rejectedMatch[1]);
      } else if (chosenLegs.length > 0) {
        rejectedLegs.push(chosenLegs[0].match);
      }
    }
  }

  if (!codeResult || !codeResult.code) {
    throw new Error(lastError ? lastError.message : 'Could not generate a betPawa booking code for the selected odds. Please try another odds range (e.g. 2 to 5 odds).');
  }

  const finalTotalOdds = Number(chosenLegs.reduce((acc, l) => acc * l.odds, 1.0).toFixed(2));

  return {
    success: true,
    code: codeResult.code,
    bookmaker: 'betpawa',
    bookmakerName: 'betPawa',
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
  generateBetpawaTicket,
  buildBetpawaCandidatePool
};
