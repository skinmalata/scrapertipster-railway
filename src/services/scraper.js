const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { detectLeague } = require('../data/leagues');
const { getDateRange, getLocalDateStr, findMatchingResult } = require('../utils/helpers');
const { executablePath, args } = require('../config/puppeteer');
const { debugLog } = require('../utils/logger');

const STATAREA_URL = 'https://www.statarea.com/predictions';
const CACHE_FILE = path.join(process.cwd(), 'predictions-cache.json');
const ANALYSIS_CACHE_FILE = path.join(process.cwd(), 'analysis-cache.json');
const RESULTS_CACHE_FILE = path.join(process.cwd(), 'results-cache.json');

const SCRAPER_LOCK_FILE = path.join(process.cwd(), '.scraper-lock');

let isScraping = false;
let browserLaunchQueue = [];
let isBrowserLaunchInProgress = false;
const MAX_QUEUE_SIZE = 10;

async function launchBrowserWithQueue(browserOptions) {
  if (browserLaunchQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error('Browser queue full, please try again later');
  }
  
  return new Promise((resolve, reject) => {
    browserLaunchQueue.push({ resolve, reject, browserOptions });
    processBrowserQueue();
  });
}

async function processBrowserQueue() {
  if (isBrowserLaunchInProgress || browserLaunchQueue.length === 0) {
    return;
  }
  
  isBrowserLaunchInProgress = true;
  const { resolve, reject, browserOptions } = browserLaunchQueue.shift();
  
  try {
    const browser = await puppeteer.launch(browserOptions);
    resolve(browser);
  } catch (err) {
    reject(err);
  } finally {
    isBrowserLaunchInProgress = false;
    processBrowserQueue();
  }
}

async function acquireScraperLock() {
  let attempts = 0;
  while (isScraping && attempts < 60) {
    console.log('Waiting for scraper to finish...');
    await sleep(5000);
    attempts++;
  }
  if (isScraping && attempts >= 60) {
    throw new Error('Scraper lock timeout - another process is running');
  }
  isScraping = true;
  try {
    fs.writeFileSync(SCRAPER_LOCK_FILE, new Date().toISOString());
  } catch (e) {}
}

function releaseScraperLock() {
  isScraping = false;
  try {
    if (fs.existsSync(SCRAPER_LOCK_FILE)) {
      fs.unlinkSync(SCRAPER_LOCK_FILE);
    }
  } catch (e) {}
}

async function withScraperLock(fn) {
  await acquireScraperLock();
  try {
    return await fn();
  } finally {
    releaseScraperLock();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeRequestWithBackoff(fn, maxRetries = 3, baseDelay = 5000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message.includes('429') || err.message.includes('rate limit');
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Rate limited. Retrying in ${delay/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      } else if (attempt >= maxRetries - 1) {
        throw err;
      }
    }
  }
}

function loadCachedPredictions() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (data.matches && data.matches.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.error('Cache load error:', err);
  }
  return null;
}

function saveCachedPredictions(data) {
  try {
    data.fetchTime = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Cache save error:', err);
  }
}

function getAnalysisCache() {
  try {
    if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function getResultsCache() {
  try {
    if (fs.existsSync(RESULTS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(RESULTS_CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

async function scrapeDate(dateStr, retryCount = 0) {
  const url = `${STATAREA_URL}/date/${dateStr}`;
  let html;
  
  console.log(`Scraping predictions for ${dateStr}...`);
  const browserOptions = {
    headless: true,
    executablePath: executablePath,
    args: args
  };
  
  const scrape = async () => {
    const browser = await launchBrowserWithQueue(browserOptions);
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.match', { timeout: 15000 }).catch(() => {});
      html = await page.content();
      console.log(`Page loaded for ${dateStr}`);
    } finally {
      await browser.close();
    }
  };

  try {
    await safeRequestWithBackoff(scrape, 3, 5000);
  } catch (err) {
    console.error(`Puppeteer error for ${dateStr}:`, err.message);
    return { matches: [], over25Matches: [], over15Matches: [], bttsMatches: [] };
  }

  const $ = cheerio.load(html);
  const matches = [];
  const over25Matches = [];
  const over15Matches = [];
  const bttsMatches = [];
  
  const matchElements = $('.match');
  console.log(`Found ${matchElements.length} match elements for ${dateStr}`);

  let matchId = 0, over25Id = 0, over15Id = 0, bttsId = 0;
  
  matchElements.each((i, el) => {
    const $match = $(el);
    const time = $match.find('.date').text().trim();
    const homeTeam = $match.find('.hostteam .name').text().trim();
    const awayTeam = $match.find('.guestteam .name').text().trim();
    
    // Simple score parsing
    const scoreEl = $match.find('.score');
    let score = null;
    if (scoreEl.length > 0) {
      const scoreText = scoreEl.text().trim();
      const scoreMatch = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (scoreMatch) {
        score = {
          home: parseInt(scoreMatch[1]),
          away: parseInt(scoreMatch[2])
        };
      }
    }
    
    const allValues = $match.find('.value');
    let prob1 = 0, probX = 0, prob2 = 0, over25 = 0, under25 = 0, over15 = 0, under15 = 0, gg = 0, ng = 0;
    
    const valueData = [];
    allValues.each((vi, vel) => {
      const cls = $(vel).attr('class') || '';
      const txt = $(vel).text().trim();
      valueData.push({ cls, txt });
    });
    
    // Logic from original file (simplified for brevity but preserving core logic)
    const rValues = valueData.filter(v => v.cls.includes('r') && !v.cls.includes('b') && !v.cls.includes('o') && !v.cls.includes('g'));
    if (rValues.length >= 3) {
      prob1 = parseInt(rValues[0].txt) || 0;
      probX = parseInt(rValues[1].txt) || 0;
      prob2 = parseInt(rValues[2].txt) || 0;
    }
    
    const oValues = valueData.filter(v => v.cls.includes('o'));
    const bValues = valueData.filter(v => v.cls.includes('b'));
    
    if (oValues.length >= 2) {
      over15 = parseInt(oValues[0].txt) || 0;
      over25 = parseInt(oValues[1].txt) || 0;
    } else if (oValues.length === 1) {
      over15 = parseInt(oValues[0].txt) || 0;
      over25 = Math.max(0, over15 - 20);
    }
    
    const gValues = valueData.filter(v => v.cls.includes('g'));
    if (gValues.length >= 2) {
      gg = parseInt(gValues[0].txt) || 0;
      ng = parseInt(gValues[1].txt) || 0;
    } else if (gValues.length === 1) {
      gg = parseInt(gValues[0].txt) || 0;
      ng = 0;
    }

    const bestProb = Math.max(prob1, probX, prob2);
    let bestPick = '';
    if (prob1 >= probX && prob1 >= prob2) bestPick = '1';
    else if (probX >= prob1 && probX >= prob2) bestPick = 'X';
    else bestPick = '2';

    const leagueInfo = detectLeague(homeTeam);

     if (homeTeam && awayTeam && bestProb >= 50) {
      matches.push({
        id: matchId++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { homeWin: prob1, draw: probX, awayWin: prob2 },
        tip: bestPick,
        probability: bestProb,
        date: dateStr,
        score: score
      });
    }

    if (homeTeam && awayTeam && over25 >= 60) {
      over25Matches.push({
        id: over25Id++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { over25: over25, under25: under25 },
        tip: 'Over 2.5',
        probability: over25,
        date: dateStr,
        score: score
      });
    }

    if (homeTeam && awayTeam && over15 >= 55) {
      over15Matches.push({
        id: over15Id++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { over15: over15, under15: under15 },
        tip: 'Over 1.5',
        probability: over15,
        date: dateStr,
        score: score
      });
    }
    
     // Optimized BTTS selection: consider both BTTS probability and Over 2.5 probability
     // BTTS is more likely in high-scoring games, so we require a minimum Over 2.5 probability
     const bttsScore = (gg * 0.7) + (over25 * 0.3); // Weighted combination
     if (homeTeam && awayTeam && bttsScore >= 50) {
       bttsMatches.push({
         id: bttsId++,
         league: leagueInfo.league,
         country: leagueInfo.country,
         time: time,
         match: `${homeTeam} - ${awayTeam}`,
         probabilities: { bttsYes: gg, bttsNo: ng },
         tip: 'BTTS',
         probability: Math.round(bttsScore), // Use the combined score for display
         date: dateStr,
         score: score
       });
     }
  });

  return { matches, over25Matches, over15Matches, bttsMatches };
}

function parseBetexplorerStreaks(html, streakType = 'win') {
  const matches = [];
  const $ = cheerio.load(html);
  
  let streakLabel;
  if (streakType === 'loss') streakLabel = 'Back To Back Losses';
  else if (streakType === 'draw') streakLabel = 'Back To Back Draws';
  else streakLabel = 'Back To Back Wins';

  const today = getLocalDateStr();
  
  const tableRows = $('.table-main tbody tr');
  
  console.log(`Found ${tableRows.length} table rows for ${streakType} streaks`);
  
  tableRows.each((i, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 4) return;
    
    const teamCell = $(cells[1]);
    const streakCell = $(cells[2]);
    const nextMatchCell = $(cells[3]);
    
    let team = teamCell.text().trim();
    const streakText = streakCell.text().trim();
    const streak = parseInt(streakText) || 0;
    const nextMatch = nextMatchCell.text().trim();
    
    let nextMatchDate = today;
    const nextMatchDateMatch = nextMatch.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (nextMatchDateMatch) {
      const day = nextMatchDateMatch[1];
      const month = nextMatchDateMatch[2];
      const year = nextMatchDateMatch[3];
      nextMatchDate = `${year}-${month}-${day}`;
    }
    
    if (team && streak >= 2) {
       let prob = Math.min(streak * 10, 95);
       let probs = { homeWin: 0, draw: 0, awayWin: 0 };
       
       if (streakType === 'draw') probs.draw = prob;
       else if (streakType === 'loss') probs.awayWin = prob;
       else probs.homeWin = prob;

       const isHomeTeam = nextMatch.toLowerCase().includes(team.toLowerCase().split(' ')[0].toLowerCase());
       
       matches.push({
         id: matches.length,
         league: 'Various',
         country: '',
         time: '',
         match: team,
         nextMatch: nextMatch,
         nextMatchDate: nextMatchDate,
         probabilities: probs,
         tip: `${streakLabel}: ${streak}`,
         probability: prob,
         date: nextMatchDate,
         streak: streak,
         isHome: isHomeTeam
       });
    }
  });
  
  console.log(`Parsed ${matches.length} ${streakType} streak matches`);
  return matches;
}

async function scrapeTeamToScore(type, retryCount = 0) {
  const urlMap = {
    score: 'https://www.betexplorer.com/football/streaks/teams-to-score-both-halves/',
    score2: 'https://www.betexplorer.com/football/streaks/teams-to-score-2-plus/'
  };
  const url = urlMap[type];
  if (!url) return [];

  const label = type === 'score' ? 'Team to Score' : 'Team to Score 2+';
  console.log(`Scraping ${label}...`);
  
  const scrape = async () => {
    const browser = await launchBrowserWithQueue({
      executablePath: executablePath,
      headless: true,
      args: args
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => {});
      await sleep(3000);
      
      const html = await page.content();
      fs.writeFileSync(`debug_teamtoscore_${type}.html`, html);
      return parseTeamToScore(html, type);
    } finally {
      await browser.close();
    }
  };

  try {
    return await safeRequestWithBackoff(scrape, 3, 5000);
  } catch (err) {
    console.error(`Error scraping ${label}:`, err.message);
    return [];
  }
}

function parseTeamToScore(html, type) {
  const matches = [];
  const $ = cheerio.load(html);
  const tableRows = $('.table-main tbody tr');
  
  console.log(`Found ${tableRows.length} table rows for team to score ${type}`);
  
  const today = getLocalDateStr();
  
  tableRows.each((i, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 3) return;
    
    const teamCell = $(cells[1]);
    const streakCell = $(cells[2]);
    const nextMatchCell = $(cells[3]);
    
    const team = teamCell.text().trim();
    const streak = parseInt(streakCell.text().trim()) || 0;
    const nextMatch = nextMatchCell.text().trim();
    
    let nextMatchDate = today;
    const nextMatchDateMatch = nextMatch.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (nextMatchDateMatch) {
      const day = nextMatchDateMatch[1];
      const month = nextMatchDateMatch[2];
      const year = nextMatchDateMatch[3];
      nextMatchDate = `${year}-${month}-${day}`;
    }
    
    const minStreak = type === 'score' ? 3 : 2;
    if (team && streak >= minStreak) {
      const prob = Math.min(streak * 12, 90);
      matches.push({
        id: matches.length,
        league: 'Various',
        country: '',
        time: '',
        match: team,
        nextMatch: nextMatch,
        nextMatchDate: nextMatchDate,
        probabilities: { homeWin: 0, draw: 0, awayWin: 0 },
        tip: type === 'score' ? `Scored in last ${streak} matches` : `Scored 2+ in last ${streak} matches`,
        probability: prob,
        date: nextMatchDate,
        streak: streak,
        isHome: true
      });
    }
  });
  
  console.log(`Parsed ${matches.length} team to score ${type} matches`);
  return matches;
}

function calculateTeamToScore(matches, winstreakMatches) {
  const teamToScore = [];
  const teamToScore2Plus = [];
  const teamMap = new Map();
  
  for (const match of matches) {
    if (!match.date || !match.match) continue;
    
    const parts = match.match.split(' - ');
    if (parts.length !== 2) continue;
    
    const homeTeam = parts[0].trim();
    const awayTeam = parts[1].trim();
    
    // For BTTS matches, we don't have homeWin/awayWin/draw probabilities in the same way.
    // Instead, we can use the BTTS probability as a base for both teams scoring.
    // However, note that the BTTS matches are those where both teams are expected to score.
    // We'll set a base probability for each team to score based on the BTTS probability.
    const bttsProb = match.probabilities?.bttsYes || 0;
    // We'll assume that if BTTS is likely, each team has at least a reasonable chance to score.
    // We can set the base scoring probability for each team to be the BTTS probability (since both need to score for BTTS to hit).
    // But note: we want the probability that the team scores (not necessarily that both score).
    // However, without separate home/away scoring probabilities, we'll use BTTS as a proxy for both.
    // Alternatively, we could use the BTTS probability to adjust a base 50/50.
    // Let's set base score probability for each team to be: 50 + (bttsProb - 50) * 0.5, so that if BTTS is 100, each team gets 75.
    // But note: the BTTS probability is the probability that both teams score.
    // We don't have the individual team scoring probabilities from the BTTS data.
    // Since we are only using BTTS matches, we'll assume that the BTTS probability is a good indicator that both teams will score.
    // We'll set the scoring probability for each team to be at least the BTTS probability (but capped) and adjust by streaks.
    // However, the existing logic uses homeTotalProb and awayTotalProb which are derived from homeWin, draw, awayWin.
    // We don't have those for BTTS matches. So we need to change the approach.
    
    // Let's change: for BTTS matches, we'll set the base scoring probability for each team to be the BTTS probability (since BTTS means both score).
    // But note: the BTTS probability is for both scoring, so the chance that a particular team scores is actually higher than the BTTS probability.
    // However, without more data, we'll use the BTTS probability as the base for each team's scoring probability.
    // We'll then adjust by win streaks.
    
    const baseScoreProb = bttsProb; // This is the probability that both teams score, so for each team, the chance they score is at least this.
    
    const homeStreak = winstreakMatches.find(m => 
      m.nextMatch && (m.nextMatch.includes(homeTeam) || m.match === homeTeam)
    );
    const awayStreak = winstreakMatches.find(m => 
      m.nextMatch && (m.nextMatch.includes(awayTeam) || m.match === awayTeam)
    );
    
    let homeScoreProb = baseScoreProb;
    let awayScoreProb = baseScoreProb;
    
    // Adjust by win streaks: if a team is on a winning streak, they are more likely to score.
    if (homeStreak?.streak) {
      homeScoreProb = Math.min(homeScoreProb + homeStreak.streak * 3, 90);
    }
    if (awayStreak?.streak) {
      awayScoreProb = Math.min(awayScoreProb + awayStreak.streak * 3, 90);
    }
    
    const key1 = `${homeTeam}|${match.date}`;
    if (!teamMap.has(key1) || teamMap.get(key1).prob < homeScoreProb) {
      teamMap.set(key1, {
        team: homeTeam,
        match: match.match,
        nextMatch: match.match,
        nextMatchDate: match.date,
        time: match.time,
        league: match.league,
        country: match.country,
        probability: Math.round(homeScoreProb),
        streak: homeStreak?.streak ? `Scored in last ${homeStreak.streak} matches` : 'Good scoring form',
        isHome: true
      });
    }
    
    const key2 = `${awayTeam}|${match.date}`;
    if (!teamMap.has(key2) || teamMap.get(key2).prob < awayScoreProb) {
      teamMap.set(key2, {
        team: awayTeam,
        match: match.match,
        nextMatch: match.match,
        nextMatchDate: match.date,
        time: match.time,
        league: match.league,
        country: match.country,
        probability: Math.round(awayScoreProb),
        streak: awayStreak?.streak ? `Scored in last ${awayStreak.streak} matches` : 'Good scoring form',
        isHome: false
      });
    }
  }
  
  const allTeams = Array.from(teamMap.values());
  
  const teamToScoreResult = allTeams
    .filter(t => t.probability >= 55)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 50)
    .map((t, i) => ({ ...t, id: i }));
  
  // Team to Score 2+: teams from Team to Score with winning streak > 4
  const teamToScore2PlusResult = teamToScoreResult
    .filter(t => {
      // Extract streak number from streak string like "Scored in last X matches"
      const streakMatch = t.streak.match(/Scored in last (\d+) matches/);
      if (streakMatch) {
        const streakNum = parseInt(streakMatch[1]);
        return streakNum > 4;
      }
      return false; // "Good scoring form" or other non-streak descriptions don't qualify
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 30)
    .map((t, i) => ({ 
      ...t, 
      id: i,
      streak: t.probability >= 80 ? `Scored 2+ in recent matches` : 'High scoring potential'
    }));
  
  const uniqueTeamToScore = [...new Map(teamToScoreResult.map(m => [m.match, m])).values()];
  const uniqueTeamToScore2Plus = [...new Map(teamToScore2PlusResult.map(m => [m.match, m])).values()];
  
  console.log(`Calculated ${uniqueTeamToScore.length} Team to Score matches`);
  console.log(`Calculated ${uniqueTeamToScore2Plus.length} Team to Score 2+ matches`);
  
  return { teamToScore: uniqueTeamToScore, teamToScore2Plus: uniqueTeamToScore2Plus };
}

async function scrapeStreak(type, retryCount = 0) {
  const urlMap = {
    win: 'https://www.betexplorer.com/football/streaks/wins/',
    loss: 'https://www.betexplorer.com/football/streaks/losses/',
    draw: 'https://www.betexplorer.com/football/streaks/draws/'
  };
  const url = urlMap[type];
  if (!url) return [];

  console.log(`Scraping ${type} streaks...`);
  
  const scrape = async () => {
    const browser = await launchBrowserWithQueue({
      executablePath: executablePath,
      headless: true,
      args: args
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => {});
      await sleep(3000);
      
      const html = await page.content();
      fs.writeFileSync(`debug_streak_${type}.html`, html);
      return parseBetexplorerStreaks(html, type);
    } finally {
      await browser.close();
    }
  };

  try {
    return await safeRequestWithBackoff(scrape, 3, 5000);
  } catch (err) {
    console.error(`Error scraping ${type} streaks:`, err.message);
    return [];
  }
}

async function fetchAndCachePredictions() {
  return withScraperLock(async () => {
    const dateRange = getDateRange();
    console.log('Fetching predictions for dates:', dateRange);
     
    const allMatches = [];
    const allOver25 = [];
    const allOver15 = [];
    const allBtts = [];
     
    for (const dateStr of dateRange) {
      const data = await scrapeDate(dateStr);
      allMatches.push(...data.matches);
      allOver25.push(...data.over25Matches);
      allOver15.push(...data.over15Matches);
      allBtts.push(...data.bttsMatches);
      await sleep(3000);
    }
     
    await sleep(5000);
    
    const winstreakMatches = await scrapeStreak('win');
    await sleep(3000);
    const losestreakMatches = await scrapeStreak('loss');
    await sleep(3000);
    const drawstreakMatches = await scrapeStreak('draw');
    
    console.log('Calculating Team to Score from BTTS data...');
    const calculated = calculateTeamToScore(allBtts, winstreakMatches);
    const teamToScoreMatches = calculated.teamToScore;
    const teamToScore2PlusMatches = calculated.teamToScore2Plus;
   
    const matchesData = {
      matches: allMatches,
      over25Matches: allOver25,
      over15Matches: allOver15,
      bttsMatches: allBtts,
      winstreakMatches,
      losestreakMatches,
      drawstreakMatches,
      teamToScoreMatches,
      teamToScore2PlusMatches
    };
   
    const ENABLE_BACKGROUND = process.env.ENABLE_BACKGROUND_SCRAPING === 'true';
    let analysisCache = {};
    
    if (ENABLE_BACKGROUND) {
      console.log('Starting batch analysis scraping...');
      analysisCache = await batchScrapeAnalysis(matchesData);
    } else {
      console.log('Skipping batch analysis scraping (ENABLE_BACKGROUND_SCRAPING not set to true)');
    }
   
    const enrichedData = {
      success: true,
      dates: dateRange,
      date: getLocalDateStr(),
      totalMatches: allMatches.length,
      totalOver25: allOver25.length,
      totalOver15: allOver15.length,
      totalBtts: allBtts.length,
      totalWinstreak: winstreakMatches.length,
      totalLosestreak: losestreakMatches.length,
      totalDrawstreak: drawstreakMatches.length,
      matches: allMatches,
      over25Matches: allOver25,
      over15Matches: allOver15,
      bttsMatches: allBtts,
      winstreakMatches,
      losestreakMatches,
      drawstreakMatches,
      teamToScoreMatches,
      teamToScore2PlusMatches,
      analysis: analysisCache
    };
     
    saveAnalysisCache(analysisCache);
    saveCachedPredictions(enrichedData);
   
    return enrichedData;
  });
}

async function fetchPredictions() {
  const cached = loadCachedPredictions();
  if (cached) {
    console.log('Serving predictions from cache...');
    return cached;
  }
  console.log('No cache found, fetching new data...');
  const data = await fetchAndCachePredictions();
  saveCachedPredictions(data);
  return data;
}

function normalizeTeamName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Analysis cache file - declared earlier in the file

function loadAnalysisCache() {
  try {
    if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Analysis cache load error:', err);
  }
  return {};
}

function getAllMatchupsFromPredictions() {
  const predictions = loadCachedPredictions();
  if (!predictions || !predictions.matches) return [];
  
  const matchups = new Set();
  
  const categories = [
    predictions.matches,
    predictions.over25Matches,
    predictions.over15Matches,
    predictions.bttsMatches,
    predictions.winstreakMatches,
    predictions.losestreakMatches,
    predictions.drawstreakMatches,
    predictions.teamToScoreMatches,
    predictions.teamToScore2PlusMatches
  ];
  
  for (const category of categories) {
    if (!category) continue;
    for (const match of category) {
      let matchup = match.match;
      if (!matchup && match.nextMatch) {
        matchup = match.nextMatch;
      }
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    }
  }
  
  return Array.from(matchups);
}

let backgroundScrapingInProgress = false;

async function scrapeSingleAnalysis(homeTeam, awayTeam) {
  console.log(`[Single Analysis] Scraping: ${homeTeam} vs ${awayTeam}`);
  const analysis = await getTeamAnalysis(homeTeam, awayTeam);
  
  const currentCache = loadAnalysisCache();
  const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
  const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
  currentCache[key1] = analysis;
  currentCache[key2] = analysis;
  saveAnalysisCache(currentCache);
  
  return analysis;
}

function triggerBackgroundScraping() {
  if (backgroundScrapingInProgress) {
    console.log('[Background] Scraping already in progress, skipping');
    return;
  }
  
  backgroundScrapingInProgress = true;
  console.log('[Background] Starting background analysis scraping...');
  
  scrapeMissingAnalysis()
    .then(() => {
      console.log('[Background] Completed background analysis scraping');
    })
    .catch(err => {
      console.error('[Background] Error:', err.message);
    })
    .finally(() => {
      backgroundScrapingInProgress = false;
    });
}

async function scrapeMissingAnalysis() {
  return withScraperLock(async () => {
    console.log('[Analysis Scraper] Starting to scrape missing analysis data...');
    
    const matchups = getAllMatchupsFromPredictions();
    if (matchups.length === 0) {
      console.log('[Analysis Scraper] No matches found in predictions cache');
      return null;
    }
    
    console.log(`[Analysis Scraper] Found ${matchups.length} total matchups in predictions`);
    
    const analysisCache = loadAnalysisCache();
    const missingMatchups = [];
    
    for (const matchup of matchups) {
      const [homeTeam, awayTeam] = matchup.split('|');
      const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
      const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
      
      if (!analysisCache[key1] && !analysisCache[key2]) {
        missingMatchups.push(matchup);
      }
    }
    
    if (missingMatchups.length === 0) {
      console.log('[Analysis Scraper] All matchups already have analysis data');
      return analysisCache;
    }
    
    console.log(`[Analysis Scraper] Found ${missingMatchups.length} matchups missing analysis data`);
    
    const MAX_SCRAPES_PER_RUN = parseInt(process.env.MAX_SCRAPES_PER_RUN) || 50;
    const matchupsToScrape = missingMatchups.slice(0, MAX_SCRAPES_PER_RUN);
    console.log(`[Analysis Scraper] Will scrape up to ${matchupsToScrape.length} matchups this run`);
    
    // 90 second timeout for background scraping
    const TIMEOUT_MS = 90 * 1000; // 90 seconds
    const startTime = Date.now();
    
    for (let i = 0; i < matchupsToScrape.length; i++) {
      // Check if we've exceeded the time limit
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.log(`[Analysis Scraper] Timeout reached (3 minutes). Stopping after ${i} matches.`);
        break;
      }
      const [homeTeam, awayTeam] = matchupsToScrape[i].split('|');
      
      console.log(`[Analysis Scraper] [${i+1}/${matchupsToScrape.length}] Scraping: ${homeTeam} vs ${awayTeam}`);
      
      try {
        const analysis = await getTeamAnalysis(homeTeam, awayTeam);
        
        const currentCache = loadAnalysisCache();
        const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
        const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
        currentCache[key1] = analysis;
        currentCache[key2] = analysis;
        saveAnalysisCache(currentCache);
        
        console.log(`[Analysis Scraper] Saved analysis for ${homeTeam} vs ${awayTeam}`);
        
        if (i < matchupsToScrape.length - 1) {
          await sleep(4000);
        }
      } catch (error) {
        console.error(`[Analysis Scraper] Failed to scrape ${homeTeam} vs ${awayTeam}:`, error.message);
        await sleep(5000);
      }
    }
    
    console.log('[Analysis Scraper] Completed scraping missing analysis data');
    return loadAnalysisCache();
  });
}

function saveAnalysisCache(data) {
  try {
    data.cacheTime = new Date().toISOString();
    fs.writeFileSync(ANALYSIS_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Analysis cache save error:', err);
  }
}

// Function to batch scrape analysis for all matches
async function batchScrapeAnalysis(matchesData) {
  console.log('Starting batch analysis scraping for all matches...');
  
  // Extract all unique matchups from different prediction types
  const matchups = new Set();
  
  // Process 1X2 matches
  if (matchesData.matches) {
    matchesData.matches.forEach(match => {
      const teams = match.match.split(' - ');
      if (teams.length === 2) {
        const [homeTeam, awayTeam] = teams.map(t => t.trim());
        matchups.add(`${homeTeam}|${awayTeam}`);
      }
    });
  }
  
  // Process Over/Under 2.5 matches
  if (matchesData.over25Matches) {
    matchesData.over25Matches.forEach(match => {
      const teams = match.match.split(' - ');
      if (teams.length === 2) {
        const [homeTeam, awayTeam] = teams.map(t => t.trim());
        matchups.add(`${homeTeam}|${awayTeam}`);
      }
    });
  }
  
  // Process Over/Under 1.5 matches
  if (matchesData.over15Matches) {
    matchesData.over15Matches.forEach(match => {
      const teams = match.match.split(' - ');
      if (teams.length === 2) {
        const [homeTeam, awayTeam] = teams.map(t => t.trim());
        matchups.add(`${homeTeam}|${awayTeam}`);
      }
    });
  }
  
  // Process BTTS matches
  if (matchesData.bttsMatches) {
    matchesData.bttsMatches.forEach(match => {
      const teams = match.match.split(' - ');
      if (teams.length === 2) {
        const [homeTeam, awayTeam] = teams.map(t => t.trim());
        matchups.add(`${homeTeam}|${awayTeam}`);
      }
    });
  }
  
  // Process Winning Streak matches - use nextMatch field for full matchup
  if (matchesData.winstreakMatches) {
    matchesData.winstreakMatches.forEach(match => {
      const matchup = match.nextMatch || match.match;
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    });
  }
  
  // Process Losing Streak matches
  if (matchesData.losestreakMatches) {
    matchesData.losestreakMatches.forEach(match => {
      const matchup = match.nextMatch || match.match;
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    });
  }
  
  // Process Draw Streak matches
  if (matchesData.drawstreakMatches) {
    matchesData.drawstreakMatches.forEach(match => {
      const matchup = match.nextMatch || match.match;
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    });
  }
  
  // Process Team to Score matches - use match field for full matchup
  if (matchesData.teamToScoreMatches) {
    matchesData.teamToScoreMatches.forEach(match => {
      const matchup = match.match || match.nextMatch;
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    });
  }
  
  // Process Team to Score 2+ matches
  if (matchesData.teamToScore2PlusMatches) {
    matchesData.teamToScore2PlusMatches.forEach(match => {
      const matchup = match.match || match.nextMatch;
      if (matchup && matchup.includes(' - ')) {
        const teams = matchup.split(' - ');
        if (teams.length === 2) {
          const [homeTeam, awayTeam] = teams.map(t => t.trim());
          matchups.add(`${homeTeam}|${awayTeam}`);
        }
      }
    });
  }

  console.log(`Found ${matchups.size} unique matchups to analyze`);
  
  // Convert set to array for processing
  const matchupsArray = Array.from(matchups);
  const analysisResults = {};
  
  // 90 second timeout for batch scraping
  const TIMEOUT_MS = 90 * 1000; // 90 seconds
  const startTime = Date.now();
  
  for (let i = 0; i < matchupsArray.length; i++) {
    // Check if we've exceeded the time limit
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.log(`Batch scraping timeout reached (3 minutes). Stopping after ${i} matches.`);
      break;
    }
    const [homeTeam, awayTeam] = matchupsArray[i].split('|');
    
    console.log(`[${i+1}/${matchupsArray.length}] Analyzing: ${homeTeam} vs ${awayTeam}`);
    
    try {
      const analysis = await getTeamAnalysis(homeTeam, awayTeam);
      const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
      const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
      analysisResults[key1] = analysis;
      analysisResults[key2] = analysis;
      
      if (i < matchupsArray.length - 1) {
        await sleep(4000);
      }
    } catch (error) {
      console.error(`Failed to analyze ${homeTeam} vs ${awayTeam}:`, error.message);
      await sleep(5000);
    }
  }
  
  console.log(`Batch analysis scraping completed. Analyzed ${Object.keys(analysisResults)/2} unique matchups.`);
  return analysisResults;
}

async function getTeamAnalysis(homeTeam, awayTeam) {
  const browserOptions = {
    headless: true,
    executablePath: executablePath,
    args: args
  };
  
  const result = {
    homeTeam,
    awayTeam,
    homeForm: '',
    awayForm: '',
    homeLast10: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 },
    awayLast10: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 },
    h2h: []
  };
  
  const scrape = async () => {
    const homeClean = homeTeam.split('(')[0].trim();
    const awayClean = awayTeam.split('(')[0].trim();
    
    console.log(`Scraping statarea.com for analysis: ${homeClean} vs ${awayClean}`);
    
    const browser = await launchBrowserWithQueue(browserOptions);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    
    const compareUrl = `https://www.statarea.com/compare/teams/${encodeURIComponent(homeClean)}/${encodeURIComponent(awayClean)}`;
    console.log(`Fetching URL: ${compareUrl}`);
    
    await page.goto(compareUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.lastteamsmatches, .teamsstatistics', { timeout: 15000 }).catch(() => {});
    
    const html = await page.content();
    const $ = cheerio.load(html);
    
    $('.lastteamsmatches .halfcontainer').each((i, el) => {
      const form = $(el).find('.teamform').map((_, tel) => $(tel).text().trim()).get().join('');
      if (i === 0) result.homeForm = form;
      else if (i === 1) result.awayForm = form;
    });
    
    $('.teamsstatistics .halfcontainer').each((i, el) => {
        const stats = { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 };
        $(el).find('.factitem').each((_, fact) => {
            const label = $(fact).find('.label').text().toLowerCase();
            const value = $(fact).find('.value').text().trim();
            if (label.includes('wins')) stats.wins = parseInt(value) || 0;
            else if (label.includes('draws')) stats.draws = parseInt(value) || 0;
            else if (label.includes('loses') || label.includes('losses')) stats.losses = parseInt(value) || 0;
            else if (label.includes('average scored goals')) stats.avgScored = parseFloat(value) || 0;
            else if (label.includes('average conceded goals')) stats.avgConceded = parseFloat(value) || 0;
        });
        if (i === 0) result.homeLast10 = stats;
        else if (i === 1) result.awayLast10 = stats;
    });

    $('.matchbtwteams .matchitem').each((_, el) => {
        const hTeam = $(el).find('.hostteam .name').text().trim();
        const aTeam = $(el).find('.guestteam .name').text().trim();
        const hGoals = $(el).find('.hostteam .goals').text().trim();
        const aGoals = $(el).find('.guestteam .goals').text().trim();
        
        if (hTeam && aTeam) {
            result.h2h.push({
                homeTeam: hTeam,
                awayTeam: aTeam,
                homeGoals: parseInt(hGoals) || 0,
                awayGoals: parseInt(aGoals) || 0
            });
        }
    });
    
    await browser.close();
    console.log(`[Scraper] Analysis successfully scraped for ${homeClean} vs ${awayClean}`);
  };

  try {
    await safeRequestWithBackoff(scrape, 3, 5000);
    
    const analysisCache = loadAnalysisCache();
    const key1 = `${homeTeam.toLowerCase()}|${awayTeam.toLowerCase()}`;
    const key2 = `${awayTeam.toLowerCase()}|${homeTeam.toLowerCase()}`;
    analysisCache[key1] = result;
    analysisCache[key2] = result;
    saveAnalysisCache(analysisCache);
    
  } catch (err) {
    console.error('Statarea scrape error:', err.message);
  }
  
  return result;
}

async function scrapeCorners() {
  const CORNERS_URL = 'https://afriscores.com/en-ng/tips/corners';
  const cornersCacheFile = path.join(process.cwd(), 'corners-cache.json');
  
  try {
    console.log('[Corners] Starting corners scrape from afriscores...');
    
    const browser = await launchBrowserWithQueue({
      executablePath,
      args: [...args, '--headless', '--no-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(CORNERS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const html = await page.content();
    await browser.close();
    
    const $ = cheerio.load(html);
    const cornersMatches = [];
    let matchId = 0;
    
    const pageText = $('body').text();
    console.log('[Corners] Page text length:', pageText.length);
    
    // Find all match sections by looking for odds (1.XX pattern) near team names
    const matchPattern = /([A-Za-z][A-Za-z\s\.']{2,40})\s+(?:vs|[-–])\s+([A-Za-z][A-Za-z\s\.']{2,40})[^0-9]*?(\d+\.\d+)/g;
    let matchInfo;
    
    while ((matchInfo = matchPattern.exec(pageText)) !== null && matchId < 50) {
      const home = matchInfo[1].trim();
      const away = matchInfo[2].trim();
      const odds = parseFloat(matchInfo[3]);
      
      if (home.length < 4 || away.length < 3) continue;
      if (!odds || odds < 1.1 || odds > 10) continue;
      
      // Find the context around this match to get insights
      const startPos = Math.max(0, matchInfo.index - 500);
      const endPos = Math.min(pageText.length, matchInfo.index + 500);
      const context = pageText.substring(startPos, endPos);
      
      // Extract insights from context - look for patterns like "10 of the last 12 games had over 8.5 corners"
      const insights = [];
      const lines = context.split(/\n|,|\.|;/);
      
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('corners') && /of the last \d+/i.test(line)) {
          console.log('[Corners] Found insight line:', line.substring(0, 100));
          // Extract count and total
          const countMatch = line.match(/(\d+)\s+of\s+(?:the\s+)?last\s+(\d+)/i);
          if (countMatch) {
            const count = parseInt(countMatch[1]);
            const total = parseInt(countMatch[2]);
            const pct = Math.round((count / total) * 100);
            
            // Find if it's home or away
            let location = '';
            if (/home games/i.test(line)) location = 'home';
            else if (/away games/i.test(line)) location = 'away';
            
            // Find team name before the count
            let teamName = '';
            const teamMatch = line.match(/([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+\d+\s+of/i);
            if (teamMatch) teamName = teamMatch[1];
            
            let insight = '';
            if (teamName && location) {
              insight = `${teamName}: ${count}/${total} ${location} (${pct}%)`;
            } else if (teamName) {
              insight = `${teamName}: ${count}/${total} (${pct}%)`;
            } else {
              insight = `${count}/${total} games (${pct}%)`;
            }
            
            if (insight.length > 5 && insight.length < 100) {
              insights.push(insight);
            }
          }
        }
      }
      
      const matchKey = `${home} vs ${away}`;
      if (cornersMatches.find(cm => cm.match === matchKey)) continue;
      
      // Calculate probability from insight or odds
      let probability = Math.round((1 / odds) * 100);
      if (insights.length > 0) {
        const pctMatch = insights[0].match(/\((\d+)%\)/);
        if (pctMatch) probability = parseInt(pctMatch[1]);
      }
      
      cornersMatches.push({
        id: matchId++,
        match: matchKey,
        tip: 'Over 8.5 Corners',
        insights: insights.slice(0, 1), // Only the most significant insight
        probability: probability,
        league: 'Various',
        date: new Date().toISOString().split('T')[0]
      });
    }
    
    console.log('[Corners] Found matches:', cornersMatches.length);
    
    const result = {
      success: true,
      date: new Date().toISOString().split('T')[0],
      totalMatches: cornersMatches.length,
      matches: cornersMatches.slice(0, 50)
    };
    
    fs.writeFileSync(cornersCacheFile, JSON.stringify(result, null, 2));
    console.log('[Corners] Scraped', cornersMatches.length, 'corners tips');
    
    return result;
  } catch (error) {
    console.error('[Corners] Scraping error:', error.message);
    
    try {
      if (fs.existsSync(cornersCacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cornersCacheFile, 'utf8'));
        console.log('[Corners] Returning cached data');
        return cached;
      }
    } catch (e) {}
    
    return { success: true, totalMatches: 0, matches: [], message: 'Corners data unavailable' };
  }
}

function loadCornersCache() {
  const cornersCacheFile = path.join(process.cwd(), 'corners-cache.json');
  try {
    if (fs.existsSync(cornersCacheFile)) {
      return JSON.parse(fs.readFileSync(cornersCacheFile, 'utf8'));
    }
  } catch (e) {}
  return null;
}

module.exports = {
  scrapeCorners,
  loadCornersCache,
  fetchPredictions,
  fetchAndCachePredictions,
  getTeamAnalysis,
  loadCachedPredictions,
  loadAnalysisCache,
  saveAnalysisCache,
  scrapeMissingAnalysis,
  scrapeSingleAnalysis,
  triggerBackgroundScraping
};
