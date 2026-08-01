const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let generatePostThumbnail;
function getGeneratePostThumbnail() {
  if (!generatePostThumbnail) {
    generatePostThumbnail = require('../../scripts/generate-thumbnail').generatePostThumbnail;
  }
  return generatePostThumbnail;
}
const { asNumber, buildOpportunities } = require('../services/liveTips');
const { getCachedLive } = require('../services/scrapeLive');
const { getSettledTodayTips, getSettledTipsForDate } = require('../services/liveTipHistory');
const { buildTwoOddsOfDay, watDate } = require('../services/twoOddsOfDay');
const { buildTicket } = require('../services/ticketBuilder');
const { buildGiantPool, getGiantPoolHistory } = require('../services/authorPicks');
const { fetchTodayStreaks } = require('../services/h2hWinningStreaks');
const { optionalAuth, requireAuth, requirePro: requireProMiddleware, requireAdmin, logAdminAction } = require('../middleware/auth');
const payment = require('../services/payment');
const whop = require('../services/whop');

// Active payment provider: set PAYMENT_PROVIDER=whop to route the existing
// /api/checkout, /api/portal and /api/subscription/cancel endpoints to Whop
// instead of Lemon Squeezy. Defaults to Lemon Squeezy.
function activePayment() {
  return process.env.PAYMENT_PROVIDER === 'whop' ? whop : payment;
}

// API-Football responses are cached so one busy page does not consume the
// provider quota for every visitor. The API key is deliberately kept here,
// never sent to the browser.
const footballOddsCache = new Map();
const FOOTBALL_ODDS_CACHE_MS = 10 * 60 * 1000;
const MAX_FOOTBALL_ODDS_CACHE = 30;
let liveTipsCache = null;
// API-Football's free plan allows 100 requests/day. Live analysis is capped
// well below that, leaving a reserve for the rest of the site.
const LIVE_TIPS_CACHE_MS = 15 * 60 * 1000;
const LIVE_TIPS_DAILY_BUDGET = 60;
const API_REQUEST_RESERVE = 20;
const MAX_LIVE_TIP_CANDIDATES = 3;
let liveTipsBudget = { day: '', used: 0, remaining: null };
const headToHeadCache = new Map();
const HEAD_TO_HEAD_CACHE_MS = 12 * 60 * 60 * 1000;
const fixtureResultsCache = new Map();
const FIXTURE_RESULTS_CACHE_MS = 24 * 60 * 60 * 1000;
let scraperService = null;
let cornersLastScrape = null;
const SCRAPE_INTERVAL_MS = 2 * 60 * 60 * 1000;
function getScraperService() {
  if (!scraperService) {
    scraperService = require('../services/scraper');
  }
  return scraperService;
}

let supabase = null;
let isRefreshing = false;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.log('Supabase not available:', e.message);
  }
}

const FREE_LIMITS = {
  btts: 8,
  winstreak: 2,
  losestreak: 2,
  drawstreak: 2,
  teamtoscore: 4,
  teamtoscore2plus: 4
};

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'throwaway.email', 'yopmail.com', 'trashmail.com', 'mailnator.com',
  'temp-mail.org', 'disposablemail.com', 'mailmetrash.com', 'trash2009.com',
  'spamgourmet.com', '33mail.com', 'jetable.org', 'trashmail.net',
  'mailexpire.com', 'spambox.us', 'mytrashmail.com', 'mytemp.email',
  'fakemailgenerator.com', 'getairmail.com', 'emailondeck.com',
  'maildrop.cc', 'inboxbear.com', 'tempinbox.com', 'sharklasers.com',
  'guerrillamail.info', 'grr.la', 'pokemail.net', 'spam4.me'
];

function isDisposableEmail(email) {
  var domain = (email || '').split('@')[1];
  if (!domain) return false;
  domain = domain.toLowerCase().trim();
  var parts = domain.split('.');
  while (parts.length > 2) { parts.shift(); }
  var baseDomain = parts.join('.');
  return DISPOSABLE_DOMAINS.indexOf(baseDomain) !== -1;
}

const ANON_RATE_FILE = path.join(__dirname, '..', '..', 'anon-rate-cache.json');

function loadAnonRateCache() {
  try {
    if (fs.existsSync(ANON_RATE_FILE)) {
      return JSON.parse(fs.readFileSync(ANON_RATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[anon-rate] Failed to load cache:', e.message);
  }
  return {};
}

function saveAnonRateCache(data) {
  try {
    fs.writeFileSync(ANON_RATE_FILE, JSON.stringify(data));
  } catch (e) {
    console.warn('[anon-rate] Failed to save cache:', e.message);
  }
}

async function checkUserVipStatus(userId) {
  if (!userId || !supabase) return { isVip: false };
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('vip_status, vip_expires_at')
      .eq('id', userId)
      .single();
    
    if (profile && (profile.vip_status === 'vip' || profile.vip_status === 'admin')) {
      const isValid = !profile.vip_expires_at || new Date(profile.vip_expires_at) > new Date();
      if (isValid) return { isVip: true };
    }
  } catch (e) {
    console.log('VIP check error:', e.message);
  }
  
  return { isVip: false };
}

// Membership decisions for the new VIP product must be based on a Supabase
// bearer token, never on a browser-supplied user ID header.
async function getAuthenticatedUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.match(/^Bearer\s+(.+)$/i);
  if (!token || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token[1]);
    if (error || !data || !data.user) return null;
    return { id: data.user.id, email: data.user.email || '' };
  } catch (error) {
    console.warn('[vip-auth] Token validation failed:', error.message);
    return null;
  }
}

async function isAuthenticatedVip(req) {
  const user = await getAuthenticatedUser(req);
  if (!user) return false;
  const result = await checkUserVipStatus(user.id);
  return result.isVip === true;
}

async function fetchPreMatchOdds(date) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return [];
  const cached = footballOddsCache.get(date);
  if (cached && Date.now() - cached.createdAt < FOOTBALL_ODDS_CACHE_MS) return cached.payload.response || [];
  try {
    const upstream = await fetch('https://v3.football.api-sports.io/odds?date=' + encodeURIComponent(date) + '&timezone=Africa%2FLagos', {
      headers: { 'x-apisports-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(25000)
    });
    const data = await upstream.json();
    if (!upstream.ok || (data.errors && Object.keys(data.errors).length)) {
      console.warn('[two-odds] Pre-match odds unavailable:', upstream.status, data.errors || data.message || 'Unknown error');
      return [];
    }
    const payload = { available: true, source: 'API-Football', date: date, fetchedAt: new Date().toISOString(), response: Array.isArray(data.response) ? data.response : [] };
    footballOddsCache.set(date, { createdAt: Date.now(), payload });
    if (footballOddsCache.size > MAX_FOOTBALL_ODDS_CACHE) {
      var oldestKey = footballOddsCache.keys().next().value;
      footballOddsCache.delete(oldestKey);
    }
    return payload.response;
  } catch (error) {
    console.warn('[two-odds] Pre-match odds fetch failed:', error.message);
    return [];
  }
}

async function fetchFixtureResults(date) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return [];
  const cached = fixtureResultsCache.get(date);
  if (cached && Date.now() - cached.createdAt < FIXTURE_RESULTS_CACHE_MS) return cached.data;
  try {
    const upstream = await fetch('https://v3.football.api-sports.io/fixtures?date=' + encodeURIComponent(date) + '&timezone=Africa%2FLagos', {
      headers: { 'x-apisports-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(25000)
    });
    const data = await upstream.json();
    if (!upstream.ok || (data.errors && Object.keys(data.errors).length)) return [];
    const finished = (data.response || []).filter(function(f) {
      return f.fixture && f.fixture.status && f.fixture.status.short === 'FT';
    }).map(function(f) {
      return {
        key: (f.teams.home.name || '') + ' - ' + (f.teams.away.name || ''),
        score: { home: Number(f.goals.home), away: Number(f.goals.away) }
      };
    });
    fixtureResultsCache.set(date, { createdAt: Date.now(), data: finished });
    return finished;
  } catch (error) {
    console.warn('[two-odds-history] Fixture results fetch failed for', date, error.message);
    return [];
  }
}

function findLegResult(predMatch, fixtureResults) {
  const predTeams = splitMatch(predMatch);
  if (predTeams.length !== 2) return null;
  const [predHome, predAway] = predTeams;
  let bestMatch = null, bestScore = 0;
  for (const result of fixtureResults) {
    const resultTeams = splitMatch(result.key);
    if (resultTeams.length !== 2) continue;
    const [resHome, resAway] = resultTeams;
    const comparisons = [
      { home: teamSimilarity(predHome, resHome), away: teamSimilarity(predAway, resAway), score: result.score },
      { home: teamSimilarity(predHome, resAway), away: teamSimilarity(predAway, resHome), score: { home: result.score.away, away: result.score.home } }
    ];
    for (const comparison of comparisons) {
      const combined = (comparison.home + comparison.away) / 2;
      if (comparison.home >= 0.5 && comparison.away >= 0.5 && combined > bestScore && combined >= 0.7) {
        bestScore = combined;
        bestMatch = comparison.score;
      }
    }
  }
  return bestMatch;
}

function didLegWin(leg, score) {
  if (!score || score.home == null || score.away == null) return null;
  const h = Number(score.home), a = Number(score.away);
  const cat = (leg.category || '').toLowerCase();
  const sel = (leg.selection || '').toLowerCase();
  if (cat === '1x2') {
    if (sel === 'home win' || sel === '1') return h > a;
    if (sel === 'away win' || sel === '2') return a > h;
    if (sel === 'draw' || sel === 'x') return h === a;
    if (sel === '1x') return h >= a;
    if (sel === 'x2') return a >= h;
    if (sel === '12') return h !== a;
  }
  if (cat === 'over15') return (h + a) > 1.5;
  if (cat === 'over25') return (h + a) > 2.5;
  if (cat === 'btts') return h > 0 && a > 0;
  if (cat === 'bttsno') return h === 0 || a === 0;
  return null;
}

function vipPredictionData() {
  const data = getScraperService().loadCachedPredictions() || {};
  const corners = getScraperService().loadCornersCache();
  const cards = getScraperService().loadCardsCache();
  if (corners && Array.isArray(corners.matches)) data.cornersMatches = corners.matches;
  if (cards && Array.isArray(cards.matches)) data.cardsMatches = cards.matches;
  return data;
}

function applyLimits(data, isVip) {
  if (isVip) {
    return { ...data, isVip: true, isFreeLimited: false, limit: null, remaining: null };
  }
  var limited = { ...data, isVip: false, isFreeLimited: true, limit: FREE_LIMITS };
  limited.bttsMatches = (data.bttsMatches || []).slice(0, FREE_LIMITS.btts);
  limited.winstreakMatches = (data.winstreakMatches || []).slice(0, FREE_LIMITS.winstreak);
  limited.losestreakMatches = (data.losestreakMatches || []).slice(0, FREE_LIMITS.losestreak);
  limited.drawstreakMatches = (data.drawstreakMatches || []).slice(0, FREE_LIMITS.drawstreak);
  limited.teamToScoreMatches = (data.teamToScoreMatches || []).slice(0, FREE_LIMITS.teamtoscore);
  limited.teamToScore2PlusMatches = (data.teamToScore2PlusMatches || []).slice(0, FREE_LIMITS.teamtoscore2plus);
  return limited;
}

router.get('/predictions', optionalAuth, async (req, res) => {
  try {
    const isVip = req.user ? await (async function() {
      if (!supabase) return false;
      try {
        const { data: profile } = await supabase.from('profiles').select('vip_status, vip_expires_at').eq('id', req.user.id).single();
        if (profile && (profile.vip_status === 'vip' || profile.vip_status === 'admin') && (!profile.vip_expires_at || new Date(profile.vip_expires_at) > new Date())) return true;
      } catch (e) {}
      return false;
    })() : false;
    
    let data;
    const cached = getScraperService().loadCachedPredictions();
    
    // Auto-refresh if cache is stale (older than 12 hours)
    if (cached && cached.isStale) {
      console.log('[API] Cache is stale, triggering background refresh...');
      // Fire and forget - serve stale data but refresh in background
      setImmediate(async () => {
        try {
          await getScraperService().fetchPredictions();
          console.log('[API] Background refresh completed');
        } catch (e) {
          console.error('[API] Background refresh failed:', e.message);
        }
      });
      delete cached.isStale;
      data = cached;
    } else if (cached) {
      console.log('[API] Serving from preloaded cache');
      data = cached;
    } else {
      try {
        data = await getScraperService().fetchPredictions();
      } catch (scraperError) {
        console.error('Scraper error:', scraperError.message);
        return res.json({
          success: true,
          dates: [],
          matches: [],
          over15Matches: [],
          over25Matches: [],
          bttsMatches: [],
          winstreakMatches: [],
          losestreakMatches: [],
          drawstreakMatches: [],
          teamToScoreMatches: [],
          teamToScore2PlusMatches: [],
          cardsMatches: [],
          cornersMatches: [],
          totalMatches: 0,
          totalOver15: 0,
          totalOver25: 0,
          totalBtts: 0,
          totalWinstreak: 0,
          totalLosestreak: 0,
          totalDrawstreak: 0,
          error: 'Data temporarily unavailable'
        });
      }
    }
    
    // Load results cache and match with predictions
    let resultsCache = {};
    try {
      if (getScraperService().getResultsCache) {
        resultsCache = getScraperService().getResultsCache();
        console.log('[API] Results cache dates:', Object.keys(resultsCache));
      }
    } catch (e) {
      console.error('Error loading results cache:', e.message);
    }
    
    // Build results grouped by date for matching
    const resultsByDate = {};
    for (const dateKey of Object.keys(resultsCache)) {
      const arr = [];
      const dateResults = resultsCache[dateKey];
      for (const [resultKey, score] of Object.entries(dateResults)) {
        arr.push({ key: resultKey, score });
      }
      resultsByDate[dateKey] = arr;
    }
    console.log('[API] Results dates loaded:', Object.keys(resultsCache).length);
    
    // Normalize team name for matching
    function normalizeTeam(name) {
      const normalized = name.toLowerCase()
        .replace(/\(w\)/g, '')
        .replace(/\(u23\)/g, '')
        .replace(/\(u21\)/g, '')
        .replace(/\(u20\)/g, '')
        .replace(/\(u19\)/g, '')
        .replace(/\(u17\)/g, '')
        .replace(/\b(u\.?td|united|fc|afc|cf|sc|ac)\b/g, '')
        .replace(/[.'’]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const aliases = { 'milton keynes dons': 'mk dons', ucd: 'uc dublin', 'uanl tigres': 'tigres uanl' };
      return aliases[normalized] || normalized;
    }

    function splitMatch(match) {
      const separator = String(match || '').search(/\s+-\s+|\s+vs\s+/i);
      if (separator < 0) return [];
      const token = String(match).slice(separator).match(/^\s+(?:-|vs)\s+/i);
      if (!token) return [];
      return [String(match).slice(0, separator), String(match).slice(separator + token[0].length)];
    }
    
    // Get significant tokens from team name (filter out common words)
    function getSignificantTokens(name) {
      const commonWords = new Set(['fc', 'sc', 'ac', 'rc', 'us', 'ud', 'utd', 'as', 'ss', 'cf', 'cd', 'de', 'da', 'do', 'el', 'la', 'le', 'il', 'al', 'united', 'city', 'club', 'team', 'sporting', 'athletic', 'association', 'real', 'inter', 'san', 'saint', 'st']);
      return normalizeTeam(name).split(/\s+/).filter(t => t.length > 2 && !commonWords.has(t));
    }
    
    // Calculate similarity between two team names
    function teamSimilarity(name1, name2) {
      const norm1 = normalizeTeam(name1);
      const norm2 = normalizeTeam(name2);
      
      // Exact match
      if (norm1 === norm2) return 1.0;
      
      // One contains the other
      if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
      if (norm1.length >= 7 && norm2.length >= 7 && editSimilarity(norm1, norm2) >= 0.85) return 0.85;
      
      // Token-based similarity
      const tokens1 = getSignificantTokens(name1);
      const tokens2 = getSignificantTokens(name2);
      
      if (tokens1.length === 0 || tokens2.length === 0) return 0;
      
      let matches = 0;
      for (const t1 of tokens1) {
        for (const t2 of tokens2) {
          if (t1.includes(t2) || t2.includes(t1)) {
            matches++;
            break;
          }
        }
      }
      
      return matches / Math.max(tokens1.length, tokens2.length);
    }

    function editSimilarity(first, second) {
      const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
      for (let row = 1; row <= first.length; row++) {
        const current = [row];
        for (let column = 1; column <= second.length; column++) {
          current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
        }
        previous.splice(0, previous.length, ...current);
      }
      return 1 - previous[second.length] / Math.max(first.length, second.length);
    }
    
    // Find best matching result for a prediction
    function findResult(predMatch, predDate) {
      const predTeams = splitMatch(predMatch);
      if (predTeams.length !== 2) return null;
      
      const [predHome, predAway] = predTeams;
      let bestMatch = null;
      let bestScore = 0;
      
      const candidates = resultsByDate[predDate] || [];
      for (const result of candidates) {
        const resultTeams = splitMatch(result.key);
        if (resultTeams.length !== 2) continue;
        
        const [resHome, resAway] = resultTeams;
        
        const comparisons = [
          { home: teamSimilarity(predHome, resHome), away: teamSimilarity(predAway, resAway), score: result.score },
          { home: teamSimilarity(predHome, resAway), away: teamSimilarity(predAway, resHome), score: { ...result.score, home: result.score.away, away: result.score.home } }
        ];
        for (const comparison of comparisons) {
          const combined = (comparison.home + comparison.away) / 2;
          if (comparison.home >= 0.5 && comparison.away >= 0.5 && combined > bestScore && combined >= 0.7) {
            bestScore = combined;
            bestMatch = comparison.score;
          }
        }
      }
      
      return bestMatch;
    }
    
    // Enrich predictions with results
    const enrichWithResults = (matches) => {
      if (!matches) return [];
      
      const today = data.date || new Date().toISOString().split('T')[0];
      
      return matches.map(match => {
        const matchKey = match.match;
        const matchDateStr = (match.date || '').trim();
        
        if (matchDateStr > today) {
          return { ...match, result: null };
        }
        
        const result = findResult(matchKey, matchDateStr);
        return { ...match, result };
      });
    };
    
    data.matches = enrichWithResults(data.matches);
    data.over25Matches = enrichWithResults(data.over25Matches);
    data.over15Matches = enrichWithResults(data.over15Matches);
    data.bttsMatches = enrichWithResults(data.bttsMatches);
    
    // Load corners data
    const cornersData = getScraperService().loadCornersCache();
    if (cornersData) {
      data.cornersMatches = cornersData.matches || [];
    } else {
      data.cornersMatches = [];
    }
    
    // Load cards data
    const cardsData = getScraperService().loadCardsCache();
    if (cardsData) {
      data.cardsMatches = cardsData.matches || [];
    } else {
      data.cardsMatches = [];
    }
    
    // Load both halves data (replaces Team to Score 2+)
    const bothHalvesData = getScraperService().loadBothHalvesCache();
    if (bothHalvesData) {
      data.teamToScore2PlusMatches = bothHalvesData.matches || [];
    } else {
      data.teamToScore2PlusMatches = [];
    }
    
    if (!data.over15Matches || data.over15Matches.length === 0) {
      data.over15Matches = data.matches ? data.matches.filter(m => m.tip === 'Over 1.5') : [];
    }
    if (!data.over25Matches || data.over25Matches.length === 0) {
      data.over25Matches = data.matches ? data.matches.filter(m => m.tip === 'Over 2.5') : [];
    }
    if (!data.bttsMatches || data.bttsMatches.length === 0) {
      data.bttsMatches = data.matches ? data.matches.filter(m => m.tip === 'BTTS') : [];
    }
    if (!data.winstreakMatches) data.winstreakMatches = [];
    if (!data.losestreakMatches) data.losestreakMatches = [];
    if (!data.drawstreakMatches) data.drawstreakMatches = [];
    if (!data.teamToScoreMatches) data.teamToScoreMatches = [];
    if (!data.teamToScore2PlusMatches) data.teamToScore2PlusMatches = [];
    
    const limitedData = applyLimits(data, isVip);
    
    res.json(limitedData);
  } catch (err) {
    console.error('Predictions error:', err.message);
    const fallbackData = {
      success: true,
      date: new Date().toISOString().split('T')[0],
      totalMatches: 0,
      matches: [],
      over25Matches: [],
      over15Matches: [],
      bttsMatches: [],
      winstreakMatches: [],
      losestreakMatches: [],
      drawstreakMatches: [],
      teamToScoreMatches: [],
      teamToScore2PlusMatches: [],
      message: 'Predictions currently unavailable. Please try again later.'
    };
    res.json(fallbackData);
  }
});

router.get('/refresh', requireAdmin, async (req, res) => {
  if (isRefreshing) {
    return res.json({ success: false, message: 'Refresh already in progress' });
  }
  
  isRefreshing = true;
  res.json({ success: true, message: 'Refresh started in background' });
  
  try {
    console.log('Manual refresh triggered');
    await getScraperService().fetchAndCachePredictions();
    console.log('Manual refresh completed');
  } catch (error) {
    console.error('Manual refresh error:', error.message);
  } finally {
    isRefreshing = false;
  }
});

router.post('/ai-summary', async (req, res) => {
  res.status(503).json({ success: false, message: 'AI summary service is currently disabled' });
});

router.get('/corners', async (req, res) => {
  try {
    let cornersData = getScraperService().loadCornersCache();
    
    if (cornersData) {
      const now = Date.now();
      const timeSinceLastScrape = cornersLastScrape ? now - cornersLastScrape : 0;
      const isWithinInterval = timeSinceLastScrape < SCRAPE_INTERVAL_MS;
      
      if (isWithinInterval) {
        console.log('[API] Using cached corners data (within 2-hour window)');
        return res.json(cornersData);
      }
    }
    
    console.log('[API] Scraping corners... (no cache or stale)');
    cornersData = await getScraperService().scrapeCorners();
    cornersLastScrape = Date.now();
    
    res.json(cornersData);
  } catch (err) {
    console.error('Corners error:', err.message);
    res.json({ success: true, totalMatches: 0, matches: [] });
  }
});

let cardsLastScrape = null;

const NEWS_SOURCES = [
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/football/rss' },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news' }
];

let newsCache = { articles: [], lastFetched: null };
const NEWS_CACHE_DURATION = 15 * 60 * 1000;

async function fetchFootballNews() {
  const axios = require('axios');
  const Parser = require('rss-parser');
  const parser = new Parser();
  
  const allArticles = [];
  const seenUrls = new Set();
  
  for (const source of NEWS_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      feed.items.forEach(item => {
        const title = item.title || '';
        if (!seenUrls.has(item.link) && 
            (title.toLowerCase().includes('football') || 
             title.toLowerCase().includes('soccer') ||
             title.toLowerCase().includes('premier league') ||
             title.toLowerCase().includes('champions league') ||
             title.toLowerCase().includes('liga') ||
             title.toLowerCase().includes('world cup') ||
             title.toLowerCase().includes('transfer'))) {
          seenUrls.add(item.link);
          allArticles.push({
            title: title,
            description: item.contentSnippet || item.content || '',
            url: item.link,
            source: source.name,
            image: item.enclosure?.url || null,
            publishedAt: item.pubDate || item.isoDate || null
          });
        }
      });
    } catch (err) {
      console.log(`Error fetching from ${source.name}:`, err.message);
    }
  }
  
  allArticles.sort((a, b) => {
    const dateA = new Date(a.publishedAt || 0);
    const dateB = new Date(b.publishedAt || 0);
    return dateB - dateA;
  });
  
  return allArticles.slice(0, 20);
}

router.get('/news', async (req, res) => {
  const now = Date.now();
  
  if (newsCache.articles.length > 0 && 
      newsCache.lastFetched && 
      (now - newsCache.lastFetched) < NEWS_CACHE_DURATION) {
    return res.json({ success: true, articles: newsCache.articles, cached: true });
  }
  
  try {
    const articles = await fetchFootballNews();
    newsCache = { articles, lastFetched: now };
    res.json({ success: true, articles });
  } catch (error) {
    console.error('News error:', error.message);
    if (newsCache.articles.length > 0) {
      return res.json({ success: true, articles: newsCache.articles, cached: true });
    }
    res.json({ success: false, articles: [], error: 'Failed to fetch news' });
  }
});

router.get('/cards', async (req, res) => {
  try {
    let cardsData = getScraperService().loadCardsCache();
    
    if (cardsData) {
      const now = Date.now();
      const timeSinceLastScrape = cardsLastScrape ? now - cardsLastScrape : 0;
      const isWithinInterval = timeSinceLastScrape < SCRAPE_INTERVAL_MS;
      
      if (isWithinInterval) {
        console.log('[API] Using cached cards data (within 2-hour window)');
        return res.json(cardsData);
      }
    }
    
    console.log('[API] Scraping cards... (no cache or stale)');
    cardsData = await getScraperService().scrapeCards();
    cardsLastScrape = Date.now();
    
    res.json(cardsData);
  } catch (err) {
    console.error('Cards error:', err.message);
    res.json({ success: true, totalMatches: 0, matches: [] });
  }
});

// Articles API
const articlesFile = path.join(__dirname, '../../articles-manifest.json');

router.get('/articles', (req, res) => {
  try {
    const data = fs.readFileSync(articlesFile, 'utf8');
    const articles = JSON.parse(data);
    const today = new Date().toISOString().split('T')[0];
    
    // Split into scheduled and published
    const published = articles.filter(a => a.published);
    const scheduled = articles.filter(a => !a.published);
    
    res.json({ success: true, published, scheduled, all: articles });
  } catch (e) {
    res.json({ success: false, error: e.message, published: [], scheduled: [] });
  }
});

router.post('/articles/publish', requireAdmin, async (req, res) => {
  const { slug } = req.body;
  if (!slug) {
    return res.json({ success: false, error: 'Missing slug' });
  }
  
  try {
    const data = fs.readFileSync(articlesFile, 'utf8');
    const articles = JSON.parse(data);
    
    const updated = articles.map(a => {
      if (a.slug === slug) {
        return { ...a, published: true };
      }
      return a;
    });
    
    const thumbnail = await getGeneratePostThumbnail()(slug);
    fs.writeFileSync(articlesFile, JSON.stringify(updated, null, 2));
    res.json({ success: true, message: `Published ${slug}`, thumbnailGenerated: Boolean(thumbnail) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// H2H Unbeaten Streaks (cached from daily scrape)
const pathH2hCache = path.join(__dirname, '../../h2h-unbeaten-cache.json');
router.get('/h2h-unbeaten', (req, res) => {
  try {
    if (fs.existsSync(pathH2hCache)) {
      const cache = JSON.parse(fs.readFileSync(pathH2hCache, 'utf8'));
      // support both legacy { date, matches } and new { dates: { "date": [...] } } formats
      let dates = cache.dates;
      if (!dates && cache.date && Array.isArray(cache.matches)) {
        dates = { [cache.date]: cache.matches };
      }
      dates = dates || {};
      const requestedDate = req.query.date;
      if (requestedDate && dates[requestedDate]) {
        return res.json({ success: true, date: requestedDate, matches: dates[requestedDate], allDates: Object.keys(dates) });
      }
      return res.json({ success: true, dates, allDates: Object.keys(dates) });
    }
    res.json({ success: true, dates: {}, allDates: [], matches: [], message: 'No data yet - first scrape runs at 4 AM' });
  } catch (e) {
    res.json({ success: false, error: e.message, matches: [] });
  }
});

router.get('/football-odds', async (req, res) => {
  const requestedDate = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return res.status(400).json({ available: false, message: 'date must use YYYY-MM-DD', response: [] });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.json({
      available: false,
      source: 'API-Football',
      message: 'API_FOOTBALL_KEY is not configured',
      response: []
    });
  }

  const cached = footballOddsCache.get(requestedDate);
  const response = await fetchPreMatchOdds(requestedDate);
  if (!response.length && !cached) return res.status(502).json({ available: false, source: 'API-Football', message: 'Pre-match odds are temporarily unavailable', response: [] });
  const payload = footballOddsCache.get(requestedDate).payload;
  res.json({ ...payload, cached: Boolean(cached) });
});

// 2 Odds of the Day is temporarily free for everyone. The ticket engine keeps
// the same data and risk rules; only the membership presentation is disabled.
let twoOddsCache = null;
const TWO_ODDS_CACHE_MS = 10 * 60 * 1000;

router.get('/two-odds/today', async function(req, res) {
  try {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : watDate();
    if (twoOddsCache && twoOddsCache.date === date && Date.now() - twoOddsCache.createdAt < TWO_ODDS_CACHE_MS && twoOddsCache.payload && twoOddsCache.payload.available) {
      return res.json({ ...twoOddsCache.payload, cached: true });
    }
    const predictions = vipPredictionData();
    if (predictions && predictions.isStale) {
      console.log('[two-odds] Pre-match data is stale, triggering background refresh...');
      setImmediate(async () => {
        try {
          await getScraperService().fetchPredictions();
          twoOddsCache = null;
        } catch (e) { console.error('[two-odds] Background refresh failed:', e.message); }
      });
    }
    const [oddsResponse, h2hMatches] = await Promise.all([fetchPreMatchOdds(date), fetchTodayStreaks()]);
    const payload = buildTwoOddsOfDay(predictions, { date: date, oddsResponse: oddsResponse, h2hMatches: h2hMatches });
    if (payload && payload.available) {
      twoOddsCache = { date, createdAt: Date.now(), payload };
      const entry = { date: date, available: true, ticket: payload.ticket, generatedAt: payload.generatedAt, savedAt: new Date().toISOString() };
      try {
        const disk = loadTwoOddsHistoryDisk();
        if (!disk[date]) {
          disk[date] = entry;
          saveTwoOddsHistoryDisk(disk);
          console.log('[two-odds] Saved ticket for', date, 'to history disk cache');
        }
      } catch (e) { console.warn('[two-odds] Failed to save to history disk:', e.message); }
      saveTwoOddsHistorySupabase(date, entry);
    } else {
      twoOddsCache = null;
    }
    res.json({ ...payload, isVip: false, freeAccess: true, feature: '2 Odds of the Day' });
  } catch (error) {
    console.error('[two-odds] Build failed:', error.message);
    res.status(502).json({ available: false, isVip: false, freeAccess: true, feature: '2 Odds of the Day', reason: '2 Odds of the Day is being refreshed. Please check again shortly.', ticket: null });
  }
});

let liveTipsPending = null;

router.get('/live-tips', async (req, res) => {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.json({ available: false, opportunities: [], message: 'Live data is not configured yet.' });
  }

  if (liveTipsCache && Date.now() - liveTipsCache.createdAt < LIVE_TIPS_CACHE_MS) {
    return res.json({ ...liveTipsCache.payload, cached: true });
  }

  if (liveTipsPending) return liveTipsPending.then(function(payload) { res.json(payload); }).catch(function() { res.status(502).json({ available: false, opportunities: [], message: 'Live data is temporarily unavailable.' }); });

  liveTipsPending = (async function() {
    const API_TIMEOUT_MS = 25000;
    const request = async function(endpoint, retries) {
      retries = retries || 1;
      const today = new Date().toISOString().slice(0, 10);
      if (liveTipsBudget.day !== today) liveTipsBudget = { day: today, used: 0, remaining: null };
      if (liveTipsBudget.remaining !== null && liveTipsBudget.remaining <= API_REQUEST_RESERVE) {
        const quotaError = new Error('The daily API quota is nearly exhausted. Tips will resume after the reset.');
        quotaError.code = 'LIVE_TIPS_BUDGET_REACHED';
        throw quotaError;
      }
      if (liveTipsBudget.used >= LIVE_TIPS_DAILY_BUDGET) {
        const quotaError = new Error('The daily live-data budget has been reached. Please check again after the reset.');
        quotaError.code = 'LIVE_TIPS_BUDGET_REACHED';
        throw quotaError;
      }
      liveTipsBudget.used++;
      try {
        const response = await fetch('https://v3.football.api-sports.io/' + endpoint, {
          headers: { 'x-apisports-key': apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS)
        });
        const remaining = Number(response.headers.get('x-ratelimit-requests-remaining'));
        if (Number.isFinite(remaining)) liveTipsBudget.remaining = remaining;
        const data = await response.json();
        if (!response.ok || (data.errors && Object.keys(data.errors).length)) throw new Error(data.message || 'API returned status ' + response.status);
        return Array.isArray(data.response) ? data.response : [];
      } catch (fetchErr) {
        if (retries > 1) throw fetchErr;
        console.warn('[live-tips] Retrying endpoint', endpoint, 'after error:', fetchErr.message);
        liveTipsBudget.used--;
        return request(endpoint, retries + 1);
      }
    };

    const fixtures = await request('fixtures?live=all');
    const candidates = fixtures.filter(function(fixture) {
      const minute = Number(fixture.fixture?.status?.elapsed || 0);
      // At minute 75, exactly 15 minutes remain; after that, exclude it.
      return minute >= 51 && minute <= 75;
    }).sort(function(a, b) {
      const scoreA = asNumber(a.goals?.home) + asNumber(a.goals?.away);
      const scoreB = asNumber(b.goals?.home) + asNumber(b.goals?.away);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return Number(b.fixture?.status?.elapsed || 0) - Number(a.fixture?.status?.elapsed || 0);
    }).slice(0, MAX_LIVE_TIP_CANDIDATES);
    // Do not spend additional quota when there are no matches in the time
    // window that this feature can evaluate.
    if (!candidates.length) {
      const payload = {
        available: true,
        fetchedAt: new Date().toISOString(),
        refreshSeconds: LIVE_TIPS_CACHE_MS / 1000,
        liveMatches: fixtures.length,
        analyzedMatches: 0,
        opportunities: []
      };
      liveTipsCache = { createdAt: Date.now(), payload };
      return payload;
    }
    // Reserve the rest of a full refresh before fetching odds. This avoids
    // spending part of the daily allowance and then failing halfway through
    // the statistics/H2H calls needed to evaluate the shortlist.
    const additionalCalls = 1 + candidates.length * 2;
    if (liveTipsBudget.used + additionalCalls > LIVE_TIPS_DAILY_BUDGET) {
      const quotaError = new Error('The daily live-data budget has been reached. Please check again after the reset.');
      quotaError.code = 'LIVE_TIPS_BUDGET_REACHED';
      throw quotaError;
    }
    const odds = await request('odds/live');
    const oddsByFixture = new Map(odds.map(function(entry) { return [entry.fixture?.id, entry]; }));
    const statistics = await Promise.all(candidates.map(async function(fixture) {
      try {
        const data = await request('fixtures/statistics?fixture=' + encodeURIComponent(fixture.fixture.id));
        return [fixture.fixture.id, data];
      } catch (error) {
        return [fixture.fixture.id, []];
      }
    }));
    const statisticsByFixture = new Map(statistics);
    const headToHead = await Promise.all(candidates.map(async function(fixture) {
      const homeId = fixture.teams?.home?.id;
      const awayId = fixture.teams?.away?.id;
      const cacheKey = [homeId, awayId].sort().join('-');
      const cached = headToHeadCache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < HEAD_TO_HEAD_CACHE_MS) return [fixture.fixture.id, cached.data];
      try {
        const data = await request('fixtures/headtohead?h2h=' + encodeURIComponent(homeId + '-' + awayId) + '&last=10');
        if (headToHeadCache.size >= 200) {
          const oldest = headToHeadCache.keys().next().value;
          headToHeadCache.delete(oldest);
        }
        headToHeadCache.set(cacheKey, { createdAt: Date.now(), data });
        return [fixture.fixture.id, data];
      } catch (error) {
        return [fixture.fixture.id, []];
      }
    }));
    const headToHeadByFixture = new Map(headToHead);
    const payload = {
      available: true,
      fetchedAt: new Date().toISOString(),
      refreshSeconds: LIVE_TIPS_CACHE_MS / 1000,
      liveMatches: fixtures.length,
      analyzedMatches: candidates.length,
      opportunities: buildOpportunities(fixtures, oddsByFixture, statisticsByFixture, headToHeadByFixture)
    };
    console.log('[live-tips] budget=' + liveTipsBudget.used + '/' + LIVE_TIPS_DAILY_BUDGET + ' remaining=' + liveTipsBudget.remaining + ' live=' + fixtures.length + ' candidates=' + candidates.length + ' opportunities=' + payload.opportunities.length);
    liveTipsCache = { createdAt: Date.now(), payload };
    return payload;
  })();

  try {
    const payload = await liveTipsPending;
    res.json(payload);
  } catch (error) {
    if (error.code === 'LIVE_TIPS_BUDGET_REACHED') {
      return res.json({ available: false, opportunities: [], budgetLimited: true, refreshSeconds: LIVE_TIPS_CACHE_MS / 1000, message: error.message });
    }
    console.warn('Live tips request error:', error.message);
    res.status(502).json({ available: false, opportunities: [], message: 'Live data is temporarily unavailable. Please try again shortly.' });
  } finally {
    liveTipsPending = null;
  }
});

const TWO_ODDS_HISTORY_DAYS = 4;
let twoOddsHistoryCache = null;
const TWO_ODDS_HISTORY_CACHE_MS = 30 * 60 * 1000;
const TWO_ODDS_HISTORY_DISK = path.join(__dirname, '..', '..', 'two-odds-history.json');
const TWO_ODDS_HISTORY_MAX_DAYS = 30;

function watDateOffset(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return watDate(d);
}

function loadTwoOddsHistoryDisk() {
  try {
    if (fs.existsSync(TWO_ODDS_HISTORY_DISK)) {
      return JSON.parse(fs.readFileSync(TWO_ODDS_HISTORY_DISK, 'utf8'));
    }
  } catch (e) {
    console.warn('[two-odds-history] Failed to load disk cache:', e.message);
  }
  return {};
}

function saveTwoOddsHistoryDisk(data) {
  try {
    fs.writeFileSync(TWO_ODDS_HISTORY_DISK, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[two-odds-history] Failed to save disk cache:', e.message);
  }
}

async function loadTwoOddsHistorySupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('two_odds_history').select('date, data');
    if (error) throw error;
    const result = {};
    (data || []).forEach(function(row) { result[row.date] = row.data; });
    return result;
  } catch (e) {
    console.warn('[two-odds-history] Supabase load failed:', e.message);
    return null;
  }
}

async function saveTwoOddsHistorySupabase(date, entry) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('two_odds_history').upsert(
      { date: date, data: entry },
      { onConflict: 'date' }
    );
    if (error) throw error;
    console.log('[two-odds-history] Saved ticket for', date, 'to Supabase');
  } catch (e) {
    console.warn('[two-odds-history] Supabase save failed:', e.message);
  }
}

function pruneTwoOddsHistory(disk) {
  const cutoff = watDateOffset(-TWO_ODDS_HISTORY_MAX_DAYS);
  let pruned = false;
  for (const key of Object.keys(disk)) {
    if (key < cutoff) { delete disk[key]; pruned = true; }
  }
  if (pruned) saveTwoOddsHistoryDisk(disk);
}

router.get('/two-odds/history', async function(req, res) {
  try {
    if (twoOddsHistoryCache && Date.now() - twoOddsHistoryCache.createdAt < TWO_ODDS_HISTORY_CACHE_MS) {
      return res.json({ ...twoOddsHistoryCache.payload, cached: true });
    }

    const disk = loadTwoOddsHistoryDisk();
    pruneTwoOddsHistory(disk);

    // Merge Supabase data into disk (durable backup survives restarts)
    const supabaseData = await loadTwoOddsHistorySupabase();
    if (supabaseData) {
      var merged = false;
      Object.keys(supabaseData).forEach(function(key) {
        if (!disk[key]) { disk[key] = supabaseData[key]; merged = true; }
      });
      if (merged) saveTwoOddsHistoryDisk(disk);
    }

    const predictions = vipPredictionData();

    const neededDates = [];
    for (let i = 1; i <= TWO_ODDS_HISTORY_DAYS; i++) {
      neededDates.push(watDateOffset(-i));
    }

    const results = neededDates.map(function(d) { return disk[d] || { date: d, available: false, ticket: null }; });
    const payload = { days: results };
    twoOddsHistoryCache = { createdAt: Date.now(), payload };
    res.json(payload);
  } catch (error) {
    console.error('[two-odds-history] Failed:', error.message);
    res.json({ days: [] });
  }
});

router.get('/live-matches', function (req, res) {
  const data = getCachedLive();
  if (!data) {
    return res.json({ available: false, matches: [], message: 'Live data is being collected. Please check again shortly.' });
  }
  res.json({ available: true, fetchedAt: data.fetchedAt, matchCount: data.matchCount, matches: data.matches });
});

let goldenTipsCache = null;
const GOLDEN_TIPS_CACHE_MS = 60 * 1000;
const MAX_LIVE_DATA_AGE_MS = 20 * 60 * 1000;

router.get('/golden-tips', optionalAuth, async function (req, res) {
  let payload;
  if (goldenTipsCache && Date.now() - goldenTipsCache.createdAt < GOLDEN_TIPS_CACHE_MS) {
    payload = { ...goldenTipsCache.payload, cached: true };
  } else {
    const liveData = getCachedLive();
    const liveDataAge = liveData && liveData.fetchedAt ? Date.now() - new Date(liveData.fetchedAt).getTime() : Infinity;
    if (!liveData || liveDataAge > MAX_LIVE_DATA_AGE_MS || !liveData.matches || liveData.matches.length === 0) {
      var reason = !liveData ? 'noLiveCache' : liveDataAge > MAX_LIVE_DATA_AGE_MS ? 'stale (' + Math.round(liveDataAge / 1000) + 's old)' : 'noMatches';
      console.log('[golden-tips] API returning empty — reason: ' + reason);
      return res.json({ available: false, opportunities: [], message: 'Live data is not available yet. Tips will appear once live matches are detected.' });
    }

    // Return only new, first-time tips published during the current live-data
    // cycle. A fixture is never suggested twice on the same day.
    const opportunities = Array.isArray(liveData.publishedTips) ? liveData.publishedTips : [];

    payload = {
      available: true,
      fetchedAt: new Date().toISOString(),
      matchCount: liveData.matchCount,
      analyzedMatchCount: liveData.detailedMatchCount || 0,
      formMatchCount: liveData.formMatchCount || 0,
      streakMatchCount: liveData.streakMatchCount || 0,
      matchStreakCount: liveData.matchStreakCount || 0,
      refreshSeconds: GOLDEN_TIPS_CACHE_MS / 1000,
      opportunities: opportunities
    };

    console.log('[golden-tips] matches=' + liveData.matchCount + ' opportunities=' + opportunities.length);
    goldenTipsCache = { createdAt: Date.now(), payload };
  }

  // Tips with a signal strength of 70% and above are Pro only. Free users
  // still see the cards, but the tip details are masked with a Pro-only message.
  const isPro = await resolveIsPro(req);
  const allOpportunities = Array.isArray(payload.opportunities) ? payload.opportunities : [];
  const lockedTips = allOpportunities.filter(function (o) { return Number(o.signalScore || 0) >= 70; });
  if (!isPro) {
    payload.opportunities = allOpportunities.map(function (o) {
      if (Number(o.signalScore || 0) >= 70) {
        return Object.assign({}, o, { locked: true, market: '', reason: '' });
      }
      return o;
    });
  }
  payload.isPro = !!isPro;
  payload.lockedCount = lockedTips.length;
  res.json(payload);
});

router.get('/golden-tips/history', function(req, res) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : today;
  res.json({ available: true, date: requestedDate, today, tips: requestedDate === today ? getSettledTodayTips() : getSettledTipsForDate(requestedDate) });
});

// ===== PRO MEMBERSHIP ROUTES =====

// POST /api/register-checkout — paywall-first signup checkout (Whop).
// No account exists yet: a pending registration is stored with a token, and the
// token rides in the Whop checkout metadata. The webhook creates the account
// after payment succeeds, so users cannot register without paying.
router.post('/register-checkout', async function (req, res) {
  try {
    var email = String(req.body.email || '').trim().toLowerCase();
    var fullName = String(req.body.fullName || '').trim();
    var planType = req.body.planType;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (isDisposableEmail(email)) {
      return res.status(400).json({ error: 'Temporary email addresses are not allowed' });
    }
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!whop.PLANS[planType]) {
      return res.status(400).json({ error: 'Invalid plan. Choose: ' + Object.keys(whop.PLANS).join(', ') });
    }
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    var existing = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing.data) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.', code: 'EMAIL_EXISTS' });
    }

    var regToken = crypto.randomBytes(24).toString('hex');
    var inserted = await supabase.from('pending_registrations').insert({
      reg_token: regToken,
      email: email,
      full_name: fullName,
      plan_type: planType,
      status: 'pending'
    });
    if (inserted.error) {
      console.error('[register-checkout] Pending insert failed:', inserted.error.message);
      return res.status(500).json({ error: 'Failed to start registration. Please try again.' });
    }

    var result = await whop.createCheckout({
      userId: null,
      email: email,
      fullName: fullName,
      planType: planType,
      returnUrl: 'https://winfulltime.com/signup.html?paid=1',
      regToken: regToken
    });
    res.json(result);
  } catch (e) {
    console.error('[register-checkout] Failed:', e.message);
    res.status(500).json({ error: 'Failed to create checkout. ' + e.message });
  }
});

// POST /api/checkout — create subscription checkout (Lemon Squeezy or Whop)
router.post('/checkout', requireAuth, async function (req, res) {
  try {
    var planType = req.body.planType;
    var returnUrl = req.body.returnUrl || 'https://winfulltime.com/account.html';
    var provider = activePayment();
    var validPlans = Object.keys(provider.PLANS);
    if (validPlans.indexOf(planType) === -1) {
      return res.status(400).json({ error: 'Invalid plan. Choose: ' + validPlans.join(', ') });
    }
    var result = await provider.createCheckout({
      userId: req.user.id,
      email: req.user.email,
      planType: planType,
      returnUrl: returnUrl
    });
    res.json(result);
  } catch (e) {
    console.error('[checkout] Failed:', e.message);
    res.status(500).json({ error: 'Failed to create checkout. ' + e.message });
  }
});

// POST /api/webhook/payment — Lemon Squeezy webhook (raw body)
router.post('/webhook/payment', function (req, res) {
  console.log('[webhook] Received event');
  if (process.env.PAYMENT_PROVIDER === 'whop') {
    console.log('[webhook] Lemon Squeezy webhook ignored — PAYMENT_PROVIDER=whop');
    return res.status(200).json({ received: true, ignored: true });
  }
  var rawBody = req.rawBody || JSON.stringify(req.body);
  var headers = req.headers;

  payment.verifyWebhook({ rawBody: rawBody, headers: headers }).then(function (verified) {
    if (!verified) {
      console.warn('[webhook] Signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    var event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    var eventId = event.data ? String(event.data.id) : 'unknown';
    var eventName = event.meta ? event.meta.event_name : 'unknown';

    supabase.from('payment_events').select('provider, event_id').eq('provider', 'lemonsqueezy').eq('event_id', eventId).single()
      .then(function (existing) {
        if (existing.data) {
          console.log('[webhook] Duplicate event ignored:', eventId);
          return res.json({ received: true, duplicate: true });
        }

        return supabase.from('payment_events').insert({ provider: 'lemonsqueezy', event_id: eventId }).then(function () {
          return payment.handleEvent(event).then(function (result) {
            console.log('[webhook] Processed event:', eventName, JSON.stringify(result));
            res.json({ received: true, handled: true });
          });
        });
      }).catch(function (err) {
        console.error('[webhook] Error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed' });
      });
  }).catch(function (err) {
    console.error('[webhook] Verification error:', err.message);
    res.status(400).json({ error: 'Webhook verification failed' });
  });
});

// POST /api/whop/checkout — Whop checkout (parallel to /api/checkout for A/B testing)
router.post('/whop/checkout', requireAuth, async function (req, res) {
  try {
    var planType = req.body.planType;
    var returnUrl = req.body.returnUrl || 'https://winfulltime.com/account.html';
    var validPlans = Object.keys(whop.PLANS);
    if (validPlans.indexOf(planType) === -1) {
      return res.status(400).json({ error: 'Invalid plan. Choose: ' + validPlans.join(', ') });
    }
    var result = await whop.createCheckout({
      userId: req.user.id,
      email: req.user.email,
      planType: planType,
      returnUrl: returnUrl
    });
    res.json(result);
  } catch (e) {
    console.error('[whop/checkout] Failed:', e.message);
    res.status(500).json({ error: 'Failed to create Whop checkout. ' + e.message });
  }
});

// POST /api/webhook/whop — Whop webhook (Standard Webhooks, raw body)
router.post('/webhook/whop', function (req, res) {
  console.log('[whop-webhook] Received event');
  var rawBody = req.rawBody || JSON.stringify(req.body);
  var headers = req.headers;

  whop.verifyWebhook({ rawBody: rawBody, headers: headers }).then(function (verified) {
    if (!verified) {
      console.warn('[whop-webhook] Signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    var event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    var eventId = String(headers['webhook-id'] || (event.id || 'unknown'));
    var eventName = event.type || 'unknown';

    supabase.from('payment_events').select('provider, event_id').eq('provider', 'whop').eq('event_id', eventId).single()
      .then(function (existing) {
        if (existing.data) {
          console.log('[whop-webhook] Duplicate event ignored:', eventId);
          return res.json({ received: true, duplicate: true });
        }

        return supabase.from('payment_events').insert({ provider: 'whop', event_id: eventId }).then(function () {
          return whop.handleEvent(event).then(function (result) {
            console.log('[whop-webhook] Processed event:', eventName, JSON.stringify(result));
            res.json({ received: true, handled: true });
          });
        });
      }).catch(function (err) {
        console.error('[whop-webhook] Error:', err.message);
        res.status(500).json({ error: 'Webhook processing failed' });
      });
  }).catch(function (err) {
    console.error('[whop-webhook] Verification error:', err.message);
    res.status(400).json({ error: 'Webhook verification failed' });
  });
});

// GET /api/whop/portal — Whop manage/cancel (parallel to /api/portal)
router.get('/whop/portal', requireAuth, function (req, res) {
  if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

  supabase.from('subscriptions')
    .select('payment_id')
    .eq('user_id', req.user.id)
    .eq('payment_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(function (sub) {
      if (!sub.data || !sub.data.payment_id) {
        return res.json({ error: 'No active subscription found' });
      }
      return whop.createCustomerPortal({ subscriptionId: sub.data.payment_id }).then(function (result) {
        res.json(result);
      });
    })
    .catch(function (err) {
      console.error('[whop/portal] Error:', err.message);
      res.status(500).json({ error: 'Failed to get portal URL' });
    });
});

// POST /api/whop/cancel — cancel active Whop subscription (parallel to /api/cancel)
router.post('/whop/cancel', requireAuth, function (req, res) {
  if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

  supabase.from('subscriptions')
    .select('payment_id')
    .eq('user_id', req.user.id)
    .eq('payment_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(function (sub) {
      if (!sub.data || !sub.data.payment_id) {
        return res.json({ error: 'No active subscription found' });
      }
      return whop.cancelSubscription(sub.data.payment_id).then(function () {
        res.json({ ok: true });
      });
    })
    .catch(function (err) {
      console.error('[whop/cancel] Error:', err.message);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    });
});

// POST /api/ticket-builder/generate — Pro members only
router.post('/ticket-builder/generate', optionalAuth, async function (req, res) {
  try {
    var isLifetime = false;
    var isVip = false;

    if (req.user) {
      if (!supabase) return res.status(503).json({ error: 'Service unavailable' });
      try {
        var prof = await supabase.from('profiles').select('vip_status, vip_expires_at').eq('id', req.user.id).single();
        isVip = prof.data && (prof.data.vip_status === 'vip' || prof.data.vip_status === 'admin') && (!prof.data.vip_expires_at || new Date(prof.data.vip_expires_at) > new Date());
      } catch (e) {}
      if (isVip) {
        try {
          var sub = await supabase.from('subscriptions').select('plan_type').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          isLifetime = sub.data && sub.data.plan_type === 'lifetime';
        } catch (e) {}
      }
    }

    if (!isVip) {
      return res.status(403).json({
        error: 'The Accumulator Ticket Builder is available to Pro members only. Upgrade to Pro to unlock it.',
        isPro: false,
        upgradeUrl: '/pricing.html'
      });
    }

    var PRO_MAX_LEGS = 30;
    var PRO_MAX_ODDS = 500;

    var body = req.body || {};
    var requestedLegs = parseInt(body.numLegs, 10) || 3;
    var requestedMaxOdds = parseFloat(body.maxOdds) || PRO_MAX_ODDS;

    var clampedLegs = Math.min(requestedLegs, PRO_MAX_LEGS);
    var clampedMaxOdds = Math.min(requestedMaxOdds, PRO_MAX_ODDS);

    var date = watDate();
    var predictions = vipPredictionData();
    var oddsResponse = await fetchPreMatchOdds(date);
    var h2hMatches = await fetchTodayStreaks();

    var buildOpts = {
      date: date,
      oddsResponse: oddsResponse,
      h2hMatches: h2hMatches,
      markets: body.markets,
      safeOnly: body.safeOnly === true,
      numLegs: clampedLegs,
      maxOdds: clampedMaxOdds,
      minOddsPerLeg: parseFloat(body.minOddsPerLeg) || 1.20,
      maxOddsPerLeg: parseFloat(body.maxOddsPerLeg) || 100,
      targetOdds: parseFloat(body.targetOdds) || 20,
      shuffle: body.shuffle === true
    };

    var payload = buildTicket(predictions, buildOpts);
    res.json({
      ...payload,
      tier: isLifetime ? 'lifetime' : 'pro',
      isPro: true,
      isLifetime: isLifetime,
      limit: null,
      remaining: null,
      maxLegs: PRO_MAX_LEGS,
      maxOdds: PRO_MAX_ODDS
    });
  } catch (e) {
    console.error('[ticket-builder] Error:', e.message);
    console.error('[ticket-builder] Stack:', e.stack);
    res.status(500).json({ error: 'Failed to generate ticket' });
  }
});

// GET /api/best-picks — top pick per category, cached once per day
var DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || path.join(__dirname, '../../data');

router.get('/best-picks', optionalAuth, async function (req, res) {
  try {
    function applyTier(payload) {
      payload.isPro = true;
      return payload;
    }

    var CACHE_DIR = path.join(DATA_ROOT, 'best-picks');
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
    var TODAY_FM = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var TODAY_SYSTEM = new Date().toISOString().slice(0, 10);
    var CACHE_PATH = path.join(CACHE_DIR, TODAY_FM + '.json');

    // Serve from cache if exists and has picks
    try {
      var cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (cached && cached.generatedAt && cached.today && cached.today.length > 0) {
        return res.json(applyTier(cached));
      }
    } catch (e) {}

    // Win Streak & Unbeaten from h2h data — the fresh copy is regenerated
    // daily by CI and served on the CDN; fall back to committed/static copies.
    // Try multiple origins: Cloudflare CDN can block datacenter IPs, so also
    // try the GitHub Pages origin and github.io raw endpoint.
    var H2H_ORIGINS = [
      'https://winfulltime.com/data/h2h-unbeaten.json',
      'https://skinmalata.github.io/scrapertipster-railway/data/h2h-unbeaten.json'
    ];
    var h2hData = { dates: {} };
    for (var h2hOriginIdx = 0; h2hOriginIdx < H2H_ORIGINS.length; h2hOriginIdx++) {
      try {
        var h2hRes = await fetch(H2H_ORIGINS[h2hOriginIdx], { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) });
        var h2hJson = await h2hRes.json();
        if (h2hJson && h2hJson.dates && Object.keys(h2hJson.dates).length > 0) { h2hData = h2hJson; break; }
      } catch (e) {}
    }
    if (!h2hData || Object.keys(h2hData.dates).length === 0) {
      try { h2hData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../h2h-unbeaten-cache.json'), 'utf8')); } catch (e) {}
    }
    if (!h2hData || Object.keys(h2hData.dates).length === 0) {
      try { h2hData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/h2h-unbeaten.json'), 'utf8')); } catch (e) {}
    }
    if (!h2hData || !h2hData.dates) h2hData = { dates: {} };

    var AUTHOR_DIR = path.join(DATA_ROOT, 'author-picks');
    var todayPicks = [];
    var bestByType = {};

    function fmtTime(kickoff) {
      if (!kickoff) return '';
      try { return new Date(kickoff).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }) + ' WAT'; } catch (e) { return ''; }
    }

    function considerPick(p) {
      if (!p || !p.type) return;
      var cur = bestByType[p.type];
      if (!cur || p.probability > cur.probability) bestByType[p.type] = p;
    }

    function mapTip(match) {
      var tip = match.tip;
      if (!tip || !tip.market) return null;
      var sel = String(tip.selection || tip.tip || '');
      var conf = Number(tip.confidence) || 0;
      var market = tip.market;
      if (market === 'Match Winner' && /^[1X2]$/.test(sel)) return { type: '1x2', label: '1X2', tip: sel, probability: conf, match: match };
      if (market === 'Goals Over/Under') {
        var m = sel.match(/^Over\s+(\d+\.?\d*)$/);
        if (m) { var ov = parseFloat(m[1]);
          if (ov === 1.5) return { type: 'over15', label: 'Over 1.5', tip: sel, probability: conf, match: match };
          if (ov === 2.5) return { type: 'over25', label: 'Over 2.5', tip: sel, probability: conf, match: match };
        }
      }
      if (market === 'Both Teams Score') {
        if (sel === 'BTTS Yes') return { type: 'btts', label: 'BTTS Yes', tip: 'BTTS YES', probability: conf, match: match };
        if (sel === 'BTTS No') return { type: 'bttsNo', label: 'BTTS No', tip: 'BTTS NO', probability: conf, match: match };
      }
      if (market === 'Corners') return { type: 'corners', label: 'Corners', tip: sel, probability: conf, match: match };
      if (market === 'Cards') return { type: 'cards', label: 'Cards', tip: sel, probability: conf, match: match };
      return null;
    }
    var CATEGORY_DEFS = [
      { type: '1x2', label: '1X2' }, { type: 'over15', label: 'Over 1.5' }, { type: 'over25', label: 'Over 2.5' },
      { type: 'btts', label: 'BTTS Yes' }, { type: 'bttsNo', label: 'BTTS No' },
      { type: 'corners', label: 'Corners' }, { type: 'cards', label: 'Cards' }
    ];

    // Author Picks — the server cron pre-builds today's file; never build here.
    var authorPicks = [];
    try {
      var raw = JSON.parse(fs.readFileSync(path.join(AUTHOR_DIR, TODAY_FM + '.json'), 'utf8'));
      authorPicks = raw.matches || [];
    } catch (e) {}

    if (authorPicks && authorPicks.length > 0) {
      authorPicks.forEach(function(m) {
        var mapped = mapTip(m);
        if (!mapped) return;
        var mm = mapped.match;
        considerPick({ type: mapped.type, category: mapped.label, match: mm.home + ' - ' + mm.away,
          tip: mapped.tip, probability: mapped.probability, league: mm.league || '', time: fmtTime(mm.kickoff),
          streak: null, streakTeam: null, isHome: null });
      });
    }

    // Scraper cache — reliable coverage of every category, merged with Author
    // Picks above so nothing is missing when Author Picks only covers 1X2.
    var preds = vipPredictionData();
    if (preds && Object.keys(preds).length > 0) {
      [
        { key: 'matches', label: '1X2', type: '1x2' },
        { key: 'over15Matches', label: 'Over 1.5', type: 'over15' },
        { key: 'over25Matches', label: 'Over 2.5', type: 'over25' },
        { key: 'bttsMatches', label: 'BTTS Yes', type: 'btts' },
        { key: 'bttsNoMatches', label: 'BTTS No', type: 'bttsNo' },
        { key: 'cornersMatches', label: 'Corners', type: 'corners' },
        { key: 'cardsMatches', label: 'Cards', type: 'cards' }
      ].forEach(function(cat) {
        var arr = Array.isArray(preds[cat.key]) ? preds[cat.key] : [];
        if (arr.length === 0) return;
        var dates = {};
        arr.forEach(function(x) { if (x.date) dates[x.date] = true; });
        var dateKeys = Object.keys(dates).sort();
        var targetDate = dateKeys.indexOf(TODAY_SYSTEM) !== -1 ? TODAY_SYSTEM : (dateKeys.pop() || '');
        if (targetDate) arr = arr.filter(function(x) { return x.date === targetDate || !x.date; });
        if (arr.length === 0) return;
        var best = arr.reduce(function(a, b) { return (Number(b.probability) || 0) > (Number(a.probability) || 0) ? b : a; });
        var tip = best.tip || '';
        if (cat.type === 'cards' && /^Over 9\.5 Cards/i.test(tip)) tip = 'Over 3.5 Cards';
        if (cat.type === 'corners' && /^Over 9\.5 Corners/i.test(tip)) tip = 'Over 8.5 Corners';
        var prob = Number(best.probability) || 0;
        if (cat.type === 'corners' || cat.type === 'cards') prob = Math.min(prob, 92);
        considerPick({ type: cat.type, category: cat.label, match: best.nextMatch || best.match || '',
          tip: tip, probability: prob,
          league: best.league || '', time: best.time || '',
          streak: null, streakTeam: null, isHome: null });
      });
    }

    // Only confident selections qualify as "best picks".
    var MIN_BEST = 60;
    CATEGORY_DEFS.forEach(function(def) {
      var entry = bestByType[def.type];
      if (!entry || entry.probability < MIN_BEST) return;
      todayPicks.push({ category: def.label, type: def.type, match: entry.match, tip: entry.tip,
        probability: entry.probability, league: entry.league, time: entry.time,
        streak: entry.streak, streakTeam: entry.streakTeam, isHome: entry.isHome });
    });

    // Win Streak & Unbeaten — prefer the server-side h2hstats fetch (reachable
    // from Render, includes both win and unbeaten streaks), fall back to the
    // CI/CDN h2h file which only carries unbeaten data.
    var liveStreakMatches = [];
    try { liveStreakMatches = await fetchTodayStreaks(); } catch (e) {}

    ['winStreak', 'unbeaten'].forEach(function(streakType) {
      var label = streakType === 'winStreak' ? 'Win Streak' : 'Unbeaten';
      var picks = [];

      (liveStreakMatches || []).forEach(function(m) {
        var home = String(m.home || '').trim();
        var away = String(m.away || '').trim();
        (m.streaks && m.streaks.all || []).forEach(function(s) {
          var isHome = s.team === home;
          if (streakType === 'winStreak') {
            if (s.type !== 'win') return;
            var prob = Math.min(s.count * 4, 85);
            picks.push({ match: m.match, nextMatch: m.match,
              tip: (isHome ? home : away) + ' to Win', probability: prob,
              league: m.league || '', time: m.time || '',
              streak: s.count, streakTeam: s.team, isHome: isHome });
          } else {
            if (s.type !== 'unbeaten') return;
            var prob = Math.min(s.count * 4, 85);
            picks.push({ match: m.match, nextMatch: m.match,
              tip: s.team + ' Unbeaten (' + s.count + ')', probability: prob,
              league: m.league || '', time: m.time || '',
              streak: s.count, streakTeam: s.team, isHome: isHome });
          }
        });
      });

      if (picks.length === 0) {
        var h2hDate = h2hData.dates[TODAY_SYSTEM] ? TODAY_SYSTEM : Object.keys(h2hData.dates).sort().pop() || '';
        var streakMatches = h2hData.dates[h2hDate] || [];
        streakMatches.forEach(function(m) {
          var home = String(m.home || '').trim();
          var away = String(m.away || '').trim();
          (m.streaks || []).forEach(function(s) {
            var isHome = s.team === home;
            var raw = String(s.text || '').toLowerCase();
            if (streakType === 'winStreak') {
              if (!raw.includes(' won') && !raw.includes('won ')) return;
            } else {
              if (!raw.includes('unbeaten') && !raw.includes('no losses')) return;
            }
            var tip = streakType === 'winStreak'
              ? (isHome ? home + ' to Win' : away + ' to Win')
              : s.team + ' Unbeaten (' + s.count + ')';
            var prob = Math.min(s.count * 4, 85);
            picks.push({
              match: m.match, nextMatch: m.match,
              tip: tip, probability: prob,
              league: m.league || '', time: m.time || '',
              streak: s.count, streakTeam: s.team, isHome: isHome
            });
          });
        });
      }

      var best = picks.reduce(function(b, item) {
        return (item.probability > (b ? b.probability : 0)) ? item : b;
      }, null);
      if (best) {
        todayPicks.push({
          category: label, type: streakType,
          match: best.match, tip: best.tip,
          probability: best.probability, league: best.league,
          time: best.time, streak: best.streak,
          streakTeam: best.streakTeam, isHome: best.isHome
        });
      }
    });

    function evaluateTip(tipStr, score) {
      if (!score || typeof score.home !== 'number') return 'pending';
      var total = score.home + score.away;
      var t = String(tipStr || '');
      if (t === '1') return score.home > score.away ? 'won' : 'lost';
      if (t === '2') return score.away > score.home ? 'won' : 'lost';
      if (t === 'X') return score.home === score.away ? 'won' : 'lost';
      if (/^Over\s+(\d+\.?\d*)$/.test(t)) { var ov = parseFloat(RegExp.$1); return total > ov ? 'won' : 'lost'; }
      if (/^Under\s+(\d+\.?\d*)$/.test(t)) { var uv = parseFloat(RegExp.$1); return total < uv ? 'won' : 'lost'; }
      if (/^BTTS\s+YES/i.test(t)) return score.home > 0 && score.away > 0 ? 'won' : 'lost';
      if (/^BTTS\s+NO/i.test(t)) return score.home === 0 || score.away === 0 ? 'won' : 'lost';
      return 'pending';
    }

    // History — prefer the CI-enriched CDN predictions (results embedded),
    // which works without any author-picks files on the server.
    var history = [];
    try {
      var cdnPred = null;
      var PRED_ORIGINS = [
        'https://winfulltime.com/data/predictions.json',
        'https://skinmalata.github.io/scrapertipster-railway/data/predictions.json'
      ];
      for (var predOriginIdx = 0; predOriginIdx < PRED_ORIGINS.length; predOriginIdx++) {
        try {
          var cdnRes = await fetch(PRED_ORIGINS[predOriginIdx], { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: AbortSignal.timeout(10000) });
          var candidate = await cdnRes.json();
          if (candidate && Array.isArray(candidate.matches) && candidate.matches.length > 0) { cdnPred = candidate; break; }
        } catch (e) {}
      }

      if (cdnPred) {
        var HISTORY_KEYS = [
          { key: 'matches', label: '1X2', type: '1x2' },
          { key: 'over15Matches', label: 'Over 1.5', type: 'over15' },
          { key: 'over25Matches', label: 'Over 2.5', type: 'over25' },
          { key: 'bttsMatches', label: 'BTTS Yes', type: 'btts' },
          { key: 'bttsNoMatches', label: 'BTTS No', type: 'bttsNo' },
          { key: 'cornersMatches', label: 'Corners', type: 'corners' },
          { key: 'cardsMatches', label: 'Cards', type: 'cards' }
        ];
        var byDate = {};
        HISTORY_KEYS.forEach(function(mk) {
          var arr = Array.isArray(cdnPred[mk.key]) ? cdnPred[mk.key] : [];
          arr.forEach(function(m) {
            var d = String(m.date || '').slice(0, 10);
            if (!d || d >= TODAY_SYSTEM) return;
            var prob = Number(m.probability) || 0;
            if (!byDate[d]) byDate[d] = {};
            var cur = byDate[d][mk.type];
            if (!cur || prob > cur.probability) {
              byDate[d][mk.type] = { category: mk.label, type: mk.type, match: m.match || m.nextMatch || '',
                tip: m.tip || '', probability: prob, result: m.result || null };
            }
          });
        });
        Object.keys(byDate).sort().slice(-3).forEach(function(d) {
          var dayPicks = [];
          CATEGORY_DEFS.forEach(function(def) {
            var entry = byDate[d][def.type];
            if (!entry) return;
            var outcome = 'pending';
            var scoreStr = null;
            if (entry.result && typeof entry.result.home === 'number') {
              outcome = evaluateTip(entry.tip, entry.result);
              scoreStr = entry.result.home + '-' + entry.result.away;
            }
            dayPicks.push({ category: def.label, type: def.type, match: entry.match, tip: entry.tip,
              probability: entry.probability, outcome: outcome, score: scoreStr,
              streakTeam: null, isHome: null });
          });
          if (dayPicks.length > 0) history.push({ date: d, picks: dayPicks });
        });
      }
    } catch (e) {}

    // Fallback: evaluate past Author Picks files (local dev / when present).
    if (history.length === 0) {
      var allDates = [];
      try {
        var files = fs.readdirSync(AUTHOR_DIR).filter(function(f) { return /^\d{8}\.json$/.test(f) && f.slice(0, 8) !== TODAY_FM; }).sort().slice(-3);
        files.forEach(function(f) { allDates.push(f.slice(0, 8)); });
      } catch (e) {}

      var fotmobDateCache = {};
      async function fetchFotMobForDate(fmDate) {
        try {
          var url = 'https://www.fotmob.com/api/data/matches?date=' + fmDate;
          var res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
          var data = await res.json();
          var out = {};
          if (data && data.leagues) {
            data.leagues.forEach(function(l) {
              (l.matches || []).forEach(function(m) {
                if (m.status && m.status.finished && !m.status.ongoing && m.status.scoreStr) {
                  var parts = String(m.status.scoreStr).match(/(\d+)\s*-\s*(\d+)/);
                  if (parts) {
                    var key = (m.home ? m.home.name : '') + ' - ' + (m.away ? m.away.name : '');
                    out[key] = { home: parseInt(parts[1], 10), away: parseInt(parts[2], 10), league: l.name || '' };
                  }
                }
              });
            });
          }
          return out;
        } catch (e) { return {}; }
      }

      for (var hi = 0; hi < allDates.length; hi++) {
        var fmDate = allDates[hi];
        var niceDate = fmDate.slice(0, 4) + '-' + fmDate.slice(4, 6) + '-' + fmDate.slice(6, 8);
        var dayPicks = [];
        try {
          var dayData = JSON.parse(fs.readFileSync(path.join(AUTHOR_DIR, fmDate + '.json'), 'utf8'));
          var dayMatches = dayData.matches || [];
          if (!fotmobDateCache[fmDate]) fotmobDateCache[fmDate] = await fetchFotMobForDate(fmDate);
          var fotmobResults = fotmobDateCache[fmDate] || {};
          var dayBest = {};
          dayMatches.forEach(function(m) {
            var mapped = mapTip(m);
            if (!mapped) return;
            var t = mapped.type;
            if (!dayBest[t] || mapped.probability > dayBest[t].probability) dayBest[t] = mapped;
          });
          CATEGORY_DEFS.forEach(function(def) {
            var entry = dayBest[def.type];
            if (!entry) return;
            var mm = entry.match;
            var matchName = mm.home + ' - ' + mm.away;
            var score = fotmobResults[matchName] || null;
            var outcome = score ? evaluateTip(entry.tip, score) : 'pending';
            dayPicks.push({
              category: def.label, type: def.type,
              match: matchName, tip: entry.tip,
              probability: entry.probability,
              outcome: outcome,
              score: score ? score.home + '-' + score.away : null,
              streakTeam: null, isHome: null
            });
          });
        } catch (e) {}
        if (dayPicks.length > 0) history.push({ date: niceDate, picks: dayPicks });
      }
    }

    var payload = { today: todayPicks, history: history, generatedAt: new Date().toISOString() };
    try { fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), 'utf8'); } catch (e) {}
    res.json(applyTier(payload));
  } catch (e) {
    console.error('[best-picks] Error:', e.message);
    res.status(500).json({ error: 'Failed to load best picks' });
  }
});

async function resolveIsPro(req) {
  if (!req.user) return false;
  try {
    var prof = await supabase.from('profiles').select('vip_status, vip_expires_at').eq('id', req.user.id).single();
    return !!(prof.data && (prof.data.vip_status === 'vip' || prof.data.vip_status === 'admin') && (!prof.data.vip_expires_at || new Date(prof.data.vip_expires_at) > new Date()));
  } catch (e) { return false; }
}

// GET /api/author-picks — all today's fixtures with best tip per match.
// Free users get a preview of only 4 tips; Pro members see all picks.
router.get('/author-picks', optionalAuth, async function (req, res) {
  try {
    var data = await buildGiantPool();
    var isPro = await resolveIsPro(req);
    var matches = data.matches || [];
    var payload = {
      matches: matches,
      totalFixtures: data.totalFixtures,
      analyzedFixtures: data.analyzedFixtures,
      generatedAt: data.generatedAt,
      isPro: isPro
    };
    if (!isPro) {
      payload.totalTips = matches.length;
      payload.matches = matches.slice(0, 4);
    }
    res.json(payload);
  } catch (e) {
    console.error('[author-picks] Error:', e.message);
    res.status(500).json({ error: 'Failed to build author picks' });
  }
});

// GET /api/author-picks/history — past performance.
// Free users get a preview of only 4 tips per day.
router.get('/author-picks/history', optionalAuth, async function (req, res) {
  try {
    var days = Math.min(5, Math.max(1, parseInt(req.query.days, 10) || 3));
    var data = await getGiantPoolHistory(days);
    var isPro = await resolveIsPro(req);
    if (!isPro) {
      data = (data || []).map(function (day) {
        var matches = (day.matches || []).slice(0, 4);
        var won = 0, lost = 0, push = 0, pending = 0;
        matches.forEach(function (m) {
          if (m.outcome === 'won') won++;
          else if (m.outcome === 'lost') lost++;
          else if (m.outcome === 'push') push++;
          else pending++;
        });
        return Object.assign({}, day, { matches: matches, won: won, lost: lost, push: push, pending: pending });
      });
    }
    res.json({ days: data, isPro: isPro });
  } catch (e) {
    console.error('[author-picks/history] Error:', e.message);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// GET /api/me/subscription — caller's subscription info
router.get('/me/subscription', requireAuth, async function (req, res) {
  try {
    if (!supabase) return res.json({ isPro: false, error: 'Service unavailable' });

    var prof = await supabase.from('profiles').select('vip_status, vip_expires_at, created_at').eq('id', req.user.id).single();
    var sub = await supabase.from('subscriptions').select('plan_type, payment_status, expires_at, started_at, payment_id')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

    var profile = prof.data;
    var subscription = sub.data;
    var isAdmin = profile && profile.vip_status === 'admin';
    var isPro = isAdmin || (profile && profile.vip_status === 'vip' && new Date(profile.vip_expires_at) > new Date());

    var emailConfirmed = false;
    var header = String(req.headers.authorization || '');
    var tokenMatch = header.match(/^Bearer\s+(.+)$/i);
    if (tokenMatch && supabase) {
      try {
        var userResult = await supabase.auth.getUser(tokenMatch[1]);
        if (userResult.data && userResult.data.user) {
          emailConfirmed = !!userResult.data.user.email_confirmed_at;
        }
      } catch (e) {}
    }

    res.json({
      isPro: isPro,
      isAdmin: isAdmin,
      email: req.user.email,
      emailConfirmed: emailConfirmed,
      plan: isAdmin ? 'admin' : (subscription ? subscription.plan_type : null),
      status: subscription ? subscription.payment_status : null,
      expiresAt: subscription && subscription.expires_at ? subscription.expires_at : null,
      memberSince: profile ? profile.created_at : null,
      paymentId: subscription ? subscription.payment_id : null
    });
  } catch (e) {
    console.error('[me/subscription] Error:', e.message);
    res.json({ isPro: false, error: 'Failed to load subscription' });
  }
});

// GET /api/portal — customer portal (Lemon Squeezy or Whop)
router.get('/portal', requireAuth, function (req, res) {
  if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

  supabase.from('subscriptions')
    .select('payment_id')
    .eq('user_id', req.user.id)
    .eq('payment_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(function (sub) {
      if (!sub.data || !sub.data.payment_id) {
        return res.json({ error: 'No active subscription' });
      }
      return activePayment().createCustomerPortal({ subscriptionId: sub.data.payment_id })
        .then(function (result) {
          if (result.error) return res.json({ error: result.error });
          res.json({ url: result.url });
        });
    }).catch(function (err) {
      console.error('[portal] Error:', err.message);
      res.status(500).json({ error: 'Failed to get portal URL' });
    });
});

// POST /api/subscription/cancel — cancel subscription (Lemon Squeezy or Whop)
router.post('/subscription/cancel', requireAuth, function (req, res) {
  if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

  supabase.from('subscriptions')
    .select('payment_id')
    .eq('user_id', req.user.id)
    .eq('payment_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then(function (sub) {
      if (!sub.data || !sub.data.payment_id) {
        return res.json({ error: 'No active subscription found' });
      }
      return activePayment().cancelSubscription(sub.data.payment_id)
        .then(function () {
          res.json({ message: 'Subscription cancelled' });
        });
    }).catch(function (err) {
      console.error('[cancel] Error:', err.message);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    });
});

// POST /api/validate-email — server-side email validation
router.post('/validate-email', async function (req, res) {
  try {
    var email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ valid: false, error: 'Invalid email format' });
    }
    if (isDisposableEmail(email)) {
      return res.json({ valid: false, error: 'Temporary email addresses are not allowed' });
    }
    if (supabase) {
      var existing = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
      if (existing.data) {
        return res.json({ valid: false, error: 'An account with this email already exists' });
      }
    }
    res.json({ valid: true });
  } catch (e) {
    console.error('[validate-email] Error:', e.message);
    res.json({ valid: false, error: 'Validation service unavailable' });
  }
});

// ===== ADMIN ROUTES =====

// GET /api/admin/users — list users with search + pagination
router.get('/admin/users', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var page = Math.max(1, parseInt(req.query.page, 10) || 1);
    var perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    var search = String(req.query.search || '').trim();

    var fromRow = (page - 1) * perPage;
    var toRow = fromRow + perPage - 1;

    var query = supabase.from('profiles')
      .select('id, email, full_name, vip_status, vip_expires_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('email', '%' + search + '%');
    }

    var result = await query.range(fromRow, toRow);
    if (result.error) return res.status(500).json({ error: result.error.message });

    var userIds = (result.data || []).map(function(u) { return u.id; });
    var subs = [];
    if (userIds.length) {
      var subRes = await supabase.from('subscriptions')
        .select('user_id, plan_type, payment_status, expires_at, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });
      if (!subRes.error) subs = subRes.data || [];
    }

    var subMap = {};
    subs.forEach(function(s) {
      if (!subMap[s.user_id]) subMap[s.user_id] = s;
    });

    var users = (result.data || []).map(function(u) {
      var sub = subMap[u.id] || null;
      return {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        vipStatus: u.vip_status,
        vipExpiresAt: u.vip_expires_at,
        joinedAt: u.created_at,
        plan: sub ? sub.plan_type : null,
        paymentStatus: sub ? sub.payment_status : null,
        expiresAt: sub ? sub.expires_at : null
      };
    });

    res.json({
      users: users,
      total: result.count || users.length,
      page: page,
      perPage: perPage,
      search: search || null
    });
  } catch (e) {
    console.error('[admin/users] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users — create a new user with an admin-chosen password and plan
router.post('/admin/users', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var email = String(req.body.email || '').trim().toLowerCase();
    var fullName = String(req.body.fullName || '').trim();
    var password = req.body.password ? String(req.body.password) : '';
    var planType = req.body.planType || 'free';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (isDisposableEmail(email)) {
      return res.status(400).json({ error: 'Temporary email addresses are not allowed' });
    }
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (['free', 'monthly', 'yearly', 'lifetime', 'admin'].indexOf(planType) === -1) {
      return res.status(400).json({ error: 'Invalid plan. Choose: free, monthly, yearly, lifetime, admin' });
    }

    var existing = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing.data) {
      return res.status(409).json({ error: 'An account with this email already exists', code: 'EMAIL_EXISTS' });
    }

    var createResult = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (createResult.error) {
      return res.status(500).json({ error: 'Failed to create user: ' + createResult.error.message });
    }
    var userId = createResult.data && createResult.data.user && createResult.data.user.id;
    if (!userId) {
      return res.status(500).json({ error: 'Account created without a user id' });
    }

    // Apply the chosen plan/status in the same step.
    if (planType === 'admin') {
      await supabase.from('profiles').update({
        vip_status: 'admin',
        vip_expires_at: null,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan_type: 'admin',
        payment_id: 'admin_' + userId,
        payment_status: 'active',
        amount: 0,
        currency: 'USD',
        expires_at: new Date(Date.now() + 864e11).toISOString()
      }, { onConflict: 'payment_id' });
    } else if (planType !== 'free') {
      var expiryDate = new Date();
      if (planType === 'yearly') expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      else if (planType === 'lifetime') expiryDate.setFullYear(expiryDate.getFullYear() + 99);
      else expiryDate.setMonth(expiryDate.getMonth() + 1);

      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan_type: planType,
        payment_id: 'manual_' + userId + '_' + Date.now(),
        payment_status: 'active',
        amount: 0,
        currency: 'USD',
        expires_at: expiryDate.toISOString()
      }, { onConflict: 'payment_id' });

      var rpcResult = await supabase.rpc('set_vip_status', {
        user_uuid: userId,
        vip_expires: expiryDate.toISOString()
      });
      if (rpcResult.error) {
        return res.status(500).json({ error: 'User created but VIP setup failed: ' + rpcResult.error.message });
      }
    }

    logAdminAction(req.user, 'create_user', userId, email, { fullName: fullName, planType: planType });

    res.json({ success: true, userId: userId, email: email, planType: planType, message: 'User created' });
  } catch (e) {
    console.error('[admin/create-user] Error:', e.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/admin/users/:id — full user details
router.get('/admin/users/:id', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;
    var prof = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (prof.error) return res.status(404).json({ error: 'User not found' });

    var subs = await supabase.from('subscriptions')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false });
    var pymts = await supabase.from('payments')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false });
    var usg = await supabase.from('usage')
      .select('*').eq('user_id', userId).order('usage_date', { ascending: false }).limit(30);

    res.json({
      profile: prof.data,
      subscriptions: subs.data || [],
      payments: pymts.data || [],
      usage: usg.data || []
    });
  } catch (e) {
    console.error('[admin/users/:id] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// POST /api/admin/users/:id/set-vip — manually set VIP
router.post('/admin/users/:id/set-vip', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;
    var planType = req.body.planType || 'monthly';
    var expiresAt = req.body.expiresAt || null;

    if (['monthly', 'yearly', 'lifetime'].indexOf(planType) === -1) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    var targetProfile = await supabase.from('profiles').select('email, vip_status').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });
    if (targetProfile.data.vip_status === 'admin') {
      return res.status(400).json({ error: 'Cannot change VIP on an admin account' });
    }

    var expiryDate = expiresAt ? new Date(expiresAt) : new Date();
    if (!expiresAt) {
      if (planType === 'yearly') expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      else if (planType === 'lifetime') expiryDate.setFullYear(expiryDate.getFullYear() + 99);
      else expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    var pid = 'manual_' + userId + '_' + Date.now();

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: planType,
      payment_id: pid,
      payment_status: 'active',
      amount: 0,
      currency: 'USD',
      expires_at: expiryDate.toISOString()
    }, { onConflict: 'payment_id' });

    var rpcResult = await supabase.rpc('set_vip_status', {
      user_uuid: userId,
      vip_expires: expiryDate.toISOString()
    });

    if (rpcResult.error) return res.status(500).json({ error: rpcResult.error.message });

    logAdminAction(req.user, 'set_vip', userId, targetProfile.data.email, { planType: planType, expiresAt: expiryDate.toISOString() });

    res.json({ success: true, planType: planType, expiresAt: expiryDate.toISOString() });
  } catch (e) {
    console.error('[admin/set-vip] Error:', e.message);
    res.status(500).json({ error: 'Failed to set VIP status' });
  }
});

// POST /api/admin/users/:id/revoke-vip — revoke VIP
router.post('/admin/users/:id/revoke-vip', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;

    var targetProfile = await supabase.from('profiles').select('email, vip_status').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });
    if (targetProfile.data.vip_status === 'admin') {
      return res.status(400).json({ error: 'Cannot revoke VIP on an admin account' });
    }

    await supabase.from('subscriptions')
      .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('payment_status', 'active');

    var rpcResult = await supabase.rpc('revoke_vip_status', { user_uuid: userId });
    if (rpcResult.error) return res.status(500).json({ error: rpcResult.error.message });

    logAdminAction(req.user, 'revoke_vip', userId, targetProfile.data.email);

    res.json({ success: true });
  } catch (e) {
    console.error('[admin/revoke-vip] Error:', e.message);
    res.status(500).json({ error: 'Failed to revoke VIP' });
  }
});

// POST /api/admin/users/:id/extend-vip — extend VIP by N days
router.post('/admin/users/:id/extend-vip', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;
    var days = Math.max(1, Math.min(3650, parseInt(req.body.days, 10) || 30));

    var prof = await supabase.from('profiles').select('vip_expires_at, email, vip_status').eq('id', userId).single();
    if (prof.error) return res.status(404).json({ error: 'User not found' });
    if (prof.data.vip_status === 'admin') {
      return res.status(400).json({ error: 'Cannot extend VIP on an admin account' });
    }

    var currentExpiry = prof.data && prof.data.vip_expires_at ? new Date(prof.data.vip_expires_at) : new Date();
    if (currentExpiry < new Date()) currentExpiry = new Date();
    currentExpiry.setDate(currentExpiry.getDate() + days);

    await supabase.rpc('set_vip_status', {
      user_uuid: userId,
      vip_expires: currentExpiry.toISOString()
    });

    logAdminAction(req.user, 'extend_vip', userId, prof.data.email, { days: days, newExpiresAt: currentExpiry.toISOString() });

    res.json({ success: true, newExpiresAt: currentExpiry.toISOString(), extendedByDays: days });
  } catch (e) {
    console.error('[admin/extend-vip] Error:', e.message);
    res.status(500).json({ error: 'Failed to extend VIP' });
  }
});

// POST /api/admin/users/:id/set-admin — grant admin privileges
router.post('/admin/users/:id/set-admin', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;

    var targetProfile = await supabase.from('profiles').select('email').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });

    await supabase.from('profiles').update({
      vip_status: 'admin',
      vip_expires_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', userId);

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: 'admin',
      payment_id: 'admin_' + userId,
      payment_status: 'active',
      amount: 0,
      currency: 'USD',
      expires_at: new Date(Date.now() + 864e11).toISOString()
    }, { onConflict: 'payment_id' });

    logAdminAction(req.user, 'set_admin', userId, targetProfile.data.email);

    res.json({ success: true, message: 'Admin privileges granted' });
  } catch (e) {
    console.error('[admin/set-admin] Error:', e.message);
    res.status(500).json({ error: 'Failed to set admin' });
  }
});

// POST /api/admin/users/:id/revoke-admin — revoke admin privileges
router.post('/admin/users/:id/revoke-admin', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot revoke your own admin privileges' });
    }

    var targetProfile = await supabase.from('profiles').select('email').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });

    await supabase.from('profiles').update({
      vip_status: 'free',
      vip_expires_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', userId);

    logAdminAction(req.user, 'revoke_admin', userId, targetProfile.data.email);

    res.json({ success: true, message: 'Admin privileges revoked' });
  } catch (e) {
    console.error('[admin/revoke-admin] Error:', e.message);
    res.status(500).json({ error: 'Failed to revoke admin' });
  }
});

// PATCH /api/admin/users/:id — edit user (full name / email)
router.patch('/admin/users/:id', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;
    var fullName = req.body.fullName;
    var email = req.body.email;

    if (fullName !== undefined && fullName !== null) fullName = String(fullName).trim();
    if (email !== undefined && email !== null) email = String(email).trim().toLowerCase();

    var targetProfile = await supabase.from('profiles').select('email, vip_status').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });
    var oldEmail = targetProfile.data.email;

    if (fullName !== undefined && !fullName) {
      return res.status(400).json({ error: 'Full name cannot be empty' });
    }

    var profilePatch = {};
    if (email !== undefined && email !== oldEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      if (isDisposableEmail(email)) {
        return res.status(400).json({ error: 'Temporary email addresses are not allowed' });
      }
      var dup = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
      if (dup.data && dup.data.id !== userId) {
        return res.status(409).json({ error: 'Another account already uses this email' });
      }
      var authRes = await supabase.auth.admin.updateUserById(userId, { email: email });
      if (authRes.error) {
        return res.status(500).json({ error: 'Failed to update email: ' + authRes.error.message });
      }
      profilePatch.email = email;
    }
    if (fullName !== undefined && fullName !== null) {
      profilePatch.full_name = fullName;
    }

    if (Object.keys(profilePatch).length) {
      profilePatch.updated_at = new Date().toISOString();
      var upd = await supabase.from('profiles').update(profilePatch).eq('id', userId);
      if (upd.error) return res.status(500).json({ error: upd.error.message });
    }

    logAdminAction(req.user, 'edit_user', userId, oldEmail, { fullName: fullName || null, email: email || null });

    res.json({ success: true, message: 'User updated' });
  } catch (e) {
    console.error('[admin/edit-user] Error:', e.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id — permanently delete a user
router.delete('/admin/users/:id', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    var targetProfile = await supabase.from('profiles').select('email').eq('id', userId).single();
    if (targetProfile.error) return res.status(404).json({ error: 'User not found' });
    var email = targetProfile.data.email;

    // Clean up child rows that reference the user (payments has ON DELETE SET NULL).
    await Promise.all([
      supabase.from('payments').delete().eq('user_id', userId),
      supabase.from('subscriptions').delete().eq('user_id', userId),
      supabase.from('usage').delete().eq('user_id', userId),
      supabase.from('pending_registrations').delete().eq('email', email)
    ]);

    var delRes = await supabase.auth.admin.deleteUser(userId);
    if (delRes.error) {
      var fallback = await supabase.from('profiles').delete().eq('id', userId);
      if (fallback.error) {
        return res.status(500).json({ error: 'Failed to delete user: ' + delRes.error.message });
      }
    }

    logAdminAction(req.user, 'delete_user', userId, email);

    res.json({ success: true, message: 'User deleted' });
  } catch (e) {
    console.error('[admin/delete-user] Error:', e.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/stats — system stats
router.get('/admin/stats', requireAdmin, async function (req, res) {
  try {
    if (!supabase) return res.status(503).json({ error: 'Service unavailable' });

    var totalProfiles = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    var proUsers = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('vip_status', 'vip');
    var adminUsers = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('vip_status', 'admin');
    var freeUsers = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('vip_status', 'free');
    var lifetimeSubs = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('plan_type', 'lifetime').eq('payment_status', 'active');

    res.json({
      totalUsers: totalProfiles.count || 0,
      proUsers: proUsers.count || 0,
      adminUsers: adminUsers.count || 0,
      freeUsers: freeUsers.count || 0,
      activeLifetimeSubs: lifetimeSubs.count || 0
    });
  } catch (e) {
    console.error('[admin/stats] Error:', e.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
