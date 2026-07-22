const { executablePath, args } = require('../config/puppeteer');
const axios = require('axios');

const FOREBET_LIVE_URL = 'https://www.forebet.com/en/live-football-tips';
const SCRAPE_INTERVAL_MS = 5 * 60 * 1000;

let liveCache = null;
let isScraping = false;
let scrapeTimer = null;

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
  const cheerio = require('cheerio');
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
  isScraping = true;

  let html = null;

  try {
    const res = await axios.get(FOREBET_LIVE_URL, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate'
      }
    });
    html = res.data;
    if (typeof html === 'string' && html.length > 1000) {
      console.log('[forebet-live] Axios loaded page, length:', html.length);
    } else {
      html = null;
    }
  } catch (e) {
    console.warn('[forebet-live] Axios failed:', e.message);
  }

  if (!html) {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      console.warn('[forebet-live] Puppeteer not available:', e.message);
      isScraping = false;
      return liveCache;
    }

    let browser;
    try {
      browser = await puppeteer.launch({ headless: true, executablePath, args });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      await page.goto(FOREBET_LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('.schema .rcnt', { timeout: 15000 }).catch(function () {});

      html = await page.content();
      console.log('[forebet-live] Puppeteer loaded page, length:', html.length);
    } catch (error) {
      console.warn('[forebet-live] Puppeteer scrape failed:', error.message);
    } finally {
      if (browser) await browser.close().catch(function () {});
    }
  }

  if (html) {
    const matches = parseHTML(html);
    liveCache = {
      fetchedAt: new Date().toISOString(),
      matchCount: matches.length,
      matches
    };
    console.log('[forebet-live] Scraped', matches.length, 'live matches');
  }

  isScraping = false;
  return liveCache;
}

function getCachedLive() {
  return liveCache;
}

function startLiveScrapeLoop() {
  if (scrapeTimer) return;
  console.log('[forebet-live] Starting scrape loop (every 5 min)');
  scrapeForebetLive();
  scrapeTimer = setInterval(scrapeForebetLive, SCRAPE_INTERVAL_MS);
}

module.exports = { scrapeForebetLive, getCachedLive, startLiveScrapeLoop, parseHTML, normaliseTeam };
