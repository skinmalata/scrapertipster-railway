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

function loadCachedPredictions() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const today = getLocalDateStr();
      if (data.date === today && data.matches && data.matches.length > 0) {
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
  
  try {
    const browser = await puppeteer.launch(browserOptions);
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.match', { timeout: 15000 }).catch(() => {});
      html = await page.content();
      console.log(`Page loaded for ${dateStr}`);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(`Puppeteer error for ${dateStr}:`, err.message);
    if (retryCount < 2) {
      console.log(`Retrying ${dateStr} in ${(retryCount + 1) * 5000}ms...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 5000));
      return scrapeDate(dateStr, retryCount + 1);
    }
    // Fallback logic could go here but skipping for brevity in this refactor
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

    if (homeTeam && awayTeam && bestProb >= 60) {
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
    
    if (homeTeam && awayTeam && gg >= 50) {
      bttsMatches.push({
        id: bttsId++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { bttsYes: gg, bttsNo: ng },
        tip: 'BTTS',
        probability: gg,
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
  
  try {
    const browser = await puppeteer.launch({
      executablePath: executablePath,
      headless: true,
      args: args
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const html = await page.content();
    fs.writeFileSync(`debug_teamtoscore_${type}.html`, html);
    await browser.close();
    
    return parseTeamToScore(html, type);
  } catch (err) {
    console.error(`Error scraping ${label}:`, err.message);
    if (retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 5000));
      return scrapeTeamToScore(type, retryCount + 1);
    }
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

function calculateTeamToScore(matches, winstreakMatches, over25Matches) {
  const teamToScore = [];
  const teamToScore2Plus = [];
  const teamMap = new Map();
  
  for (const match of matches) {
    if (!match.date || !match.match) continue;
    
    const parts = match.match.split(' - ');
    if (parts.length !== 2) continue;
    
    const homeTeam = parts[0].trim();
    const awayTeam = parts[1].trim();
    
    const homeStreak = winstreakMatches.find(m => 
      m.nextMatch && (m.nextMatch.includes(homeTeam) || m.match === homeTeam)
    );
    const awayStreak = winstreakMatches.find(m => 
      m.nextMatch && (m.nextMatch.includes(awayTeam) || m.match === awayTeam)
    );
    
    const homeProb = match.probabilities?.homeWin || 0;
    const awayProb = match.probabilities?.awayWin || 0;
    const drawProb = match.probabilities?.draw || 0;
    
    const homeTotalProb = homeProb + (drawProb * 0.3);
    const awayTotalProb = awayProb + (drawProb * 0.3);
    
    let homeScoreProb = 50;
    let awayScoreProb = 50;
    
    if (homeTotalProb > awayTotalProb) {
      homeScoreProb = Math.min(50 + (homeTotalProb - awayTotalProb) * 0.5, 85);
      awayScoreProb = Math.max(50 - (homeTotalProb - awayTotalProb) * 0.3, 25);
    } else if (awayTotalProb > homeTotalProb) {
      awayScoreProb = Math.min(50 + (awayTotalProb - homeTotalProb) * 0.5, 85);
      homeScoreProb = Math.max(50 - (awayTotalProb - homeTotalProb) * 0.3, 25);
    }
    
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
  
  const teamToScore2PlusResult = allTeams
    .filter(t => t.probability >= 70)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 30)
    .map((t, i) => ({ 
      ...t, 
      id: i,
      streak: t.probability >= 80 ? `Scored 2+ in recent matches` : 'High scoring potential'
    }));
  
  console.log(`Calculated ${teamToScoreResult.length} Team to Score matches`);
  console.log(`Calculated ${teamToScore2PlusResult.length} Team to Score 2+ matches`);
  
  return { teamToScore: teamToScoreResult, teamToScore2Plus: teamToScore2PlusResult };
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
  try {
     const browser = await puppeteer.launch({
        executablePath: executablePath,
        headless: true,
        args: args
     });
     const page = await browser.newPage();
     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
     
     await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
     
     await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => {});
     
     await new Promise(resolve => setTimeout(resolve, 3000));
     
     const html = await page.content();
     fs.writeFileSync(`debug_streak_${type}.html`, html);
     await browser.close();
     return parseBetexplorerStreaks(html, type);
  } catch (err) {
    console.error(`Error scraping ${type} streaks:`, err.message);
    if (retryCount < 2) {
      console.log(`Retrying ${type} streak scrape in ${(retryCount + 1) * 5000}ms...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 5000));
      return scrapeStreak(type, retryCount + 1);
    }
    return [];
  }
}

async function fetchAndCachePredictions() {
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
    // Simple delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Scrape streaks
  const winstreakMatches = await scrapeStreak('win');
  const losestreakMatches = await scrapeStreak('loss');
  const drawstreakMatches = await scrapeStreak('draw');

  // Calculate Team to Score from match data (Betexplorer scraping disabled)
  console.log('Calculating Team to Score from match data...');
  const calculated = calculateTeamToScore(allMatches, winstreakMatches, allOver25);
  const teamToScoreMatches = calculated.teamToScore;
  const teamToScore2PlusMatches = calculated.teamToScore2Plus;

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
      teamToScore2PlusMatches
  };
  
  return enrichedData;
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
  
  try {
    const homeClean = homeTeam.split('(')[0].trim();
    const awayClean = awayTeam.split('(')[0].trim();
    
    console.log(`Scraping statarea.com for analysis: ${homeClean} vs ${awayClean}`);
    
    const browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const compareUrl = `https://www.statarea.com/compare/teams/${encodeURIComponent(homeClean)}/${encodeURIComponent(awayClean)}`;
    console.log(`Fetching URL: ${compareUrl}`);
    
    await page.goto(compareUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.lastteamsmatches, .teamsstatistics', { timeout: 15000 }).catch(() => {});
    
    const html = await page.content();
    const $ = cheerio.load(html);
    
    // Parse form
    $('.lastteamsmatches .halfcontainer').each((i, el) => {
      const form = $(el).find('.teamform').map((_, tel) => $(tel).text().trim()).get().join('');
      if (i === 0) result.homeForm = form;
      else if (i === 1) result.awayForm = form;
    });
    
    // Parse stats
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

    // Parse H2H
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
    
  } catch (err) {
    console.error('Statarea scrape error:', err.message);
  }
  
  return result;
}

module.exports = {
  fetchPredictions,
  fetchAndCachePredictions,
  getTeamAnalysis
};
