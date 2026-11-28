'use strict';

const fs = require('fs');
const path = require('path');
const { createCodeFromLegs } = require('./bookingCodes/converter');
const { resolveLeg } = require('./bookingCodes/resolver');
const { lagosDate } = require('../utils/dates');

const PREDICTIONS_FILE = path.join(__dirname, '..', '..', 'predictions-cache.json');
const CURATED_FILE = path.join(__dirname, '..', '..', 'scripts', 'perfect-record-curated.json');
const MAX_CANDIDATES = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const resultCache = new Map();
const TIP_ALIASES = { '1': '1', X: 'X', '2': '2', '1X': '1X', X2: 'X2', '12': '12' };
const TIP_PRIORITY = { '1': 0, '2': 0, X: 1, '1X': 2, X2: 2, '12': 2 };

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('[page-sportybet-code] Failed to read ' + path.basename(file) + ':', e.message);
    return null;
  }
}

function serviceError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function cacheGet(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (resultCache.size >= 100) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, { at: Date.now(), value: value });
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normaliseTip(value) {
  const tip = String(value || '').trim().toUpperCase();
  return TIP_ALIASES[tip] || null;
}

function resolveDate(input) {
  const value = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value === 'yesterday') return lagosDate(-1);
  if (value === 'tomorrow') return lagosDate(1);
  return lagosDate(0);
}

function matchName(row) {
  if (row && row.home && row.away) return String(row.home).trim() + ' - ' + String(row.away).trim();
  return String((row && row.match) || '').trim();
}

function rowsForSource(source) {
  if (source === 'perfect-record') {
    const curated = readJson(CURATED_FILE);
    const rows = curated && Array.isArray(curated.matches) ? curated.matches.slice() : [];
    const cached = readJson(PREDICTIONS_FILE);
    const cachedRows = cached && Array.isArray(cached.perfectRecordMatches) ? cached.perfectRecordMatches : [];
    const seen = new Set(rows.map(function (row) { return normalise(matchName(row)) + '|' + (row.date || ''); }));
    cachedRows.forEach(function (row) {
      const key = normalise(matchName(row)) + '|' + (row.date || '');
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    });
    return rows;
  }

  const data = readJson(PREDICTIONS_FILE) || {};
  return Array.isArray(data.matches) ? data.matches.slice() : [];
}

function latestDate(rows) {
  let latest = '';
  rows.forEach(function (row) {
    const date = String((row && row.date) || '');
    if (date && date > latest) latest = date;
  });
  return latest;
}

function buildLeg(row, source) {
  const name = matchName(row);
  if (!name) return null;

  let tip = null;
  if (source === 'perfect-record') {
    const parts = name.split(/\s+-\s+/);
    const perfect = normalise(row.perfectTeam);
    if (perfect && normalise(parts[0]) === perfect) tip = '1';
    else if (perfect && normalise(parts[1]) === perfect) tip = '2';
  } else {
    tip = normaliseTip(row.tip);
  }
  if (!tip) return null;

  return {
    match: name,
    tip: tip,
    category: '1x2',
    league: String((row && row.league) || ''),
    date: String((row && row.date) || ''),
    sport: 'football'
  };
}

function shortReason(err) {
  if (err && err.code === 'UNRESOLVED_EVENT') return 'Not offered in the SportyBet schedule';
  if (err && err.code === 'UNSUPPORTED_MARKET') return 'Market not available on SportyBet';
  return 'Unavailable on SportyBet';
}

async function generatePageSportybetCode(input) {
  const body = input || {};
  let source = String(body.source || '1x2').toLowerCase();
  if (source === 'homepage') source = 'home';
  if (source !== 'home' && source !== '1x2' && source !== 'perfect-record') {
    throw serviceError('Unknown page source.', 'INVALID_SOURCE', 400);
  }

  const rawDate = String(body.date || '').trim();
  const requestedDate = resolveDate(rawDate);
  const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
  const league = normalise(body.league);
  const cacheKey = source + '|' + requestedDate + '|' + league + '|' + (explicitDate ? 'e' : 'r');
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const rows = rowsForSource(source);
  let selectedDate = requestedDate;
  let filtered = rows.filter(function (row) {
    if (selectedDate && String((row && row.date) || '') !== selectedDate) return false;
    if (league && normalise((row && row.league) || '') !== league) return false;
    return true;
  });

  if (!filtered.length && !explicitDate) {
    const latest = latestDate(rows);
    if (latest && latest !== selectedDate) {
      selectedDate = latest;
      filtered = rows.filter(function (row) {
        if (String((row && row.date) || '') !== selectedDate) return false;
        if (league && normalise((row && row.league) || '') !== league) return false;
        return true;
      });
    }
  }

  const candidates = filtered
    .map(function (row) { return buildLeg(row, source); })
    .filter(Boolean)
    .sort(function (a, b) {
      const ap = TIP_PRIORITY[a.tip] == null ? 9 : TIP_PRIORITY[a.tip];
      const bp = TIP_PRIORITY[b.tip] == null ? 9 : TIP_PRIORITY[b.tip];
      return ap - bp;
    });

  const legs = candidates.slice(0, MAX_CANDIDATES);
  const cappedCount = Math.max(0, candidates.length - legs.length);
  const skipped = [];
  const available = [];

  for (const leg of legs) {
    try {
      await resolveLeg(leg, 'sportybet');
      available.push(leg);
    } catch (err) {
      skipped.push({ match: leg.match, tip: leg.tip, reason: shortReason(err) });
    }
  }

  let result;
  if (!available.length) {
    result = {
      success: false,
      status: 404,
      error: 'No predictions from this page are currently available on SportyBet.',
      code: 'NO_AVAILABLE_MATCHES',
      source: source,
      date: selectedDate,
      requestedDate: requestedDate,
      totalCandidates: candidates.length,
      cappedCount: cappedCount,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 20)
    };
  } else {
    const created = await createCodeFromLegs({ bookmaker: 'sportybet', legs: available });
    result = Object.assign({}, created, {
      success: true,
      source: source,
      date: selectedDate,
      requestedDate: requestedDate,
      totalCandidates: candidates.length,
      cappedCount: cappedCount,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 20)
    });
  }

  cacheSet(cacheKey, result);
  return result;
}

module.exports = { generatePageSportybetCode };
