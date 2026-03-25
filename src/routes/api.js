const express = require('express');
const router = express.Router();

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
    if (cached) {
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
    
    // Enrich predictions with results
    const enrichWithResults = (matches) => {
      if (!matches) return [];
      return matches.map(match => {
        const matchKey = match.match;
        let result = null;
        
        // Search through all dates in results cache
        for (const dateKey of Object.keys(resultsCache)) {
          const dateResults = resultsCache[dateKey];
          for (const [resultKey, score] of Object.entries(dateResults)) {
            const normalizedMatch = matchKey.toLowerCase().replace(/\s+/g, ' ').trim();
            const normalizedResult = resultKey.toLowerCase().replace(/\s+/g, ' ').trim();
            
            const matchTeams = normalizedMatch.split(/ - | vs /);
            const resultTeams = normalizedResult.split(/ - | vs /);
            
            if (matchTeams.length === 2 && resultTeams.length === 2) {
              const [home1, away1] = matchTeams;
              const [home2, away2] = resultTeams;
              
              // Check if teams match (partial match allowed)
              const homeMatch = home1.includes(home2) || home2.includes(home1);
              const awayMatch = away1.includes(away2) || away2.includes(away1);
              
              if (homeMatch && awayMatch) {
                result = score;
                break;
              }
            }
          }
          if (result) break;
        }
        
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

router.get('/refresh', async (req, res) => {
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

router.get('/refresh-results', async (req, res) => {
    // Stubbed for now as results fetching is complex
    res.json({ success: true, message: 'Results refresh functionality is currently limited in this version.' });
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

module.exports = router;
