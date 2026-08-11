const axios = require('axios');

const FOREBET_LIVE_URL = 'https://www.forebet.com/en/live-football-tips';
const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;
// Escalating backoff when Forebet returns 429/403: 5 -> 10 -> 15 min.
const FOREBET_BLOCK_BASE_MS = 5 * 60 * 1000;
const FOREBET_BLOCK_MAX_MS = 15 * 60 * 1000;
// Small random jitter per cycle so the 5-minute cadence is not a fixed,
// easily-fingerprinted pattern.
const SCRAPE_JITTER_MS = 45 * 1000;

let liveCache = null;
let isScraping = false;
let scrapeTimer = null;
let forebetBlockedUntil = 0;
let forebetBlockAttempts = 0;

function isForebetBlocked() {
  return Date.now() < forebetBlockedUntil;
}

function markForebetBlocked(status) {
  const attempts = forebetBlockAttempts + 1;
  forebetBlockAttempts = attempts;
  const cooldownMs = Math.min(FOREBET_BLOCK_MAX_MS, FOREBET_BLOCK_BASE_MS * Math.pow(2, attempts - 1));
  forebetBlockedUntil = Date.now() + cooldownMs;
  console.warn('[forebet-live] Upstream block detected (HTTP ' + status + ') — backing off ' + Math.round(cooldownMs / 60000) + ' min (attempt ' + attempts + ')');
}

function resetForebetBlock() {
  if (forebetBlockAttempts === 0 && forebetBlockedUntil === 0) return;
  forebetBlockAttempts = 0;
  forebetBlockedUntil = 0;
  console.log('[forebet-live] Upstream healthy again — block cleared');
}

function normaliseTeam(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLiveMinute(text) {
  const t = String(text || '').trim();
  if (t === 'HT') return 45;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseScore(text) {
  const m = String(text || '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}

function parsePercent(text) {
  const n = parseInt(String(text || '').replace('%', '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseOdds(text) {
  const n = parseFloat(String(text || '').replace('-', '').trim());
  return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
}

function parseAvgGoals(text) {
  const n = parseFloat(String(text || '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseMatchUrl(href) {
  if (!href) return null;
  const m = String(href).match(/\/en\/football\/matches\/(.+)/);
  return m ? m[1] : null;
}

function parseHTML(html) {
  let cheerio;
  try {
    cheerio = require('cheerio');
  } catch (e) {
    console.warn('[forebet-live] Cheerio not available:', e.message);
    return [];
  }
  const $ = cheerio.load(html);
  const matches = [];

  $('.schema .rcnt').each(function () {
    const $row = $(this);
    const homeEl = $row.find('.homeTeam [itemprop="name"]');
    const awayEl = $row.find('.awayTeam [itemprop="name"]');
    const home = (homeEl.text() || $row.find('.homeTeam').text()).trim();
    const away = (awayEl.text() || $row.find('.awayTeam').text()).trim();

    if (!home || !away) return;

    const probSpans = $row.find('.fprc span');
    const homeProb = parsePercent(probSpans.eq(0).text());
    const drawProb = parsePercent(probSpans.eq(1).text());
    const awayProb = parsePercent(probSpans.eq(2).text());

    const prediction = ($row.find('.forepr').text() || '').trim();

    const avgGoals = parseAvgGoals($row.find('.avg_sc').text());

    const preMatchOddsEls = $row.find('.prmod .haodd span');
    const preMatchOdds = {
      home: parseOdds(preMatchOddsEls.eq(0).text()),
      draw: parseOdds(preMatchOddsEls.eq(1).text()),
      away: parseOdds(preMatchOddsEls.eq(2).text())
    };

    const minute = parseLiveMinute($row.find('.l_min').text());
    const fullScore = parseScore($row.find('.l_scr').text());
    const htScore = parseScore($row.find('.ht_scr').text());

    const league = ($row.find('.shortTag').text() || '').trim();
    const flagSrc = $row.find('.flsc').attr('src') || '';
    const countryMatch = flagSrc.match(/\/fc\/([^.]+)\./);
    const country = countryMatch ? countryMatch[1].toUpperCase() : '';

    const favEl = $row.find('.nofav, .fav_icon');
    const matchId = favEl.attr('id') || '';

    const matchUrl = $row.find('.tnmscn').attr('href') || '';

    matches.push({
      matchId,
      home,
      away,
      homeNormal: normaliseTeam(home),
      awayNormal: normaliseTeam(away),
      league,
      country,
      minute,
      score: fullScore,
      htScore,
      probabilities: { home: homeProb, draw: drawProb, away: awayProb },
      prediction,
      avgGoals,
      preMatchOdds,
      matchUrl: parseMatchUrl(matchUrl)
    });
  });

  return matches;
}

async function scrapeForebetLive() {
  if (isScraping) return liveCache;
  if (isForebetBlocked()) {
    console.log('[forebet-live] Skipping scrape — upstream block cooldown active (' + Math.ceil((forebetBlockedUntil - Date.now()) / 60000) + ' min left)');
    return liveCache;
  }
  isScraping = true;

  try {
    const res = await axios.get(FOREBET_LIVE_URL, {
      timeout: 20000,
      validateStatus: function () { return true; },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate'
      }
    });
    if (res.status === 429 || res.status === 403) {
      markForebetBlocked(res.status);
    } else if (res.status === 200 && typeof res.data === 'string' && res.data.length > 1000) {
      resetForebetBlock();
      const matches = parseHTML(res.data);
      liveCache = {
        fetchedAt: new Date().toISOString(),
        matchCount: matches.length,
        matches
      };
      console.log('[forebet-live] Scraped', matches.length, 'live matches');
    } else {
      console.warn('[forebet-live] Unexpected response (HTTP ' + res.status + ') or content too short/not HTML');
    }
  } catch (e) {
    console.warn('[forebet-live] Scrape failed:', e.message);
  }

  isScraping = false;
  return liveCache;
}

function getCachedLive() {
  return liveCache;
}

function scheduleNextScrape() {
  // Jittered delay: each cycle waits 5 min plus a random +-45s so the scrape
  // cadence is not a fixed, easily-fingerprinted pattern.
  const jitterMs = Math.round((Math.random() * 2 - 1) * SCRAPE_JITTER_MS);
  const delayMs = Math.max(1000, SCRAPE_INTERVAL_MS + jitterMs);
  scrapeTimer = setTimeout(function () {
    scrapeForebetLive();
    scheduleNextScrape();
  }, delayMs);
}

function startLiveScrapeLoop() {
  if (scrapeTimer) return;
  console.log('[forebet-live] Starting scrape loop (every 5 min with +/-' + Math.round(SCRAPE_JITTER_MS / 1000) + 's jitter)');
  scrapeForebetLive();
  scheduleNextScrape();
}

module.exports = { scrapeForebetLive, getCachedLive, startLiveScrapeLoop, parseHTML, normaliseTeam };
