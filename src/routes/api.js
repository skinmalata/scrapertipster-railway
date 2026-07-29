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
const { fetchTodayStreaks } = require('../services/h2hWinningStreaks');
const { optionalAuth, requireAuth, requirePro: requireProMiddleware, requireAdmin } = require('../middleware/auth');
const payment = require('../services/payment');

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
var anonTicketCache = null;

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

async function checkUserVipStatus(userId) {
  if (!userId || !supabase) return { isVip: false };
  
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('vip_status, vip_expires_at')
      .eq('id', userId)
      .single();
    
    if (profile && profile.vip_status === 'vip') {
      const expiresAt = new Date(profile.vip_expires_at);
      const isValid = expiresAt > new Date();
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
        if (profile && profile.vip_status === 'vip' && new Date(profile.vip_expires_at) > new Date()) return true;
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

function sanitizeTeamName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[<>\"'&;$`|\x00-\x1F\x7F]/g, '').slice(0, 100);
}

router.get('/analysis', async (req, res) => {
  let { homeTeam, awayTeam } = req.query;
  
  homeTeam = sanitizeTeamName(homeTeam);
  awayTeam = sanitizeTeamName(awayTeam);
  
  console.log(`[API] Analysis requested: ${homeTeam} vs ${awayTeam}`);
   
  if (!homeTeam || !awayTeam) {
    return res.json({ success: false, message: 'Missing team parameters' });
  }
   
  try {
    const analysisCache = getScraperService().loadAnalysisCache();
    const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
    const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
    
    const cachedAnalysis = analysisCache[key1] || analysisCache[key2];
    if (cachedAnalysis) {
      console.log(`[API] Serving analysis from cache for: ${homeTeam} vs ${awayTeam}`);
      return res.json(cachedAnalysis);
    }
    
    console.log(`[API] Not in cache. Scraping single match first: ${homeTeam} vs ${awayTeam}`);
    
    const analysis = await getScraperService().scrapeSingleAnalysis(homeTeam, awayTeam);
    
    if (process.env.ENABLE_BACKGROUND_SCRAPING === 'true') {
      getScraperService().triggerBackgroundScraping();
    }
    
    console.log(`[API] Returning scraped analysis for: ${homeTeam} vs ${awayTeam}`);
    return res.json(analysis);
    
  } catch (err) {
    console.error(`[API] Analysis error:`, err.message);
    res.status(500).json({ success: false, message: err.message });
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

router.get('/golden-tips', async function (req, res) {
  if (goldenTipsCache && Date.now() - goldenTipsCache.createdAt < GOLDEN_TIPS_CACHE_MS) {
    return res.json({ ...goldenTipsCache.payload, cached: true });
  }

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

  const payload = {
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
  res.json(payload);
});

router.get('/golden-tips/history', function(req, res) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : today;
  res.json({ available: true, date: requestedDate, today, tips: requestedDate === today ? getSettledTodayTips() : getSettledTipsForDate(requestedDate) });
});

// ===== PRO MEMBERSHIP ROUTES =====

// POST /api/checkout — create PayPal subscription checkout
router.post('/checkout', requireAuth, async function (req, res) {
  try {
    var planType = req.body.planType;
    var returnUrl = req.body.returnUrl || 'https://winfulltime.com/account.html';
    var validPlans = Object.keys(payment.PLANS);
    if (validPlans.indexOf(planType) === -1) {
      return res.status(400).json({ error: 'Invalid plan. Choose: ' + validPlans.join(', ') });
    }
    var result = await payment.createCheckout({
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

// POST /api/ticket-builder/generate — tier-gated ticket builder
router.post('/ticket-builder/generate', optionalAuth, async function (req, res) {
  try {
    var isLifetime = false;
    var isVip = false;
    var remaining = null;

    if (req.user) {
      if (!supabase) return res.status(503).json({ error: 'Service unavailable' });
      try {
        var prof = await supabase.from('profiles').select('vip_status, vip_expires_at').eq('id', req.user.id).single();
        isVip = prof.data && prof.data.vip_status === 'vip' && new Date(prof.data.vip_expires_at) > new Date();
      } catch (e) {}
      if (isVip) {
        try {
          var sub = await supabase.from('subscriptions').select('plan_type').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          isLifetime = sub.data && sub.data.plan_type === 'lifetime';
        } catch (e) {}
      }
    }

    var FREE_ANON_MAX_LEGS = 3;
    var FREE_ANON_MAX_ODDS = 4.0;
    var FREE_ANON_DAILY = 1;
    var FREE_REG_MAX_LEGS = 3;
    var FREE_REG_MAX_ODDS = 4.0;
    var FREE_REG_DAILY = 5;
    var PRO_MAX_LEGS = 30;
    var PRO_MAX_ODDS = 500;

    var tier;
    var maxLegs;
    var maxTotalOdds;

    if (isVip) {
      tier = isLifetime ? 'lifetime' : 'pro';
      maxLegs = PRO_MAX_LEGS;
      maxTotalOdds = PRO_MAX_ODDS;
    } else if (req.user) {
      tier = 'free_registered';
      maxLegs = FREE_REG_MAX_LEGS;
      maxTotalOdds = FREE_REG_MAX_ODDS;
    } else {
      tier = 'free_anon';
      maxLegs = FREE_ANON_MAX_LEGS;
      maxTotalOdds = FREE_ANON_MAX_ODDS;
    }

    if (!isVip) {
      if (req.user) {
        try {
          var rpcResult = await supabase.rpc('consume_free_allowance', { p_user_id: req.user.id, p_action: 'ticket_builder', p_max_daily: FREE_REG_DAILY });
          remaining = rpcResult.data && rpcResult.data[0] ? rpcResult.data[0].remaining : 0;
        } catch (e) {
          if (e.code === 'LMIT') return res.status(429).json({ error: 'Daily limit reached (' + FREE_REG_DAILY + ' runs)', isPro: false, remaining: 0 });
          remaining = 0;
        }
      } else {
        if (!anonTicketCache) anonTicketCache = new Map();
        var ip = req.ip || 'anon';
        var anonKey = 'anon_ticket_' + ip.replace(/[.:]/g, '_') + '_' + new Date().toISOString().slice(0, 10);
        var anonCount = anonTicketCache.get(anonKey) || 0;
        if (anonCount >= FREE_ANON_DAILY) return res.status(429).json({ error: 'Anonymous limit reached (' + FREE_ANON_DAILY + ' run/day). Sign in for ' + FREE_REG_DAILY + ' free runs.', isPro: false, remaining: 0 });
        anonTicketCache.set(anonKey, anonCount + 1);
        remaining = 0;
      }
    }

    var body = req.body || {};
    var requestedLegs = parseInt(body.numLegs, 10) || 3;
    var requestedMaxOdds = parseFloat(body.maxOdds) || maxTotalOdds;

    var clampedLegs = Math.min(requestedLegs, maxLegs);
    var clampedMaxOdds = Math.min(requestedMaxOdds, maxTotalOdds);

    var date = watDate();
    var predictions = vipPredictionData();
    var oddsResponse = await fetchPreMatchOdds(date);
    var h2hMatches = await fetchTodayStreaks();


    var buildOpts = {
      date: date,
      oddsResponse: oddsResponse,
      h2hMatches: h2hMatches,
      markets: isVip ? body.markets : undefined,
      safeOnly: isVip ? (body.safeOnly === true) : false,
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
      tier: tier,
      isPro: isVip,
      isLifetime: isLifetime,
      limit: isVip ? null : (tier === 'free_registered' ? FREE_REG_DAILY : FREE_ANON_DAILY),
      remaining: isVip ? null : (remaining !== null ? remaining : 0),
      maxLegs: maxLegs,
      maxOdds: maxTotalOdds
    });
  } catch (e) {
    console.error('[ticket-builder] Error:', e.message);
    console.error('[ticket-builder] Stack:', e.stack);
    res.status(500).json({ error: 'Failed to generate ticket' });
  }
});

// GET /api/best-picks — top pick per category + historical results
router.get('/best-picks', async function (req, res) {
  try {
    var predictions = vipPredictionData();
    if (!predictions || !Array.isArray(predictions.matches)) {
      return res.json({ today: [], history: [], dates: [] });
    }

    var resultsCache = {};
    try { resultsCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'results-cache.json'), 'utf8')); } catch (e) {}

    var today = predictions.date || new Date().toISOString().slice(0, 10);

    function getBestPick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr.reduce(function(best, item) {
        var prob = Number(item.probability) || 0;
        var bestProb = Number(best.probability) || 0;
        return prob > bestProb ? item : best;
      });
    }

    function evaluatePick(pick, result) {
      if (!result || typeof result.home !== 'number') return 'pending';
      var tip = String(pick.tip || '');
      var home = Number(result.home);
      var away = Number(result.away);
      if (tip === '1') return home > away ? 'won' : 'lost';
      if (tip === '2') return away > home ? 'won' : 'lost';
      if (tip === 'X') return home === away ? 'won' : 'lost';
      if (/^over\s+([\d.]+)/i.test(tip)) {
        var threshold = parseFloat(RegExp.$1);
        return (home + away) > threshold ? 'won' : 'lost';
      }
      if (/^under\s+([\d.]+)/i.test(tip)) {
        var threshold = parseFloat(RegExp.$1);
        return (home + away) < threshold ? 'won' : 'lost';
      }
      if (/^btts\s+yes/i.test(tip) || tip === 'BTTS YES') return home > 0 && away > 0 ? 'won' : 'lost';
      if (/^btts\s+no/i.test(tip) || tip === 'BTTS NO') return home === 0 || away === 0 ? 'won' : 'lost';
      if (/to (Win|Lose|Draw)/.test(tip) && typeof pick.streakTeam === 'string' && typeof pick.isHome === 'boolean') {
        if (pick.isHome) {
          if (/to Win/.test(tip)) return home > away ? 'won' : 'lost';
          if (/to Lose/.test(tip)) return away > home ? 'won' : 'lost';
          if (/to Draw/.test(tip)) return home === away ? 'won' : 'lost';
        } else {
          if (/to Win/.test(tip)) return away > home ? 'won' : 'lost';
          if (/to Lose/.test(tip)) return home > away ? 'won' : 'lost';
          if (/to Draw/.test(tip)) return home === away ? 'won' : 'lost';
        }
      }
      return 'pending';
    }

    var CATEGORIES = [
      { key: 'matches', label: '1X2', type: '1x2' },
      { key: 'over15Matches', label: 'Over 1.5', type: 'over15' },
      { key: 'over25Matches', label: 'Over 2.5', type: 'over25' },
      { key: 'bttsMatches', label: 'BTTS Yes', type: 'btts' },
      { key: 'bttsNoMatches', label: 'BTTS No', type: 'bttsNo' },
      { key: 'cornersMatches', label: 'Corners', type: 'corners' },
      { key: 'cardsMatches', label: 'Cards', type: 'cards' },
      { key: 'teamToScore2PlusMatches', label: 'To Score 2+', type: 'teamScore' },
      { key: 'winstreakMatches', label: 'Win Streak', type: 'winStreak' },
      { key: 'losestreakMatches', label: 'Loss Streak', type: 'lossStreak' },
      { key: 'drawstreakMatches', label: 'Draw Streak', type: 'drawStreak' }
    ];

    var todayPicks = [];
    CATEGORIES.forEach(function(cat) {
      var matches = Array.isArray(predictions[cat.key]) ? predictions[cat.key].filter(function(m) { return (m.date || today) === today; }) : [];
      var best = getBestPick(matches);
      if (!best) return;
      todayPicks.push({
        category: cat.label,
        type: cat.type,
        match: best.nextMatch || best.match || '',
        tip: best.tip || '',
        probability: Number(best.probability) || 0,
        league: best.league || '',
        time: best.time || '',
        streak: best.streak || null,
        streakTeam: cat.type === 'winStreak' || cat.type === 'lossStreak' || cat.type === 'drawStreak' ? (best.match || '') : null,
        isHome: cat.type === 'winStreak' || cat.type === 'lossStreak' || cat.type === 'drawStreak' ? (best.isHome === true) : null
      });
    });

    var dates = (predictions.dates || []).filter(function(d) { return d !== today; }).slice(-3).sort();
    var history = [];
    dates.forEach(function(date) {
      var dayResults = resultsCache[date] || {};
      var dayPicks = [];
      CATEGORIES.forEach(function(cat) {
        var matches = Array.isArray(predictions[cat.key]) ? predictions[cat.key].filter(function(m) { return m.date === date; }) : [];
        var best = getBestPick(matches);
        if (!best) return;
        var matchName = best.nextMatch || best.match || '';
        var result = dayResults[matchName] || null;
        var enriched = {
          category: cat.label,
          type: cat.type,
          match: matchName,
          tip: best.tip || '',
          probability: Number(best.probability) || 0,
          outcome: 'pending',
          score: null,
          streakTeam: cat.type === 'winStreak' || cat.type === 'lossStreak' || cat.type === 'drawStreak' ? (best.match || '') : null,
          isHome: cat.type === 'winStreak' || cat.type === 'lossStreak' || cat.type === 'drawStreak' ? (best.isHome === true) : null
        };
        if (result) {
          enriched.outcome = evaluatePick(enriched, result);
          enriched.score = result.home + '-' + result.away;
        }
        dayPicks.push(enriched);
      });
      if (dayPicks.length > 0) {
        history.push({ date: date, picks: dayPicks });
      }
    });

    res.json({ today: todayPicks, history: history, dates: predictions.dates || [] });
  } catch (e) {
    console.error('[best-picks] Error:', e.message);
    res.status(500).json({ error: 'Failed to load best picks' });
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

    res.json({
      isPro: isPro,
      isAdmin: isAdmin,
      email: req.user.email,
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

// GET /api/portal — Lemon Squeezy customer portal
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
      return payment.createCustomerPortal({ subscriptionId: sub.data.payment_id })
        .then(function (result) {
          if (result.error) return res.json({ error: result.error });
          res.json({ url: result.url });
        });
    }).catch(function (err) {
      console.error('[portal] Error:', err.message);
      res.status(500).json({ error: 'Failed to get portal URL' });
    });
});

// POST /api/subscription/cancel — cancel subscription
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
      return payment.cancelSubscription(sub.data.payment_id)
        .then(function () {
          res.json({ message: 'Subscription cancelled' });
        });
    }).catch(function (err) {
      console.error('[cancel] Error:', err.message);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    });
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

    await supabase.from('subscriptions')
      .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('payment_status', 'active');

    var rpcResult = await supabase.rpc('revoke_vip_status', { user_uuid: userId });
    if (rpcResult.error) return res.status(500).json({ error: rpcResult.error.message });

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

    var prof = await supabase.from('profiles').select('vip_expires_at').eq('id', userId).single();
    if (prof.error) return res.status(404).json({ error: 'User not found' });

    var currentExpiry = prof.data && prof.data.vip_expires_at ? new Date(prof.data.vip_expires_at) : new Date();
    if (currentExpiry < new Date()) currentExpiry = new Date();
    currentExpiry.setDate(currentExpiry.getDate() + days);

    await supabase.rpc('set_vip_status', {
      user_uuid: userId,
      vip_expires: currentExpiry.toISOString()
    });

    res.json({ success: true, newExpiresAt: currentExpiry.toISOString(), extendedByDays: days });
  } catch (e) {
    console.error('[admin/extend-vip] Error:', e.message);
    res.status(500).json({ error: 'Failed to extend VIP' });
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
