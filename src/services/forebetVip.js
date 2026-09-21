'use strict';

// Forebet VIP pro-tips engine.
//
// The VIP system uses Forebet as its single source of truth. Forebet serves a
// Cloudflare managed challenge (HTTP 403 "Just a moment..." to non-browser
// HTTP clients), which neither datacenter IPs nor canned axios requests can
// pass. The daily scrape therefore runs from a residential machine (Task
// Scheduler wrapper: scripts/scrape-forebet-vip.ps1) and, when Forebet
// challenges the plain HTTP request, transparently falls back to a real
// Chrome session via puppeteer-core (resolved from src/config/puppeteer's
// detected binary) that clears the challenge. The runner then pushes a
// committed forebet-vip-cache.json. The Node API serves VIP picks from that
// cache to authenticated Pro members only (/api/vip). Static Pages never carry
// the picks, so the tips cannot leak outside the paywall.
//
// Confidence score (0-100):
//   - algorithm certainty  40 pts (margin between top-2 Forebet probabilities)
//   - edge vs bookmakers   30 pts (alg implied prob minus market implied prob)
//   - form + head-to-head  15 pts (recent form table + H2H confirmation)
//   - market agreement     15 pts (Forebet pick matches the market favourite)
// Gate: picks are published only when confidence >= 55 (and, when real
// bookmaker odds are available, the edge is positive).

const axios = require('axios');

let _browserPromise = null;

// Lazily launch a real Chrome session (via puppeteer-core, a devDependency)
// used ONLY as a fetch fallback when Forebet serves a Cloudflare challenge to
// plain HTTP. The browser is reused across every fetch in a run and closed at
// the end, so cookies (cf_clearance) survive across detail pages.
async function getVipBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const puppeteer = require('puppeteer-core');
    const { executablePath, args } = require('../config/puppeteer');
    return puppeteer.launch({
      executablePath,
      headless: 'new',
      args,
      ignoreHTTPSErrors: true
    });
  })().catch((err) => {
    _browserPromise = null;
    throw err;
  });
  return _browserPromise;
}

async function closeVipBrowser() {
  if (_browserPromise) {
    const b = await _browserPromise.catch(() => null);
    _browserPromise = null;
    if (b) await b.close().catch(() => {});
  }
}

function isCloudflareChallenge(html) {
  return typeof html === 'string' && /Just a moment\.\.\.|<title>Just a moment/.test(html.slice(0, 5000));
}

// Fetch + render a Forebet page through a real browser so the Cloudflare
// managed challenge can be solved. Drains the challenge by waiting until the
// challenge interstitial has gone and the requested selector has rendered.
async function fetchWithBrowser(url, opts) {
  const waitRows = !!(opts && opts.waitRows);
  const browser = await getVipBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const started = Date.now();
    let html = await page.content();
    let title = await page.title().catch(() => '');
    // Cloudflare managed challenge needs a few seconds to solve; poll until
    // the interstitial has cleared (or we run out of patience).
    let tries = 0;
    while ((resp && resp.status() === 403) || isCloudflareChallenge(html) || title === 'Just a moment...') {
      await new Promise((r) => setTimeout(r, 3000));
      html = await page.content();
      title = await page.title().catch(() => '');
      tries += 1;
      if (Date.now() - started > 60000 || tries > 20) break;
    }
    // List pages render rows client-side after the challenge; wait for them.
    if (waitRows) {
      await page.waitForFunction(
        () => document.querySelectorAll('.schema .rcnt').length > 0,
        { timeout: 45000 }
      ).catch(() => {});
    } else {
      await new Promise((r) => setTimeout(r, 700));
    }
    html = await page.content();
    if (isCloudflareChallenge(html) || html.length < 500) {
      throw new Error('Forebet challenge not cleared via real Chrome (tries=' + tries + ')');
    }
    return html;
  } finally {
    await page.close().catch(() => {});
  }
}

const FOREBET_TODAY_URL = 'https://www.forebet.com/en/football-tips-and-predictions-for-today';
const FOREBET_DATE_URL = 'https://www.forebet.com/en/football-predictions/predictions-1x2/';
const FOREBET_MATCH_BASE = 'https://www.forebet.com';

const MIN_CONFIDENCE = 55;
// Team-to-score market is only published when the model's estimated fair odd
// is above this floor - below it the market is too short to be worth a VIP tip.
const MIN_TEAM_SCORE_ODD = 1.3;
const SCRAPE_TIMEOUT_MS = 25000;
// Per-fixture detail pages add form/H2H/preview (max +15 confidence) but cost
// one browser navigation each, which is slow against Forebet's Cloudflare
// challenge. Off by default: the list page already yields probabilities and
// average odds, which is enough for confidence, edge, best odds and the
// team-to-score model. Set VIP_ENRICH_DETAIL=1 to opt in.
const ENRICH_DETAIL = process.env.VIP_ENRICH_DETAIL === '1';
// Hard wall-clock budget for a whole scrape run. When it is exceeded the run
// stops starting new work and publishes whatever it has already scored, so the
// scheduled task can never run long. Default 3 minutes.
const SCRAPE_BUDGET_MS = Number(process.env.VIP_SCRAPE_BUDGET_MS || 180000);
let _deadline = 0;
function budgetExceeded() {
  return _deadline > 0 && Date.now() > _deadline;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function normaliseTeam(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePercent(text) {
  const n = parseInt(String(text || '').replace('%', '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFloatSafe(text) {
  const n = parseFloat(String(text || '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseOdds(text) {
  const n = parseFloatSafe(String(text || '').replace('-', '').trim());
  return n > 1 ? Number(n.toFixed(2)) : null;
}

function parseMatchUrl(href) {
  if (!href) return null;
  const m = String(href).match(/\/en\/football\/matches\/(.+)/);
  return m ? m[1] : null;
}

function normalisePredictions(prob) {
  const total = prob.home + prob.draw + prob.away;
  if (total > 100 && total > 0) {
    return {
      home: Number(((prob.home / total) * 100).toFixed(1)),
      draw: Number(((prob.draw / total) * 100).toFixed(1)),
      away: Number(((prob.away / total) * 100).toFixed(1))
    };
  }
  return prob;
}

function predictionLabel(prob) {
  const p = normalisePredictions(prob);
  if (p.home > p.draw && p.home > p.away) return '1';
  if (p.away > p.draw && p.away > p.home) return '2';
  return 'X';
}

function impliedFromOdds(odds) {
  if (!odds || !odds.home || !odds.draw || !odds.away) return null;
  const inv = (1 / odds.home) + (1 / odds.draw) + (1 / odds.away);
  if (inv <= 0) return null;
  return {
    home: Number(((1 / odds.home) / inv * 100).toFixed(1)),
    draw: Number(((1 / odds.draw) / inv * 100).toFixed(1)),
    away: Number(((1 / odds.away) / inv * 100).toFixed(1))
  };
}

// Probability that a Poisson(lambda) team scores at least one goal:
// P(X >= 1) = 1 - e^(-lambda).
function poissonAtLeastOne(lambda) {
  return 1 - Math.exp(-lambda);
}

// Estimate team-to-score props from expected goals. A market qualifies only
// when the estimated fair odd is at least MIN_TEAM_SCORE_ODD, so value bets
// are never diluted by ultra-short favourites.
function estimateTeamScoreProps({ expHome, expAway, probs, avgGoals }) {
  const props = [];
  const push = (side, team, lambda) => {
    const scoreAtLeastOne = poissonAtLeastOne(lambda);
    const fairProb = Math.min(0.98, Math.max(0.05, scoreAtLeastOne));
    const fairOdd = Number((1 / fairProb).toFixed(2));
    if (fairOdd >= MIN_TEAM_SCORE_ODD && fairOdd < 1 / 0.05) {
      props.push({
        market: 'team-to-score',
        side,
        team,
        prob: Number((fairProb * 100).toFixed(1)),
        estimatedOdd: fairOdd,
        qualifies: fairOdd >= MIN_TEAM_SCORE_ODD
      });
    }
  };
  push('home', 'home', expHome);
  push('away', 'away', expAway);
  return props;
}

function bestAcross(books, pick) {
  const oddsKey = pick === '1' ? 'home' : pick === '2' ? 'away' : 'draw';
  let best = null;
  for (const b of books || []) {
    const v = b.odds && b.odds[oddsKey];
    if (v && (!best || v > best)) best = v;
  }
  return best || null;
}

function meanOdds(books) {
  if (!books || books.length === 0) return null;
  const acc = { home: 0, draw: 0, away: 0, n: 0 };
  for (const b of books) {
    if (b.odds && b.odds.home && b.odds.draw && b.odds.away) {
      acc.home += b.odds.home;
      acc.draw += b.odds.draw;
      acc.away += b.odds.away;
      acc.n += 1;
    }
  }
  if (acc.n === 0) return null;
  return {
    home: Number((acc.home / acc.n).toFixed(2)),
    draw: Number((acc.draw / acc.n).toFixed(2)),
    away: Number((acc.away / acc.n).toFixed(2))
  };
}

function computeConfidence({ probs, pick, books, form, h2h }) {
  const p = normalisePredictions(probs || { home: 0, draw: 0, away: 0 });
  const top = Math.max(p.home, p.draw, p.away);
  const order = [p.home, p.draw, p.away].sort((a, b) => b - a);
  const margin = top - order[1];

  let algScore = Math.min(40, margin * 2.5);

  const market = impliedFromOdds(books && books.length ? meanOdds(books) : null);
  const marketPick = market ? predictionLabel(market) : null;
  let edgePoints = 0;
  let edge = null;
  if (market && marketPick) {
    const algProb = pick === '1' ? p.home : pick === '2' ? p.away : p.draw;
    const mktProb = marketPick === '1' ? market.home : marketPick === '2' ? market.away : market.draw;
    edge = Number((algProb - mktProb).toFixed(1));
    edgePoints = Math.min(30, Math.max(0, edge));
  }

  let formScore = 0;
  if (form) {
    const homePct = typeof form.homeRecently === 'number' ? form.homeRecently : null;
    const awayPct = typeof form.awayRecently === 'number' ? form.awayRecently : null;
    const relevant = pick === '1' ? homePct : pick === '2' ? awayPct : null;
    if (relevant !== null) {
      formScore = Math.min(12, Math.max(0, relevant - 50) * 0.3);
    }
    if (typeof h2h === 'number' && h2h > 0) {
      formScore += Math.min(3, h2h);
    }
  }

  let marketScore = 0;
  if (marketPick === pick) {
    marketScore = 10;
  } else if (market && pick === 'X') {
    marketScore = 3;
  }
  const confidence = Math.round(Math.min(100, algScore + edgePoints + formScore + marketScore));

  const hasRealOdds = Array.isArray(books) && books.length > 0;
  const bestOdds = bestAcross(books, pick);
  const passesGate = confidence >= MIN_CONFIDENCE && (!hasRealOdds || edge === null || edge > 0);

  return { confidence, edge, bestOdds, marketPick, passesGate, margin: Number(margin.toFixed(1)) };
}

function parseMatchList(html) {
  let cheerio;
  try {
    cheerio = require('cheerio');
  } catch (e) {
    throw new Error('cheerio unavailable: ' + e.message);
  }
  const $ = cheerio.load(html);
  const matches = [];

  $('.schema .rcnt').each(function () {
    const $row = $(this);
    const home = ($row.find('.homeTeam [itemprop="name"]').text() || $row.find('.homeTeam').text()).trim();
    const away = ($row.find('.awayTeam [itemprop="name"]').text() || $row.find('.awayTeam').text()).trim();
    if (!home || !away) return;

    const probSpans = $row.find('.fprc span');
    const probs = {
      home: parsePercent(probSpans.eq(0).text()),
      draw: parsePercent(probSpans.eq(1).text()),
      away: parsePercent(probSpans.eq(2).text())
    };

    const predictionText = ($row.find('.forepr').text() || '').trim();
    const avgGoals = parseFloatSafe($row.find('.avg_sc').text());

    const oddsEls = $row.find('.prmod .haodd span');
    const avgOdds = {
      home: parseOdds(oddsEls.eq(0).text()),
      draw: parseOdds(oddsEls.eq(1).text()),
      away: parseOdds(oddsEls.eq(2).text())
    };

    const league = ($row.find('.shortTag').text() || '').trim();
    const favEl = $row.find('.nofav, .fav_icon');
    const matchId = favEl.attr('id') || '';
    const matchUrl = parseMatchUrl($row.find('.tnmscn').attr('href') || '');

    const timeText = ($row.find('.rcnt .datetime, .rcnt .min').text() || '').trim();

    matches.push({
      matchId,
      home,
      away,
      league,
      time: timeText,
      probs,
      predictionText,
      avgGoals,
      avgOdds,
      matchUrl
    });
  });

  return matches;
}

function parseMatchDetail(html) {
  let cheerio;
  try {
    cheerio = require('cheerio');
  } catch (e) {
    return {};
  }
  const $ = cheerio.load(html);

  const books = [];
  $('.odds .tr:not(.empty)').each(function () {
    const $row = $(this);
    const name = ($row.find('.btb-live td:first, .bookmaker, .ag_bookmaker').first().text() || '').trim();
    const nums = [];
    $row.find('td').each(function () {
      const t = $(this).text().trim();
      const o = parseOdds(t);
      if (o) nums.push(o);
      else if (t) nums.push(null);
    });
    const odds = { home: nums[0] || null, draw: nums[1] || null, away: nums[2] || null };
    if (odds.home || odds.draw || odds.away) {
      books.push({ name, odds });
    }
  });
  if (books.length === 0) {
    $('.bookmakers .row').each(function () {
      const $row = $(this);
      const name = ($row.find('.bookmaker-name, .b-name').text() || '').trim();
      const cells = $row.find('.odds-cell, .o, .odds');
      const odds = {
        home: parseOdds(cells.eq(0).text()),
        draw: parseOdds(cells.eq(1).text()),
        away: parseOdds(cells.eq(2).text())
      };
      if (odds.home || odds.draw || odds.away) {
        books.push({ name, odds });
      }
    });
  }

  const previewText = $('.prev-up-text, .prev_text, #preview_text').first().text();

  let form = null;
  const formRows = [];
  $('.form, .FormTable').first().each(function () {
    $(this).find('tr').each(function () {
      const cells = [];
      $(this).find('td').each(function () {
        const cls = $(this).attr('class') || '';
        const t = $(this).text().trim();
        if (cls.indexOf('ago') === -1 && t) cells.push(t.substring(0, 1));
      });
      if (cells.length >= 5) formRows.push(cells.join(''));
    });
  });
  if (formRows.length >= 2) {
    const homeRecently = formRows[0].replace(/[^WD]/gi, '').length;
    const awayRecently = formRows[1].replace(/[^WD]/gi, '').length;
    const homeTotal = formRows[0].length || 1;
    const awayTotal = formRows[1].length || 1;
    form = {
      homeForm: formRows[0],
      awayForm: formRows[1],
      homeRecently: Math.round((homeRecently / homeTotal) * 100),
      awayRecently: Math.round((awayRecently / awayTotal) * 100)
    };
  }

  let h2h = null;
  $('.h2h_fix, .h2h, #h2h').each(function () {
    const rows = [];
    $(this).find('tr').each(function () {
      const t = ($(this).text() || '').replace(/\s+/g, ' ').trim();
      if (t) rows.push(t);
    });
    if (rows.length >= 2) {
      const joined = rows.join(' ');
      const homeW = (joined.match(/\bH\b|\bW\b/g) || []).length;
      h2h = Math.min(5, homeW);
    }
  });

  let expGoals = null;
  $('.exp_goal, #exp_goal, .expected-goals, .avg_goals_home, .sh_info')
    .first()
    .parent()
    .find('span, b, i, em')
    .each(function () {
      const t = parseFloatSafe($(this).text());
      if (t > 0 && t < 10) {
        if (!expGoals) expGoals = { home: null, away: null };
        if (expGoals.home === null) expGoals.home = t;
        else if (expGoals.away === null) expGoals.away = t;
      }
    });

  return {
    books,
    previewText,
    form,
    h2h,
    expGoals: (expGoals && expGoals.home !== null && expGoals.away !== null) ? expGoals : null
  };
}

let siteChallenged = false;

async function fetchUrl(url, opts) {
  let res = null;
  if (!siteChallenged) {
    try {
      res = await axios.get(url, {
        timeout: SCRAPE_TIMEOUT_MS,
        validateStatus: function () { return true; },
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate'
        }
      });
    } catch (e) {
      res = null;
    }
    const blocked = !res || res.status === 403 || res.status === 429 || (res.status === 200 && isCloudflareChallenge(res.data));
    if (!blocked) {
      if (res.status !== 200 || typeof res.data !== 'string' || res.data.length < 500) {
        throw new Error('Unexpected response (HTTP ' + res.status + ')');
      }
      return res.data;
    }
    // Site serves a Cloudflare challenge (or hard-block) to plain HTTP; from
    // here on, go straight to the real browser instead of retrying axios per
    // page. This is the hot path for every fixture on a challenged site.
    siteChallenged = true;
  }
  return fetchWithBrowser(url, opts);
}

async function enrichMatch(match) {
  if (!match.matchUrl) {
    return Object.assign({}, match, { detail: null, confidence: 0, edge: null, passesGate: false });
  }
  try {
    const html = await fetchUrl(FOREBET_MATCH_BASE + '/en/football/matches/' + match.matchUrl);
    const detail = parseMatchDetail(html);
    return Object.assign({}, match, { detail });
  } catch (e) {
    console.warn('[forebetVip] Detail scrape failed for ' + match.home + ' v ' + match.away + ': ' + e.message);
    return Object.assign({}, match, { detail: null });
  }
}

// Enrichment is deliberately sequential: Cloudflare re-challenges parallel
// tabs, so one shared browser session handling pages one-at-a-time is the
// reliable path. Fixtures whose preliminary score (without the detail-only
// form/H2H bonus) cannot possibly reach the gate are skipped entirely.
async function enrichAll(matches, shouldEnrich) {
  const results = [];
  for (const match of matches) {
    if (budgetExceeded()) {
      results.push(Object.assign({}, match, { detail: null, detailOverBudget: true }));
      continue;
    }
    if (shouldEnrich && !shouldEnrich(match)) {
      results.push(Object.assign({}, match, { detail: null, detailSkipped: true }));
    } else {
      results.push(await enrichMatch(match));
    }
  }
  return results;
}

async function scrapeDay(dateStr) {
  let url = FOREBET_DATE_URL + dateStr;
  const todayLocal = new Date().toISOString().slice(0, 10);
  const isToday = dateStr === todayLocal;
  if (isToday) url = FOREBET_TODAY_URL;

  console.log('[forebetVip] Scraping ' + dateStr + ' (' + url + ')');
  const html = await fetchUrl(url, { waitRows: true });
  const raw = parseMatchList(html);
  if (raw.length === 0) {
    console.warn('[forebetVip] No matches parsed for ' + dateStr + ' (structure may have changed)');
    return [];
  }

  const listBooks = (m) => (m.avgOdds && m.avgOdds.home && m.avgOdds.draw && m.avgOdds.away)
    ? [{ name: 'forebet-avg', odds: m.avgOdds }]
    : [];
  const shouldEnrich = (match) => {
    const pick = predictionLabel(match.probs);
    const prelim = computeConfidence({ probs: match.probs, pick, books: listBooks(match), form: null, h2h: null });
    return prelim.confidence + 15 >= MIN_CONFIDENCE;
  };

  let enriched;
  if (ENRICH_DETAIL) {
    enriched = await enrichAll(raw, shouldEnrich);
    const enrichedCount = enriched.filter((m) => m.detail).length;
    console.log('[forebetVip] Parsed ' + raw.length + ' fixtures for ' + dateStr + '; enriched ' + enrichedCount + ' candidates...');
  } else {
    enriched = raw.map((m) => Object.assign({}, m, { detail: null, detailSkipped: true }));
    console.log('[forebetVip] Parsed ' + raw.length + ' fixtures for ' + dateStr + ' (list-only scoring; set VIP_ENRICH_DETAIL=1 for form/H2H detail).');
  }

  const out = [];
  for (const m of enriched) {
    const probs = m.probs;
    const pick = predictionLabel(probs);
    const detailBooks = m.detail && Array.isArray(m.detail.books) ? m.detail.books : [];
    // Fall back to Forebet's aggregated average odds from the list page when
    // the match-detail bookmaker table is unavailable, so the value edge is
    // still estimated against the market.
    let books = detailBooks;
    if (books.length === 0 && m.avgOdds && m.avgOdds.home && m.avgOdds.draw && m.avgOdds.away) {
      books = [{ name: 'forebet-avg', odds: m.avgOdds }];
    }
    const form = m.detail && m.detail.form ? m.detail.form : null;
    const h2h = m.detail && typeof m.detail.h2h === 'number' ? m.detail.h2h : null;
    const scored = computeConfidence({ probs, pick, books, form, h2h });

    let expGoals = m.detail && m.detail.expGoals ? m.detail.expGoals : null;
    if (!expGoals) {
      const pn = normalisePredictions(probs);
      const total = (pn.home + pn.away) || 1;
      expGoals = {
        home: Number(((m.avgGoals || 0) * pn.home / total).toFixed(2)),
        away: Number(((m.avgGoals || 0) * pn.away / total).toFixed(2))
      };
    }
    const teamScoreProps = estimateTeamScoreProps({
      expHome: expGoals.home,
      expAway: expGoals.away,
      probs,
      avgGoals: m.avgGoals
    });

    out.push(Object.assign({}, m, {
      pick,
      market: pick,
      confidence: scored.confidence,
      edge: scored.edge,
      bestOdds: scored.bestOdds,
      marketPick: scored.marketPick,
      margin: scored.margin,
      passesGate: scored.passesGate,
      expGoals,
      teamScoreProps,
      preview: m.detail && m.detail.previewText ? m.detail.previewText : null,
      form: form ? { home: form.homeForm, away: form.awayForm } : null,
      h2h: h2h
    }));
  }
  return out;
}

async function scrapeVip(dates) {
  const list = Array.isArray(dates) ? dates : [dates];
  const result = {};
  _deadline = Date.now() + SCRAPE_BUDGET_MS;
  try {
    for (const date of list) {
      if (budgetExceeded()) {
        console.warn('[forebetVip] Skipping ' + date + ' - scrape budget of ' + Math.round(SCRAPE_BUDGET_MS / 1000) + 's exceeded');
        result[date] = [];
        continue;
      }
      try {
        result[date] = await scrapeDay(date);
      } catch (err) {
        console.error('[forebetVip] Failed to scrape ' + date + ': ' + err.message);
        result[date] = [];
      }
    }
  } finally {
    _deadline = 0;
    await closeVipBrowser();
  }
  return result;
}

module.exports = {
  scrapeDay,
  scrapeVip,
  parseMatchList,
  parseMatchDetail,
  computeConfidence,
  estimateTeamScoreProps,
  poissonAtLeastOne,
  normaliseTeam,
  predictionLabel,
  impliedFromOdds,
  closeVipBrowser,
  MIN_CONFIDENCE,
  MIN_TEAM_SCORE_ODD
};

if (require.main === module) {
  const ymd = (shift) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(Date.now() + (shift || 0) * 86400000));
    return parts.find(p => p.type === 'year').value + '-' +
      parts.find(p => p.type === 'month').value + '-' +
      parts.find(p => p.type === 'day').value;
  };
  const dates = process.argv.slice(2).length ? process.argv.slice(2) : [ymd(0), ymd(1)];
  scrapeVip(dates).then((byDate) => {
    for (const [date, matches] of Object.entries(byDate)) {
      console.log('\n=== ' + date + ' (' + matches.length + ' fixtures) ===');
      matches.forEach(m => {
        const ts = (m.teamScoreProps || []).map(p => 'TS ' + p.team + '@' + p.estimatedOdd).join(', ');
        console.log('[' + m.pick + '] ' + m.home + ' v ' + m.away + ' | conf=' + m.confidence + ' edge=' + m.edge + ' gate=' + m.passesGate + (m.bestOdds ? ' best=' + m.bestOdds : '') + (ts ? ' | ' + ts : ''));
      });
    }
  }).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}