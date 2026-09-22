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
// VIP markets: MATCH-WINNER RECORD CERT and TEAM-TO-SCORE. Every fixture
// publishes at most ONE tip:
//   1. Match-winner record cert: a side whose recent win rate clears
//     TTS_PERFECT_FORM_PCT (90%) AND whose head-to-head ledger against this
//      opponent is 100% over at least TTS_PERFECT_H2H_MEETS (3) meetings is
//      published as "Team X to win". The records are the reasoning; the
//      model's 1X2 win probability only has to clear TTS_WIN_CERT_MIN_PROB
//      (35%) so the model never firmly expects the side to lose.
//   2. Team to score: otherwise the strongest "must score" call publishes
//      only when all of the following hold:
//      - the fair price from the Poisson split is STRICTLY above
//        MIN_TEAM_SCORE_ODD (default 1.25), and
//      - the model's scoring probability is >= TTS_MIN_PROB (62%), and
//      - the must-score composite clears MUST_SCORE_MIN: history
//        (expected-goal scoring model, max 40) + recent form win rate
//        (max 35) + head-to-head record (max 25). When detail pages were not
//        scraped the history-backed probability alone must clear
//        TTS_NO_DETAIL_PROB (75%), and
//      - form/H2H lock: the same record perfection as the cert (form >= 90%,
//        100% H2H over >= 3 meetings) may publish under the relaxed floors
//        TTS_LOCK_MIN_PROB / TTS_LOCK_MIN_ODD instead of the bars above.
// No analysis text ships with tips: members see the pick, its probability and
// the form/H2H record rows. The API strips every price field before the
// payload reaches a member.
//
// Confidence score (0-100) - kept for context and enrichment prefiltering:
//   - algorithm certainty  40 pts (margin between top-2 Forebet probabilities)
//   - edge vs bookmakers   30 pts (model prob minus market-implied prob FOR THE
//                            PICK - never compared against a different outcome)
//   - form + head-to-head  15 pts (recent WIN-rate table + H2H confirmation;
//                            detail-page only, so it only counts when
//                            detail enrichment is enabled - on by default)
//   - market agreement     10 pts (Forebet pick matches the market favourite)

const axios = require('axios');
const { lagosDate } = require('../utils/dates');

let _browserPromise = null;

// Lazily launch a real Chrome session (via puppeteer-core, a devDependency)
// used ONLY as a fetch fallback when Forebet serves a Cloudflare challenge to
// plain HTTP. The browser is reused across every fetch in a run and closed at
// the end, so cookies (cf_clearance) survive across detail pages.
async function getVipBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const puppeteer = require('puppeteer-core');
    const { executablePath } = require('../config/puppeteer');
    // Cloudflare's managed challenge needs a normal Chrome: the shared scraper
    // args (--single-process, --disable-web-security, --disable-background-
    // networking) break its worker/cookie handling, so use a clean, stable set.
    return puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled'
      ],
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
const FOREBET_HT_TODAY_URL = 'https://www.forebet.com/en/football-tips-and-predictions-for-today/predictions-ht';
const FOREBET_HT_DATE_URL = 'https://www.forebet.com/en/football-predictions/predictions-ht/';
const FOREBET_MATCH_BASE = 'https://www.forebet.com';

const MIN_CONFIDENCE = 55;
// Highest-scoring-half is a FREE market (never part of the VIP gate). It is
// derived from Forebet's half-time 1X2 probabilities: the leading half must
// clear this probability floor and at most this many picks are published per
// day, so the tab only ever shows the strongest calls.
const HSH_MIN_PROB = envNumber('HSH_MIN_PROB', 0.55, 0.05, 1);
const HSH_MAX_PICKS = Math.round(envNumber('HSH_MAX_PICKS', 12, 1, 60));
// A first-half share f is fit to Forebet's half-time 1X2 probs; the fit is
// rejected when its mean squared error is above this bound, so a bad fit can
// never publish a free-market pick it cannot reproduce.
const HSH_MAX_FIT_ERR = envNumber('HSH_MAX_FIT_ERR', 0.04, 0.005, 1);
// The fitted first-half share is pulled toward the empirical prior of how many
// goals land before half-time (~0.44) so a weak half-time signal cannot pin the
// share on the 0.20/0.80 boundary and publish absurd half splits. The
// regularizer adds REG * (share - prior)^2 to the fit error; a strong signal
// still moves the share away from the prior. Shares outside HSH_SHARE_MIN..MAX
// are not even considered.
const HSH_SHARE_PRIOR = envNumber('HSH_SHARE_PRIOR', 0.44, 0.1, 0.9);
const HSH_SHARE_REG = envNumber('HSH_SHARE_REG', 0.004, 0, 0.1);
const HSH_SHARE_MIN = envNumber('HSH_SHARE_MIN', 0.25, 0.1, 0.9);
const HSH_SHARE_MAX = envNumber('HSH_SHARE_MAX', 0.65, 0.1, 0.9);
// The leading half must clear the other half's race probability by at least
// this margin, and the match must carry at least this many expected goals, or
// the pick is not published. Together they keep the free tab honest: a call
// with a razor-thin edge, or from a low-scoring fixture, is off the board.
const HSH_MARGIN_MIN = envNumber('HSH_MARGIN_MIN', 0.05, 0.01, 0.5);
const HSH_MIN_GOALS = envNumber('HSH_MIN_GOALS', 2.2, 0.5, 8);
// Team-to-score is a VIP market. A team's scoring probability must clear
// this floor to be published as a VIP tip (default 62% - quality over
// quantity: the feed prefers fewer, stronger calls).
const TTS_MIN_PROB = envNumber('TTS_MIN_PROB', 0.62, 0.05, 0.95);
// The fair price of a team-to-score call must be STRICTLY above this floor
// (default 1.25). Below it the pick is an uninteresting ultra-short price that
// pays next to nothing for a near-certainty.
const MIN_TEAM_SCORE_ODD = envNumber('TTS_MIN_ODD', 1.25, 1.05, 10);
// Composite "must score" gate (0-100). Three signals feed it: the
// history-backed expected-goals scoring probability (max 40), the picked
// side's recent-form win rate (max 35) and head-to-head support (max 25). A
// tip only publishes when detail records (form/H2H) are available and the
// composite clears this floor (default 50 - a bit more record support than
// before the quality tightening; the prob floor already lifts modelPts).
const MUST_SCORE_MIN = envNumber('TTS_MUST_SCORE_MIN', 50, 0, 160);
// Fallback for fixtures whose detail page was not scraped (enrichment skipped
// or timed out): the history-backed scoring probability alone must clear this
// higher bar, so strong calls survive a barren detail day but weak ones never
// sneak through without form/H2H backing.
const TTS_NO_DETAIL_PROB = envNumber('TTS_NO_DETAIL_PROB', 0.75, 0.55, 0.95);
// Form/H2H lock: a side that has won (near) all its recent matches AND a 100%
// head-to-head record against this opponent is a must-score in its own right,
// so such fixtures may also publish when the expected-goals model's
// probability or fair price sit below the normal TTS bars. The lock only
// engages on genuine perfection: the recent win rate must clear this percent
// AND every recent meeting must have been won, over at least this many
// meetings. A single hot streak or thin sample is never enough.
const TTS_PERFECT_FORM_PCT = envNumber('TTS_PERFECT_FORM_PCT', 90, 50, 100);
const TTS_PERFECT_H2H_MEETS = envNumber('TTS_PERFECT_H2H_MEETS', 3, 2, 10);
const TTS_LOCK_MIN_PROB = envNumber('TTS_LOCK_MIN_PROB', 0.35, 0.05, 0.95);
const TTS_LOCK_MIN_ODD = envNumber('TTS_LOCK_MIN_ODD', 1.01, 1.01, 10);
// Match-winner record cert: the model's 1X2 win probability for the
// near-perfect side only has to clear this light floor - the records carry the
// tip, the model merely guards against a side the model firmly expects to lose.
const TTS_WIN_CERT_MIN_PROB = envNumber('TTS_WIN_CERT_MIN_PROB', 0.35, 0.1, 0.95);
// Hard per-day ceiling on published VIP tips (mirrors HSH_MAX_PICKS). The
// scrape sorts qualified picks (locked certs first, then confidence/must-score)
// and stores only the top VIP_MAX_TIPS per date. HSH picks are selected from
// the full fixture list separately, so this cap never starves the free market.
const VIP_MAX_TIPS = envNumber('VIP_MAX_TIPS', 15, 1, 200);
const SCRAPE_TIMEOUT_MS = 25000;
// Per-fixture detail pages add the form/H2H records the must-score gate now
// needs, but cost one browser navigation each, which is slow against Forebet's
// Cloudflare challenge. ON by default; set VIP_ENRICH_DETAIL=0 for list-only.
const ENRICH_DETAIL = process.env.VIP_ENRICH_DETAIL !== '0';
// Hard wall-clock budget for a whole scrape run. When it is exceeded the run
// stops starting new work and publishes whatever it has already scored, so the
// scheduled task can never run long. Default 5 minutes (detail enrichment
// needs more headroom than the old list-only run).
const SCRAPE_BUDGET_MS = Math.max(1000, envNumber('VIP_SCRAPE_BUDGET_MS', 300000, 1000, 3600000));
let _deadline = 0;
function budgetExceeded() {
  return _deadline > 0 && Date.now() > _deadline;
}

// Parse and clamp a positive numeric env var. Garbage (NaN) falls back to the
// default instead of silently disabling a market or the whole run budget.
function envNumber(key, def, min, max) {
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw)) return def;
  return Math.min(max, Math.max(min, raw));
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

// --- Highest-scoring-half model (free market) -----------------------------
//
// Forebet publishes half-time 1X2 probabilities per fixture. The market only
// needs the split of a match's total expected goals (Forebet's avg goals)
// between the two halves: the "which half scores more" comparison depends on
// the first-half total and second-half total alone, not on the home/away split.
//
// The half-time 1X2 probabilities pin down the first-half total but only in
// combination with the match's home/away strength, so the model fixes the
// first-half home/away split to the full-match split (scaled) and fits a single
// first-half share f in [0.2, 0.8] that reproduces Forebet's HT probabilities:
//   lambdaHome1 = f * expHome, lambdaAway1 = f * expAway
// Then lambda1 = f * total, lambda2 = (1 - f) * total, and two independent
// Poisson distributions give P(1st > 2nd), P(2nd > 1st) and the tie. The
// strongest call is published when it clears HSH_MIN_PROB. Always free.
const POISSON_K = 10;
const _factorial = [1];
for (let i = 1; i <= POISSON_K + 1; i++) _factorial[i] = _factorial[i - 1] * i;

function poissonPmf(lambda, k) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / _factorial[k];
}

// P(A > B), P(A == B), P(A < B) for independent Poissons A, B.
function poissonThreeWay(lambdaA, lambdaB) {
  const pA = [], pB = [];
  for (let k = 0; k <= POISSON_K; k++) { pA.push(poissonPmf(lambdaA, k)); pB.push(poissonPmf(lambdaB, k)); }
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i <= POISSON_K; i++) {
    for (let j = 0; j <= POISSON_K; j++) {
      const q = pA[i] * pB[j];
      if (i > j) home += q; else if (i < j) away += q; else draw += q;
    }
  }
  return { home, draw, away };
}

function computeHighestScoringHalf(htProbs, expGoals, avgGoals) {
  if (!htProbs || htProbs.home == null || htProbs.draw == null || htProbs.away == null) return null;
  const ph = htProbs.home / 100, pd = htProbs.draw / 100, pa = htProbs.away / 100;
  if (ph + pd + pa <= 0) return null;

  const expHomeRaw = expGoals && expGoals.home > 0 ? expGoals.home : 0;
  const expAwayRaw = expGoals && expGoals.away > 0 ? expGoals.away : 0;
  let total = Number(avgGoals) > 0 ? Number(avgGoals) : expHomeRaw + expAwayRaw;
  if (!(total > 0)) return null;

  // The fit must operate on the SAME goal scale that will produce the final
  // half lambdas, otherwise the calibrated first-half share is meaningless.
  // Rescale the home/away split so it sums to `total` (the match's expected
  // goals), then solve for the first-half share f on that scale.
  let expHome, expAway;
  if (expHomeRaw + expAwayRaw > 0) {
    const sum = expHomeRaw + expAwayRaw;
    expHome = (expHomeRaw / sum) * total;
    expAway = (expAwayRaw / sum) * total;
  } else {
    expHome = total / 2;
    expAway = total / 2;
  }

  // Single-parameter fit: the share of the match's goals expected in the first
  // half. Fixed home/away split keeps the fit stable where HT 1X2 alone is
  // underdetermined. A ridge on the share toward the empirical half-goal prior
  // stops the optimizer from pinning f on the range boundary just to shave the
  // error; the raw fit error is still reported against HSH_MAX_FIT_ERR.
  let best = null;
  for (let f = HSH_SHARE_MIN; f <= HSH_SHARE_MAX + 1e-9; f += 0.01) {
    const three = poissonThreeWay(expHome * f, expAway * f);
    const rawErr = (three.home - ph) * (three.home - ph) +
      (three.draw - pd) * (three.draw - pd) +
      (three.away - pa) * (three.away - pa);
    const penalized = rawErr + HSH_SHARE_REG * (f - HSH_SHARE_PRIOR) * (f - HSH_SHARE_PRIOR);
    if (!best || penalized < best.penalized) best = { penalized, err: rawErr, f: Number(f.toFixed(2)) };
  }
  // Fit quality check: reject fixtures the model cannot reproduce - a bad fit
  // must never publish a free-market call.
  if (!best || best.err > HSH_MAX_FIT_ERR) return null;

  const share = best.f;
  const lambda1 = total * share;
  const lambda2 = total * (1 - share);
  const cmp = poissonThreeWay(lambda1, lambda2);
  // The published market is "which half scores more" - a tie is a push/non-call
  // and is never offered as a pick. Exclude it from the ranked options.
  const options = [
    { key: '1H', label: '1st Half', prob: cmp.home },
    { key: '2H', label: '2nd Half', prob: cmp.away }
  ].sort((a, b) => b.prob - a.prob);
  const top = options[0];
  const other = options[1];
  const margin = top.prob - other.prob;
  return {
    pick: top.key,
    label: top.label,
    prob: Number(top.prob.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    firstHalfShare: share,
    firstHalfExp: Number(lambda1.toFixed(2)),
    secondHalfExp: Number(lambda2.toFixed(2)),
    p1: Number(cmp.home.toFixed(3)),
    p2: Number(cmp.away.toFixed(3)),
    tie: Number(cmp.draw.toFixed(3)),
    fitErr: Number(best.err.toFixed(5)),
    totalExp: Number(total.toFixed(2)),
    referenceFirstHalfProb: Number(ph.toFixed(3)),
    referenceDrawProb: Number(pd.toFixed(3)),
    referenceSecondHalfProb: Number(pa.toFixed(3)),
    reason: 'Expected ' + total.toFixed(1) + ' goals, split ' + lambda1.toFixed(1) +
      ' in the 1st half vs ' + lambda2.toFixed(1) + ' in the 2nd. The ' + top.label.toLowerCase() +
      ' wins the half race ' + (top.prob * 100).toFixed(0) + '% of the time, ' +
      (margin * 100).toFixed(0) + '% clear of the other half.'
  };
}

// Parse half-time 1X2 probabilities (percentages) keyed by Forebet match id.
function parseHtList(html) {
  let cheerio;
  try { cheerio = require('cheerio'); } catch (e) { return {}; }
  const $ = cheerio.load(html);
  const map = {};
  $('.schema .rcnt').each(function () {
    const $row = $(this);
    const id = $row.find('.nofav, .fav_icon').attr('id') || '';
    if (!id) return;
    const spans = $row.find('.fprc span');
    if (spans.length !== 3) return;
    const home = parsePercent(spans.eq(0).text());
    const draw = parsePercent(spans.eq(1).text());
    const away = parsePercent(spans.eq(2).text());
    if (home + draw + away <= 0) return;
    map[id] = { home, draw, away };
  });
  return map;
}

// Best-only selection for the public tab: strongest calls that clear the
// probability floor, the race margin and the expected-goals floor, then ranked
// by margin (the most decisive call first), capped per day.
function selectHshPicks(matches, limit) {
  const max = limit || HSH_MAX_PICKS;
  return (matches || [])
    .filter((m) => m.hsh && m.hsh.prob >= HSH_MIN_PROB &&
      m.hsh.margin >= HSH_MARGIN_MIN &&
      Number(m.avgGoals) >= HSH_MIN_GOALS)
    .sort((a, b) => (b.hsh.margin - a.hsh.margin) || (b.hsh.prob - a.hsh.prob))
    .slice(0, max)
    .map((m) => ({
      matchId: m.matchId,
      home: m.home,
      away: m.away,
      league: m.league,
      time: m.time,
      probs: m.probs,
      avgGoals: m.avgGoals,
      hsh: m.hsh
    }));
}

// Estimate team-to-score props from expected goals. Props are generated down to
// TTS_LOCK_MIN_ODD so a form/H2H lock can still surface a near-certain scorer;
// the normal path re-applies the stricter MIN_TEAM_SCORE_ODD floor in
// selectTeamScoreTip, so the field never includes ultra-short or meaningless
// prices for ordinary picks.
function estimateTeamScoreProps({ expHome, expAway }) {
  const props = [];
  const push = (side, team, lambda) => {
    const scoreAtLeastOne = poissonAtLeastOne(lambda);
    const fairProb = Math.min(0.98, Math.max(0.05, scoreAtLeastOne));
    const fairOdd = Number((1 / fairProb).toFixed(2));
    if (fairOdd > TTS_LOCK_MIN_ODD && fairOdd < 1 / 0.05) {
      props.push({
        market: 'team-to-score',
        side,
        team,
        prob: Number((fairProb * 100).toFixed(1)),
        estimatedOdd: fairOdd
      });
    }
  };
  push('home', 'home', expHome);
  push('away', 'away', expAway);
  return props;
}

// Expected goals for a match - the history-backed signal. Uses the detail-page
// split when present, otherwise splits the match total (Forebet's aggregated
// average goals, itself built from historical scoring) by the outcome
// probabilities. Shared by the enrichment prefilter and the scorer so both
// reason about the same number.
function estimateMatchExpGoals(m) {
  if (m.detail && m.detail.expGoals && (m.detail.expGoals.home > 0 || m.detail.expGoals.away > 0)) return m.detail.expGoals;
  const pn = normalisePredictions(m.probs);
  const total = (pn.home + pn.away) || 1;
  return {
    home: Number(((m.avgGoals || 0) * pn.home / total).toFixed(2)),
    away: Number(((m.avgGoals || 0) * pn.away / total).toFixed(2))
  };
}

// The VIP market: pick the single strongest team-to-score call for the match -
// one distinct tip per fixture, never two rows from the same match.
//
// "Must score" is a composite of three records:
//   - history/model    40 pts - the expected-goals scoring probability
//   - recent form      35 pts - the picked side's win rate in recent outings
//   - head-to-head     25 pts - historical meetings against this opponent
// A candidate must clear the scoring-probability floor and the price floor,
// and the composite must clear MUST_SCORE_MIN. When no detail records exist
// (enrichment skipped/timed out) the history-backed probability alone must
// clear the higher TTS_NO_DETAIL_PROB bar. The form/H2H lock bypasses the
// composite and price/probability bars for a side that has won (near) all its
// recent matches AND every recent meeting against this opponent - see
// selectTeamScoreTip.
function mustScoreFor({ prob, formPct, h2h }) {
  const modelPts = Math.max(0, Math.min(40, Math.round((prob - 0.3) * 100)));
  let formPts = 0;
  if (formPct != null) formPts = Math.max(0, Math.min(35, Math.round(formPct - 40)));
  let h2hPts = 0;
  if (typeof h2h === 'number' && h2h > 0) h2hPts = Math.max(0, Math.min(25, Math.round(h2h * 5)));
  return { modelPts, formPts, h2hPts, score: modelPts + formPts + h2hPts };
}

// Loose team-name equality that survives accents (Vispeşti vs Vispesti) and
// casing, so H2H meeting sides can be aligned to today's home/away names.
function sameTeam(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

// A side-relative H2H signal: the number of recent meetings (0..5) won by the
// given side. Accepts both the parsed shape ({ wins: {home,away}, meets }) and
// the legacy plain count for caches written before the shape change.
function h2hCountFor(h2h, side) {
  if (typeof h2h === 'number') return h2h > 0 ? h2h : 0;
  if (h2h && h2h.wins) return Number(h2h.wins[side] || 0) || 0;
  return 0;
}

// Whether real H2H records exist at all (any side with a win), the mark that
// puts a pick under the full MUST_SCORE_MIN gate instead of the no-detail floor.
function h2hHasSignal(h2h) {
  if (typeof h2h === 'number') return h2h > 0;
  return !!(h2h && h2h.wins && (h2h.wins.home > 0 || h2h.wins.away > 0));
}

// Number of recent meetings actually studied for the H2H record (0 when none).
function h2hMeetsFor(h2h) {
  if (!h2h || typeof h2h !== 'object') return 0;
  return Number(h2h.meets || 0) || 0;
}

function selectTeamScoreTip({ home, away, teamScoreProps, form, h2h }) {
  const props = teamScoreProps || [];
  const hasDetailSignals = !!(form || h2hHasSignal(h2h));
  const meets = h2hMeetsFor(h2h);
  let best = null;
  for (const p of props) {
    const prob = (Number(p.prob) || 0) / 100;
    if (!(p.estimatedOdd > TTS_LOCK_MIN_ODD)) continue;
    const sidePct = p.side === 'home'
      ? (form && typeof form.homeRecently === 'number' ? form.homeRecently : null)
      : (form && typeof form.awayRecently === 'number' ? form.awayRecently : null);
    const wins = h2hCountFor(h2h, p.side);
    // The lock: near-perfect recent form AND a clean head-to-head ledger.
    const locked = sidePct != null && meets >= TTS_PERFECT_H2H_MEETS &&
      sidePct >= TTS_PERFECT_FORM_PCT && wins === meets;
    if (locked) {
      if (prob < TTS_LOCK_MIN_PROB) continue;
    } else {
      if (!(p.estimatedOdd > MIN_TEAM_SCORE_ODD)) continue;
      if (prob < TTS_MIN_PROB) continue;
    }
    const { score, modelPts, formPts, h2hPts } = mustScoreFor({ prob, formPct: sidePct, h2h: wins });
    if (!best || score > best.score) {
      best = { side: p.side, prob, estimatedOdd: Number(p.estimatedOdd), score, modelPts, formPts, h2hPts, locked };
    }
  }
  if (!best) return null;
  if (best.locked) {
    // A near-100% form side that also owns this opponent 100% head-to-head is
    // a must-score regardless of the model's probability/price bars. Only an
    // absence of detail records (which is impossible here - the lock needs
    // them) could block it.
    if (!hasDetailSignals) return null;
  } else if (hasDetailSignals ? best.score < MUST_SCORE_MIN : best.prob < TTS_NO_DETAIL_PROB) {
    return null;
  }
  return {
    market: 'team-to-score',
    side: best.side,
    team: best.side === 'home' ? home : away,
    prob: best.prob,
    estimatedOdd: best.estimatedOdd,
    confidence: Math.round(best.prob * 100),
    mustScore: best.score,
    mustScoreBreakdown: { model: best.modelPts, form: best.formPts, h2h: best.h2hPts },
    locked: best.locked,
    edge: null,
    marketPick: null
  };
}

// VIP tip type: MATCH-WINNER RECORD CERT. A side with a near-perfect recent
// win rate AND a 100% head-to-head record against this opponent publishes as
// "Team X to win" - the records are the reasoning, the model's 1X2 win
// probability only has to clear TTS_WIN_CERT_MIN_PROB. One row per fixture:
// when this cert qualifies it takes the fixture ahead of the team-to-score
// call. Confidence is the records+model must-score composite, so a dominant
// record reads as strong confidence even when the model is only neutral-
// positive.
function selectMatchWinnerCert({ home, away, probs, form, h2h }) {
  if (!form) return null;
  const meets = h2hMeetsFor(h2h);
  if (meets < TTS_PERFECT_H2H_MEETS) return null;
  const pn = normalisePredictions(probs || { home: 0, draw: 0, away: 0 });
  for (const side of ['home', 'away']) {
    const formPct = side === 'home'
      ? (typeof form.homeRecently === 'number' ? form.homeRecently : null)
      : (typeof form.awayRecently === 'number' ? form.awayRecently : null);
    if (formPct == null || formPct < TTS_PERFECT_FORM_PCT) continue;
    const wins = h2hCountFor(h2h, side);
    if (wins !== meets) continue;
    const winProb = Number(side === 'home' ? pn.home : pn.away) / 100;
    if (winProb < TTS_WIN_CERT_MIN_PROB) continue;
    const { score, modelPts, formPts, h2hPts } = mustScoreFor({ prob: winProb, formPct, h2h: wins });
    return {
      market: 'match-winner',
      side,
      team: side === 'home' ? home : away,
      prob: winProb,
      estimatedOdd: null,
      confidence: score,
      mustScore: score,
      mustScoreBreakdown: { model: modelPts, form: formPts, h2h: h2hPts },
      locked: true,
      edge: null,
      marketPick: null
    };
  }
  return null;
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

function oddsKeyFor(pick) {
  return pick === '1' ? 'home' : pick === '2' ? 'away' : 'draw';
}

function computeConfidence({ probs, pick, books, form, h2h }) {
  const p = normalisePredictions(probs || { home: 0, draw: 0, away: 0 });
  const top = Math.max(p.home, p.draw, p.away);
  const order = [p.home, p.draw, p.away].sort((a, b) => b - a);
  const margin = top - order[1];
  const algProb = pick === '1' ? p.home : pick === '2' ? p.away : p.draw;

  let algScore = Math.min(40, margin * 2.5);

  // Market data means any odds at all: real bookmaker rows from the detail
  // page OR Forebet's aggregated average odds from the list page. Both count
  // as market data for the gate, because both give us a market-implied
  // probability to measure value against.
  const hasOddsData = Array.isArray(books) && books.length > 0;
  const market = hasOddsData ? impliedFromOdds(meanOdds(books)) : null;
  const marketPick = market ? predictionLabel(market) : null;
  let edgePoints = 0;
  let edge = null;
  if (market) {
    // Value is always measured FOR THE PICK against the market's own price for
    // the SAME outcome - never against a different outcome's probability.
    const mktProb = market[oddsKeyFor(pick)];
    edge = Number((algProb - mktProb).toFixed(1));
    edgePoints = Math.min(30, Math.max(0, edge));
  }

  let formScore = 0;
  if (form) {
    const homePct = typeof form.homeRecently === 'number' ? form.homeRecently : null;
    const awayPct = typeof form.awayRecently === 'number' ? form.awayRecently : null;
    const relevant = pick === '1' ? homePct : pick === '2' ? awayPct : null;
    if (relevant !== null) {
      formScore = Math.min(12, Math.max(0, relevant - 40) * 0.3);
    }
    const h2hW = pick === '1' ? h2hCountFor(h2h, 'home') : pick === '2' ? h2hCountFor(h2h, 'away') : 0;
    if (h2hW > 0) {
      formScore += Math.min(3, h2hW);
    }
  }

  // Market agreement rewards alignment and only alignment: no points for a
  // pick the market does not share.
  let marketScore = 0;
  if (marketPick === pick) {
    marketScore = 10;
  }
  const confidence = Math.round(Math.min(100, algScore + edgePoints + formScore + marketScore));

  // The gate: minimum confidence, and when any market data exists the pick
  // must carry a positive value edge over the market's implied price. Without
  // market data the pick rests on model certainty alone.
  const passesGate = confidence >= MIN_CONFIDENCE && (!hasOddsData || edge === null || edge > 0);
  const bestOdds = bestAcross(books, pick);

  return {
    confidence,
    edge,
    edgeSource: hasOddsData ? 'books' : null,
    marketPick,
    bestOdds,
    passesGate,
    margin: Number(margin.toFixed(1)),
    algProb: Number(algProb.toFixed(1)),
    mktProb: market && typeof market[oddsKeyFor(pick)] === 'number' ? market[oddsKeyFor(pick)] : null,
    algScore: Math.round(algScore),
    edgePoints: Math.round(edgePoints),
    formScore: Math.round(formScore),
    marketScore
  };
}

// --- Expert analysis -------------------------------------------------------
//
// Every published VIP tip ships with a plain-English write-up that backs the
// pick with whatever the model actually measured: algorithm certainty (margin
// over the second favourite), value edge vs the market's implied price, market
// agreement, the expected-goals split, any team-to-score prop, the higher-
// scoring-half lean and, when detail pages are on, form and head-to-head.
// Sections are dropped when their data is absent, so the narrative stays true
// to what was known at scrape time. Target length is roughly 100 words.

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function buildAnalysis(options) {
  const {
    home, away, league,
    pick, confidence, margin, edge, mktProb, algProb, marketPick,
    avgGoals, expGoals, teamScoreProps, hsh,
    formPct, h2h
  } = options || {};

  const sentences = [];
  const pickDesc = pick === '1' ? home + ' to win' : pick === '2' ? away + ' to win' : 'the match to end level';
  const lead = [home, away].every(Boolean)
    ? home + ' vs ' + away + (league ? ' (' + league + ')' : '')
    : 'This fixture';
  sentences.push(lead + ', and the model backs ' + pickDesc + ' with ' + confidence + '/100 confidence');

  if (margin != null) {
    sentences.push('forebet places that outcome ' + margin.toFixed(1) + ' points clear of the next most likely result');
  }

  if (edge != null && mktProb != null && edge > 0) {
    sentences.push('that price still leaves value - roughly ' + mktProb.toFixed(0) + '% implied chance against a ' + algProb.toFixed(0) + '% model estimate is a +' + edge.toFixed(1) + 'pt value edge');
  } else if (edge != null && mktProb != null) {
    sentences.push('the market already prices the call closely (edge ' + (edge > 0 ? '+' : '') + edge.toFixed(1) + 'pt), so certainty drives the pick rather than value');
  } else {
    sentences.push('no market odds were available, so this pick rests on model certainty alone');
  }

  if (marketPick) {
    sentences.push(marketPick === pick
      ? 'the model and the market favourite are aligned on the most likely outcome'
      : 'the market leans the other way, making this a contrarian call that only pays if the model beats the crowd');
  }

  if (expGoals && (expGoals.home > 0 || expGoals.away > 0)) {
    const totalNote = avgGoals > 0 ? ' off a ' + Number(avgGoals).toFixed(2) + '-goal match total' : '';
    sentences.push('expected goals split ' + Number(expGoals.home).toFixed(2) + ' - ' + Number(expGoals.away).toFixed(2) + totalNote);
  }

  if (teamScoreProps && teamScoreProps.length) {
    const prop = teamScoreProps[0];
    sentences.push(prop.team + ' to score at least once is fairly priced near ' + Number(prop.estimatedOdd).toFixed(2));
  }

  if (hsh && hsh.prob > 0) {
    sentences.push('the model also favours the ' + String(hsh.label || '').toLowerCase() + ' to produce more goals (' + Math.round(hsh.prob * 100) + '%)');
  }

  if (formPct != null) {
    sentences.push('recent form backs it up - the chosen side has won ' + Math.round(formPct) + '% of its last outings');
  }

  if (h2h && h2h > 0) {
    sentences.push('head-to-head history favours the call');
  }

  return sentences.filter(Boolean).map(cap).join('. ') + '.';
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

function parseMatchDetail(html, refs) {
  const refHome = refs && refs.home;
  const refAway = refs && refs.away;
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
  // Current DOM: one .prformcont per team (home first), each holding one
  // <span class="form_w|form_d|form_l">W|D|L</span> per recent outing. The old
  // .form/.FormTable tables are long gone.
  $('.prformcont').each(function () {
    const letters = [];
    $(this).find('span.form_w, span.form_d, span.form_l').each(function () {
      letters.push($(this).text().trim().substring(0, 1).toUpperCase());
    });
    if (letters.length) formRows.push(letters.join(''));
  });
  if (formRows.length >= 2) {
    // Win-RATE, not "unbeaten" rate: only W counts toward recent form, so a
    // string of draws no longer inflates the score.
    const homeWins = (formRows[0].match(/W/g) || []).length;
    const awayWins = (formRows[1].match(/W/g) || []).length;
    const homeTotal = formRows[0].length || 1;
    const awayTotal = formRows[1].length || 1;
    form = {
      homeForm: formRows[0],
      awayForm: formRows[1],
      homeRecently: Math.round((homeWins / homeTotal) * 100),
      awayRecently: Math.round((awayWins / awayTotal) * 100)
    };
  }

  // Head-to-head: the "Head to head" module holds one .st_row per past
  // meeting (most recent first). st_0/st_1 are zebra stripes, not result
  // markers - parse the two team names and the score, compare each meeting's
  // sides to TODAY'S home/away and count wins per side (capped at 5 meetings).
  let h2h = null;
  const h2hWins = { home: 0, away: 0 };
  const MAX_H2H_MEETINGS = 5;
  let h2hMeets = 0;
  $('.mptlt').filter(function () {
    return /head\s*to\s*head/i.test($(this).text());
  }).parent().find('.st_row').each(function () {
    if (h2hMeets >= MAX_H2H_MEETINGS) return;
    const hteam = ($(this).find('.st_hteam').text() || '').trim();
    const ateam = ($(this).find('.st_ateam').text() || '').trim();
    const scoreText = ($(this).find('.st_res').text() || '').trim();
    const m = scoreText.match(/(\d+)\s*-\s*(\d+)/);
    if (!m || !hteam || !ateam) return;
    const meetingHome = sameTeam(hteam, refHome);
    const meetingAway = sameTeam(ateam, refAway);
    if (!(meetingHome && meetingAway)) return;
    h2hMeets += 1;
    const hs = Number(m[1]);
    const as = Number(m[2]);
    if (hs > as) h2hWins.home += 1;
    else if (as > hs) h2hWins.away += 1;
  });
  if (h2hMeets > 0) {
    h2h = { wins: h2hWins, meets: h2hMeets };
  }

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
    const detail = parseMatchDetail(html, match);
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
  // "Today" is the current date in Africa/Lagos, not UTC - toISOString() flips
  // the day between 23:00 and 00:00 UTC and previously mis-selected the URL.
  const isToday = dateStr === lagosDate(0);
  if (isToday) url = FOREBET_TODAY_URL;

  console.log('[forebetVip] Scraping ' + dateStr + ' (' + url + ')');
  const html = await fetchUrl(url, { waitRows: true });
  const raw = parseMatchList(html);
  if (raw.length === 0) {
    console.warn('[forebetVip] No matches parsed for ' + dateStr + ' (structure may have changed)');
    return [];
  }

  // Half-time probabilities feed the free highest-scoring-half market. This is
  // best-effort: a failure here must never affect the VIP run.
  let htMap = {};
  try {
    const htUrl = isToday ? FOREBET_HT_TODAY_URL : FOREBET_HT_DATE_URL + dateStr;
    const htHtml = await fetchUrl(htUrl, { waitRows: true });
    htMap = parseHtList(htHtml);
    console.log('[forebetVip] Parsed HT probabilities for ' + Object.keys(htMap).length + ' fixtures on ' + dateStr);
  } catch (e) {
    console.warn('[forebetVip] HT scrape failed for ' + dateStr + ': ' + e.message);
  }

  // Detail enrichment prefilter: only fixtures that could possibly produce a
  // qualifying team-to-score call are worth a browser fetch for form/H2H. The
  // same expected-goals derivation runs here and in the scorer below.
  const shouldEnrich = (match) => {
    const exp = estimateMatchExpGoals(match);
    const props = estimateTeamScoreProps({ expHome: exp.home, expAway: exp.away });
    return props.some((p) => (Number(p.prob) / 100) >= TTS_MIN_PROB);
  };

  let enriched;
  if (ENRICH_DETAIL) {
    enriched = await enrichAll(raw, shouldEnrich);
    const enrichedCount = enriched.filter((m) => m.detail).length;
    console.log('[forebetVip] Parsed ' + raw.length + ' fixtures for ' + dateStr + '; enriched ' + enrichedCount + ' candidates for form/H2H must-score check...');
  } else {
    enriched = raw.map((m) => Object.assign({}, m, { detail: null, detailSkipped: true }));
    console.log('[forebetVip] Parsed ' + raw.length + ' fixtures for ' + dateStr + ' (list-only scoring; form/H2H must-score gate runs at a higher probability floor).');
  }

  const out = [];
  for (const m of enriched) {
    const expGoals = estimateMatchExpGoals(m);
    const teamScoreProps = estimateTeamScoreProps({
      expHome: expGoals.home,
      expAway: expGoals.away
    });
    // "Must score" from history (expected goals), recent form and head-to-head.
    const form = m.detail && m.detail.form ? m.detail.form : null;
    const h2h = m.detail && m.detail.h2h ? m.detail.h2h : null;
    // One tip per fixture: a form/H2H record cert takes the row as a
    // match-winner pick; only fixtures without a cert fall through to the
    // team-to-score market.
    const cert = selectMatchWinnerCert({ home: m.home, away: m.away, probs: m.probs, form, h2h });
    const tip = cert || selectTeamScoreTip({ home: m.home, away: m.away, teamScoreProps, form, h2h });

    const hsh = computeHighestScoringHalf(htMap[m.matchId], expGoals, m.avgGoals);

    const side = tip ? tip.side : null;
    out.push(Object.assign({}, m, {
      market: tip ? tip.market : null,
      pick: side,
      team: tip ? tip.team : null,
      teamScoreProb: tip && tip.market === 'team-to-score' ? Number((tip.prob * 100).toFixed(1)) : null,
      winProb: tip && tip.market === 'match-winner' ? Number((tip.prob * 100).toFixed(1)) : null,
      mustScore: tip ? tip.mustScore : null,
      mustScoreBreakdown: tip ? tip.mustScoreBreakdown : null,
      locked: tip ? !!tip.locked : false,
      estimatedOdd: tip ? tip.estimatedOdd : null,
      confidence: tip ? tip.confidence : null,
      edge: null,
      bestOdds: null,
      marketPick: null,
      margin: null,
      passesGate: !!tip,
      expGoals,
      teamScoreProps,
      hsh,
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
  parseHtList,
  computeConfidence,
  buildAnalysis,
  estimateTeamScoreProps,
  selectMatchWinnerCert,
  selectTeamScoreTip,
  computeHighestScoringHalf,
  selectHshPicks,
  poissonAtLeastOne,
  poissonPmf,
  normaliseTeam,
  predictionLabel,
  impliedFromOdds,
  closeVipBrowser,
  MIN_CONFIDENCE,
  MIN_TEAM_SCORE_ODD,
  TTS_MIN_PROB,
  MUST_SCORE_MIN,
  TTS_NO_DETAIL_PROB,
  TTS_PERFECT_FORM_PCT,
  TTS_PERFECT_H2H_MEETS,
  TTS_LOCK_MIN_PROB,
  TTS_LOCK_MIN_ODD,
  TTS_WIN_CERT_MIN_PROB,
  VIP_MAX_TIPS,
  h2hMeetsFor,
  estimateMatchExpGoals,
  HSH_MIN_PROB,
  HSH_MAX_PICKS,
  HSH_MAX_FIT_ERR,
  HSH_SHARE_PRIOR,
  HSH_SHARE_REG,
  HSH_SHARE_MIN,
  HSH_SHARE_MAX,
  HSH_MARGIN_MIN,
  HSH_MIN_GOALS
};

if (require.main === module) {
  const dates = process.argv.slice(2).length ? process.argv.slice(2) : [lagosDate(0), lagosDate(1)];
  scrapeVip(dates).then((byDate) => {
    for (const [date, matches] of Object.entries(byDate)) {
      console.log('\n=== ' + date + ' (' + matches.length + ' fixtures) ===');
      matches.forEach(m => {
        const tag = m.market === 'match-winner' ? 'WIN' : 'TTS';
        console.log('[' + tag + '] ' + m.home + ' v ' + m.away + ' | team=' + m.team + ' p=' + (m.market === 'match-winner' ? m.winProb + '% win' : m.teamScoreProb + '% score') + ' conf=' + m.confidence + ' mustScore=' + m.mustScore + ' gate=' + m.passesGate);
      });
    }
  }).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}