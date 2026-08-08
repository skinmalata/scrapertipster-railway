'use strict';

// Live football matches currently on air at 1xbet, from 1xbet's own
// server-rendered live page. 1xbet streams top-league matches to registered
// users, and their /en/live/football page embeds a JSON-LD SportsEvent block
// with one entry per currently-live match plus a deep link straight to that
// match's live view, so we surface a "Watch live on 1xBet" button that drops
// the reader straight into the relevant broadcast.
//
// Only the featured live matches are server-rendered (the bulk of the list is
// client-side), so this returns the matches 1xbet itself is highlighting right
// now, not a full schedule. That is intentional: these are exactly the matches
// worth linking and they are guaranteed to exist when clicked.

const cheerio = require('cheerio');
const { getJson, BROWSER_UA } = require('./http');

// Candidate URLs, tried in order. 1xbet's CDN serves datacenter/direct-fetch
// clients a different (often challenge) page on some hosts, so we attempt more
// than one entry point and fall back if the first yields no live fixtures.
const ONE_XBET_LIVE = 'https://1xbet.ng/en/live/football';
const ONE_XBET_LIVE_CANDIDATES = [
  'https://1xbet.ng/en/live/football',
  'https://1xbet.com/en/live/football',
  'https://1xbetaff.net/en/live/football'
];

const CACHE_TTL_MS = 60 * 1000;

const CACHE_MAX = 20;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), value: value });
}

function oneXbetHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

function splitTeams(name) {
  const parts = String(name || '').split(/\s+-\s+/).map(function (s) { return s.trim(); });
  return parts.length === 2 && parts[0] && parts[1] ? parts : null;
}

function buildEvent(home, away, league, start, watchUrl) {
  const m = /\/live\/football\/[^/]+\/(\d+)-/.exec(String(watchUrl || ''));
  const eventId = m ? m[1] : '';
  return { eventId: eventId, home: home, away: away, league: league || '', start: start || '', watchUrl: watchUrl || '' };
}

// Parse the JSON-LD SportsEvent blocks from 1xbet's live page.
function parseLiveMatches(html) {
  const $ = cheerio.load(html);
  const matches = new Map();

  $('script[type="application/ld+json"]').each(function () {
    let data;
    try {
      data = JSON.parse($(this).text());
    } catch (e) {
      return;
    }
    const items = Array.isArray(data) ? data : [data];
    items.forEach(function (item) {
      if (!item || item['@type'] !== 'SportsEvent') return;
      const pair = splitTeams(item.name);
      if (!pair) return;
      const league = item.organizer && item.organizer.name ? item.organizer.name : '';
      const watchUrl = item.url || '';
      if (!/^https?:\/\/1xbet\.(ng|com)\/en\/live\/football\//.test(watchUrl)) return;
      const ev = buildEvent(pair[0], pair[1], league, item.startDate || '', watchUrl);
      if (ev.eventId && !matches.has(ev.eventId)) matches.set(ev.eventId, ev);
    });
  });

  return Array.from(matches.values());
}

// Live matches currently highlighted by 1xbet, with the deep links needed to
// jump into the match view. Cached for a minute so the frontend can refresh
// without hammering 1xbet.
async function getLiveMatches() {
  const key = 'live';
  const cached = cacheGet(key);
  if (cached) return cached;

  const result = await fetchLiveMatches();
  cacheSet(key, result);
  return result;
}

async function fetchLiveMatches() {
  const probe = { attempts: [], source: '', total: 0 };
  for (const url of ONE_XBET_LIVE_CANDIDATES) {
    const attempt = await fetchAttempt(url);
    probe.attempts.push({ url: url.replace('https://', ''), note: attempt.note, bytes: attempt.bytes, events: attempt.events, sportsEvents: attempt.sportsEvents });
    if (attempt.matches.length > 0) {
      probe.source = url;
      probe.total = attempt.matches.length;
      return { generatedAt: new Date().toISOString(), matches: attempt.matches, probe: probe };
    }
  }
  throw new Error('No live fixtures returned by 1xBet (' + probe.attempts.map(function (a) { return a.url + ':' + a.note; }).join('; ') + ').');
}

function looksBlocked(html) {
  if (!html) return 'empty-response';
  if (/Just a moment|Enable JavaScript and cookies to continue|cf-chl|challenge-platform|Pardon Our Interruption/i.test(html)) return 'cloudflare-challenge';
  if (/Access denied|Your IP has been blocked|restricted in your country|geo-blocked/i.test(html)) return 'blocked';
  return '';
}

async function fetchAttempt(url) {
  let raw;
  try {
    raw = await getJson(url, oneXbetHeaders(), 30000);
  } catch (err) {
    return { bytes: 0, events: 0, sportsEvents: 0, matches: [], note: 'network-error' };
  }
  const html = String(raw || '');
  const blocked = looksBlocked(html);
  const matches = parseLiveMatches(html);
  return {
    bytes: html.length,
    events: matches.length,
    sportsEvents: (html.match(/SportsEvent/g) || []).length,
    matches: matches,
    note: blocked || (matches.length ? 'ok' : 'no-jsonld')
  };
}

module.exports = { getLiveMatches, parseLiveMatches };