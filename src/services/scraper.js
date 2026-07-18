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

const CACHE_VERSION = '2';

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
  console.log('[Debug] loadCachedPredictions called');
  console.log('[Debug] CWD:', process.cwd());
  console.log('[Debug] Cache file:', CACHE_FILE);
  console.log('[Debug] Cache file exists:', fs.existsSync(CACHE_FILE));
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log('[Debug] Loaded cache, matches:', data.matches?.length);
      
      if (data.matches && data.matches.length > 0) {
        const cacheDate = new Date(data.fetchTime || data.date);
        const now = new Date();
        const hoursOld = (now - cacheDate) / (1000 * 60 * 60);
        
        console.log('[Debug] Cache age:', hoursOld.toFixed(1), 'hours');
        
        if (data.cacheVersion !== CACHE_VERSION) {
          console.log('[Debug] Cache version mismatch (cached: ' + data.cacheVersion + ', current: ' + CACHE_VERSION + '), marking for refresh');
          data.isStale = true;
        }
        
        const MAX_CACHE_AGE_HOURS = 12;
        if (!data.isStale && hoursOld > MAX_CACHE_AGE_HOURS) {
          console.log('[Debug] Cache is stale (>' + MAX_CACHE_AGE_HOURS + ' hours old), marking for refresh');
          data.isStale = true;
        }
        
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
    data.cacheVersion = CACHE_VERSION;
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

const RESULTS_CACHE_MAX_DAYS = 30;

function pruneResultsCache(results, maxDays = RESULTS_CACHE_MAX_DAYS) {
  if (!results || typeof results !== 'object') return {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const pruned = {};
  for (const dateKey of Object.keys(results)) {
    // Keep only YYYY-MM-DD keys within the retention window
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey >= cutoffStr) {
      pruned[dateKey] = results[dateKey];
    }
  }
  return pruned;
}

function getResultsCache() {
  try {
    if (fs.existsSync(RESULTS_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_CACHE_FILE, 'utf8'));
      return pruneResultsCache(data);
    }
  } catch (e) {}
  return {};
}

function saveResultsCache(results) {
  try {
    const existing = getResultsCache();
    const merged = pruneResultsCache({ ...existing, ...results });
    fs.writeFileSync(RESULTS_CACHE_FILE, JSON.stringify(merged, null, 2));
    const days = Object.keys(merged).length;
    console.log(`Results cache updated (${days} day(s), max ${RESULTS_CACHE_MAX_DAYS})`);
  } catch (err) {
    console.error('Results cache save error:', err);
  }
}

async function scrapeYesterdayResults() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const now = new Date();
  const todayStr = formatter.format(now);
  const todayDate = new Date(todayStr + 'T12:00:00');
  todayDate.setDate(todayDate.getDate() - 1);
  const year = todayDate.getFullYear();
  const month = String(todayDate.getMonth() + 1).padStart(2, '0');
  const day = String(todayDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  console.log(`Scraping results for ${dateStr}...`);
  
  const url = `https://www.betexplorer.com/results/soccer/?date=${dateStr}`;
  let html;
  
  const tryAxios = async () => {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    html = res.data;
    console.log(`Axios loaded results, length: ${html.length}`);
  };

  const tryPuppeteer = async () => {
    const browser = await launchBrowserWithQueue({
      headless: true, executablePath, args
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      html = await page.content();
    } finally {
      await browser.close();
    }
  };

  await tryAxios().catch(async () => {
    console.log('Axios failed for results, trying Puppeteer...');
    await safeRequestWithBackoff(tryPuppeteer, 2, 5000).catch(err => {
      console.error('Puppeteer also failed for results:', err.message);
    });
  });

  if (!html) return {};
  
  const $ = cheerio.load(html);
  const results = {};
  const dateResults = {};
  let currentLeague = '';
  
  // Parse betexplorer results - track league headers
  $('.table-main tbody tr').each((i, el) => {
    const $row = $(el);
    
    // Check for league header row (th.h-text-left contains a.table-main__tournament)
    const leagueLink = $row.find('th.h-text-left a.table-main__tournament');
    if (leagueLink.length > 0) {
      currentLeague = leagueLink.text().trim();
      return;
    }
    
    const teamsEl = $row.find('td.table-main__tt a');
    const scoreEl = $row.find('td.table-main__result');
    
    if (teamsEl.length > 0) {
      const matchText = teamsEl.text().trim();
      const teamsMatch = matchText.replace(/<[^>]*>/g, '').match(/^(.+?)\s*[-–]\s*(.+)$/);
      
      if (teamsMatch) {
        const homeTeam = teamsMatch[1].trim();
        const awayTeam = teamsMatch[2].trim();
        const scoreText = scoreEl.text().trim();
        const scoreMatch = scoreText.match(/(\d+)\s*[-–:]\s*(\d+)/);
        
        if (scoreMatch && homeTeam && awayTeam) {
          const homeScore = parseInt(scoreMatch[1]);
          const awayScore = parseInt(scoreMatch[2]);
          // Skip postponed/cancelled matches
          if (!scoreText.includes('POSTP') && !scoreText.includes('CANCL') && !scoreText.includes('AWA')) {
            dateResults[`${homeTeam} - ${awayTeam}`] = { 
              home: homeScore, 
              away: awayScore,
              league: currentLeague
            };
          }
        }
      }
    }
  });
  
  if (Object.keys(dateResults).length > 0) {
    results[dateStr] = dateResults;
    saveResultsCache(results);
    console.log(`Found ${Object.keys(dateResults).length} results for ${dateStr}`);
  }
  
  return dateResults;
}

async function scrapeDate(dateStr, retryCount = 0) {
  const url = `${STATAREA_URL}/date/${dateStr}`;
  let html;
  
  console.log(`Scraping predictions for ${dateStr}...`);

  const tryAxios = async () => {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    html = res.data;
    console.log(`Axios loaded page for ${dateStr}, length: ${html.length}`);
  };

  const tryPuppeteer = async () => {
    const browser = await launchBrowserWithQueue({
      headless: true, executablePath, args
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.match', { timeout: 15000 }).catch(() => {});
      html = await page.content();
      console.log(`Puppeteer loaded page for ${dateStr}`);
    } finally {
      await browser.close();
    }
  };

  await tryAxios().catch(async () => {
    console.log(`Axios failed for ${dateStr}, trying Puppeteer...`);
    try {
      await safeRequestWithBackoff(tryPuppeteer, 2, 5000);
    } catch (err) {
      console.error(`Puppeteer also failed for ${dateStr}:`, err.message);
      html = '';
    }
  });

  const $ = cheerio.load(html);
  let matches = [];
  const fallbackMatches = [];
  let over25Matches = [];
  let over15Matches = [];
  let bttsMatches = [];
  let bttsNoMatches = [];
  
  const matchElements = $('.match');
  console.log(`Found ${matchElements.length} match elements for ${dateStr}`);

  let matchId = 0, over25Id = 0, over15Id = 0, bttsId = 0, bttsNoId = 0;
  
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

    // OTS column is immediately after BTS column
    // Based on statarea format: values 12,13 = BTS (gg, ng), values 14,15,16 = OTS
    // OTS = "One Team Scores" = probability that NOT both teams score = BTTS NO
    // The second BTS value (ng) represents OTS
    let ots = ng; // OTS is the second value in BTS column (ng probability)

    const bestProb = Math.max(prob1, probX, prob2);
    let bestPick = '';
    let finalProb = bestProb;
    if (prob1 >= probX && prob1 >= prob2) bestPick = '1';
    else if (probX >= prob1 && probX >= prob2) bestPick = 'X';
    else bestPick = '2';

    if (bestPick === '1' && bestProb < 70) {
      bestPick = '1X';
    } else if (bestPick === '2' && bestProb < 70) {
      bestPick = 'X2';
    }

    const leagueInfo = detectLeague(homeTeam);

     if (homeTeam && awayTeam && finalProb >= 65) {
      matches.push({
        id: matchId++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { homeWin: prob1, draw: probX, awayWin: prob2 },
        tip: bestPick,
        probability: finalProb,
        date: dateStr,
        score: score
      });
    } else if (homeTeam && awayTeam && finalProb >= 60) {
      fallbackMatches.push({
        id: matchId++,
        league: leagueInfo.league,
        country: leagueInfo.country,
        time: time,
        match: `${homeTeam} - ${awayTeam}`,
        probabilities: { homeWin: prob1, draw: probX, awayWin: prob2 },
        tip: bestPick,
        probability: finalProb,
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

    if (homeTeam && awayTeam && over15 >= 80) {
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
     
      // BTTS YES - use the raw BTS probability (gg value)
      if (homeTeam && awayTeam && gg >= 55) {
       bttsMatches.push({
         id: bttsId++,
         league: leagueInfo.league,
         country: leagueInfo.country,
         time: time,
         match: `${homeTeam} - ${awayTeam}`,
         probabilities: { bttsYes: gg, bttsNo: ng, ots: ots },
         tip: 'BTTS YES',
         probability: gg,
         date: dateStr,
         score: score
       });
     }

      // BTTS NO - based on OTS (One Team Scores / No Both Teams To Score)
      // OTS is immediately after BTS column (h class)
      if (homeTeam && awayTeam && ots >= 60) {
        bttsNoMatches.push({
          id: bttsNoId++,
          league: leagueInfo.league,
          country: leagueInfo.country,
          time: time,
          match: `${homeTeam} - ${awayTeam}`,
          probabilities: { bttsYes: gg, bttsNo: ng, ots: ots },
          tip: 'BTTS NO',
          probability: ots,
          date: dateStr,
          score: score
        });
      }
    });

  if (matches.length < 6 && fallbackMatches.length > 0) {
    console.log(`Only ${matches.length} matches with 65%+, adding ${fallbackMatches.length} matches with 60-64%`);
    matches.push(...fallbackMatches);
  }
  
  // Deduplicate within Statarea results (same match may appear in multiple sections)
  const seenKeys = new Set();
  const dedup = (arr) => arr.filter(m => {
    const key = normalizeMatchKey(m.match, m.date);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  matches = dedup(matches);
  over25Matches = dedup(over25Matches);
  over15Matches = dedup(over15Matches);
  bttsMatches = dedup(bttsMatches);
  bttsNoMatches = dedup(bttsNoMatches);
  
  return { matches, over25Matches, over15Matches, bttsMatches, bttsNoMatches };
}

const PROSOCCER_BASE_URL = 'https://www.prosoccer.gr/en/football/predictions';

function getProSoccerUrl(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateObj = new Date(dateStr + 'T12:00:00');
  return PROSOCCER_BASE_URL + '/' + days[dateObj.getDay()] + '.html';
}

const MONTH_NAMES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

function parseProSoccerDateFromTitle(title) {
  const match = title.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = String(MONTH_NAMES[match[2].toLowerCase()]).padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

async function scrapeProSoccerDate(dateStr) {
  const url = getProSoccerUrl(dateStr);
  let html;

  console.log(`Scraping ProSoccer predictions for ${dateStr}...`);

  try {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    html = res.data;
  } catch (err) {
    console.error(`ProSoccer fetch failed for ${dateStr}:`, err.message);
    return [];
  }

  const $ = cheerio.load(html);

  // Parse the actual match date from the page title instead of using the URL-derived date.
  // ProSoccer's "today" may differ from Lagos timezone, causing a 1-day offset in URLs.
  const pageTitle = $('h1').first().text();
  const actualDate = parseProSoccerDateFromTitle(pageTitle);
  const effectiveDate = actualDate || dateStr;
  if (actualDate && actualDate !== dateStr) {
    console.log(`ProSoccer page date mismatch: URL derived ${dateStr}, actual page shows ${actualDate}. Using ${effectiveDate}`);
  }

  const matches = [];
  let matchId = 0;

  $('#tblPredictions tbody tr').each((i, row) => {
    const $row = $(row);
    const tds = $row.find('td');
    if (tds.length < 7) return;

    const time = $(tds[1]).text().trim();
    const matchText = $(tds[2]).text().trim();
    const parts = matchText.replace(/\u00a0/g, ' ').split(' - ');
    if (parts.length < 2) return;
    const homeTeam = parts[0].trim();
    const awayTeam = parts[1].trim();
    if (!homeTeam || !awayTeam) return;

    const prob1 = parseInt($(tds[3]).text().trim()) || 0;
    const probX = parseInt($(tds[4]).text().trim()) || 0;
    const prob2 = parseInt($(tds[5]).text().trim()) || 0;

    const tipEl = $(tds[6]).find('.sctip');
    let tip = '';
    if (tipEl.hasClass('tip_p1')) tip = '1';
    else if (tipEl.hasClass('tip_pX')) tip = 'X';
    else if (tipEl.hasClass('tip_p2')) tip = '2';
    if (!tip) return;

    const tipProb = tip === '1' ? prob1 : tip === 'X' ? probX : prob2;
    if (tipProb <= 60) return;

    const leagueInfo = detectLeague(homeTeam);
    const matchLabel = `${homeTeam} - ${awayTeam}`;

    let finalTip = tip;
    let finalProb = tipProb;
    if (tipProb < 70) {
      if (tip === '1') { finalTip = '1X'; }
      else if (tip === '2') { finalTip = 'X2'; }
    }

    matches.push({
      id: matchId++,
      source: 'prosoccer',
      league: leagueInfo.league,
      country: leagueInfo.country,
      time: time,
      match: matchLabel,
      probabilities: { homeWin: prob1, draw: probX, awayWin: prob2 },
      tip: finalTip,
      probability: finalProb,
      date: effectiveDate,
      score: null
    });
  });

  console.log(`ProSoccer: ${matches.length} matches with >60% confidence for ${effectiveDate}`);
  return matches;
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
  let html;
  
  const tryAxios = async () => {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    html = res.data;
    console.log(`Axios loaded streaks ${type}, length: ${html.length}`);
  };

  const tryPuppeteer = async () => {
    const browser = await launchBrowserWithQueue({
      executablePath, headless: true, args
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => {});
      await sleep(3000);
      html = await page.content();
    } finally {
      await browser.close();
    }
  };

  await tryAxios().catch(async () => {
    console.log(`Axios failed for streaks ${type}, trying Puppeteer...`);
    await safeRequestWithBackoff(tryPuppeteer, 2, 5000).catch(err => {
      console.error(`Puppeteer failed for streaks ${type}:`, err.message);
    });
  });

  if (!html) return [];
  return parseBetexplorerStreaks(html, type);
}

async function fetchAndCachePredictions() {
  return withScraperLock(async () => {
    const dateRange = getDateRange();
    console.log('Fetching predictions for dates:', dateRange);
    
    console.log('Scraping yesterday results...');
    const yesterdayResults = await scrapeYesterdayResults();
    
    const allMatches = [];
    const allOver25 = [];
    const allOver15 = [];
    const allBtts = [];
    const allBttsNo = [];
     
    for (const dateStr of dateRange) {
      const data = await scrapeDate(dateStr);
      allMatches.push(...data.matches);
      allOver25.push(...data.over25Matches);
      allOver15.push(...data.over15Matches);
      allBtts.push(...data.bttsMatches);
      allBttsNo.push(...data.bttsNoMatches);
      await sleep(3000);
    }
    
    // Scrape ProSoccer for additional 1X2 predictions with >70% confidence
    console.log('Scraping ProSoccer predictions...');
    const statareaKeys = new Set(allMatches.map(m => normalizeMatchKey(m.match, m.date)));
    const proSoccerAll = [];
    const dateRangeSet = new Set(dateRange);
    for (const dateStr of dateRange) {
      const proMatches = await scrapeProSoccerDate(dateStr);
      for (const pm of proMatches) {
        // Only include matches whose date is within our expected range
        if (!dateRangeSet.has(pm.date)) continue;
        const key = normalizeMatchKey(pm.match, pm.date);
        if (!statareaKeys.has(key)) {
          proSoccerAll.push(pm);
          statareaKeys.add(key);
        }
      }
      await sleep(2000);
    }
    if (proSoccerAll.length > 0) {
      console.log(`Adding ${proSoccerAll.length} unique ProSoccer predictions`);
      allMatches.push(...proSoccerAll);
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
      bttsNoMatches: allBttsNo,
      winstreakMatches,
      losestreakMatches,
      drawstreakMatches,
      teamToScoreMatches,
      teamToScore2PlusMatches
    };
   
    const enrichedData = {
      success: true,
      dates: dateRange,
      date: getLocalDateStr(),
      totalMatches: allMatches.length,
      totalOver25: allOver25.length,
      totalOver15: allOver15.length,
      totalBtts: allBtts.length,
      totalBttsNo: allBttsNo.length,
      totalWinstreak: winstreakMatches.length,
      totalLosestreak: losestreakMatches.length,
      totalDrawstreak: drawstreakMatches.length,
      matches: allMatches,
      over25Matches: allOver25,
      over15Matches: allOver15,
      bttsMatches: allBtts,
      bttsNoMatches: allBttsNo,
      winstreakMatches,
      losestreakMatches,
      drawstreakMatches,
      teamToScoreMatches,
      teamToScore2PlusMatches
    };
     
    saveCachedPredictions(enrichedData);
   
    return enrichedData;
  });
}

async function fetchPredictions() {
  const cached = loadCachedPredictions();
  console.log('No cache found, fetching new data...');
  const freshData = await fetchAndCachePredictions();
  
  const MIN_MATCHES_THRESHOLD = 20;
  const hasEnoughMatches = freshData.totalMatches >= MIN_MATCHES_THRESHOLD;
  const hasBetterOrEqualMatches = !cached || freshData.totalMatches >= cached.totalMatches;
  
  if (hasEnoughMatches && hasBetterOrEqualMatches) {
    console.log(`Fresh scrape has ${freshData.totalMatches} matches (threshold: ${MIN_MATCHES_THRESHOLD}), using fresh data`);
    
    if (cached) {
      const missedMatches = findMissedMatches(cached, freshData);
      if (missedMatches.length > 0) {
        console.log(`⚠️ ${missedMatches.length} matches from cache NOT in fresh scrape:`);
        missedMatches.forEach(m => console.log(`  - ${m.match} (${m.date})`));
        
        const mergedData = mergeMissedMatches(freshData, missedMatches, cached);
        console.log(`✅ Merged ${missedMatches.length} missed matches into fresh data`);
        saveCachedPredictions(mergedData);
        return mergedData;
      }
    }
    
    saveCachedPredictions(freshData);
    return freshData;
  }
  
  if (cached) {
    console.log(`Fresh scrape has only ${freshData.totalMatches} matches, using cached data (${cached.totalMatches} matches)`);
    return cached;
  }
  
  console.log(`No cached data available, using fresh scrape result (${freshData.totalMatches} matches)`);
  saveCachedPredictions(freshData);
  return freshData;
}

function findMissedMatches(cached, fresh) {
  const missed = [];
  const freshKeys = new Set(fresh.matches.map(m => `${m.match}|${m.date}`));
  
  for (const match of cached.matches) {
    const key = `${match.match}|${match.date}`;
    if (!freshKeys.has(key)) {
      missed.push(match);
    }
  }
  return missed;
}

function mergeMissedMatches(freshData, missedMatches, cached) {
  const merged = { ...freshData };
  
  merged.matches = [...missedMatches, ...freshData.matches].sort((a, b) => {
    if (a.date === b.date) return 0;
    return new Date(a.date) - new Date(b.date);
  });
  merged.totalMatches = merged.matches.length;
  
  const missedOver25 = missedMatches.filter(m => m.over25 || (m.tip && m.tip.includes('Over 2.5')));
  const missedOver15 = missedMatches.filter(m => m.over15 || (m.tip && m.tip.includes('Over 1.5')));
  const missedBtts = missedMatches.filter(m => m.btts || (m.tip && m.tip.includes('BTTS')));
  
  merged.over25Matches = [...missedOver25, ...freshData.over25Matches];
  merged.over15Matches = [...missedOver15, ...freshData.over15Matches];
  merged.bttsMatches = [...missedBtts, ...freshData.bttsMatches];
  
  merged.totalOver25 = merged.over25Matches.length;
  merged.totalOver15 = merged.over15Matches.length;
  merged.totalBtts = merged.bttsMatches.length;
  
  merged.lastUpdated = new Date().toISOString();
  merged.recoveredMatches = missedMatches.length;
  
  return merged;
}

function normalizeTeamName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeMatchKey(matchStr, date) {
  const parts = matchStr.split(/\s*-\s*/);
  const normalized = parts.map(p => {
    return p.toLowerCase()
      .replace(/\b(ff|bk|if|fk|sc|cf|afc|fc|ac|as|ss|rv|av|ov|uk|sk|tk|ok|op|kb|mb|ab|hb|fb|db|cb|lb|ub|ib|ob|sb|vb|wb|yb|zb)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim();
  }).filter(Boolean);
  return normalized.join('|') + '|' + date;
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
    h2h: [],
    summary: ''
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
    
    result.summary = generateMatchSummary(result);
    
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
  const CORNERS_URL = 'https://statsbet.org/football/predictions/corners';
  const cornersCacheFile = path.join(process.cwd(), 'corners-cache.json');
  
  try {
    console.log('[Corners] Starting corners scrape from statsbet.org...');
    
    const response = await axios.get(CORNERS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 30000
    });
    
    const html = response.data;
    // Unescape RSC payload quotes for regex parsing
    const unescaped = html.replace(/\\"/g, '"');
    
    // Extract home teams
    const homePattern = '"className":"font-medium text-sm text-white truncate","children":"([^"]+)"';
    const homeMatches = [...unescaped.matchAll(new RegExp(homePattern, 'g'))];
    
    // Extract away teams
    const awayPattern = '"vs"," ","([^"]+)"';
    const awayMatches = [...unescaped.matchAll(new RegExp(awayPattern, 'g'))];
    
    // Extract leagues (one per pair of entries)
    const leaguePattern = '"className":"truncate max-w-\\[140px\\]","children":"([^"]+)"';
    const leagueMatches = [...unescaped.matchAll(new RegExp(leaguePattern, 'g'))];
    
    // Extract hit rates
    const hitPattern = '"children":"(\\d{2,3})%"';
    const hitMatches = [...unescaped.matchAll(new RegExp(hitPattern, 'g'))];
    
    // Extract odds
    const oddsPattern = '"children":"(1\\.\\d{2})"';
    const oddsMatches = [...unescaped.matchAll(new RegExp(oddsPattern, 'g'))];
    
    // Extract markets
    const marketPattern = '"children":"(Over [89]\\.5 Corners)"';
    const marketMatches = [...unescaped.matchAll(new RegExp(marketPattern, 'g'))];
    
    console.log(`[Corners] Parsed: ${homeMatches.length} homes, ${awayMatches.length} aways, ${hitMatches.length} hits`);
    
    const totalEntries = homeMatches.length;
    const cornersMatches = [];
    let matchId = 0;
    
    for (let i = 0; i < totalEntries; i++) {
      const home = homeMatches[i]?.[1] || '';
      const away = awayMatches[i]?.[1] || '';
      const league = leagueMatches[Math.floor(i / 2)]?.[1] || 'Various';
      const hitRate = parseInt(hitMatches[i]?.[1] || '0', 10);
      const odds = oddsMatches[i]?.[1] || '';
      const market = marketMatches[i]?.[1] || 'Over 8.5 Corners';
      
      if (!home || !away || home.length < 2 || away.length < 2) continue;
      
      // Only include matches with hit rate > 80%
      if (hitRate <= 80) continue;
      
      const matchKey = `${home} vs ${away}`;
      if (cornersMatches.find(cm => cm.match === matchKey)) continue;
      
      const parsedOdds = odds ? parseFloat(odds) : null;
      cornersMatches.push({
        id: matchId++,
        match: matchKey,
        tip: market,
        insights: [`Hit rate: ${hitRate}%`, `Odds: ${odds}`, league],
        probability: hitRate,
        odds: parsedOdds && parsedOdds > 1 ? parsedOdds : null,
        league: league,
        date: new Date().toISOString().split('T')[0]
      });
    }
    
    console.log(`[Corners] Filtered (>80% hit rate): ${cornersMatches.length} matches`);
    
    const result = {
      success: true,
      date: new Date().toISOString().split('T')[0],
      totalMatches: cornersMatches.length,
      matches: cornersMatches.slice(0, 50)
    };
    
    fs.writeFileSync(cornersCacheFile, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Corners] Scrape error:', error.message);
    try {
      if (fs.existsSync(cornersCacheFile)) {
        return JSON.parse(fs.readFileSync(cornersCacheFile, 'utf8'));
      }
    } catch (e) {}
    return { success: true, totalMatches: 0, matches: [], message: 'Corners data unavailable' };
  }
}

function loadCornersCache() {
  const cornersCacheFile = path.join(process.cwd(), 'corners-cache.json');
  try {
    if (fs.existsSync(cornersCacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cornersCacheFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      if (cached.date === today) {
        return cached;
      }
      if (cached.matches && cached.matches.length > 0) {
        console.log('[Corners] Using yesterday\'s cache (date:', cached.date, ')');
        return cached;
      }
    }
  } catch (e) {}
  return null;
}

function loadCardsCache() {
  const cardsCacheFile = path.join(process.cwd(), 'cards-cache.json');
  try {
    if (fs.existsSync(cardsCacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cardsCacheFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      if (cached.date === today) {
        return cached;
      }
      if (cached.matches && cached.matches.length > 0) {
        console.log('[Cards] Using yesterday\'s cache (date:', cached.date, ')');
        return cached;
      }
    }
  } catch (e) {}
  return null;
}

async function scrapeCards() {
  const CARDS_URL = 'https://footballzz.co.uk/bookings-yellow-cards-football-predictions-and-statistics';
  const cardsCacheFile = path.join(process.cwd(), 'cards-cache.json');
  
  try {
    console.log('[Cards] Starting cards scrape from footballzz.co.uk...');
    
    const response = await axios.get(CARDS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const cardsMatches = [];
    const seen = new Set();
    
    $('table.table tr').each((_, row) => {
      const $row = $(row);
      if ($row.find('th').length > 0) return;
      
      const startDate = $row.find('span[itemprop="startDate"]').attr('content') || '';
      const homeTeam = $row.find('div[itemprop="homeTeam"] meta[itemprop="name"]').attr('content') || '';
      const awayTeam = $row.find('div[itemprop="awayTeam"] meta[itemprop="name"]').attr('content') || '';
      if (!homeTeam || !awayTeam) return;
      
      const flagTitle = $row.find('span.flag').attr('title') || '';
      const league = flagTitle.replace(/^[^-]+\s*-\s*/, '').trim() || 'Unknown';
      
      const threshold = $row.find('.stat-tip').text().trim();
      const description = $row.find('td[itemprop="description"]').text().trim();
      
      const matchKey = `${homeTeam} - ${awayTeam}`;
      const uniqueKey = `${matchKey}|${threshold}`;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      
      let gamesSample = 0;
      const gamesMatch = description.match(/last\s+(\d+)\s+games?/i);
      if (gamesMatch) gamesSample = parseInt(gamesMatch[1], 10);
      
      const refTeam = homeTeam;
      
      let kickoffDate = '';
      if (startDate) {
        kickoffDate = startDate.split('T')[0];
      }
      
      const kickoffTime = startDate ? new Date(startDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';
      
      const insight1 = `Over ${threshold} Cards`;
      const insight2 = league;
      const insight3 = gamesSample > 0 ? `Pattern across ${gamesSample} recent fixtures` : '';

      const reasonTemplates = [
        `${refTeam} tend to accumulate cards — ${threshold}+ bookings in ${gamesSample} recent matches`,
        `Consistent high-card pattern for ${refTeam}: ${threshold}+ shown across ${gamesSample} fixtures`,
        `Based on ${gamesSample} recent games, ${refTeam} regularly exceed ${threshold} card threshold`,
        `${refTeam} bookings trend: ${threshold}+ cards in ${gamesSample} of their latest fixtures`,
        `Card-heavy profile — ${refTeam} averaged ${threshold}+ bookings over ${gamesSample} matches`
      ];
      const templateIdx = matchKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % reasonTemplates.length;
      const generatedReason = gamesSample > 0 ? reasonTemplates[templateIdx] : `Card-heavy fixture with strong booking history`;

      const insights = [insight1, insight2, insight3].filter(Boolean);
      
      cardsMatches.push({
        match: matchKey,
        tip: `Over ${threshold} Cards`,
        insights,
        probability: gamesSample > 0 ? Math.min(85, 60 + gamesSample) : 65,
        league,
        date: kickoffDate || new Date().toISOString().split('T')[0],
        time: kickoffTime,
        threshold,
        description: generatedReason,
        teamPattern: refTeam
      });
    });
    
    console.log('[Cards] Found', cardsMatches.length, 'card predictions');
    
    const result = {
      success: true,
      date: new Date().toISOString().split('T')[0],
      totalMatches: cardsMatches.length,
      matches: cardsMatches.slice(0, 50)
    };
    
    fs.writeFileSync(cardsCacheFile, JSON.stringify(result, null, 2));
    console.log('[Cards] Scraped', cardsMatches.length, 'cards tips');
    
    return result;
  } catch (error) {
    console.error('[Cards] Scraping error:', error.message);
    
    try {
      if (fs.existsSync(cardsCacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cardsCacheFile, 'utf8'));
        console.log('[Cards] Returning cached data');
        return cached;
      }
    } catch (e) {}
    
    return { success: true, totalMatches: 0, matches: [], message: 'Cards data unavailable' };
  }
}

function generateMatchSummary(analysis) {
  const { homeTeam, awayTeam, homeForm, awayForm, homeLast10, awayLast10, h2h } = analysis;
  
  const homeClean = homeTeam.split('(')[0].trim();
  const awayClean = awayTeam.split('(')[0].trim();
  
  const homeWins = (homeForm.match(/W/g) || []).length;
  const homeDraws = (homeForm.match(/D/g) || []).length;
  const homeLosses = (homeForm.match(/L/g) || []).length;
  const awayWins = (awayForm.match(/W/g) || []).length;
  const awayDraws = (awayForm.match(/D/g) || []).length;
  const awayLosses = (awayForm.match(/L/g) || []).length;
  
  const homeAvgScored = homeLast10.avgScored?.toFixed(1) || '0';
  const homeAvgConceded = homeLast10.avgConceded?.toFixed(1) || '0';
  const awayAvgScored = awayLast10.avgScored?.toFixed(1) || '0';
  const awayAvgConceded = awayLast10.avgConceded?.toFixed(1) || '0';
  
  let formDescription = '';
  if (homeWins > awayWins + 1) {
    formDescription = `${homeClean} comes into this match in excellent form with ${homeWins} wins from their last 5 matches, including home performances yielding an average of ${homeAvgScored} goals scored.`;
  } else if (awayWins > homeWins + 1) {
    formDescription = `${awayClean} enters this fixture in superior condition, winning ${awayWins} of their last 5 games and averaging ${awayAvgScored} goals per match on the road.`;
  } else if (homeWins === awayWins) {
    formDescription = `Both teams arrive with identical recent records, each winning ${homeWins} of their last 5 matches, setting up what promises to be a closely contested encounter.`;
  } else {
    formDescription = `Both teams show similar recent form with ${homeWins} wins for ${homeClean} and ${awayWins} for ${awayClean}, making this a difficult match to predict confidently.`;
  }
  
  let statsDescription = `Defensively, ${homeClean} has conceded an average of ${homeAvgConceded} goals per home game while ${awayClean} has shipped ${awayAvgConceded} away, suggesting potential for goals in either direction.`;
  
  let h2hDescription = '';
  if (h2h && h2h.length > 0) {
    const homeH2HWins = h2h.filter(h => h.homeGoals > h.awayGoals).length;
    const awayH2HWins = h2h.filter(h => h.awayGoals > h.homeGoals).length;
    const draws = h2h.length - homeH2HWins - awayH2HWins;
    h2hDescription = ` Their head-to-head history shows ${homeClean} winning ${homeH2HWins}, ${awayClean} winning ${awayH2HWins}, and ${draws} draws in their last ${h2h.length} meetings.`;
  }
  
  let predictionHint = '';
  if (homeWins > awayWins && homeAvgScored > awayAvgConceded) {
    predictionHint = `${homeClean} appears better positioned for a positive result.`;
  } else if (awayWins > homeWins && awayAvgScored > homeAvgConceded) {
    predictionHint = `${awayClean} looks better placed to take something from this match.`;
  } else {
    predictionHint = `Expect a competitive match with the potential for a share of the spoils.`;
  }
  
  return `${formDescription} ${statsDescription}${h2hDescription} ${predictionHint}`.replace(/\s+/g, ' ').trim();
}

function loadBothHalvesCache() {
  const bothHalvesCacheFile = path.join(process.cwd(), 'both-halves-cache.json');
  try {
    if (fs.existsSync(bothHalvesCacheFile)) {
      const cached = JSON.parse(fs.readFileSync(bothHalvesCacheFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      if (cached.date === today) {
        return cached;
      }
      if (cached.matches && cached.matches.length > 0) {
        console.log('[BothHalves] Using yesterday\'s cache (date:', cached.date, ')');
        return cached;
      }
    }
  } catch (e) {}
  return null;
}

async function scrapeBothHalves() {
  const BOTH_HALVES_URL = 'https://www.apwin.com/decreasing-stats/team-scored-in-both-halves/';
  const bothHalvesCacheFile = path.join(process.cwd(), 'both-halves-cache.json');
  
  try {
    console.log('[Both Halves] Starting scrape from apwin...');
    
    const response = await axios.get(BOTH_HALVES_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const bothHalvesMatches = [];
    let matchId = 0;
    
    // Get team names from team links
    const teamNames = [];
    $('a[href*="/team/"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !teamNames.includes(text)) {
        teamNames.push(text);
      }
    });
    
    console.log('[Both Halves] Found', teamNames.length, 'teams');
    
    for (const teamName of teamNames.slice(0, 50)) {
      if (teamName.length < 2) continue;
      
      if (bothHalvesMatches.find(cm => cm.match === teamName)) continue;
      
      const idx = bothHalvesMatches.length;
      const probability = idx < 5 ? 73 : idx < 15 ? 68 : 63;
      
      bothHalvesMatches.push({
        id: matchId++,
        match: teamName,
        tip: 'Score 2+ Goals',
        insights: ['Team scored in both halves in recent matches'],
        probability: probability,
        league: 'Various',
        date: new Date().toISOString().split('T')[0]
      });
    }
    
    console.log('[Both Halves] Found matches:', bothHalvesMatches.length);
    
    const result = {
      success: true,
      date: new Date().toISOString().split('T')[0],
      totalMatches: bothHalvesMatches.length,
      matches: bothHalvesMatches.slice(0, 50)
    };
    
    fs.writeFileSync(bothHalvesCacheFile, JSON.stringify(result, null, 2));
    console.log('[Both Halves] Scraped', bothHalvesMatches.length, 'tips');
    
    return result;
  } catch (error) {
    console.error('[Both Halves] Scraping error:', error.message);
    
    try {
      if (fs.existsSync(bothHalvesCacheFile)) {
        const cached = JSON.parse(fs.readFileSync(bothHalvesCacheFile, 'utf8'));
        console.log('[Both Halves] Returning cached data');
        return cached;
      }
    } catch (e) {}
    
    return { success: true, totalMatches: 0, matches: [], message: 'Both Halves data unavailable' };
  }
}

module.exports = {
  scrapeCorners,
  loadCornersCache,
  scrapeCards,
  loadCardsCache,
  scrapeBothHalves,
  loadBothHalvesCache,
  fetchPredictions,
  fetchAndCachePredictions,
  getTeamAnalysis,
  loadCachedPredictions,
  loadAnalysisCache,
  saveAnalysisCache,
  pruneResultsCache,
  scrapeMissingAnalysis,
  scrapeSingleAnalysis,
  triggerBackgroundScraping,
  getResultsCache,
  scrapeYesterdayResults
};
