const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
let generatePostThumbnail;
function getGeneratePostThumbnail() {
  if (!generatePostThumbnail) {
    generatePostThumbnail = require('../../scripts/regenerate-legacy-thumbnails').generatePostThumbnail;
  }
  return generatePostThumbnail;
}
const { asNumber, buildOpportunities } = require('../services/liveTips');
const { getCachedLive } = require('../services/scrapeLive');
const { buildGoldenTips } = require('../services/goldenOpportunities');

// API-Football responses are cached so one busy page does not consume the
// provider quota for every visitor. The API key is deliberately kept here,
// never sent to the browser.
const footballOddsCache = new Map();
const FOOTBALL_ODDS_CACHE_MS = 10 * 60 * 1000;
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

function applyLimits(data, isVip) {
  if (isVip) {
    return { ...data, isVip: true, isFreeLimited: false };
  }
  return { ...data, isVip: false, isFreeLimited: true };
}

router.get('/predictions', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { isVip } = await checkUserVipStatus(userId);
    
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

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

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
  if (cached && Date.now() - cached.createdAt < FOOTBALL_ODDS_CACHE_MS) {
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    const upstream = await fetch('https://v3.football.api-sports.io/odds?date=' + encodeURIComponent(requestedDate) + '&timezone=Africa%2FLagos', {
      headers: { 'x-apisports-key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(25000)
    });
    const data = await upstream.json();
    if (!upstream.ok || (data.errors && Object.keys(data.errors).length)) {
      console.warn('API-Football odds request failed:', upstream.status, data.errors || data.message || 'Unknown error');
      return res.status(502).json({ available: false, source: 'API-Football', message: 'Live odds are temporarily unavailable', response: [] });
    }

    const payload = {
      available: true,
      source: 'API-Football',
      date: requestedDate,
      fetchedAt: new Date().toISOString(),
      response: Array.isArray(data.response) ? data.response : []
    };
    footballOddsCache.set(requestedDate, { createdAt: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    console.warn('API-Football odds request error:', error.message);
    res.status(502).json({ available: false, source: 'API-Football', message: 'Live odds are temporarily unavailable', response: [] });
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
      return minute >= 51 && minute <= 85;
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

router.get('/live-matches', function (req, res) {
  const data = getCachedLive();
  if (!data) {
    return res.json({ available: false, matches: [], message: 'Live data is being collected. Please check again shortly.' });
  }
  res.json({ available: true, fetchedAt: data.fetchedAt, matchCount: data.matchCount, matches: data.matches });
});

let goldenTipsCache = null;
const GOLDEN_TIPS_CACHE_MS = 5 * 60 * 1000;

router.get('/golden-tips', async function (req, res) {
  if (goldenTipsCache && Date.now() - goldenTipsCache.createdAt < GOLDEN_TIPS_CACHE_MS) {
    return res.json({ ...goldenTipsCache.payload, cached: true });
  }

  const liveData = getCachedLive();
  if (!liveData || !liveData.matches || liveData.matches.length === 0) {
    return res.json({ available: false, opportunities: [], message: 'Live data is not available yet. Tips will appear once live matches are detected.' });
  }

  const opportunities = buildGoldenTips(liveData);

  const payload = {
    available: true,
    fetchedAt: new Date().toISOString(),
    matchCount: liveData.matchCount,
    refreshSeconds: GOLDEN_TIPS_CACHE_MS / 1000,
    opportunities: opportunities
  };

  console.log('[golden-tips] matches=' + liveData.matchCount + ' opportunities=' + opportunities.length);
  goldenTipsCache = { createdAt: Date.now(), payload };
  res.json(payload);
});

module.exports = router;
