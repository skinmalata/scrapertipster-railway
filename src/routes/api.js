const express = require('express');
const router = express.Router();
const scraperService = require('../services/scraper');

let supabase = null;
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
  // All users get full access - no restrictions
  return { ...data, isVip: true, isFreeLimited: false };
}

router.get('/predictions', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { isVip } = await checkUserVipStatus(userId);
    
    const data = await scraperService.fetchPredictions();
    const limitedData = applyLimits(data, isVip);
    
    res.json(limitedData);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    await scraperService.fetchAndCachePredictions();
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

router.get('/analysis', async (req, res) => {
  const { homeTeam, awayTeam } = req.query;
  console.log(`[API] Analysis requested: ${homeTeam} vs ${awayTeam}`);
   
  if (!homeTeam || !awayTeam) {
    return res.json({ success: false, message: 'Missing team parameters' });
  }
   
  try {
    const analysisCache = scraperService.loadAnalysisCache();
    const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
    const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
    
    const cachedAnalysis = analysisCache[key1] || analysisCache[key2];
    if (cachedAnalysis) {
      console.log(`[API] Serving analysis from cache for: ${homeTeam} vs ${awayTeam}`);
      return res.json(cachedAnalysis);
    }
    
    console.log(`[API] Not in cache. Scraping single match first: ${homeTeam} vs ${awayTeam}`);
    
    const analysis = await scraperService.scrapeSingleAnalysis(homeTeam, awayTeam);
    
    if (process.env.ENABLE_BACKGROUND_SCRAPING === 'true') {
      scraperService.triggerBackgroundScraping();
    }
    
    console.log(`[API] Returning scraped analysis for: ${homeTeam} vs ${awayTeam}`);
    return res.json(analysis);
    
  } catch (err) {
    console.error(`[API] Analysis error:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ai-summary', async (req, res) => {
  const { homeTeam, awayTeam, homeForm, awayForm, homeLast10, awayLast10, h2h } = req.body;
  
  if (!homeTeam || !awayTeam) {
    return res.json({ success: false, message: 'Missing required data' });
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ success: false, message: 'AI summary service not configured' });
  }
  
  try {
    const prompt = `Analyze this football match and provide a detailed summary of at least 50 words:

Home Team: ${homeTeam}
Away Team: ${awayTeam}

Home Team Recent Form (last 5 matches): ${homeForm ? homeForm.slice(-5) : 'No data'}
Away Team Recent Form (last 5 matches): ${awayForm ? awayForm.slice(-5) : 'No data'}

Home Team Last 10 Stats - Wins: ${homeLast10?.wins || 0}, Draws: ${homeLast10?.draws || 0}, Losses: ${homeLast10?.losses || 0}, Avg Goals Scored: ${homeLast10?.avgScored?.toFixed(1) || 0}, Avg Goals Conceded: ${homeLast10?.avgConceded?.toFixed(1) || 0}
Away Team Last 10 Stats - Wins: ${awayLast10?.wins || 0}, Draws: ${awayLast10?.draws || 0}, Losses: ${awayLast10?.losses || 0}, Avg Goals Scored: ${awayLast10?.avgScored?.toFixed(1) || 0}, Avg Goals Conceded: ${awayLast10?.avgConceded?.toFixed(1) || 0}

Head to Head Matches (most recent first):
${h2h?.slice(0, 5).map(h => `${h.homeTeam} ${h.homeGoals} - ${h.awayGoals} ${h.awayTeam}`).join('\n') || 'No H2H data'}

Provide a detailed match preview with:
1. Overall analysis based on recent form and head-to-head history
2. 1X2 prediction with reasoning (Home Win/Draw/Away Win)
3. Over/Under 2.5 Goals prediction with reasoning
4. Final recommendation

Make sure the summary is at least 50 words.`;

    console.log('[AI Summary] Sending request to Gemini API...');
    console.log('[AI Summary] API Key present:', !!apiKey);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });

    console.log('[AI Summary] Response status:', response.status);
    const data = await response.json();
    console.log('[Gemini API] response:', JSON.stringify(data, null, 2));

    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      res.json({ success: true, summary: data.candidates[0].content.parts[0].text });
    } else {
      console.log('[AI Summary] No valid response from API');
      res.json({ success: false, message: 'Failed to generate summary' });
    }
  } catch (err) {
    console.error('[AI Summary] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
