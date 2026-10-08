'use strict';

const { decodeCode } = require('./bookingCodes/converter');
const { createSportybetCode } = require('./bookingCodes/sportradar');
const { getAvailableMatches, getEventIndex, hasEventIndex } = require('./bookingCodes/resolver');
const { normaliseName } = require('./h2hWinningStreaks');

const TOLERANCE_LEVELS = ['conservative', 'medium', 'aggressive'];
const TOLERANCE_CUTOFF = { conservative: 4, medium: 6, aggressive: 8 };
const DEFAULT_TOLERANCE = 'medium';
const MIN_CODE_LEGS = 2;
const SOON_MS = 3 * 60 * 60 * 1000;
const INDEX_TIMEOUT_MS = 3500;
const COLD_INDEX_TIMEOUT_MS = 25000;
const GEMINI_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const analysisCache = new Map();

function badRequest(message) {
  const err = new Error(message);
  err.code = 'BAD_REQUEST';
  return err;
}

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function cacheGet(key) {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (analysisCache.size >= CACHE_MAX) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) analysisCache.delete(oldestKey);
  }
  analysisCache.set(key, { at: Date.now(), value: value });
}

function oddsScore(odds) {
  if (!(odds > 0)) return 3;
  if (odds >= 8) return 8;
  if (odds >= 5) return 6;
  if (odds >= 3.5) return 4;
  if (odds >= 2) return 2;
  return 1;
}

function isStandardMarket(name) {
  const t = String(name || '').toLowerCase();
  return /1x2|match result|double chance|over\/under|over & under|total goals/.test(t);
}

function parseStartTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    let n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e12) n *= 1000;
    return n;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickSide(leg) {
  const marketId = String(leg.marketId || '');
  const outcomeId = String(leg.outcomeId || '');
  if (marketId === '1') {
    if (outcomeId === '1') return 'home';
    if (outcomeId === '2') return 'draw';
    if (outcomeId === '3') return 'away';
  }
  const name = String(leg.outcomeName || '').toLowerCase().trim();
  if (name === '1' || name === 'home' || name === 'home win') return 'home';
  if (name === '2' || name === 'away' || name === 'away win') return 'away';
  if (name === 'x' || name === 'draw') return 'draw';
  return null;
}

function totalOdds(legs) {
  let product = 1;
  let hasOdds = false;
  for (const leg of legs) {
    const odd = Number(leg.odds);
    if (Number.isFinite(odd) && odd > 0) {
      product *= odd;
      hasOdds = true;
    }
  }
  return hasOdds ? Number(product.toFixed(2)) : null;
}

async function buildMatchIndex() {
  try {
    // Warm index: short race so a background refresh never slows the request.
    // Cold index (fresh boot / Render free-tier spin-up): give the first build
    // real time to finish, otherwise match names stay empty on every request.
    const timeoutMs = hasEventIndex() ? INDEX_TIMEOUT_MS : COLD_INDEX_TIMEOUT_MS;
    const timeout = new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error('INDEX_TIMEOUT')); }, timeoutMs);
    });
    const pair = await Promise.race([
      Promise.all([getEventIndex(), getAvailableMatches()]),
      timeout
    ]);
    const byId = {};
    for (const e of pair[0]) byId[e.eventId] = e;
    const h2hByPair = {};
    for (const m of pair[1]) h2hByPair[normaliseName(m.home) + '|' + normaliseName(m.away)] = m.h2h;
    return { byId: byId, h2hByPair: h2hByPair };
  } catch (e) {
    return null;
  }
}

// SportyBet's share API decodes codes down to bare ids and odds, so the
// display fields (match, league, kick-off) and the market/selection names are
// filled back in from the event index before scoring.
function hydrateLeg(leg, index) {
  const ev = index ? index.byId[leg.eventId] : null;
  const marketId = String(leg.marketId || '');
  const outcomeId = String(leg.outcomeId || '');
  const specifier = String(leg.specifier || '');

  const marketNames = { '1': '1X2', '10': 'Double Chance', '18': 'Over/Under' };
  const outcomeNames = { '1': 'Home Win', '2': 'Draw', '3': 'Away Win',
    '12': '1X (Home or Draw)', '13': '12 (Home or Away)', '23': 'X2 (Draw or Away)' };
  let outcomeName = leg.outcomeName || outcomeNames[outcomeId] || '';
  if (!outcomeName && marketId === '18') {
    const total = /total=([0-9.]+)/.exec(specifier);
    if (total) outcomeName = (outcomeId === '12' ? 'Over ' : 'Under ') + total[1];
  }

  const tournament = leg.sport && leg.sport.category && leg.sport.category.tournament
    ? leg.sport.category.tournament.name : '';

  return Object.assign({}, leg, {
    eventName: leg.eventName || (ev ? ev.home + ' - ' + ev.away : ''),
    league: (ev && ev.league) || leg.competition || tournament || '',
    marketName: leg.marketName || marketNames[marketId] || '',
    outcomeName: outcomeName,
    startTime: leg.startTime || (ev && ev.date && ev.time ? ev.date + ' ' + ev.time : '')
  });
}

function scoreLeg(leg, matchInfo, now) {
  const odds = Number(leg.odds);
  const marketName = String(leg.marketName || '');
  const signals = [];
  let score = oddsScore(odds);

  if (odds > 0) {
    signals.push(odds >= 5 ? 'Longshot price of ' + odds.toFixed(2) : 'Odds of ' + odds.toFixed(2));
  } else {
    signals.push('No price available');
  }

  if (marketName && !isStandardMarket(marketName)) {
    score += 1;
    signals.push('Specialist market (' + marketName + ') — higher variance');
  }

  const startMs = parseStartTime(leg.startTime);
  if (startMs && startMs <= now) {
    signals.push('Kick-off time has passed');
    return { riskScore: 10, started: true, signals: signals };
  }
  if (startMs && startMs - now <= SOON_MS) {
    score += 2;
    signals.push('Kicks off within 3 hours');
  }

  const side = pickSide(leg);
  if (side && matchInfo) {
    const h = matchInfo.h2h;
    if (h) {
      if (side === 'home' && h.awayWin >= 3) {
        score += 2;
        signals.push('Away side on a ' + h.awayWin + '-match winning run');
      }
      if (side === 'away' && h.homeWin >= 3) {
        score += 2;
        signals.push('Home side on a ' + h.homeWin + '-match winning run');
      }
      if (side === 'home' && h.awayUnbeaten >= 5) {
        score += 1;
        signals.push('Away side unbeaten in the last ' + h.awayUnbeaten + ' head-to-head meetings');
      }
      if (side === 'away' && h.homeUnbeaten >= 5) {
        score += 1;
        signals.push('Home side unbeaten in the last ' + h.homeUnbeaten + ' head-to-head meetings');
      }
    }

    const sign = side === 'home' ? '1' : side === 'away' ? '2' : 'X';
    const current = matchInfo.odds ? matchInfo.odds[sign] : null;
    if (current && odds > 0 && current / odds >= 1.2) {
      score += 1;
      signals.push('Price has drifted since the code was made (' + odds.toFixed(2) + ' to ' + current.toFixed(2) + ')');
    }
  }

  return { riskScore: Math.max(1, Math.min(10, score)), started: false, signals: signals };
}

function fallbackReason(v) {
  if (v.started) return 'Kick-off has passed for this fixture, so it cannot travel in a new code.';
  if (v.keep) {
    const hasWarning = v.signals.some(function (s) {
      return /Longshot|drift|winning run|unbeaten|within 3 hours|Specialist|passed/.test(s);
    });
    if (hasWarning) return 'Some warning signs, but this leg stays below the removal threshold at ' + v.riskScore + '/10.';
    if (v.odds && v.odds <= 1.7) return 'Short price of ' + v.odds + ' — one of the safer legs on the slip.';
    return 'No risk flags: standard market and a survivable price.';
  }
  const h2h = v.signals.find(function (s) { return /winning run|unbeaten in the last/.test(s); });
  if (h2h) return h2h + '.';
  const drift = v.signals.find(function (s) { return /drifted/.test(s); });
  if (drift) return drift + '.';
  const soon = v.signals.find(function (s) { return /within 3 hours/.test(s); });
  if (soon) return 'Kicks off within 3 hours, leaving little room to place it safely.';
  if (v.odds >= 5) return 'Longshot at ' + v.odds + ' — the most likely leg to break this slip.';
  if (v.odds >= 3.5) return 'At ' + v.odds + ' this pick carries a low implied chance of surviving the slip.';
  const specialist = v.signals.find(function (s) { return /Specialist market/.test(s); });
  if (specialist) return specialist + '.';
  return 'Flagged risky at ' + v.riskScore + '/10 by the scoring rules.';
}

function buildReasonsPrompt(rows) {
  return (
    'You are a football betting risk analyst reviewing selections from a SportyBet accumulator.\n' +
    'For every selection below, write ONE factual reason of at most 110 characters explaining the risk verdict. ' +
    'Reference the odds, market or signals when relevant. Removed selections should state what makes them risky; ' +
    'kept selections should state why they look solid. Never promise outcomes or use gambling hype.\n' +
    'Selections (JSON):\n' + JSON.stringify(rows) + '\n' +
    'Respond with ONLY a JSON array of the form [{"i":0,"reason":"..."}] covering every index. No markdown, no other text.'
  );
}

function parseReasonsArray(text, verdicts) {
  if (!text) return null;

  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return null;

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) return null;

  const byIndex = {};
  for (const item of parsed) {
    if (item && Number.isInteger(item.i) && typeof item.reason === 'string' && item.reason.trim()) {
      byIndex[item.i] = item.reason.trim().slice(0, 140);
    }
  }
  const filled = verdicts.map(function (v, i) { return byIndex[i] || null; });
  const hasAny = filled.some(Boolean);
  return hasAny ? filled : null;
}

function aiDebug() {
  return process.env.AI_DEBUG || process.env.GEMINI_DEBUG;
}

async function geminiReasons(verdicts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'YOUR_NEW_API_KEY_HERE') return null;

  const rows = verdicts.map(function (v, i) {
    return {
      i: i,
      match: v.match,
      market: v.market,
      selection: v.selection,
      odds: v.odds,
      riskScore: v.riskScore,
      removed: !v.keep,
      signals: v.signals
    };
  });

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/' + (process.env.GEMINI_MODEL || 'gemini-3.5-flash') + ':generateContent?key=' + key,
      { contents: [{ parts: [{ text: buildReasonsPrompt(rows) }] }] },
      { timeout: GEMINI_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    const text = response.data && response.data.candidates && response.data.candidates[0] &&
      response.data.candidates[0].content && response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts[0] && response.data.candidates[0].content.parts[0].text;
    if (aiDebug()) console.log('[ai-debug][gemini] raw text:', String(text).slice(0, 400));
    return parseReasonsArray(text, verdicts);
  } catch (e) {
    if (aiDebug()) console.log('[ai-debug][gemini] error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 300) : (e.code || '') + ' ' + e.message);
    return null;
  }
}

async function groqReasons(verdicts) {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.indexOf('YOUR_') === 0) return null;

  const rows = verdicts.map(function (v, i) {
    return {
      i: i,
      match: v.match,
      market: v.market,
      selection: v.selection,
      odds: v.odds,
      riskScore: v.riskScore,
      removed: !v.keep,
      signals: v.signals
    };
  });

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: buildReasonsPrompt(rows) }],
        temperature: 0.2
      },
      { timeout: GEMINI_TIMEOUT_MS, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key } }
    );
    const text = response.data && response.data.choices && response.data.choices[0] &&
      response.data.choices[0].message && response.data.choices[0].message.content;
    if (aiDebug()) console.log('[ai-debug][groq] raw text:', String(text).slice(0, 400));
    return parseReasonsArray(text, verdicts);
  } catch (e) {
    if (aiDebug()) console.log('[ai-debug][groq] error:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 300) : (e.code || '') + ' ' + e.message);
    return null;
  }
}

async function aiReasons(verdicts) {
  return (await geminiReasons(verdicts)) || (await groqReasons(verdicts));
}

async function analyzeCode(input) {
  const code = normalizeCode(input && input.code);
  if (!code) throw badRequest('Please enter a booking code.');
  if (code.length > 40) throw badRequest('That does not look like a valid booking code.');

  const rawTolerance = String(input && input.tolerance || '').toLowerCase();
  const tolerance = TOLERANCE_LEVELS.indexOf(rawTolerance) !== -1 ? rawTolerance : DEFAULT_TOLERANCE;

  const cacheKey = code + ':' + tolerance;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const source = await decodeCode({ code: code, bookmaker: 'sportybet' });
  if (!source.legs.length) throw badRequest('This code contains no selections.');

  const matchIndex = await buildMatchIndex();
  const now = Date.now();

  const legs = source.legs.map(function (leg) { return hydrateLeg(leg, matchIndex); });

  const verdicts = legs.map(function (leg, i) {
    const ev = matchIndex ? matchIndex.byId[leg.eventId] : null;
    const pair = ev ? normaliseName(ev.home) + '|' + normaliseName(ev.away) : '';
    const matchInfo = ev
      ? { odds: ev.odds || {}, h2h: pair && matchIndex.h2hByPair[pair] ? matchIndex.h2hByPair[pair] : null }
      : null;
    const scored = scoreLeg(leg, matchInfo, now);
    return {
      index: i,
      match: leg.eventName || '',
      league: leg.league || '',
      market: leg.marketName || '',
      selection: leg.outcomeName || '',
      odds: Number(leg.odds) || null,
      startTime: leg.startTime || '',
      riskScore: scored.riskScore,
      keep: scored.riskScore < TOLERANCE_CUTOFF[tolerance],
      started: scored.started,
      signals: scored.signals,
      reason: ''
    };
  });

  const flagged = verdicts.filter(function (v) { return !v.keep; }).length;
  const keptLegs = legs.filter(function (leg, i) { return verdicts[i].keep; });

  let status;
  let newCode = null;
  let message = '';

  if (flagged === 0) {
    status = 'clean';
    newCode = source.code;
    message = 'No risky selections found — this code is already clean at the ' + tolerance + ' tolerance.';
  } else if (keptLegs.length < MIN_CODE_LEGS) {
    status = 'too_few';
    message = flagged === verdicts.length
      ? 'Every selection was flagged at the ' + tolerance + ' tolerance, so there is nothing safe left to build a code from. Try a looser tolerance.'
      : 'Removing the flagged selections would leave ' + keptLegs.length + ' selection' + (keptLegs.length === 1 ? '' : 's') +
        ', and a SportyBet booking code needs at least ' + MIN_CODE_LEGS + '. Try a looser tolerance.';
  } else {
    newCode = await createSportybetCode(keptLegs);
    status = 'rebuilt';
    message = flagged + ' risky selection' + (flagged === 1 ? '' : 's') + ' removed. The new code carries the remaining ' + keptLegs.length + '.';
  }

  const reasons = flagged > 0 ? await aiReasons(verdicts) : null;
  verdicts.forEach(function (v, i) {
    v.reason = (reasons && reasons[i]) || fallbackReason(v);
  });

  const keptVerdicts = verdicts.filter(function (v) { return v.keep; });
  const result = {
    sourceCode: source.code,
    bookmaker: 'sportybet',
    bookmakerName: source.bookmakerName,
    status: status,
    tolerance: tolerance,
    message: message,
    newCode: newCode,
    legCountBefore: verdicts.length,
    legCountAfter: keptVerdicts.length,
    flaggedCount: flagged,
    totalOddsBefore: totalOdds(source.legs),
    totalOddsAfter: status === 'clean' ? totalOdds(source.legs) : totalOdds(keptLegs),
    verdicts: verdicts
  };

  cacheSet(cacheKey, result);
  return result;
}

module.exports = { analyzeCode, TOLERANCE_LEVELS };
