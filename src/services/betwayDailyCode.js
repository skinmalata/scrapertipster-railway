'use strict';

// Daily Betway booking code for the flashing "Betway code" banner on the
// homepage and prediction pages. The codes live in data/betway-daily-code.json
// keyed by Africa/Lagos date, so the operator adds one line each day. When a
// code for today is missing, the banner shows "not available yet" instead of
// exposing a stale code.
//
// The file is small and re-read at most once per minute; an unavailable file
// or malformed JSON simply yields no code (banner falls back to a friendly
// message).

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'betway-daily-code.json');
const TIME_ZONE = 'Africa/Lagos';
const CACHE_TTL_MS = 60 * 1000;

let cache = null;
let cacheAt = 0;

function dayKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(value ? new Date(value) : new Date());
  const values = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
}

function load() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[betway-code] Could not load:', err.message);
    cache = {};
  }
  cacheAt = now;
  return cache;
}

function getToday() {
  const map = load();
  const today = dayKey();
  const raw = map[today];
  return {
    date: today,
    code: typeof raw === 'string' && raw.trim() ? raw.trim() : null
  };
}

module.exports = { getToday, dayKey };