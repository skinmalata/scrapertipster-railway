const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const cron = require('node-cron');

const LOG_FILE = path.join(__dirname, 'debug.log');

function debugLog(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  console.log(msg);
  fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\n');
}

let CHROME_PATH = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
const SKIP_INITIAL_FETCH = false; //process.env.SKIP_INITIAL_FETCH === 'true' || process.argv.includes('--skip-fetch');
if (!CHROME_PATH) {
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        CHROME_PATH = p;
        break;
      }
    }
  } else {
    CHROME_PATH = '/usr/bin/chromium';
  }
}

const app = express();
const PORT = process.env.PORT || 3002;

const rateLimit = new Map();
const RATE_LIMIT = 100;
const TIME_WINDOW = 60 * 1000;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, resetTime: now + TIME_WINDOW });
    return next();
  }
  
  const data = rateLimit.get(ip);
  
  if (now > data.resetTime) {
    rateLimit.set(ip, { count: 1, resetTime: now + TIME_WINDOW });
    return next();
  }
  
  if (data.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  data.count++;
  rateLimit.set(ip, data);
  next();
}

app.use(rateLimiter);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled prediction fetch...');
  try {
    const data = await fetchAndCachePredictions();
    console.log('Scheduled fetch completed:', data.success ? 'success' : 'failed');
    console.log('Pre-fetching analysis for all matches...');
    await preFetchAnalysis(data);
    console.log('Analysis pre-fetch completed');
  } catch (error) {
    console.error('Scheduled fetch error:', error.message);
  }
});

setTimeout(async () => {
  if (SKIP_INITIAL_FETCH) {
    console.log('Skipping initial fetch (--skip-fetch flag set)');
    return;
  }
  console.log('Initial prediction fetch on startup...');
  try {
    const data = await fetchAndCachePredictions();
    saveCachedPredictions(data);
    console.log('Initial fetch completed:', data.success ? 'success' : 'failed');
    console.log('Pre-fetching analysis for all matches...');
    await preFetchAnalysis(data);
    console.log('Analysis pre-fetch completed');
  } catch (error) {
    console.error('Initial fetch error:', error.message);
  }
}, 2000);

async function preFetchAnalysis(predictionsData) {
  const allMatches = [
    ...(predictionsData.matches || []),
    ...(predictionsData.over15Matches || []),
    ...(predictionsData.over25Matches || []),
    ...(predictionsData.bttsMatches || [])
  ];
  
  const uniqueMatches = new Map();
  for (const match of allMatches) {
    const key = `${match.match}`.toLowerCase();
    if (!uniqueMatches.has(key)) {
      uniqueMatches.set(key, match);
    }
  }
  
  const analysisCache = getAnalysisCache();
  const today = getLocalDateStr();
  let fetched = 0;
  let skipped = 0;
  
  for (const [key, match] of uniqueMatches) {
    const teams = match.match.split(' - ');
    const homeTeam = teams[0]?.trim() || '';
    const awayTeam = teams[1]?.trim() || '';
    
    if (!homeTeam || !awayTeam) continue;
    
    const cacheKey = `${homeTeam}-${awayTeam}`.toLowerCase();
    
    if (analysisCache[cacheKey] && analysisCache[cacheKey].date === today) {
      skipped++;
      continue;
    }
    
    try {
      const result = await scrapeStatareaAnalysis(homeTeam, awayTeam);
      analysisCache[cacheKey] = result;
      fetched++;
      
      if (fetched % 10 === 0) {
        console.log(`Pre-fetched ${fetched} analyses...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error fetching analysis for ${homeTeam} vs ${awayTeam}:`, error.message);
    }
  }
  
  saveAnalysisCache(analysisCache);
  console.log(`Analysis pre-fetch complete: ${fetched} new, ${skipped} cached`);
}

const STATAREA_URL = 'https://www.statarea.com/predictions';
const CACHE_FILE = path.join(__dirname, 'predictions-cache.json');
const ANALYSIS_CACHE_FILE = path.join(__dirname, 'analysis-cache.json');

function getAnalysisCache() {
  try {
    if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveAnalysisCache(cache) {
  try {
    fs.writeFileSync(ANALYSIS_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {}
}

const leagueMap = {
  'VfB Stuttgart': { league: 'UEFA Champions League', country: 'Europe' },
  'Celtic': { league: 'UEFA Champions League', country: 'Europe' },
  'Bologna': { league: 'UEFA Champions League', country: 'Europe' },
  'Brann': { league: 'UEFA Champions League', country: 'Europe' },
  'Crystal Palace': { league: 'UEFA Champions League', country: 'Europe' },
  'Zrinjski Mostar': { league: 'UEFA Champions League', country: 'Europe' },
  'Fiorentina': { league: 'UEFA Champions League', country: 'Europe' },
  'Jagiellonia': { league: 'UEFA Champions League', country: 'Europe' },
  'Samsunspor': { league: 'UEFA Champions League', country: 'Europe' },
  'Shkendija': { league: 'UEFA Champions League', country: 'Europe' },
  'AZ Alkmaar': { league: 'UEFA Champions League', country: 'Europe' },
  'FC Noah': { league: 'UEFA Champions League', country: 'Europe' },
  'NK Celje': { league: 'UEFA Champions League', country: 'Europe' },
  'Drita': { league: 'UEFA Champions League', country: 'Europe' },
  'Real Madrid': { league: 'UEFA Champions League', country: 'Europe' },
  'Benfica': { league: 'UEFA Champions League', country: 'Europe' },
  'Paris Saint Germain': { league: 'UEFA Champions League', country: 'Europe' },
  'Monaco': { league: 'UEFA Champions League', country: 'Europe' },
  'Atalanta': { league: 'UEFA Champions League', country: 'Europe' },
  'Borussia Dortmund': { league: 'UEFA Champions League', country: 'Europe' },
  'Juventus': { league: 'UEFA Champions League', country: 'Europe' },
  'Galatasaray': { league: 'UEFA Champions League', country: 'Europe' },
  'Liverpool': { league: 'Premier League', country: 'England' },
  'Manchester City': { league: 'Premier League', country: 'England' },
  'Arsenal': { league: 'Premier League', country: 'England' },
  'Chelsea': { league: 'Premier League', country: 'England' },
  'Manchester United': { league: 'Premier League', country: 'England' },
  'Tottenham': { league: 'Premier League', country: 'England' },
  'Newcastle': { league: 'Premier League', country: 'England' },
  'Liverpool': { league: 'Premier League', country: 'England' },
  'Aston Villa': { league: 'Premier League', country: 'England' },
  'West Ham': { league: 'Premier League', country: 'England' },
  'Nottingham Forest': { league: 'Premier League', country: 'England' },
  'Fulham': { league: 'Premier League', country: 'England' },
  'Brighton': { league: 'Premier League', country: 'England' },
  'Everton': { league: 'Premier League', country: 'England' },
  'Brentford': { league: 'Premier League', country: 'England' },
  'Crystal Palace': { league: 'Premier League', country: 'England' },
  'Wolves': { league: 'Premier League', country: 'England' },
  'Burnley': { league: 'Premier League', country: 'England' },
  'Luton': { league: 'Premier League', country: 'England' },
  'Leicester': { league: 'Premier League', country: 'England' },
  'Southampton': { league: 'Premier League', country: 'England' },
  'Leeds': { league: 'Championship', country: 'England' },
  'Norwich': { league: 'Championship', country: 'England' },
  'Sheffield Wed': { league: 'Championship', country: 'England' },
  'Stoke City': { league: 'Championship', country: 'England' },
  'Oxford United': { league: 'Championship', country: 'England' },
  'Millwall': { league: 'Championship', country: 'England' },
  'Birmingham': { league: 'Championship', country: 'England' },
  'Sheffield Utd': { league: 'Championship', country: 'England' },
  'Coventry': { league: 'Championship', country: 'England' },
  'West Brom': { league: 'Championship', country: 'England' },
  'Sunderland': { league: 'Championship', country: 'England' },
  'Middlesbrough': { league: 'Championship', country: 'England' },
  'Hull': { league: 'Championship', country: 'England' },
  'Swansea': { league: 'Championship', country: 'England' },
  'Watford': { league: 'Championship', country: 'England' },
  'Preston': { league: 'Championship', country: 'England' },
  'Bristol City': { league: 'Championship', country: 'England' },
  'Cardiff': { league: 'Championship', country: 'England' },
  'QPR': { league: 'Championship', country: 'England' },
  'Derby': { league: 'Championship', country: 'England' },
  'Blackburn': { league: 'Championship', country: 'England' },
  'Portsmouth': { league: 'Championship', country: 'England' },
  'Bournemouth': { league: 'Premier League', country: 'England' },
  'Flamengo': { league: 'Copa Libertadores', country: 'Brazil' },
  'Palmeiras': { league: 'Brazil Serie A', country: 'Brazil' },
  'Botafogo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Vitoria': { league: 'Brazil Serie A', country: 'Brazil' },
  'Bahia': { league: 'Brazil Serie A', country: 'Brazil' },
  'Chapecoense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Bragantino': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico Paranaense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Coritiba': { league: 'Brazil Serie A', country: 'Brazil' },
  'Sao Paulo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Remo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Internacional': { league: 'Brazil Serie A', country: 'Brazil' },
  'Gremio': { league: 'Brazil Serie A', country: 'Brazil' },
  'Fluminense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Santos': { league: 'Brazil Serie A', country: 'Brazil' },
  'Vasco': { league: 'Brazil Serie A', country: 'Brazil' },
  'Cruzeiro': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico Mineiro': { league: 'Brazil Serie A', country: 'Brazil' },
  'Corinthians': { league: 'Brazil Serie A', country: 'Brazil' },
  'Athletico': { league: 'Brazil Serie A', country: 'Brazil' },
  'Nacional Potosi': { league: 'Copa Libertadores', country: 'Bolivia' },
  'River Plate': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Banfield': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Argentinos Jrs': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Barcelona SC': { league: 'Copa Libertadores', country: 'Ecuador' },
  'Estudiantes': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Huracan': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Racing Club': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Independiente': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Godoy Cruz': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'San Lorenzo': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Velez Sarsfield': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Boca Juniors': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Talleres': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Union Santa Fe': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Sarmiento': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Al Ahly': { league: 'Egyptian Premier League', country: 'Egypt' },
  'Zamalek': { league: 'Egyptian Premier League', country: 'Egypt' },
  'Pyramids': { league: 'Egyptian Premier League', country: 'Egypt' },
  'Al Najma': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al-Nassr': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al Hilal': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al Ittihad': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al Riyadh': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al Fateh': { league: 'Saudi Pro League', country: 'Saudi Arabia' },
  'Al-Wehdat': { league: 'Jordan Pro League', country: 'Jordan' },
  'Al-Hussein': { league: 'Jordan Pro League', country: 'Jordan' },
  'Al Salt': { league: 'Jordan Pro League', country: 'Jordan' },
  'Al Duhail': { league: 'Qatar Stars League', country: 'Qatar' },
  'Al Sadd': { league: 'Qatar Stars League', country: 'Qatar' },
  'Al Rayyan': { league: 'Qatar Stars League', country: 'Qatar' },
  'Al Gharafa': { league: 'Qatar Stars League', country: 'Qatar' },
  'Persib': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Madura United': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Arema': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Persita': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Borneo': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Persebaya': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'PSM Makassar': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'Persija': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'RANS Nusantara': { league: 'Indonesia Liga 1', country: 'Indonesia' },
  'FCSB': { league: 'Romanian Liga 1', country: 'Romania' },
  'CFR Cluj': { league: 'Romanian Liga 1', country: 'Romania' },
  'Dinamo': { league: 'Romanian Liga 1', country: 'Romania' },
  'Steaua': { league: 'Romanian Liga 1', country: 'Romania' },
  'Sporting Cristal': { league: 'Liga 1 Peru', country: 'Peru' },
  'Universitario': { league: 'Liga 1 Peru', country: 'Peru' },
  'Alianza Lima': { league: 'Liga 1 Peru', country: 'Peru' },
  'Melgar': { league: 'Liga 1 Peru', country: 'Peru' },
  'Deportivo Municipal': { league: 'Liga 1 Peru', country: 'Peru' },
  'Cienciano': { league: 'Liga 1 Peru', country: 'Peru' },
  '2 De Mayo': { league: 'Liga 1 Paraguay', country: 'Paraguay' },
  'Olimpia': { league: 'Liga 1 Paraguay', country: 'Paraguay' },
  'Cerro Porteno': { league: 'Liga 1 Paraguay', country: 'Paraguay' },
  'Libertad': { league: 'Liga 1 Paraguay', country: 'Paraguay' },
  'Racing Club': { league: 'Copa Libertadores', country: 'Argentina' },
  'Nacional': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Penacosta': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Defensor Sporting': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Montevideo City': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Liverpool FC': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Cerro Largo': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Danubio': { league: 'Uruguayan Primera Division', country: 'Uruguay' },
  'Raja Casablanca': { league: 'Botola Pro', country: 'Morocco' },
  'Wydad': { league: 'Botola Pro', country: 'Morocco' },
  'Renaissance Berkane': { league: 'Botola Pro', country: 'Morocco' },
  'Maccabi Tel Aviv': { league: 'Israeli Premier League', country: 'Israel' },
  'Maccabi Haifa': { league: 'Israeli Premier League', country: 'Israel' },
  'Hapoel Tel Aviv': { league: 'Israeli Premier League', country: 'Israel' },
  'Shimshon Tel Aviv': { league: 'Israeli Liga Alef', country: 'Israel' },
  'Hapoel Ramat HaSharon': { league: 'Israeli Liga Alef', country: 'Israel' },
  'Breidablik': { league: 'Urvalsdeild', country: 'Iceland' },
  'Valur': { league: 'Urvalsdeild', country: 'Iceland' },
  'KR Reykjavik': { league: 'Urvalsdeild', country: 'Iceland' },
  'IA Akranes': { league: 'Urvalsdeild', country: 'Iceland' },
  'IR': { league: 'Urvalsdeild', country: 'Iceland' },
  'Grindavik': { league: 'Urvalsdeild', country: 'Iceland' },
  'Leiknir Reykjavik': { league: 'Urvalsdeild', country: 'Iceland' },
  'Macarthur FC': { league: 'A-League', country: 'Australia' },
  'Central Coast Mariners': { league: 'A-League', country: 'Australia' },
  'Melbourne Victory': { league: 'A-League', country: 'Australia' },
  'Sydney FC': { league: 'A-League', country: 'Australia' },
  'Western Sydney': { league: 'A-League', country: 'Australia' },
  'Adelaide United': { league: 'A-League', country: 'Australia' },
  'Geylang': { league: 'Singapore Premier League', country: 'Singapore' },
  'Young Lions': { league: 'Singapore Premier League', country: 'Singapore' },
  'Lion City': { league: 'Singapore Premier League', country: 'Singapore' },
  'DPMM': { league: 'Singapore Premier League', country: 'Brunei' },
  'Home United': { league: 'Singapore Premier League', country: 'Singapore' },
  'Tampines': { league: 'Singapore Premier League', country: 'Singapore' },
  'FC Winterthur': { league: 'Swiss Super League', country: 'Switzerland' },
  'FC Thun': { league: 'Swiss Challenge League', country: 'Switzerland' },
  'Young Boys': { league: 'Swiss Super League', country: 'Switzerland' },
  'Zurich': { league: 'Swiss Super League', country: 'Switzerland' },
  'Servette': { league: 'Swiss Super League', country: 'Switzerland' },
  'Lugano': { league: 'Swiss Super League', country: 'Switzerland' },
  'Lausanne': { league: 'Swiss Super League', country: 'Switzerland' },
  'Crvena Zvezda': { league: 'Serbian SuperLiga', country: 'Serbia' },
  'Partizan': { league: 'Serbian SuperLiga', country: 'Serbia' },
  'Vojvodina': { league: 'Serbian SuperLiga', country: 'Serbia' },
  'Ludogorets': { league: 'Bulgarian First League', country: 'Bulgaria' },
  'Levski': { league: 'Bulgarian First League', country: 'Bulgaria' },
  'CSKA Sofia': { league: 'Bulgarian First League', country: 'Bulgaria' },
  'Plzen': { league: 'Czech First League', country: 'Czech Republic' },
  'Sparta Prague': { league: 'Czech First League', country: 'Czech Republic' },
  'Slavia Prague': { league: 'Czech First League', country: 'Czech Republic' },
  'Panathinaikos': { league: 'Greek Super League', country: 'Greece' },
  'Olympiacos': { league: 'Greek Super League', country: 'Greece' },
  'PAOK': { league: 'Greek Super League', country: 'Greece' },
  'AEK Athens': { league: 'Greek Super League', country: 'Greece' },
  'Aris Thessaloniki': { league: 'Greek Super League', country: 'Greece' },
  'Omonia': { league: 'Cypriot First Division', country: 'Cyprus' },
  ' APOEL': { league: 'Cypriot First Division', country: 'Cyprus' },
  'Anorthosis': { league: 'Cypriot First Division', country: 'Cyprus' },
  'Rijeka': { league: 'Croatian First Football League', country: 'Croatia' },
  'Dinamo Zagreb': { league: 'Croatian First Football League', country: 'Croatia' },
  'Hajduk Split': { league: 'Croatian First Football League', country: 'Croatia' },
  'Ferencvaros': { league: 'Hungarian NB I', country: 'Hungary' },
  'Debrecen': { league: 'Hungarian NB I', country: 'Hungary' },
  'MTK Budapest': { league: 'Hungarian NB I', country: 'Hungary' },
  'Lech Poznan': { league: 'Polish Ekstraklasa', country: 'Poland' },
  'Legia Warsaw': { league: 'Polish Ekstraklasa', country: 'Poland' },
  'Piast Gliwice': { league: 'Polish Ekstraklasa', country: 'Poland' },
  'KuPS': { league: 'Finnish Veikkausliiga', country: 'Finland' },
  'HJK': { league: 'Finnish Veikkausliiga', country: 'Finland' },
  'Inter Milan': { league: 'Serie A', country: 'Italy' },
  'AC Milan': { league: 'Serie A', country: 'Italy' },
  'Juventus': { league: 'Serie A', country: 'Italy' },
  'Napoli': { league: 'Serie A', country: 'Italy' },
  'Roma': { league: 'Serie A', country: 'Italy' },
  'Lazio': { league: 'Serie A', country: 'Italy' },
  'Atalanta': { league: 'Serie A', country: 'Italy' },
  'Fiorentina': { league: 'Serie A', country: 'Italy' },
  'Bologna': { league: 'Serie A', country: 'Italy' },
  'Torino': { league: 'Serie A', country: 'Italy' },
  'Udinese': { league: 'Serie A', country: 'Italy' },
  'Sassuolo': { league: 'Serie A', country: 'Italy' },
  'Monza': { league: 'Serie A', country: 'Italy' },
  'Empoli': { league: 'Serie A', country: 'Italy' },
  'Celta Vigo': { league: 'La Liga', country: 'Spain' },
  'Barcelona': { league: 'La Liga', country: 'Spain' },
  'Real Madrid': { league: 'La Liga', country: 'Spain' },
  'Atletico Madrid': { league: 'La Liga', country: 'Spain' },
  'Sevilla': { league: 'La Liga', country: 'Spain' },
  'Villarreal': { league: 'La Liga', country: 'Spain' },
  'Real Betis': { league: 'La Liga', country: 'Spain' },
  'Real Sociedad': { league: 'La Liga', country: 'Spain' },
  'Athletic Bilbao': { league: 'La Liga', country: 'Spain' },
  'Valencia': { league: 'La Liga', country: 'Spain' },
  'Girona': { league: 'La Liga', country: 'Spain' },
  'Alaves': { league: 'La Liga', country: 'Spain' },
  'Osasuna': { league: 'La Liga', country: 'Spain' },
  'Mallorca': { league: 'La Liga', country: 'Spain' },
  'Almeria': { league: 'La Liga', country: 'Spain' },
  'Granada': { league: 'La Liga', country: 'Spain' },
  'Las Palmas': { league: 'La Liga', country: 'Spain' },
  'Almeria': { league: 'La Liga', country: 'Spain' },
  'Nottingham Forest': { league: 'Premier League', country: 'England' },
  'Fenerbahce': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Galatasaray': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Besiktas': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Trabzonspor': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Samsunspor': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Ankaragücü': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Konyaspor': { league: 'Turkish Super Lig', country: 'Turkey' },
  'Bayern Munich': { league: 'Bundesliga', country: 'Germany' },
  'Borussia Dortmund': { league: 'Bundesliga', country: 'Germany' },
  'RB Leipzig': { league: 'Bundesliga', country: 'Germany' },
  'Leverkusen': { league: 'Bundesliga', country: 'Germany' },
  'Eintracht Frankfurt': { league: 'Bundesliga', country: 'Germany' },
  'Union Berlin': { league: 'Bundesliga', country: 'Germany' },
  'Freiburg': { league: 'Bundesliga', country: 'Germany' },
  'Wolfsburg': { league: 'Bundesliga', country: 'Germany' },
  'Stuttgart': { league: 'Bundesliga', country: 'Germany' },
  'Hoffenheim': { league: 'Bundesliga', country: 'Germany' },
  'Augsburg': { league: 'Bundesliga', country: 'Germany' },
  'Bochum': { league: 'Bundesliga', country: 'Germany' },
  'Darmstadt': { league: 'Bundesliga', country: 'Germany' },
  'Heidenheim': { league: 'Bundesliga', country: 'Germany' },
  'PSG': { league: 'Ligue 1', country: 'France' },
  'Marseille': { league: 'Ligue 1', country: 'France' },
  'Monaco': { league: 'Ligue 1', country: 'France' },
  'Lyon': { league: 'Ligue 1', country: 'France' },
  'Lille': { league: 'Ligue 1', country: 'France' },
  'Nice': { league: 'Ligue 1', country: 'France' },
  'Rennes': { league: 'Ligue 1', country: 'France' },
  'Lens': { league: 'Ligue 1', country: 'France' },
  'Strasbourg': { league: 'Ligue 1', country: 'France' },
  'Toulouse': { league: 'Ligue 1', country: 'France' },
  'Brest': { league: 'Ligue 1', country: 'France' },
  'Nantes': { league: 'Ligue 1', country: 'France' },
  'Le Havre': { league: 'Ligue 1', country: 'France' },
  'Metz': { league: 'Ligue 1', country: 'France' },
  'Lorient': { league: 'Ligue 1', country: 'France' },
  'Clermont': { league: 'Ligue 1', country: 'France' },
  'Manchester City': { league: 'Premier League', country: 'England' },
  'Arsenal': { league: 'Premier League', country: 'England' },
  'Liverpool': { league: 'Premier League', country: 'England' },
  'Aston Villa': { league: 'Premier League', country: 'England' },
  'Tottenham': { league: 'Premier League', country: 'England' },
  'Chelsea': { league: 'Premier League', country: 'England' },
  'Manchester United': { league: 'Premier League', country: 'England' },
  'West Ham': { league: 'Premier League', country: 'England' },
  'Newcastle': { league: 'Premier League', country: 'England' },
  'Brighton': { league: 'Premier League', country: 'England' },
  'Fulham': { league: 'Premier League', country: 'England' },
  'Crystal Palace': { league: 'Premier League', country: 'England' },
  'Wolves': { league: 'Premier League', country: 'England' },
  'Everton': { league: 'Premier League', country: 'England' },
  'Brentford': { league: 'Premier League', country: 'England' },
  'Forest': { league: 'Premier League', country: 'England' },
  'Luton': { league: 'Premier League', country: 'England' },
  'Burnley': { league: 'Premier League', country: 'England' },
  'Sheffield United': { league: 'Premier League', country: 'England' },
  'Club Brugge': { league: 'Belgian Pro League', country: 'Belgium' },
  ' Anderlecht': { league: 'Belgian Pro League', country: 'Belgium' },
  'Gent': { league: 'Belgian Pro League', country: 'Belgium' },
  'Antwerp': { league: 'Belgian Pro League', country: 'Belgium' },
  'Standard Liege': { league: 'Belgian Pro League', country: 'Belgium' },
  'Ajax': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'Feyenoord': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'PSV': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'AZ': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'Twente': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'Ajax': { league: 'Dutch Eredivisie', country: 'Netherlands' },
  'Porto': { league: 'Primeira Liga', country: 'Portugal' },
  'Benfica': { league: 'Primeira Liga', country: 'Portugal' },
  'Sporting': { league: 'Primeira Liga', country: 'Portugal' },
  'Braga': { league: 'Primeira Liga', country: 'Portugal' },
  'Gil Vicente': { league: 'Primeira Liga', country: 'Portugal' },
  'Casa Pia': { league: 'Primeira Liga', country: 'Portugal' },
  'Vitoria Guimaraes': { league: 'Primeira Liga', country: 'Portugal' },
  'Arouca': { league: 'Primeira Liga', country: 'Portugal' },
  'Santa Clara': { league: 'Primeira Liga', country: 'Portugal' },
  'Chaves': { league: 'Primeira Liga', country: 'Portugal' },
  'Estrela': { league: 'Primeira Liga', country: 'Portugal' },
  'Rio Ave': { league: 'Primeira Liga', country: 'Portugal' },
  'Vila Real': { league: 'Primeira Liga', country: 'Portugal' },
  'Moreirense': { league: 'Primeira Liga', country: 'Portugal' },
  'Nacional': { league: 'Primeira Liga', country: 'Portugal' },
  'Boavista': { league: 'Primeira Liga', country: 'Portugal' },
  'Portimonense': { league: 'Primeira Liga', country: 'Portugal' },
  'Olhanense': { league: 'Primeira Liga', country: 'Portugal' },
  'CS Constantine': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'CR Belouizdad': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'MC Alger': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'JS Kabylie': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Parma': { league: 'Serie B', country: 'Italy' },
  'Venezia': { league: 'Serie B', country: 'Italy' },
  'Cremonese': { league: 'Serie B', country: 'Italy' },
  'Cittadella': { league: 'Serie B', country: 'Italy' },
  'Sampdoria': { league: 'Serie B', country: 'Italy' },
  'Reggina': { league: 'Serie B', country: 'Italy' },
  'Ascoli': { league: 'Serie B', country: 'Italy' },
  'Brescia': { league: 'Serie B', country: 'Italy' },
  'Cosenza': { league: 'Serie B', country: 'Italy' },
  'Ternana': { league: 'Serie B', country: 'Italy' },
  'Stoke City': { league: 'Championship', country: 'England' },
  'Luton Town': { league: 'Championship', country: 'England' },
  'Norwich City': { league: 'Championship', country: 'England' },
  'Middlesbrough': { league: 'Championship', country: 'England' },
  'Sunderland': { league: 'Championship', country: 'England' },
  'Swansea City': { league: 'Championship', country: 'England' },
  'West Brom': { league: 'Championship', country: 'England' },
  'Watford': { league: 'Championship', country: 'England' },
  'Hull City': { league: 'Championship', country: 'England' },
  'Preston North End': { league: 'Championship', country: 'England' },
  'Bristol City': { league: 'Championship', country: 'England' },
  'Cardiff City': { league: 'Championship', country: 'England' },
  'Queens Park Rangers': { league: 'Championship', country: 'England' },
  'Birmingham City': { league: 'Championship', country: 'England' },
  'Millwall': { league: 'Championship', country: 'England' },
  'Sheffield Wednesday': { league: 'Championship', country: 'England' },
  'Coventry City': { league: 'Championship', country: 'England' },
  'Ipswich': { league: 'Championship', country: 'England' },
  'Leicester City': { league: 'Championship', country: 'England' },
  'Southampton': { league: 'Championship', country: 'England' },
  'Leeds United': { league: 'Championship', country: 'England' },
  'Walsall': { league: 'League One', country: 'England' },
  'MK Dons': { league: 'League One', country: 'England' },
  'Bolton': { league: 'League One', country: 'England' },
  'Portsmouth': { league: 'League One', country: 'England' },
  'Derby County': { league: 'League One', country: 'England' },
  'Peterborough': { league: 'League One', country: 'England' },
  'Oxford United': { league: 'League One', country: 'England' },
  'Lincoln': { league: 'League One', country: 'England' },
  'Bristol Rovers': { league: 'League One', country: 'England' },
  'Exeter': { league: 'League One', country: 'England' },
  'Charlton': { league: 'League One', country: 'England' },
  'Cambridge': { league: 'League One', country: 'England' },
  'Wigan': { league: 'League One', country: 'England' },
  'Stevenage': { league: 'League One', country: 'England' },
  'Fleetwood': { league: 'League One', country: 'England' },
  'Northampton': { league: 'League One', country: 'England' },
  'Leyton Orient': { league: 'League One', country: 'England' },
  'Burton': { league: 'League One', country: 'England' },
  'Cheltenham': { league: 'League One', country: 'England' },
  'Carlisle': { league: 'League One', country: 'England' },
  'Gillingham': { league: 'League One', country: 'England' },
  'Morecambe': { league: 'League One', country: 'England' },
  'Accrington': { league: 'League One', country: 'England' },
  'Crewe': { league: 'League One', country: 'England' },
  'Donny': { league: 'League One', country: 'England' },
  'Mixco': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Mictlan': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Comunicaciones': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'CSD Municipal': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Antigua': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Xela': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Coban Imperial': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Santa Lucia': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Deportivo Marquense': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'Aurora FC': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'CD Olimpia': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Platense FC': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Lobos UPNFM': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Motagua': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Real Espana': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Victoria': { league: 'Honduran Liga Nacional', country: 'Honduras' },
  'Herediano': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Alajuelense': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Saprissa': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Cartagines': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Santos de Guapiles': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Perez Zeledon': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'San Carlos': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Grecia': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Jicaral': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Liberia': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Santa Ana': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Caiar': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Futbal': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'Carmelita': { league: 'Costa Rican Primera Division', country: 'Costa Rica' },
  'AS Monaco': { league: 'Ligue 1', country: 'France' },
  'OGC Nice': { league: 'Ligue 1', country: 'France' },
  'Olympique Lyon': { league: 'Ligue 1', country: 'France' },
  'Olympique Marseille': { league: 'Ligue 1', country: 'France' },
  'FC Lorient': { league: 'Ligue 1', country: 'France' },
  'FC Nantes': { league: 'Ligue 1', country: 'France' },
  'Stade Brestois': { league: 'Ligue 1', country: 'France' },
  'Stade Rennais': { league: 'Ligue 1', country: 'France' },
  'LOSC Lille': { league: 'Ligue 1', country: 'France' },
  'RC Strasbourg': { league: 'Ligue 1', country: 'France' },
  'Toulouse FC': { league: 'Ligue 1', country: 'France' },
  'Le Havre AC': { league: 'Ligue 1', country: 'France' },
  'FC Metz': { league: 'Ligue 1', country: 'France' },
  ' Clermont Foot': { league: 'Ligue 1', country: 'France' },
  'AC Ajaccio': { league: 'Ligue 2', country: 'France' },
  'Amiens SC': { league: 'Ligue 2', country: 'France' },
  'Angers SCO': { league: 'Ligue 2', country: 'France' },
  'Auxerre': { league: 'Ligue 2', country: 'France' },
  'Bordeaux': { league: 'Ligue 2', country: 'France' },
  'Caen': { league: 'Ligue 2', country: 'France' },
  'Dijon FCO': { league: 'Ligue 2', country: 'France' },
  'Grenoble': { league: 'Ligue 2', country: 'France' },
  'Guingamp': { league: 'Ligue 2', country: 'France' },
  'Laval': { league: 'Ligue 2', country: 'France' },
  'Le Havre': { league: 'Ligue 2', country: 'France' },
  'Lorient': { league: 'Ligue 2', country: 'France' },
  'Nancy': { league: 'Ligue 2', country: 'France' },
  'Nimes': { league: 'Ligue 2', country: 'France' },
  'Paris FC': { league: 'Ligue 2', country: 'France' },
  'Pau': { league: 'Ligue 2', country: 'France' },
  'Rodez': { league: 'Ligue 2', country: 'France' },
  'Sochaux': { league: 'Ligue 2', country: 'France' },
  'Troyes': { league: 'Ligue 2', country: 'France' },
  'Valenciennes': { league: 'Ligue 2', country: 'France' },
  'Concarneau': { league: 'National 1', country: 'France' },
  'Chateauroux': { league: 'National 1', country: 'France' },
  'Nancy': { league: 'National 1', country: 'France' },
  'Bourg Peronnas': { league: 'National 1', country: 'France' },
  'Orleans': { league: 'National 1', country: 'France' },
  'Villefranche': { league: 'National 1', country: 'France' },
  'Lyon': { league: 'National 1', country: 'France' },
  'Chambly': { league: 'National 1', country: 'France' },
  'Le Mans': { league: 'National 1', country: 'France' },
  'Boulogne': { league: 'National 1', country: 'France' },
  'Creteil': { league: 'National 1', country: 'France' },
  'Avranches': { league: 'National 2', country: 'France' },
  'Lusitanos': { league: 'National 3', country: 'France' },
  'FC Setif': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'MC Oran': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'JS Saoura': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'USM Alger': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'CRB': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Paradou': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Medea': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Telagh': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Bechar': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Blida': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'USM Bel Abbès': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Warda': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Magra': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Nadit': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Batna': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Khroub': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Mosta': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Annaba': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Tiaret': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Tizi Ouzou': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Mostaganem': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Sig': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Mascara': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Relizane': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Sidi Belabes': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Tlemcen': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Saida': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Kouba': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'ASM Oran': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'WA Tlemcen': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'MCB Oued Sly': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'US Souk Ahras': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'JSM Skikda': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Hamra Annaba': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'MB Bazala': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'CRB Oued Rhiou': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'NCA Bouira': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'MC El Bayadh': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'IB Lakhdaria': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'WA Boufarik': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'MC Magra': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Paradou': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'RCB Oued Rhiou': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'CABB': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'ASO Chlef': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'USM Alger': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'CR Belouizdad': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'MC Alger': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'JS Kabylie': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'NA Hussein Dey': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'NC Mascara': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'WA Mostaganem': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'USM Bel Abbes': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'CRB Ain Benian': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'WA Sfisef': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'OM Arzew': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Ghardaia': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Tamanrasset': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Illizi': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Tindouf': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Adrar': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'In Salah': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Djanet': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'El Bayadh': { league: 'Algerian Ligue 2', country: 'Algeria' },
  'Biskra': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Setif': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'USM Alger': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'MC Oran': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'JS Saoura': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Kabylie': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Constantine': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Belouizdad': { league: 'Algerian Ligue 1', country: 'Algeria' },
  'Raja': { league: 'Botola Pro', country: 'Morocco' },
  'Wydad': { league: 'Botola Pro', country: 'Morocco' },
  'FAR Rabat': { league: 'Botola Pro', country: 'Morocco' },
  'MAS Fez': { league: 'Botola Pro', country: 'Morocco' },
  'FUS Rabat': { league: 'Botola Pro', country: 'Morocco' },
  'MCO Oujda': { league: 'Botola Pro', country: 'Morocco' },
  'RSB Berkane': { league: 'Botola Pro', country: 'Morocco' },
  'OCK Oujda': { league: 'Botola Pro', country: 'Morocco' },
  'DH Jadida': { league: 'Botola Pro', country: 'Morocco' },
  'HUSA Agadir': { league: 'Botola Pro', country: 'Morocco' },
  'OC Khouribga': { league: 'Botola Pro', country: 'Morocco' },
  'RCA Casablanca': { league: 'Botola Pro', country: 'Morocco' },
  'IZK Khouribga': { league: 'Botola Pro', country: 'Morocco' },
  'MOG Tiznit': { league: 'Botola Pro', country: 'Morocco' },
  'Chellah': { league: 'Botola Pro', country: 'Morocco' },
  'Santos': { league: 'Brazil Serie A', country: 'Brazil' },
  'Corinthians': { league: 'Brazil Serie A', country: 'Brazil' },
  'São Paulo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Palmeiras': { league: 'Brazil Serie A', country: 'Brazil' },
  'Santos FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'São Paulo FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Flamengo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Fluminense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Botafogo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Vasco da Gama': { league: 'Brazil Serie A', country: 'Brazil' },
  'Cruzeiro': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico Mineiro': { league: 'Brazil Serie A', country: 'Brazil' },
  'Gremio': { league: 'Brazil Serie A', country: 'Brazil' },
  'Internacional': { league: 'Brazil Serie A', country: 'Brazil' },
  'Bahia': { league: 'Brazil Serie A', country: 'Brazil' },
  'Vitoria': { league: 'Brazil Serie A', country: 'Brazil' },
  'Coritiba': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico Paranaense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Athletico Paranaense': { league: 'Brazil Serie A', country: 'Brazil' },
  'Bragantino': { league: 'Brazil Serie A', country: 'Brazil' },
  'Red Bull Bragantino': { league: 'Brazil Serie A', country: 'Brazil' },
  'Juventude': { league: 'Brazil Serie A', country: 'Brazil' },
  'Criciuma': { league: 'Brazil Serie A', country: 'Brazil' },
  'Caxias': { league: 'Brazil Serie B', country: 'Brazil' },
  'Botafogo SP': { league: 'Brazil Serie B', country: 'Brazil' },
  'Goias': { league: 'Brazil Serie B', country: 'Brazil' },
  'Operario': { league: 'Brazil Serie B', country: 'Brazil' },
  'Avaí': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ponte Preta': { league: 'Brazil Serie B', country: 'Brazil' },
  'Guarani': { league: 'Brazil Serie B', country: 'Brazil' },
  'Vila Nova': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ituano': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sampaio Corrêa': { league: 'Brazil Serie B', country: 'Brazil' },
  'CRB': { league: 'Brazil Serie B', country: 'Brazil' },
  'Londrina': { league: 'Brazil Serie B', country: 'Brazil' },
  'Tombense': { league: 'Brazil Serie B', country: 'Brazil' },
  'Novorizontino': { league: 'Brazil Serie B', country: 'Brazil' },
  ' Brusque': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ceará': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sport': { league: 'Brazil Serie B', country: 'Brazil' },
  'Santa Cruz': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ferroviário': { league: 'Brazil Serie C', country: 'Brazil' },
  'Floresta': { league: 'Brazil Serie C', country: 'Brazil' },
  'Altos': { league: 'Brazil Serie C', country: 'Brazil' },
  'Piauí': { league: 'Brazil Serie C', country: 'Brazil' },
  'Botafogo PB': { league: 'Brazil Serie C', country: 'Brazil' },
  'Treze': { league: 'Brazil Serie C', country: 'Brazil' },
  'CAMPISTA': { league: 'Brazil Serie C', country: 'Brazil' },
  'ABC': { league: 'Brazil Serie C', country: 'Brazil' },
  'Globo': { league: 'Brazil Serie C', country: 'Brazil' },
  'Sao Paulo': { league: 'Brazil Serie A', country: 'Brazil' },
  'Botafogo-SP': { league: 'Brazil Serie B', country: 'Brazil' },
  'Atletico-GO': { league: 'Brazil Serie B', country: 'Brazil' },
  'Goias': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ceara': { league: 'Brazil Serie B', country: 'Brazil' },
  'Vila Nova-GO': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sampaio': { league: 'Brazil Serie B', country: 'Brazil' },
  'Mirassol': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sport Recife': { league: 'Brazil Serie B', country: 'Brazil' },
  'Santa Cruz-PE': { league: 'Brazil Serie B', country: 'Brazil' },
  'CEARA': { league: 'Brazil Serie B', country: 'Brazil' },
  'Chapecoense': { league: 'Brazil Serie B', country: 'Brazil' },
  'Brasil de Pelotas': { league: 'Brazil Serie C', country: 'Brazil' },
  'Ypiranga': { league: 'Brazil Serie C', country: 'Brazil' },
  'Juventude': { league: 'Brazil Serie A', country: 'Brazil' },
  'Criciuma': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico GO': { league: 'Brazil Serie A', country: 'Brazil' },
  'Goias': { league: 'Brazil Serie A', country: 'Brazil' },
  'Corinthians-SP': { league: 'Brazil Serie A', country: 'Brazil' },
  'Bahia': { league: 'Brazil Serie A', country: 'Brazil' },
  'Athletico-PR': { league: 'Brazil Serie A', country: 'Brazil' },
  'Fortaleza': { league: 'Brazil Serie A', country: 'Brazil' },
  'International': { league: 'Brazil Serie A', country: 'Brazil' },
  'Atletico Mineiro': { league: 'Brazil Serie A', country: 'Brazil' },
  'Fluminense FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Botafogo RJ': { league: 'Brazil Serie A', country: 'Brazil' },
  'Vasco da Gama': { league: 'Brazil Serie A', country: 'Brazil' },
  'Sao Paulo FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Palmeiras FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Santos FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Flamengo RJ': { league: 'Brazil Serie A', country: 'Brazil' },
  'Cruzeiro EC': { league: 'Brazil Serie A', country: 'Brazil' },
  'Gremio FBPA': { league: 'Brazil Serie A', country: 'Brazil' },
  'EC Vitoria': { league: 'Brazil Serie A', country: 'Brazil' },
  'SC Corinthians': { league: 'Brazil Serie A', country: 'Brazil' },
  'EC Bahia': { league: 'Brazil Serie A', country: 'Brazil' },
  'Sampaio Correa': { league: 'Brazil Serie B', country: 'Brazil' },
  'Marica': { league: 'Brazil Serie C', country: 'Brazil' },
  'America FC': { league: 'Brazil Serie A', country: 'Brazil' },
  'America MG': { league: 'Brazil Serie B', country: 'Brazil' },
  'Vila Nova FC': { league: 'Brazil Serie B', country: 'Brazil' },
  'Avai': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ponte Preta': { league: 'Brazil Serie B', country: 'Brazil' },
  'Guarani FC': { league: 'Brazil Serie B', country: 'Brazil' },
  'Atletico GO': { league: 'Brazil Serie B', country: 'Brazil' },
  'Botafogo RJ': { league: 'Brazil Serie A', country: 'Brazil' },
  'Nautico': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sampaio Correa FC': { league: 'Brazil Serie B', country: 'Brazil' },
  'Parana': { league: 'Brazil Serie B', country: 'Brazil' },
  'Parana Clube': { league: 'Brazil Serie B', country: 'Brazil' },
  'Londrina EC': { league: 'Brazil Serie B', country: 'Brazil' },
  'Operario Ferroviario': { league: 'Brazil Serie B', country: 'Brazil' },
  'Sociedade Esportiva': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ituano FC': { league: 'Brazil Serie B', country: 'Brazil' },
  'Tombense': { league: 'Brazil Serie B', country: 'Brazil' },
  'Novorizontino': { league: 'Brazil Serie B', country: 'Brazil' },
  'Brusque': { league: 'Brazil Serie B', country: 'Brazil' },
  'Ypiranga FC': { league: 'Brazil Serie C', country: 'Brazil' },
  'Sao Jose': { league: 'Brazil Serie C', country: 'Brazil' },
  'Porto Alegre': { league: 'Brazil Serie C', country: 'Brazil' },
  'Guarany': { league: 'Brazil Serie C', country: 'Brazil' },
  'Canoas': { league: 'Brazil Serie C', country: 'Brazil' },
  'Esporte Clube': { league: 'Brazil Serie C', country: 'Brazil' },
  'Novo Hamburgo': { league: 'Brazil Serie C', country: 'Brazil' },
  'Aimoré': { league: 'Brazil Serie C', country: 'Brazil' },
  'São José': { league: 'Brazil Serie C', country: 'Brazil' },
  'São Paulo U20': { league: 'Copa do Brasil U20', country: 'Brazil' },
  'Flamengo U20': { league: 'Copa do Brasil U20', country: 'Brazil' },
  'Palmeiras U20': { league: 'Copa do Brasil U20', country: 'Brazil' },
  'Santos U20': { league: 'Copa do Brasil U20', country: 'Brazil' },
  'São Paulo U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Flamengo U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Palmeiras U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Santos U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Botafogo U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Goias U17': { league: 'Copa do Brasil U17', country: 'Brazil' },
  'Racing': { league: 'Copa Libertadores', country: 'Argentina' },
  'Juventud': { league: 'Copa Libertadores', country: 'Argentina' },
  'Club Guarani': { league: 'Copa Libertadores', country: 'Paraguay' },
  'Estudiantes': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Gimnasia': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Rosario Central': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Newells Old Boys': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Colon': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Tigre': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Velez': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Banfield': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Lanus': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Huracan': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Club Atletico': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Independiente': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Atletico Tucuman': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Central Cordoba': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Defensa': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'San Lorenzo': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Talleres Cordoba': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Union Santa Fe': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Barracas Central': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Instituto': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Alvarado': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Chacarita': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'All Boys': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'San Martin SJ': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'San Martin T': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Quilmes': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Moron': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Atlanta': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Tristan Suarez': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'UIII': { league: 'Argentine Primera D', country: 'Argentina' },
  'Deportivo Armenio': { league: 'Argentine Primera D', country: 'Argentina' },
  'General Lamadrid': { league: 'Argentine Primera D', country: 'Argentina' },
  'Juventud Unida': { league: 'Argentine Primera D', country: 'Argentina' },
  'Victoriano Arenas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Atlas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Leandro N Alem': { league: 'Argentine Primera D', country: 'Argentina' },
  'Puerto Nuevo': { league: 'Argentine Primera D', country: 'Argentina' },
  'Club Atletico': { league: 'Argentine Primera D', country: 'Argentina' },
  'San Miguel': { league: 'Argentine Primera D', country: 'Argentina' },
  'Colegiales': { league: 'Argentine Primera D', country: 'Argentina' },
  'Sacachispas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Argentino Merlo': { league: 'Argentine Primera D', country: 'Argentina' },
  'La Boca': { league: 'Argentine Primera D', country: 'Argentina' },
  'Ferro Carril': { league: 'Argentine Primera D', country: 'Argentina' },
  'Central Argentino': { league: 'Argentine Primera D', country: 'Argentina' },
  'Mendoza': { league: 'Argentine Primera D', country: 'Argentina' },
  'Godoy Cruz': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'San Martin': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Deportivo Moron': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Club Almirante': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Brown': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Temperley': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Guillermo Brown': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Aldosivi': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Santamarina': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'San Telmo': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Riestra': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Instituto AC': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Quilmes AT': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Alumni': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Platense': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Villa Dalmine': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Atletico Rafaela': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'San Martin SJ': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Gimnasia Jujuy': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Boca Unidos': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  ' Crucero del Norte': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Guemes': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Sarmiento Resistencia': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Club Sol de Mayo': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Deportivo Madryn': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Cuyo': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Juventud ATV': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Desamparados': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'San Martin M': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Gimnasia CdU': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Union Sunchales': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Atletico Parana': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Patronato': { league: 'Argentine Primera Nacional', country: 'Argentina' },
  'Colon Santa Fe': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Tigre Victoria': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Atletico S': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Gimnasia LP': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Union Santa Fe': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Estudiantes LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Godoy Cruz M': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'San Lorenzo LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Talleres LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Independiente LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Rosario Central LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Newells LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Central Cordoba SDE': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Banfield LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Lanus LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Huracan LPI': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Velez Sarsfield': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Defensa Y Justicia': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Atletico Tucuman': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Arsenal Sarandi': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Argentinos Juniors': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Club Atletico': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Colon': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Tigre': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Sarmiento Junin': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Barracas Central': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Club Social': { league: 'Argentine Liga Profesional', country: 'Argentina' },
  'Instituto': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Alvarado': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Chacarita Juniors': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'All Boys': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'San Martin San Juan': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'San Martin Tucuman': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Quilmes': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Club Atletico Moron': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Atlanta': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Club Social y Deportivo': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Tristan Suarez': { league: 'Argentine Liga Nacional B', country: 'Argentina' },
  'Deportivo Armenio': { league: 'Argentine Primera D', country: 'Argentina' },
  'General Lamadrid': { league: 'Argentine Primera D', country: 'Argentina' },
  'Juventud Unida San Miguel': { league: 'Argentine Primera D', country: 'Argentina' },
  'Victoriano Arenas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Atlas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Leandro N Alem': { league: 'Argentine Primera D', country: 'Argentina' },
  'Puerto Nuevo': { league: 'Argentine Primera D', country: 'Argentina' },
  'San Miguel': { league: 'Argentine Primera D', country: 'Argentina' },
  'Colegiales': { league: 'Argentine Primera D', country: 'Argentina' },
  'Sacachispas': { league: 'Argentine Primera D', country: 'Argentina' },
  'Argentino Merlo': { league: 'Argentine Primera D', country: 'Argentina' },
  'Ferro Carril Oeste': { league: 'Argentine Primera D', country: 'Argentina' },
  'Central Argentino': { league: 'Argentine Primera D', country: 'Argentina' },
  'San Miguel Bogota': { league: 'Copa Colombia', country: 'Colombia' },
  'Atletico Nacional': { league: 'Copa Libertadores', country: 'Colombia' },
  'Millonarios': { league: 'Copa Libertadores', country: 'Colombia' },
  'America de Cali': { league: 'Copa Libertadores', country: 'Colombia' },
  'Junior': { league: 'Copa Libertadores', country: 'Colombia' },
  'Santa Fe': { league: 'Copa Libertadores', country: 'Colombia' },
  'Once Caldas': { league: 'Copa Sudamericana', country: 'Colombia' },
  'Independiente Medellin': { league: 'Copa Sudamericana', country: 'Colombia' },
  'Deportivo Pasto': { league: 'Copa Sudamericana', country: 'Colombia' },
  'Atletico Junior': { league: 'Copa Libertadores', country: 'Colombia' },
  'Independiente Santa Fe': { league: 'Copa Libertadores', country: 'Colombia' },
  'America de Cali': { league: 'Copa Colombia', country: 'Colombia' },
  'Atletico Nacional': { league: 'Copa Colombia', country: 'Colombia' },
  'Millonarios FC': { league: 'Primera A', country: 'Colombia' },
  'Junior FC': { league: 'Primera A', country: 'Colombia' },
  'America de Cali': { league: 'Primera A', country: 'Colombia' },
  'Independiente Santa Fe': { league: 'Primera A', country: 'Colombia' },
  'Atletico Nacional': { league: 'Primera A', country: 'Colombia' },
  'Santa Fe': { league: 'Primera A', country: 'Colombia' },
  'Once Caldas': { league: 'Primera A', country: 'Colombia' },
  'Independiente Medellin': { league: 'Primera A', country: 'Colombia' },
  'Deportivo Pasto': { league: 'Primera A', country: 'Colombia' },
  'Junior': { league: 'Primera A', country: 'Colombia' },
  'Rionegro': { league: 'Primera A', country: 'Colombia' },
  'Envigado': { league: 'Primera A', country: 'Colombia' },
  'La Equidad': { league: 'Primera A', country: 'Colombia' },
  'Patriotas': { league: 'Primera A', country: 'Colombia' },
  'Atlético Huila': { league: 'Primera B', country: 'Colombia' },
  'Atletico CA': { league: 'Primera B', country: 'Colombia' },
  'Union Magdalena': { league: 'Primera B', country: 'Colombia' },
  'Barranquilla': { league: 'Primera B', country: 'Colombia' },
  'Atletico FC': { league: 'Primera B', country: 'Colombia' },
  'Bogota FC': { league: 'Primera B', country: 'Colombia' },
  'Real Santander': { league: 'Primera B', country: 'Colombia' },
  'Deportivo Cucuta': { league: 'Primera B', country: 'Colombia' },
  'Atletico Bucaramanga': { league: 'Primera B', country: 'Colombia' },
  'Club Llaneros': { league: 'Primera B', country: 'Colombia' },
  'Universitario Popayan': { league: 'Primera B', country: 'Colombia' },
  'Tigres FC': { league: 'Primera B', country: 'Colombia' },
  'Cucuta': { league: 'Primera B', country: 'Colombia' },
  'Pereira': { league: 'Primera A', country: 'Colombia' },
  ' Deportivo Pereira': { league: 'Primera A', country: 'Colombia' },
  'Alianza Petrolera': { league: 'Primera A', country: 'Colombia' },
  'Atlético Nacional': { league: 'Primera A', country: 'Colombia' },
  'Independiente Santa Fe': { league: 'Primera A', country: 'Colombia' },
  'Once Caldas': { league: 'Primera A', country: 'Colombia' },
  'Deportivo Pasto': { league: 'Primera A', country: 'Colombia' },
  'Jaguares': { league: 'Primera A', country: 'Colombia' },
  'Cortulua': { league: 'Primera A', country: 'Colombia' },
  'Tulua': { league: 'Primera A', country: 'Colombia' },
  'Cali': { league: 'Primera A', country: 'Colombia' },
  ' Deportivo Cali': { league: 'Primera A', country: 'Colombia' },
  'Atlético Junior': { league: 'Primera A', country: 'Colombia' },
  'Independiente Medellín': { league: 'Primera A', country: 'Colombia' },
  'Club Deportivo': { league: 'Primera A', country: 'Colombia' },
  'Universidad': { league: 'Primera A', country: 'Colombia' },
  'Pumas': { league: 'Primera A', country: 'Colombia' },
  'Tolima': { league: 'Primera A', country: 'Colombia' },
  'Atlético Tolima': { league: 'Primera A', country: 'Colombia' },
  'C Bucaramanga': { league: 'Primera A', country: 'Colombia' },
  'Aguila': { league: 'Primera A', country: 'Colombia' },
  'Real Cartagena': { league: 'Primera B', country: 'Colombia' },
  'Leones': { league: 'Primera B', country: 'Colombia' },
  'Fortaleza': { league: 'Primera B', country: 'Colombia' },
  'Orsomarso': { league: 'Primera B', country: 'Colombia' },
  'Llaneros': { league: 'Primera B', country: 'Colombia' },
  'Bogota': { league: 'Primera B', country: 'Colombia' },
  'Cundinamarca': { league: 'Primera B', country: 'Colombia' },
  'Tigres FC': { league: 'Primera B', country: 'Colombia' },
  'Valle': { league: 'Primera B', country: 'Colombia' },
  'Boyaca Chico': { league: 'Primera B', country: 'Colombia' },
  'Union Magdalena': { league: 'Primera B', country: 'Colombia' },
  'Barranquilla FC': { league: 'Primera B', country: 'Colombia' },
  'Atletico FC': { league: 'Primera B', country: 'Colombia' },
  'Real Santander': { league: 'Primera B', country: 'Colombia' },
  'Deportivo Cucuta': { league: 'Primera B', country: 'Colombia' },
  'Atletico Bucaramanga': { league: 'Primera B', country: 'Colombia' },
  'Club Llaneros': { league: 'Primera B', country: 'Colombia' },
  'Universitario Popayan': { league: 'Primera B', country: 'Colombia' },
  'Cucuta Deportivo': { league: 'Primera B', country: 'Colombia' },
  'Depor FC': { league: 'Primera B', country: 'Colombia' },
  'Atlético Huila': { league: 'Primera A', country: 'Colombia' },
  'Atlético CA': { league: 'Primera A', country: 'Colombia' },
  'Real San Andres': { league: 'Primera B', country: 'Colombia' },
  'Independiente': { league: 'Primera A', country: 'Colombia' },
  'Atletico': { league: 'Primera A', country: 'Colombia' },
  'Universidad': { league: 'Liga MX', country: 'Mexico' },
  'Pumas': { league: 'Liga MX', country: 'Mexico' },
  'Cruz Azul': { league: 'Liga MX', country: 'Mexico' },
  'Club America': { league: 'Liga MX', country: 'Mexico' },
  'Chivas': { league: 'Liga MX', country: 'Mexico' },
  'Tigres': { league: 'Liga MX', country: 'Mexico' },
  'Rayados': { league: 'Liga MX', country: 'Mexico' },
  'Leon': { league: 'Liga MX', country: 'Mexico' },
  'Pachuca': { league: 'Liga MX', country: 'Mexico' },
  'Tijuana': { league: 'Liga MX', country: 'Mexico' },
  'Queretaro': { league: 'Liga MX', country: 'Mexico' },
  'Atlas': { league: 'Liga MX', country: 'Mexico' },
  'Santos': { league: 'Liga MX', country: 'Mexico' },
  'Necaxa': { league: 'Liga MX', country: 'Mexico' },
  'Mazatlan': { league: 'Liga MX', country: 'Mexico' },
  'San Luis': { league: 'Liga MX', country: 'Mexico' },
  'Juarez': { league: 'Liga MX', country: 'Mexico' },
  'Puebla': { league: 'Liga MX', country: 'Mexico' },
  'Tigres UANL': { league: 'Liga MX', country: 'Mexico' },
  'Club Leon': { league: 'Liga MX', country: 'Mexico' },
  'Cruz Azul FC': { league: 'Liga MX', country: 'Mexico' },
  'Club America': { league: 'Liga MX', country: 'Mexico' },
  'Guadalajara': { league: 'Liga MX', country: 'Mexico' },
  'CF America': { league: 'Liga MX', country: 'Mexico' },
  'CF Pachuca': { league: 'Liga MX', country: 'Mexico' },
  'Tijuana': { league: 'Liga MX', country: 'Mexico' },
  'Queretaro FC': { league: 'Liga MX', country: 'Mexico' },
  'Santos Laguna': { league: 'Liga MX', country: 'Mexico' },
  'Tigres de la UANL': { league: 'Liga MX', country: 'Mexico' },
  'Club Tijuana': { league: 'Liga MX', country: 'Mexico' },
  'Monterrey': { league: 'Liga MX', country: 'Mexico' },
  'UANL': { league: 'Liga MX', country: 'Mexico' },
  'Atlante': { league: 'Liga MX', country: 'Mexico' },
  'Celaya': { league: 'Liga de Expansión', country: 'Mexico' },
  'Cimarrones': { league: 'Liga de Expansión', country: 'Mexico' },
  'Correcaminos': { league: 'Liga de Expansión', country: 'Mexico' },
  'Dorados': { league: 'Liga de Expansión', country: 'Mexico' },
  'Leones Negros': { league: 'Liga de Expansión', country: 'Mexico' },
  'Minatitlan': { league: 'Liga de Expansión', country: 'Mexico' },
  'Potros UAEM': { league: 'Liga de Expansión', country: 'Mexico' },
  'Tampico': { league: 'Liga de Expansión', country: 'Mexico' },
  'Venados': { league: 'Liga de Expansión', country: 'Mexico' },
  'Cancun': { league: 'Liga de Expansión', country: 'Mexico' },
  'Raya': { league: 'Liga de Expansión', country: 'Mexico' },
  'Cafetaleros': { league: 'Liga de Expansión', country: 'Mexico' },
  'Copa Mexico': { league: 'Copa MX', country: 'Mexico' },
  'Copa MX': { league: 'Copa MX', country: 'Mexico' },
  'Tercera Division': { league: 'Tercera Division', country: 'Mexico' },
  'Guatemala': { league: 'Guatemalan Liga Nacional', country: 'Guatemala' },
  'El Salvador': { league: 'Copa Presidente', country: 'El Salvador' },
  'FAS': { league: 'Copa Presidente', country: 'El Salvador' },
  'Alianza': { league: 'Copa Presidente', country: 'El Salvador' },
  'Santa Tecla': { league: 'Copa Presidente', country: 'El Salvador' },
  'Luis Angel Firpo': { league: 'Copa Presidente', country: 'El Salvador' },
  'Vision': { league: 'Copa Presidente', country: 'El Salvador' }
};

function detectLeague(teamName) {
  const cleanName = teamName.replace(/[^a-zA-Z]/g, '').toLowerCase();
  
  for (const [team, info] of Object.entries(leagueMap)) {
    const cleanTeam = team.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (cleanName.includes(cleanTeam) || cleanTeam.includes(cleanName) || teamName.includes(team) || team.includes(teamName)) {
      return info;
    }
  }
  return { league: '', country: '' };
}

function normalizeTeamName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/è/g, 'e')
    .replace(/ê/g, 'e')
    .replace(/à/g, 'a')
    .replace(/â/g, 'a')
    .replace(/á/g, 'a')
    .replace(/ã/g, 'a')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/õ/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .trim();
}

function findMatchingResult(matchKey, resultsMap) {
  const normalizedMatch = matchKey.toLowerCase();
  const parts = normalizedMatch.split(' - ');
  if (parts.length !== 2) return null;
  
  const [homeNorm, awayNorm] = parts.map(p => normalizeTeamName(p));
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [resultKey, score] of resultsMap) {
    const resultNorm = resultKey.toLowerCase();
    const resultParts = resultNorm.split(' - ');
    if (resultParts.length !== 2) continue;
    
    const [resHome, resAway] = resultParts.map(p => normalizeTeamName(p));
    
    const homeMatch = resHome.includes(homeNorm) || homeNorm.includes(resHome);
    const awayMatch = resAway.includes(awayNorm) || awayNorm.includes(resAway);
    
    if (homeMatch && awayMatch) {
      const matchLength = resHome.length + resAway.length;
      if (matchLength > bestScore) {
        bestScore = matchLength;
        bestMatch = score;
      }
    }
  }
  return bestMatch;
}

function getDateRange() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = -3; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

function getLocalDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadCachedPredictions() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const today = getLocalDateStr();
      if (data.dates && data.dates.includes(today) && data.success) {
        console.log('Serving cached predictions from', data.fetchTime);
        return data;
      }
    }
  } catch (e) {
    console.log('Cache read error:', e.message);
  }
  return null;
}

function saveCachedPredictions(data) {
  data.fetchTime = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log('Predictions cached successfully');
}

async function scrapeDate(dateStr) {
  const url = `${STATAREA_URL}/date/${dateStr}`;
  
  let html;
  
  console.log(`Scraping predictions for ${dateStr}...`);
  const browserOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };
  if (CHROME_PATH) {
    browserOptions.executablePath = CHROME_PATH;
  }
  const browser = await puppeteer.launch(browserOptions);
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.match', { timeout: 15000 }).catch(() => {});
    html = await page.content();
    console.log(`Page loaded for ${dateStr}`);
  } finally {
    await browser.close();
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
    
    if (bValues.length >= 2) {
      under15 = parseInt(bValues[0].txt) || 0;
      under25 = parseInt(bValues[1].txt) || 0;
    } else if (bValues.length === 1) {
      under15 = parseInt(bValues[0].txt) || 0;
      under25 = Math.max(0, under15 - 20);
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

  return {
    matches,
    over25Matches,
    over15Matches,
    bttsMatches
  };
}

async function scrapeWinningStreak() {
  try {
    console.log('Scraping winning streaks from betexplorer.com...');
    const url = 'https://www.betexplorer.com/football/streaks/wins/?setnext=1';
    
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (e) {
      console.log('Puppeteer launch failed, trying axios...');
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      return parseBetexplorerStreaks(response.data, 'win');
    }
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('.table-main tbody tr', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent && btn.textContent.includes('today')) {
            btn.click();
            return;
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (e) {
      console.log('Page load timeout, using alternative method...');
    }
    
    const html = await page.content();
    await browser.close();
    
    return parseBetexplorerStreaks(html, 'win');
  } catch (error) {
    console.log('Error scraping winning streaks:', error.message);
    return [];
  }
}

async function scrapeLosingStreak() {
  try {
    console.log('Scraping losing streaks from betexplorer.com...');
    const url = 'https://www.betexplorer.com/football/streaks/losses/?setnext=1';
    
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (e) {
      console.log('Puppeteer launch failed, trying axios...');
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      return parseBetexplorerStreaks(response.data, 'loss');
    }
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('.table-main tbody tr', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('Page load timeout, using alternative method...');
    }
    
    const html = await page.content();
    await browser.close();
    
    return parseBetexplorerStreaks(html, 'loss');
  } catch (error) {
    console.log('Error scraping losing streaks:', error.message);
    return [];
  }
}

async function scrapeDrawStreak() {
  try {
    console.log('Scraping draws streaks from betexplorer.com...');
    const url = 'https://www.betexplorer.com/football/streaks/draws/?setnext=1';
    
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
      });
    } catch (e) {
      console.log('Puppeteer launch failed, trying axios...');
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      return parseBetexplorerStreaks(response.data, 'draw');
    }
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      await page.waitForSelector('.table-main tbody tr', { timeout: 10000 }).catch(() => {});
    } catch (e) {
      console.log('Page load timeout, using alternative method...');
    }
    
    const html = await page.content();
    await browser.close();
    console.log('Draws page HTML length:', html.length);
    
    return parseBetexplorerStreaks(html, 'draw');
  } catch (error) {
    console.log('Error scraping draws streaks:', error.message);
    return [];
  }
}

function parseBetexplorerStreaks(html, streakType = 'win') {
  const matches = [];
  const $ = cheerio.load(html);
  
  console.log(`Parsing ${streakType} streaks - HTML length:`, html.length);
  const rowCount = $('.table-main tbody tr').length;
  console.log(`Found ${rowCount} table rows`);
  
  let streakLabel;
  if (streakType === 'loss') streakLabel = 'Back To Back Losses';
  else if (streakType === 'draw') streakLabel = 'Back To Back Draws';
  else streakLabel = 'Back To Back Wins';

  const today = getLocalDateStr();
  const todayStr = today.replace(/-/g, '');
  
  let matchCount = 0;
  $('.table-main tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    
    const flagCell = $(cells[0]);
    const teamCell = $(cells[1]);
    const streakCell = $(cells[2]);
    const nextMatchCell = $(cells[3]);
    
    let team = teamCell.text().trim();
    const countryTitle = flagCell.find('img').attr('alt') || '';
    const streakText = streakCell.text().trim();
    const streak = parseInt(streakText) || 0;
    const nextMatch = nextMatchCell.text().trim();
    
    const nextMatchLink = nextMatchCell.find('a').attr('href') || '';
    let nextMatchDate = '';
    const dateMatch = nextMatchLink.match(/\/(\d{4}-\d{2}-\d{2})\//);
    if (dateMatch) {
      nextMatchDate = dateMatch[1];
    }
    
    if (team && streak >= 2) {
      const nextMatchText = nextMatchCell.text().trim();
      
      const oddsCells = $(cells).slice(4, 7);
      const homeOdds = parseFloat($(oddsCells[0]).text().trim()) || 0;
      const drawOdds = parseFloat($(oddsCells[1]).text().trim()) || 0;
      const awayOdds = parseFloat($(oddsCells[2]).text().trim()) || 0;
      
      let prob = Math.min(streak * 10, 95);
      let probs = { homeWin: 0, draw: 0, awayWin: 0 };
      if (streakType === 'draw') {
        probs = { homeWin: 0, draw: prob, awayWin: 0 };
      } else if (streakType === 'loss') {
        probs = { homeWin: 0, draw: 0, awayWin: prob };
      } else {
        probs = { homeWin: prob, draw: 0, awayWin: 0 };
      }
      
      matches.push({
        id: matches.length,
        league: 'Various',
        country: countryTitle,
        time: '',
        match: team,
        nextMatch: nextMatchText,
        nextMatchDate: nextMatchDate,
        homeOdds: homeOdds,
        drawOdds: drawOdds,
        awayOdds: awayOdds,
        probabilities: probs,
        tip: `${streakLabel}: ${streak}`,
        probability: prob,
        date: nextMatchDate || today,
        score: null,
        streak: streak
      });
      matchCount++;
    }
  });
  
  console.log(`Parsed ${matchCount} ${streakLabel.toLowerCase()} teams (today's matches only)`);
  return matches;
}

function getConsecutiveScoringCount(form) {
  if (!form || form.length === 0) return 0;
  
  let count = 0;
  for (let i = form.length - 1; i >= 0; i--) {
    if (form[i] !== 'L') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

async function filterTeamsThatScoredLast5Games(over25Matches) {
  const matchesMap = new Map();
  const analysisCache = getAnalysisCache();
  
  console.log('Finding teams that scored in last 5 games from Over 2.5 matches...');
  
  for (const match of over25Matches) {
    const teams = match.match.split(' - ');
    const homeTeam = teams[0]?.trim();
    const awayTeam = teams[1]?.trim();
    const matchDate = match.date;
    const matchKey = match.match;
    
    if (!homeTeam || !awayTeam) continue;
    
    const homeKey = `${homeTeam}-${awayTeam}`.toLowerCase();
    const awayKey = `${awayTeam}-${homeTeam}`.toLowerCase();
    const analysis = analysisCache[homeKey] || analysisCache[awayKey];
    
    let homeScoredCount = 0;
    let awayScoredCount = 0;
    
    if (analysis) {
      if (analysis.homeForm && analysis.homeForm.length >= 5) {
        homeScoredCount = getConsecutiveScoringCount(analysis.homeForm);
      }
      if (analysis.awayForm && analysis.awayForm.length >= 5) {
        awayScoredCount = getConsecutiveScoringCount(analysis.awayForm);
      }
    } else {
      homeScoredCount = 5;
      awayScoredCount = 5;
    }
    
    // Determine the better team (higher scored count)
    const betterTeam = homeScoredCount >= awayScoredCount 
      ? { name: homeTeam, count: homeScoredCount } 
      : { name: awayTeam, count: awayScoredCount };
    
    if (betterTeam.count >= 5 && !matchesMap.has(matchKey)) {
      matchesMap.set(matchKey, {
        team: betterTeam.name,
        country: match.country || '',
        nextMatch: match.match,
        nextMatchDate: matchDate,
        streak: `Scored in last ${betterTeam.count} matches`,
        streakNum: betterTeam.count
      });
    }
  }
  
  const teamsArray = Array.from(matchesMap.values());
  
  console.log(`Team to Score: ${teamsArray.length} teams found`);
  return teamsArray;
}

async function filterTeamsThatScored2PlusLast5Games(over25Matches) {
  const matchesMap = new Map();
  
  console.log('Finding teams that scored 2+ goals frequently (from over 2.5 stats)...');
  
  for (const match of over25Matches) {
    const teams = match.match.split(' - ');
    const homeTeam = teams[0]?.trim();
    const awayTeam = teams[1]?.trim();
    const matchDate = match.date;
    const matchKey = match.match;
    
    if (!homeTeam || !awayTeam) continue;
    
    const homeProb = match.probabilities?.over25 || match.probability || 0;
    const awayProb = match.probabilities?.over25 || match.probability || 0;
    
    // Determine the better team (higher probability)
    const betterTeam = homeProb >= awayProb ? { name: homeTeam, prob: homeProb } : { name: awayTeam, prob: awayProb };
    
    if (betterTeam.prob >= 70 && !matchesMap.has(matchKey)) {
      matchesMap.set(matchKey, {
        team: betterTeam.name,
        country: match.country || '',
        nextMatch: match.match,
        nextMatchDate: matchDate,
        streak: `2+ goals: ${betterTeam.prob}%`
      });
    }
  }
  
  const teamsArray = Array.from(matchesMap.values());
  console.log(`Team to Score 2+: ${teamsArray.length} teams found`);
  return teamsArray;
}

function checkConsecutiveScoring(form) {
  if (!form || form.length < 5) return false;
  
  const last5 = form.slice(-5);
  
  for (const char of last5) {
    if (char === 'L') return false;
  }
  
  return true;
}

function checkScoredAtLeast5(form) {
  if (!form || form.length < 5) return false;
  
  const last5 = form.slice(-5);
  const scoredCount = (last5.match(/W|D/g) || []).length;
  
  return scoredCount >= 4;
}

async function fetchAndCachePredictions() {
  try {
    const dateRange = getDateRange();
    console.log('Fetching predictions for dates:', dateRange);
    
    const allMatches = [];
    const allOver25 = [];
    const allOver15 = [];
    const allBtts = [];
    
    for (const dateStr of dateRange) {
      try {
        const data = await scrapeDate(dateStr);
        allMatches.push(...data.matches);
        allOver25.push(...data.over25Matches);
        allOver15.push(...data.over15Matches);
        allBtts.push(...data.bttsMatches);
      } catch (err) {
        console.error(`Error fetching ${dateStr}:`, err.message);
      }
    }
    
    const resultsMapByDate = {};
    const now = new Date();
    const localDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    localDate.setHours(0, 0, 0, 0);
    
    for (const dateStr of dateRange) {
      const date = new Date(dateStr);
      const targetDate = new Date(localDate);
      targetDate.setDate(localDate.getDate() - 1);
      if (date.getTime() <= targetDate.getTime()) {
        try {
          const resultsMap = await fetchMatchResultsByDate(date);
          resultsMapByDate[dateStr] = resultsMap;
        } catch (err) {
          console.error(`Error fetching results for ${dateStr}:`, err.message);
        }
      }
    }
    
    const enrichWithResults = (matches) => {
      return matches.map(match => {
        if (match.date && resultsMapByDate[match.date]) {
          const results = resultsMapByDate[match.date];
          const matchedScore = findMatchingResult(match.match, results);
          if (matchedScore) {
            return { ...match, score: matchedScore };
          }
        }
        return match;
      });
    };
    
    console.log('Scraping winning streak data...');
    const winstreakMatches = await scrapeWinningStreak();
    const losestreakMatches = await scrapeLosingStreak();
    const drawstreakMatches = await scrapeDrawStreak();
    
    console.log('Filtering over 2.5 matches for teams that scored in last 5 games...');
    const teamToScoreMatches = await filterTeamsThatScoredLast5Games(allOver25);
    const teamToScore2PlusMatches = await filterTeamsThatScored2PlusLast5Games(allOver25);
    
    return {
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
      totalTeamToScore: teamToScoreMatches.length,
      totalTeamToScore2Plus: teamToScore2PlusMatches.length,
      matches: enrichWithResults(allMatches),
      over25Matches: enrichWithResults(allOver25),
      over15Matches: enrichWithResults(allOver15),
      bttsMatches: enrichWithResults(allBtts),
      winstreakMatches: winstreakMatches,
      losestreakMatches: losestreakMatches,
      drawstreakMatches: drawstreakMatches,
      teamToScoreMatches: teamToScoreMatches,
      teamToScore2PlusMatches: teamToScore2PlusMatches
    };
  } catch (error) {
    console.error('Error fetching predictions:', error.message);
    return {
      success: false,
      error: error.message,
      date: new Date().toISOString().split('T')[0],
      dates: getDateRange(),
      matches: [],
      over25Matches: [],
      over15Matches: [],
      bttsMatches: [],
      winstreakMatches: [],
      losestreakMatches: [],
      drawstreakMatches: []
    };
  }
}

async function fetchPredictions() {
  const cached = loadCachedPredictions();
  if (cached) return cached;
  
  console.log('No cache found, fetching new data...');
  const data = await fetchAndCachePredictions();
  saveCachedPredictions(data);
  return data;
}

app.get('/api/predictions', async (req, res) => {
  const data = await fetchPredictions();
  res.json(data);
});

let isRefreshing = false;

app.get('/api/refresh', async (req, res) => {
  if (isRefreshing) {
    return res.json({ success: false, message: 'Refresh already in progress' });
  }
  
  isRefreshing = true;
  res.json({ success: true, message: 'Refresh started in background' });
  
  (async () => {
    try {
      console.log('Background refresh started...');
      const data = await fetchAndCachePredictions();
      saveCachedPredictions(data);
      console.log('Background refresh completed:', data.success ? 'success' : 'failed');
    } catch (error) {
      console.error('Background refresh error:', error.message);
    } finally {
      isRefreshing = false;
    }
  })();
});

app.get('/api/test-betexplorer', async (req, res) => {
  try {
    const dateStr = '2026-02-28';
    const results = await scrapeResultsFromBetexplorer(dateStr);
    res.json({ date: dateStr, resultsCount: results.size, results: Array.from(results.entries()).slice(0, 10) });
  } catch (error) {
    res.json({ error: error.message });
  }
});

const API_KEY = '14d449fa732f61806305463b396bfb04';
const API_BASE = 'https://v3.football.api-sports.io';

const cache = { teamForm: new Map(), h2h: new Map() };

async function searchTeam(teamName) {
  try {
    const response = await axios.get(`${API_BASE}/teams`, {
      params: { search: teamName },
      headers: { 'x-apisports-key': API_KEY }
    });
    return response.data.response?.[0] || null;
  } catch (error) {
    return null;
  }
}

async function getHeadToHead(homeTeamId, awayTeamId) {
  try {
    const response = await axios.get(`${API_BASE}/fixtures/headtohead`, {
      params: { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 },
      headers: { 'x-apisports-key': API_KEY }
    });
    return response.data.response || [];
  } catch (error) {
    return [];
  }
}

const API_FOOTBALL_API = 'https://v3.football.api-sports.io';
const API_FOOTBALL_KEY = '1556706f434ff46b550f391366f31f39';

const apiFootballHeaders = {
  'x-rapidapi-key': API_FOOTBALL_KEY,
  'x-rapidapi-host': 'v3.football.api-sports.io'
};

async function searchTeamFootballData(teamName) {
  try {
    const response = await axios.get(`${API_FOOTBALL_API}/teams`, {
      params: { search: teamName },
      headers: apiFootballHeaders
    });
    
    console.log('Team search response for', teamName, ':', JSON.stringify(response.data.response?.slice(0, 2)));
    
    if (response.data.response?.length > 0) {
      const teams = response.data.response;
      const exact = teams.find(t => 
        t.team.name.toLowerCase().includes(teamName.toLowerCase()) || 
        teamName.toLowerCase().includes(t.team.name.toLowerCase())
      );
      return exact?.team || teams[0].team;
    }
    return null;
  } catch (error) {
    console.log('Team search error:', error.message);
    return null;
  }
}

async function fetchTeamStats(teamName) {
  try {
    const response = await axios.get(`${API_FOOTBALL_API}/teams`, {
      params: { search: teamName },
      headers: apiFootballHeaders
    });
    
    if (response.data.response?.length > 0) {
      return response.data.response[0].team;
    }
    return null;
  } catch (error) {
    console.log('Team search error:', error.message);
    return null;
  }
}

async function fetchTeamFixtures(teamId, last = 5) {
  try {
    const response = await axios.get(`${API_FOOTBALL_API}/fixtures`, {
      params: { team: teamId, last: last },
      headers: apiFootballHeaders
    });
    return response.data.response || [];
  } catch (error) {
    console.log('Fixtures fetch error:', error.message);
    return [];
  }
}

const resultsCache = new Map();

const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || 'faaf8f6cd3c54d519bbe150c5934759b';

const API_SPORTS_KEYS = [
  '14d449fa732f61806305463b396bfb04',
  '1556706f434ff46b550f391366f31f39'
];

async function fetchResultsFromFootballData(dateStr) {
  if (!FOOTBALL_DATA_KEY) {
    return null;
  }
  try {
    const response = await axios.get(`${FOOTBALL_DATA_API}/matches`, {
      params: { date: dateStr },
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
    });
    const matches = response.data.matches || [];
    const resultsMap = new Map();
    matches.forEach(match => {
      if (match.status === 'FINISHED') {
        const homeTeam = match.homeTeam.name;
        const awayTeam = match.awayTeam.name;
        const key = `${homeTeam} - ${awayTeam}`;
        resultsMap.set(key, {
          home: match.score.fullTime.home,
          away: match.score.fullTime.away
        });
      }
    });
    console.log(`football-data.org found ${resultsMap.size} results for ${dateStr}`);
    return resultsMap;
  } catch (error) {
    console.log('football-data.org error:', error.message);
    return null;
  }
}

async function fetchResultsFromApiSports(dateStr) {
  const API_SPORTS_BASE = 'https://v3.football.api-sports.io';
  
  for (const apiKey of API_SPORTS_KEYS) {
    try {
      const response = await axios.get(`${API_SPORTS_BASE}/fixtures`, {
        params: { date: dateStr },
        headers: { 'x-apisports-key': apiKey }
      });
      
      const fixtures = response.data.response || [];
      const resultsMap = new Map();
      
      fixtures.forEach(fixture => {
        if (fixture.fixture.status.short === 'FT' || fixture.fixture.status.short === 'AET') {
          const homeTeam = fixture.teams.home.name;
          const awayTeam = fixture.teams.away.name;
          const key = `${homeTeam} - ${awayTeam}`;
          resultsMap.set(key, {
            home: fixture.score.fulltime.home,
            away: fixture.score.fulltime.away
          });
        }
      });
      
      console.log(`api-sports.io (key: ${apiKey.substring(0, 8)}...) found ${resultsMap.size} results for ${dateStr}`);
      return resultsMap;
    } catch (error) {
      console.log(`api-sports.io (key: ${apiKey.substring(0, 8)}...) error:`, error.message);
      continue;
    }
  }
  
  console.log('All api-sports.io keys failed');
  return null;
}

async function scrapeResultsFromBetexplorer(dateStr) {
  try {
    console.log(`Scraping betexplorer.com for results: ${dateStr}`);
    const [year, month, day] = dateStr.split('-');
    const url = `https://www.betexplorer.com/football/results/?year=${year}&month=${month}&day=${day}`;
    
    const browserOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };
    if (CHROME_PATH) {
      browserOptions.executablePath = CHROME_PATH;
    }
    
    const browser = await puppeteer.launch(browserOptions);
    let html = '';
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.in-match', { timeout: 15000 }).catch(() => {});
      html = await page.content();
    } finally {
      await browser.close();
    }
    
    const $ = cheerio.load(html);
    const resultsMap = new Map();
    
    // Try different selectors for match rows
    let matchRows = $('table.table-main tbody tr');
    if (matchRows.length === 0) {
      matchRows = $('tr').filter((i, el) => {
        const text = $(el).text();
        return text.includes(':') && (text.includes('-') || text.includes('–')) && /\d+:\d+/.test(text);
      });
    }
    
    matchRows.each((i, el) => {
      const rowText = $(el).text().trim();
      if (!rowText || rowText.includes('Date:') || rowText.includes(': ')) return;
      
      // Skip rows with league names (no score)
      if (!/\d+:\d+/.test(rowText)) return;
      // Skip postponed matches
      if (rowText.includes('POSTP')) return;
      
      // Extract teams and score - look for pattern like "13:30 Team1 - Team2 2:1"
      const matchParts = rowText.split(/\d+:\d+/);
      if (matchParts.length < 2) return;
      
      const teamsPart = matchParts[0].trim();
      const scorePart = rowText.match(/(\d+)\s*:\s*(\d+)/);
      
      // Split teams by " - " or "–"
      const teamSplit = teamsPart.split(/\s+[-–]\s+/);
      if (teamSplit.length !== 2) return;
      
      const homeTeam = teamSplit[0].replace(/^\d+\s*/, '').trim(); // Remove leading time
      const awayTeam = teamSplit[1].trim();
      
      if (scorePart && homeTeam && awayTeam) {
        const homeScore = parseInt(scorePart[1]);
        const awayScore = parseInt(scorePart[2]);
        
        if (!isNaN(homeScore) && !isNaN(awayScore)) {
          const key = `${homeTeam} - ${awayTeam}`;
          resultsMap.set(key, { home: homeScore, away: awayScore });
        }
      }
    });
    
    $('.in-match').each((i, el) => {
      const $row = $(el);
      const $homeTeam = $row.find('.h-text-right .team');
      const $awayTeam = $row.find('.h-text-left .team');
      const $score = $row.find('.h-text-center');
      
      const homeTeam = $homeTeam.text().trim();
      const awayTeam = $awayTeam.text().trim();
      const scoreText = $score.text().trim();
      
      if (homeTeam && awayTeam && scoreText) {
        const scoreMatch = scoreText.match(/(\d+)\s*[-–:]\s*(\d+)/);
        if (scoreMatch) {
          const key = `${homeTeam} - ${awayTeam}`;
          resultsMap.set(key, {
            home: parseInt(scoreMatch[1]),
            away: parseInt(scoreMatch[2])
          });
        }
      }
    });
    
    console.log(`betexplorer.com found ${resultsMap.size} results for ${dateStr}`);
    return resultsMap;
  } catch (error) {
    console.log('betexplorer.com results scrape error:', error.message);
    return new Map();
  }
}

async function fetchMatchResultsByDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  if (resultsCache.has(dateStr)) {
    return resultsCache.get(dateStr);
  }
  
  let resultsMap = new Map();
  
  console.log('Fetching results from football-data.org...');
  const footballDataResults = await fetchResultsFromFootballData(dateStr);
  if (footballDataResults && footballDataResults.size > 0) {
    resultsMap = footballDataResults;
    console.log(`football-data.org found ${resultsMap.size} results for ${dateStr}`);
  } else {
    console.log('No results from football-data.org, trying api-sports.io...');
    const apiSportsResults = await fetchResultsFromApiSports(dateStr);
    if (apiSportsResults && apiSportsResults.size > 0) {
      resultsMap = apiSportsResults;
      console.log(`api-sports.io found ${resultsMap.size} results for ${dateStr}`);
    }
  }
  
  resultsCache.set(dateStr, resultsMap);
  return resultsMap;
}

async function fetchTeamLeagueStats(teamId, leagueId) {
  try {
    const response = await axios.get(`${API_FOOTBALL_API}/teams/statistics`, {
      params: { team: teamId, league: leagueId, season: 2024 },
      headers: apiFootballHeaders
    });
    return response.data.response || null;
  } catch (error) {
    console.log('League stats error:', error.message);
    return null;
  }
}

async function scrapeStatareaAnalysis(homeTeam, awayTeam) {
  try {
    console.log('Scraping statarea.com for analysis:', homeTeam, 'vs', awayTeam);
    
    const homeEncoded = encodeURIComponent(homeTeam);
    const awayEncoded = encodeURIComponent(awayTeam);
    const compareUrl = `https://www.statarea.com/compare/teams/${homeEncoded}/${awayEncoded}`;
    
    console.log('Fetching URL:', compareUrl);
    
    const browserOptions2 = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };
    if (CHROME_PATH) {
      browserOptions2.executablePath = CHROME_PATH;
    }
    const browser = await puppeteer.launch(browserOptions2);

    let html = '';
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(compareUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      html = await page.content();
      console.log('Page loaded, content length:', html.length);
      
      // Save HTML for debugging
      const debugFile = path.join(__dirname, 'debug_' + homeTeam.replace(/[^a-zA-Z]/g, '_') + '_' + awayTeam.replace(/[^a-zA-Z]/g, '_') + '.html');
      fs.writeFileSync(debugFile, html);
      console.log('Debug HTML saved to:', debugFile);
    } finally {
      await browser.close();
    }

    const $ = cheerio.load(html);
    
    let homeForm = [];
    let awayForm = [];
    let h2hData = [];
    let homeStats = { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 };
    let awayStats = { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 };
    let homeLast10 = {};
    let awayLast10 = {};
    
    const pageHtml = html;
    const pageText = $('body').text();
    
    // Extract stats from factitem elements - the HTML structure is:
    // <div class="halfcontainer">
    //   <div class="caption"><div class="name">TeamName</div>...</div>
    //   <div class="data">
    //     <div class="factitem"><div class="value">2.5</div><div class="label">Average scored goals per match</div></div>
    //   </div>
    // </div>
    
    // Find all halfcontainer elements containing team data
    const teamHalfContainers = $('.teamsstatistics .halfcontainer');
    
    console.log('Found halfcontainers:', teamHalfContainers.length);
    
    // Process each team halfcontainer
    teamHalfContainers.each((colIdx, colEl) => {
      const $col = $(colEl);
      const teamName = $col.find('.caption .name').text().trim();
      
      console.log('Found team in halfcontainer:', teamName);
      
      if (!teamName) return;
      
      const isHomeTeam = teamName.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) || 
                        homeTeam.toLowerCase().includes(teamName.toLowerCase().split(' ')[0]);
      
      const factItems = $col.find('.factitem');
      const stats = {
        wins: 0,
        draws: 0,
        losses: 0,
        avgScored: 0,
        avgConceded: 0,
        chanceToScore: 0,
        chanceToConcede: 0,
        cleanSheets: 0,
        failToScore: 0,
        over25: 0,
        under25: 0
      };
      
      factItems.each((i, item) => {
        const $item = $(item);
        const label = $item.find('.label').text().trim();
        const value = $item.find('.value').text().trim();
        
        // Number of wins
        if (label.includes('wins')) {
          const match = value.match(/(\d+)/);
          if (match) stats.wins = parseInt(match[1]);
        }
        // Number of draws
        else if (label.includes('draws')) {
          const match = value.match(/(\d+)/);
          if (match) stats.draws = parseInt(match[1]);
        }
        // Number of loses
        else if (label.includes('loses') || label.includes('losses')) {
          const match = value.match(/(\d+)/);
          if (match) stats.losses = parseInt(match[1]);
        }
        // Average scored goals per match
        else if (label.includes('Average scored')) {
          const match = value.match(/([\d.]+)/);
          if (match) stats.avgScored = parseFloat(match[1]);
        }
        // Average conceded goals per match
        else if (label.includes('Average conceded')) {
          const match = value.match(/([\d.]+)/);
          if (match) stats.avgConceded = parseFloat(match[1]);
        }
        // Chance to score goal
        else if (label.includes('Chance to score')) {
          const match = value.match(/(\d+)/);
          if (match) stats.chanceToScore = parseInt(match[1]);
        }
        // Chance to conceded goal
        else if (label.includes('Chance to conceded') || label.includes('chance to concede')) {
          const match = value.match(/(\d+)/);
          if (match) stats.chanceToConcede = parseInt(match[1]);
        }
        // Number of clean sheet
        else if (label.includes('clean sheet')) {
          const match = value.match(/(\d+)/);
          if (match) stats.cleanSheets = parseInt(match[1]);
        }
        // Failure to score
        else if (label.includes('Failure to score')) {
          const match = value.match(/(\d+)/);
          if (match) stats.failToScore = parseInt(match[1]);
        }
        // Matches over 2.5
        else if (label.includes('over 2.5') || label.includes('Over 2.5')) {
          const match = value.match(/(\d+)/);
          if (match) stats.over25 = parseInt(match[1]);
        }
        // Matches under 2.5
        else if (label.includes('under 2.5') || label.includes('Under 2.5')) {
          const match = value.match(/(\d+)/);
          if (match) stats.under25 = parseInt(match[1]);
        }
      });
      
      console.log(`Stats for ${teamName}:`, stats);
      
      // Assign to home or away based on team name matching
      if (isHomeTeam || (Object.keys(homeLast10).length === 0 && colIdx === 0)) {
        homeLast10 = stats;
        console.log('Assigned to HOME:', teamName);
      } else {
        awayLast10 = stats;
        console.log('Assigned to AWAY:', teamName);
      }
    });
    
    // If halfcontainer approach didn't work, try alternative method
    // Only trigger if we have NO stats at all (object is empty or has no meaningful data)
    const homeHasData = homeLast10 && typeof homeLast10.wins === 'number' && Object.keys(homeLast10).length > 0;
    const awayHasData = awayLast10 && typeof awayLast10.wins === 'number' && Object.keys(awayLast10).length > 0;
    
    if (!homeHasData) {
      console.log('Trying alternative extraction method...');
      
      // Find all factitems and group by team
      const allFactItems = $('.factitem');
      let currentTeam = '';
      
      allFactItems.each((i, item) => {
        const $item = $(item);
        const parentCol = $item.closest('.halfcontainer');
        const teamNameInCol = parentCol.find('.caption .name').text().trim();
        
        if (teamNameInCol) {
          currentTeam = teamNameInCol;
        }
        
        const label = $item.find('.label').text().trim();
        const value = $item.find('.value').text().trim();
        
        if (!currentTeam || !label || !value) return;
        
        const isHome = currentTeam.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
                      homeTeam.toLowerCase().includes(currentTeam.toLowerCase().split(' ')[0]);
        
        const target = isHome ? homeLast10 : awayLast10;
        
        if (label.includes('wins') && label.includes('Number of')) {
          target.wins = parseInt(value) || 0;
        } else if (label.includes('draws') && label.includes('Number of')) {
          target.draws = parseInt(value) || 0;
        } else if ((label.includes('loses') || label.includes('losses')) && label.includes('Number of')) {
          target.losses = parseInt(value) || 0;
        } else if (label.includes('Average scored')) {
          target.avgScored = parseFloat(value) || 0;
        } else if (label.includes('Average conceded')) {
          target.avgConceded = parseFloat(value) || 0;
        } else if (label.includes('Chance to score')) {
          target.chanceToScore = parseInt(value.replace('%', '')) || 0;
        } else if (label.includes('Chance to conceded') || (label.includes('Chance to') && label.includes('conceded'))) {
          target.chanceToConcede = parseInt(value.replace('%', '')) || 0;
        } else if (label.includes('clean sheet')) {
          target.cleanSheets = parseInt(value) || 0;
        } else if (label.includes('Failure to score')) {
          target.failToScore = parseInt(value) || 0;
        } else if (label.includes('over 2.5')) {
          target.over25 = parseInt(value) || 0;
        } else if (label.includes('under 2.5')) {
          target.under25 = parseInt(value) || 0;
        }
      });
      
      console.log('Home stats after alt method:', homeLast10);
      console.log('Away stats after alt method:', awayLast10);
    }
    
    // Extract form from HTML div elements using cheerio
    // The form is in elements like: <div class='header'>Team form</div><div class='formastext'><div class='teamform win'>W</div>...
    const headers = $('.header');
    const formastexts = $('.formastext');
    
    // First Team form section is for home team, second is for away team
    let homeFormElements = $();
    let awayFormElements = $();
    
    headers.each((i, el) => {
      if ($(el).text().includes('Team form')) {
        const nextDiv = $(el).next('.formastext');
        if (homeFormElements.length === 0) {
          homeFormElements = nextDiv.find('.teamform');
        } else {
          awayFormElements = nextDiv.find('.teamform');
        }
      }
    });
    
    homeFormElements.each((i, el) => {
      if (i < 10) {
        const result = $(el).text().trim().toUpperCase();
        if (['W', 'D', 'L'].includes(result)) {
          homeForm.push(result);
        }
      }
    });
    
    awayFormElements.each((i, el) => {
      if (i < 10) {
        const result = $(el).text().trim().toUpperCase();
        if (['W', 'D', 'L'].includes(result)) {
          awayForm.push(result);
        }
      }
    });
    
    console.log('Home form from statarea:', homeForm.join(''));
    console.log('Away form from statarea:', awayForm.join(''));
    
    // Also look for "Team form" pattern as fallback
    const homeSectionMatch = pageHtml.match(new RegExp(homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '[\\s\\S]{0,500}Team\\s+form\\s+([WDXL10]+)', 'i'));
    const awaySectionMatch = pageHtml.match(new RegExp(awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '[\\s\\S]{0,500}Team\\s+form\\s+([WDXL10]+)', 'i'));
    
    if (homeForm.length === 0 && homeSectionMatch && homeSectionMatch[1]) {
      const formStr = homeSectionMatch[1].toUpperCase();
      homeForm = formStr.split('').slice(-10).filter(c => ['W', 'D', 'L'].includes(c));
      console.log('Home form from statarea (fallback):', homeForm.join(''));
    }
    
    if (awayForm.length === 0 && awaySectionMatch && awaySectionMatch[1]) {
      const formStr = awaySectionMatch[1].toUpperCase();
      awayForm = formStr.split('').slice(-10).filter(c => ['W', 'D', 'L'].includes(c));
      console.log('Away form from statarea (fallback):', awayForm.join(''));
    }
    
// Extract head-to-head data from the "Matches between teams" section
    // Format from statarea: date, away goals, away team, home goals, home team
    let h2hFromSection = [];
    
    // Find the "Matches between" section
    const matchesBetweenPattern = /Matches between[\s\S]*?(?=show all|$)/i;
    const matchesBetweenMatch = pageHtml.match(matchesBetweenPattern);
    
    if (matchesBetweenMatch) {
      const h2hSection = matchesBetweenMatch[0];
      console.log('Found "Matches between" section, length:', h2hSection.length);
      
      // Extract dates - try multiple formats
      const dateMatches = [];
      const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/g,  // YYYY-MM-DD
        /(\d{2}\/\d{2}\/\d{4})/g,  // DD/MM/YYYY
        /(\d{2}-\d{2}-\d{4})/g   // DD-MM-YYYY
      ];
      
      for (const datePattern of datePatterns) {
        let dateMatch;
        while ((dateMatch = datePattern.exec(h2hSection)) !== null && dateMatches.length < 20) {
          let dateStr = dateMatch[1];
          // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
          if (dateStr.includes('/') || dateStr.includes('-')) {
            const parts = dateStr.split(/[\/\-]/);
            if (parts[0].length === 4) {
              dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
            } else if (parts[2].length === 4) {
              dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          }
          dateMatches.push(dateStr);
        }
        if (dateMatches.length > 0) break;
      }
      
      // Look for scores in format: number, team, number, team
      const lines = h2hSection.split(/<[^>]+>/).filter(l => l.trim());
      
      for (let i = 0; i < lines.length - 4; i++) {
        const line1 = lines[i].trim();
        const line2 = lines[i + 1].trim();
        const line3 = lines[i + 2].trim();
        const line4 = lines[i + 3].trim();
        
        const num1 = parseInt(line1);
        const num3 = parseInt(line3);
        
        // Check if we have two numbers followed by two text lines (team names)
        if (!isNaN(num1) && !isNaN(num3) && num1 <= 10 && num3 <= 10) {
          // line2 and line4 are team names - line2 is away team, line4 is home team
          const awayTeamName = line2;
          const homeTeamName = line4;
          
          // Check if these contain our team names
          const isMatch = (awayTeamName.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]) ||
                          awayTeamName.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0])) &&
                         (homeTeamName.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
                          homeTeamName.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]));
          
          if (isMatch) {
            h2hFromSection.push({
              awayTeam: awayTeamName,
              homeTeam: homeTeamName,
              awayGoals: num1, // first score is away team
              homeGoals: num3, // second score is home team
              result: num3 > num1 ? 'H' : num1 > num3 ? 'A' : 'D'
            });
          }
        }
      }
      
      console.log('H2H from section:', h2hFromSection.length);
      console.log('Date matches found:', dateMatches);
      console.log('Sample H2H entries:', h2hFromSection.slice(0, 2));
    }
    
    // Use h2hFromSection or fall back to original h2hData
    const finalH2hData = h2hFromSection.length > 0 ? h2hFromSection : h2hData.slice(0, 5);
    
    console.log('Final H2H matches:', finalH2hData.length);
    
    // Also try to find summary stats with dynamic team names
    const h2hSummaryPattern2 = new RegExp('(\\\\d+)\\\\s*' + homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '\\\\s*wins.*?(\\\\d+)\\\\s*' + awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '\\\\s*wins.*?(\\\\d+)\\\\s*Draw', 'i');
    const h2hSummaryMatch2 = pageHtml.match(h2hSummaryPattern2);
    if (h2hSummaryMatch2) {
      console.log('H2H summary found:', h2hSummaryMatch2[0]);
    }
    
    // Only calculate form-based stats as FALLBACK if HTML extraction didn't work
    // Check if we got valid avgScored from HTML extraction
    const hasHomeStats = homeHasData;
    const hasAwayStats = awayHasData;
    
    if (homeForm.length > 0 && !hasHomeStats) {
      const formLast10 = homeForm.slice(-10);
      const wins = formLast10.filter(f => f === 'W').length;
      const draws = formLast10.filter(f => f === 'D').length;
      const losses = formLast10.filter(f => f === 'L').length;
      homeLast10 = {
        wins: wins,
        draws: draws,
        losses: losses,
        avgScored: 0,
        avgConceded: 0,
        chanceToScore: Math.round((wins + draws) / Math.max(formLast10.length, 1) * 100),
        chanceToConcede: Math.round((losses + draws) / Math.max(formLast10.length, 1) * 100),
        cleanSheets: 0,
        failToScore: losses,
        over25: 0,
        under25: 0
      };
      console.log('Home last 10 calculated from form (fallback):', homeLast10);
    }
    
    if (awayForm.length > 0 && !hasAwayStats) {
      const formLast10 = awayForm.slice(-10);
      const wins = formLast10.filter(f => f === 'W').length;
      const draws = formLast10.filter(f => f === 'D').length;
      const losses = formLast10.filter(f => f === 'L').length;
      awayLast10 = {
        wins: wins,
        draws: draws,
        losses: losses,
        avgScored: 0,
        avgConceded: 0,
        chanceToScore: Math.round((wins + draws) / Math.max(formLast10.length, 1) * 100),
        chanceToConcede: Math.round((losses + draws) / Math.max(formLast10.length, 1) * 100),
        cleanSheets: 0,
        failToScore: losses,
        over25: 0,
        under25: 0
      };
      console.log('Away last 10 calculated from form (fallback):', awayLast10);
    }
    
    // SKIPPING OLD TEXT PARSING CODE - using form data only
    /*
    // Try to get stats from page TEXT (not HTML) - it's easier to parse
    const homeTeamEscaped = homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\.');
    const awayTeamEscaped = awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\.');
    
    // Get the text version of the page
    const pageText = $('body').text();
    
    // Find home team stats in text
    const homeTextMatch = pageText.match(new RegExp(homeTeamEscaped + '[\\s\\S]{0,5000}(?:Estoril|Team form|match)', 'i'));
    if (homeTextMatch) {
      const textSection = homeTextMatch[0];
      console.log('Home text section sample:', textSection.slice(0, 500));
      
      // Try different patterns
      const winsMatch = textSection.match(/(\d+)\s+Number of.*wins/i);
      const drawsMatch = textSection.match(/(\d+)\s+Number of.*draws/i);
      const losesMatch = textSection.match(/(\d+)\s+Number of.*loses/i);
      const avgScoredMatch = textSection.match(/([\d.]+)\s+Average scored/i);
      const avgConcededMatch = textSection.match(/([\d.]+)\s+Average conceded/i);
      const chanceScoreMatch = textSection.match(/(\d+)%.*Chance.*score/i);
      const chanceConcedeMatch = textSection.match(/(\d+)%.*Chance.*conceded/i);
      const cleanMatch = textSection.match(/(\d+)\s+Number of clean sheet/i);
      const failMatch = textSection.match(/(\d+)\s+Failure to score/i);
      const over25Match = textSection.match(/(\d+)\s+Matches over.*2\.5/i);
      const under25Match = textSection.match(/(\d+)\s+Matches under.*2\.5/i);
      
      const tempWins = winsMatch ? parseInt(winsMatch[1]) : 0;
      const tempDraws = drawsMatch ? parseInt(drawsMatch[1]) : 0;
      const tempLosses = losesMatch ? parseInt(losesMatch[1]) : 0;
      
      console.log('Home text stats - W:', tempWins, 'D:', tempDraws, 'L:', tempLosses);
      
      // Only use if sum is 10
      if (tempWins + tempDraws + tempLosses === 10) {
        homeLast10 = {
          wins: tempWins,
          draws: tempDraws,
          losses: tempLosses,
: avgScoredMatch ? parseFloat(avgScoredMatch[1]) : 0,
          avgConceded: avgConcededMatch ? parseFloat(avgConcededMatch[1]) : 0,
          chanceToScore: chanceScoreMatch ? parseInt(chanceScoreMatch[1]) : 0,
          chanceToConcede: chanceConcedeMatch ? parseInt(chanceConcedeMatch[1]) : 0,
          cleanSheets: cleanMatch ? parseInt(cleanMatch[1]) : 0,
          failToScore: failMatch ? parseInt(failMatch[1]) : 0,
          over25: over25Match ? parseInt(over25Match[1]) : 0,
          under25: under25Match ? parseInt(under25Match[1]) : 0
        };
        console.log('Home last 10 from TEXT:', homeLast10);
      }
    }
    
    // Find away team stats in text  
    const awayTextMatch = pageText.match(new RegExp(awayTeamEscaped + '[\\s\\S]{0,5000}(?:Team form|match)', 'i'));
    if (awayTextMatch) {
      const textSection = awayTextMatch[0];
      console.log('Away text section sample:', textSection.slice(0, 500));
      
      const winsMatch = textSection.match(/(\d+)\s+Number of.*wins/i);
      const drawsMatch = textSection.match(/(\d+)\s+Number of.*draws/i);
      const losesMatch = textSection.match(/(\d+)\s+Number of.*loses/i);
      const avgScoredMatch = textSection.match(/([\d.]+)\s+Average scored/i);
      const avgConcededMatch = textSection.match(/([\d.]+)\s+Average conceded/i);
      const chanceScoreMatch = textSection.match(/(\d+)%.*Chance.*score/i);
      const chanceConcedeMatch = textSection.match(/(\d+)%.*Chance.*conceded/i);
      const cleanMatch = textSection.match(/(\d+)\s+Number of clean sheet/i);
      const failMatch = textSection.match(/(\d+)\s+Failure to score/i);
      const over25Match = textSection.match(/(\d+)\s+Matches over.*2\.5/i);
      const under25Match = textSection.match(/(\d+)\s+Matches under.*2\.5/i);
      
      const tempWins = winsMatch ? parseInt(winsMatch[1]) : 0;
      const tempDraws = drawsMatch ? parseInt(drawsMatch[1]) : 0;
      const tempLosses = losesMatch ? parseInt(losesMatch[1]) : 0;
      
      console.log('Away text stats - W:', tempWins, 'D:', tempDraws, 'L:', tempLosses);
      
      if (tempWins + tempDraws + tempLosses === 10) {
        awayLast10 = {
          wins: tempWins,
          draws: tempDraws,
          losses: tempLosses,
          avgScored: avgScoredMatch ? parseFloat(avgScoredMatch[1]) : 0,
          avgConceded: avgConcededMatch ? parseFloat(avgConcededMatch[1]) : 0,
          chanceToScore: chanceScoreMatch ? parseInt(chanceScoreMatch[1]) : 0,
          chanceToConcede: chanceConcedeMatch ? parseInt(chanceConcedeMatch[1]) : 0,
          cleanSheets: cleanMatch ? parseInt(cleanMatch[1]) : 0,
          failToScore: failMatch ? parseInt(failMatch[1]) : 0,
          over25: over25Match ? parseInt(over25Match[1]) : 0,
          under25: under25Match ? parseInt(under25Match[1]) : 0
        };
        console.log('Away last 10 from TEXT:', awayLast10);
      }
    }
    
    // Extract away team last 10 stats
    const awaySectionMatch = pageHtml.match(new RegExp(awayTeamEscaped + '[\\s\\S]{0,20000}(?:Time without|Statistic facts)', 'i'));
    const awaySection = awaySectionMatch ? awaySectionMatch[0] : '';
    
    if (awaySection) {
      const winsMatch = awaySection.match(/(\d+)\s*Number of[\s\S]{0,50}wins/i);
      const drawsMatch = awaySection.match(/(\d+)\s*Number of[\s\S]{0,50}draws/i);
      const losesMatch = awaySection.match(/(\d+)\s*Number of[\s\S]{0,50}loses/i);
      const avgScoredMatch = awaySection.match(/([\d.]+)\s*Average scored/i);
      const avgConcededMatch = awaySection.match(/([\d.]+)\s*Average conceded/i);
      const chanceScoreMatch = awaySection.match(/(\d+)%\s*Chance to score/i);
      const chanceConcedeMatch = awaySection.match(/(\d+)%\s*Chance to conceded/i);
      const cleanSheetMatch = awaySection.match(/(\d+)\s*Number of clean sheet/i);
      const failScoreMatch = awaySection.match(/(\d+)\s*Failure to score/i);
      const over25Match = awaySection.match(/(\d+)\s*Matches over 2\.5/i);
      const under25Match = awaySection.match(/(\d+)\s*Matches under 2\.5/i);
      
      awayLast10 = {
        wins: winsMatch ? parseInt(winsMatch[1]) : 0,
        draws: drawsMatch ? parseInt(drawsMatch[1]) : 0,
        losses: losesMatch ? parseInt(losesMatch[1]) : 0,
        avgScored: avgScoredMatch ? parseFloat(avgScoredMatch[1]) : 0,
        avgConceded: avgConcededMatch ? parseFloat(avgConcededMatch[1]) : 0,
        chanceToScore: chanceScoreMatch ? parseInt(chanceScoreMatch[1]) : 0,
        chanceToConcede: chanceConcedeMatch ? parseInt(chanceConcedeMatch[1]) : 0,
        cleanSheets: cleanSheetMatch ? parseInt(cleanSheetMatch[1]) : 0,
        failToScore: failScoreMatch ? parseInt(failScoreMatch[1]) : 0,
        over25: over25Match ? parseInt(over25Match[1]) : 0,
        under25: under25Match ? parseInt(under25Match[1]) : 0
      };
      console.log('Away last 10 stats:', awayLast10);
    }
    */
    
    // Extract recent match results - look for score patterns like "3 - 3", "1 - 4", etc.
    // These appear in the team listings with the team name
    // scorePattern already declared above
    
    // Calculate stats from form if available
    if (homeForm.length > 0) {
      homeStats.wins = homeForm.filter(f => f === 'W').length;
      homeStats.draws = homeForm.filter(f => f === 'D').length;
      homeStats.losses = homeForm.filter(f => f === 'L').length;
    }
    
    if (awayForm.length > 0) {
      awayStats.wins = awayForm.filter(f => f === 'W').length;
      awayStats.draws = awayForm.filter(f => f === 'D').length;
      awayStats.losses = awayForm.filter(f => f === 'L').length;
    }
    
    // Look for goals scored/conceded patterns in the team sections
    // Only match realistic scores (0-10) to avoid picking up years/dates
    const validScorePattern = /(\d{1,2})\s*[-–]\s*(\d{1,2})/g;
    const homeRecentMatches = pageHtml.match(new RegExp(homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '[\\s\\S]{0,2000}(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})', 'gi'));
    if (homeRecentMatches && homeRecentMatches.length > 0) {
      let totalHomeScored = 0;
      let totalHomeConceded = 0;
      let validCount = 0;
      const recentScores = homeRecentMatches.slice(0, 10);
      recentScores.forEach(match => {
        const scores = match.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
        if (scores) {
          const firstNum = parseInt(scores[1]);
          const secondNum = parseInt(scores[2]);
          // Only count realistic scores (0-10)
          if (firstNum <= 10 && secondNum <= 10) {
            totalHomeScored += firstNum;
            totalHomeConceded += secondNum;
            validCount++;
          }
        }
      });
      if (validCount > 0) {
        homeStats.avgScored = parseFloat((totalHomeScored / validCount).toFixed(1));
        homeStats.avgConceded = parseFloat((totalHomeConceded / validCount).toFixed(1));
      }
    }
    
    const awayRecentMatches = pageHtml.match(new RegExp(awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\\\.') + '[\\s\\S]{0,2000}(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})', 'gi'));
    if (awayRecentMatches && awayRecentMatches.length > 0) {
      let totalAwayScored = 0;
      let totalAwayConceded = 0;
      let validCount = 0;
      const recentScores = awayRecentMatches.slice(0, 10);
      recentScores.forEach(match => {
        const scores = match.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
        if (scores) {
          const firstNum = parseInt(scores[1]);
          const secondNum = parseInt(scores[2]);
          if (firstNum <= 10 && secondNum <= 10) {
            totalAwayScored += firstNum;
            totalAwayConceded += secondNum;
            validCount++;
          }
        }
      });
      if (validCount > 0) {
        awayStats.avgScored = parseFloat((totalAwayScored / validCount).toFixed(1));
        awayStats.avgConceded = parseFloat((totalAwayConceded / validCount).toFixed(1));
      }
    }
    
    // Only use calculated stats if we don't have proper data from halfcontainer extraction
    if (!homeHasData && homeStats.avgScored > 0) {
      homeLast10.avgScored = homeStats.avgScored;
      homeLast10.avgConceded = homeStats.avgConceded;
    }
    
    if (!awayHasData && awayStats.avgScored > 0) {
      awayLast10.avgScored = awayStats.avgScored;
      awayLast10.avgConceded = awayStats.avgConceded;
    }
    
    // Statarea-specific patterns for home team stats
    // Look for patterns like: "Home: 3W 1D 1L" or "Home Form: WWDWL"
    const homeFormMatch = pageHtml.match(/Home[\s:-]*Form[:\s]*([WDXL\d,.\-\s]+)/i) || 
                          pageHtml.match(/home[\s:-]*form[:\s]*([WDXL\d,.\-\s]+)/i);
    if (homeFormMatch) {
      const formStr = homeFormMatch[1].toUpperCase();
      const wCount = (formStr.match(/W|1/g) || []).length;
      const dCount = (formStr.match(/D|X/g) || []).length;
      const lCount = (formStr.match(/L|2/g) || []).length;
      if (wCount + dCount + lCount >= 3) {
        homeStats.wins = wCount;
        homeStats.draws = dCount;
        homeStats.losses = lCount;
      }
    }

    // Away form pattern
    const awayFormMatch = pageHtml.match(/Away[\s:-]*Form[:\s]*([WDXL\d,.\-\s]+)/i) || 
                          pageHtml.match(/away[\s:-]*form[:\s]*([WDXL\d,.\-\s]+)/i);
    if (awayFormMatch) {
      const formStr = awayFormMatch[1].toUpperCase();
      const wCount = (formStr.match(/W|1/g) || []).length;
      const dCount = (formStr.match(/D|X/g) || []).length;
      const lCount = (formStr.match(/L|2/g) || []).length;
      if (wCount + dCount + lCount >= 3) {
        awayStats.wins = wCount;
        awayStats.draws = dCount;
        awayStats.losses = lCount;
      }
    }

    // Use the form and stats we extracted above (from Team form pattern)
    // Only use additional patterns if needed as fallback for goals
    
    // If we already have form but no goals yet, try to extract from average goals text
    if (homeStats.avgScored === 0) {
      const avgGoalsMatch = pageText.match(/(\d+(?:\.\d+)?)\s*goals?\s*(?:per\s*game|avg|average|match)/i);
      if (avgGoalsMatch) {
        homeStats.avgScored = parseFloat(avgGoalsMatch[1]);
        homeStats.avgConceded = parseFloat(avgGoalsMatch[1]) * 0.8;
      }
    }
    
    if (awayStats.avgScored === 0) {
      const avgGoalsMatch = pageText.match(/(\d+(?:\.\d+)?)\s*goals?\s*(?:per\s*game|avg|average|match)/i);
      if (avgGoalsMatch) {
        awayStats.avgScored = parseFloat(avgGoalsMatch[1]);
        awayStats.avgConceded = parseFloat(avgGoalsMatch[1]) * 0.8;
      }
    }
    
    if (homeStats.avgScored > 0 || homeStats.avgConceded > 0) {
      if (homeLast10.avgScored === 0) homeLast10.avgScored = homeStats.avgScored;
      if (homeLast10.avgConceded === 0) homeLast10.avgConceded = homeStats.avgConceded;
    }
    
    if (awayStats.avgScored > 0 || awayStats.avgConceded > 0) {
      if (awayLast10.avgScored === 0) awayLast10.avgScored = awayStats.avgScored;
      if (awayLast10.avgConceded === 0) awayLast10.avgConceded = awayStats.avgConceded;
    }

    const homeStatsFound = homeStats.wins > 0 || homeStats.draws > 0 || homeStats.losses > 0 || homeStats.avgScored > 0;
    const awayStatsFound = awayStats.wins > 0 || awayStats.draws > 0 || awayStats.losses > 0 || awayStats.avgScored > 0;
    const homeFormFound = homeForm.length > 0;
    const awayFormFound = awayForm.length > 0;

    console.log('Home form found:', homeForm.join(''), '| stats found:', homeStatsFound);
    console.log('Home stats:', homeStats);
    console.log('Away stats:', awayStats);

    // If scraping didn't get data, use realistic defaults based on typical team performance
    if (!homeFormFound || !homeStatsFound) {
      if (!homeFormFound) homeForm = ['W', 'D', 'W', 'L', 'W'];
      if (!homeStatsFound) homeStats = { wins: 3, draws: 1, losses: 1, avgScored: 1.7, avgConceded: 1.2 };
    }
    
    if (!awayFormFound || !awayStatsFound) {
      if (!awayFormFound) awayForm = ['W', 'D', 'W', 'L', 'D'];
      if (!awayStatsFound) awayStats = { wins: 2, draws: 2, losses: 1, avgScored: 1.5, avgConceded: 1.3 };
    }
    
    if (homeLast10.avgScored === 0 && homeStats.avgScored > 0) {
      homeLast10.avgScored = homeStats.avgScored;
      homeLast10.avgConceded = homeStats.avgConceded;
    }
    
    if (awayLast10.avgScored === 0 && awayStats.avgScored > 0) {
      awayLast10.avgScored = awayStats.avgScored;
      awayLast10.avgConceded = awayStats.avgConceded;
    }

    return {
      homeTeam,
      awayTeam,
      h2h: finalH2hData,
      homeForm: homeForm.join(''),
      awayForm: awayForm.join(''),
      homeStats,
      awayStats,
      homeLast10,
      awayLast10,
      source: 'statarea.com',
      date: getLocalDateStr(),
      debug: { pageTextLength: pageText ? pageText.length : 0 }
    };
  } catch (error) {
    console.log('Statarea scrape error:', error.message);
    // Calculate from form when scraping fails
    let homeLast10Err = {};
    let awayLast10Err = {};
    
    if (homeForm.length > 0) {
      const formLast10 = homeForm.slice(-10);
      const wins = formLast10.filter(f => f === 'W').length;
      const draws = formLast10.filter(f => f === 'D').length;
      const losses = formLast10.filter(f => f === 'L').length;
      homeLast10Err = { wins, draws, losses, avgScored: 0, avgConceded: 0, chanceToScore: Math.round((wins + draws) / 10 * 100), chanceToConcede: Math.round((losses + draws) / 10 * 100), cleanSheets: 0, failToScore: losses, over25: 0, under25: 0 };
    }
    if (awayForm.length > 0) {
      const formLast10 = awayForm.slice(-10);
      const wins = formLast10.filter(f => f === 'W').length;
      const draws = formLast10.filter(f => f === 'D').length;
      const losses = formLast10.filter(f => f === 'L').length;
      awayLast10Err = { wins, draws, losses, avgScored: 0, avgConceded: 0, chanceToScore: Math.round((wins + draws) / 10 * 100), chanceToConcede: Math.round((losses + draws) / 10 * 100), cleanSheets: 0, failToScore: losses, over25: 0, under25: 0 };
    }
    
    return {
      homeTeam,
      awayTeam,
      h2h: [],
      homeForm: homeForm.join(''),
      awayForm: awayForm.join(''),
      homeStats,
      awayStats,
      homeLast10: homeLast10Err,
      awayLast10: awayLast10Err,
      source: 'statarea.com',
      date: getLocalDateStr()
    };
  }
}

function generateEmptyAnalysis(homeTeam, awayTeam) {
  return {
    homeTeam,
    awayTeam,
    h2h: [],
    homeForm: '',
    awayForm: '',
    homeStats: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 },
    awayStats: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0 },
    homeLast10: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0, chanceToScore: 0, chanceToConcede: 0, cleanSheets: 0, failToScore: 0, over25: 0, under25: 0 },
    awayLast10: { wins: 0, draws: 0, losses: 0, avgScored: 0, avgConceded: 0, chanceToScore: 0, chanceToConcede: 0, cleanSheets: 0, failToScore: 0, over25: 0, under25: 0 },
    source: 'statarea.com',
    date: getLocalDateStr()
  };
}

app.get('/api/analysis', async (req, res) => {
  const { homeTeam, awayTeam } = req.query;
  const cacheKey = `${homeTeam}-${awayTeam}`.toLowerCase();
  
  const analysisCache = getAnalysisCache();
  const today = getLocalDateStr();
  
  if (analysisCache[cacheKey] && analysisCache[cacheKey].date === today) {
    console.log(`Serving cached analysis for: ${homeTeam} vs ${awayTeam}`);
    return res.json(analysisCache[cacheKey]);
  }
  
  try {
    console.log(`Fetching analysis from statarea for: ${homeTeam} vs ${awayTeam}`);
    
    const result = await scrapeStatareaAnalysis(homeTeam, awayTeam);
    
    analysisCache[cacheKey] = result;
    saveAnalysisCache(analysisCache);
    
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error.message);
    res.json(generateEmptyAnalysis(homeTeam, awayTeam));
  }
});

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

app.post('/api/register', (req, res) => {
  console.log('Register request received:', req.body);
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }
  const users = loadUsers();
  if (users[email]) {
    return res.status(400).json({ message: 'Email already registered' });
  }
  const activationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
  users[email] = { 
    email, 
    password: hashPassword(password), 
    createdAt: new Date().toISOString(),
    verified: false,
    activationToken: activationToken
  };
  saveUsers(users);
  console.log('========================================');
  console.log('ACTIVATION LINK for', email, ':');
  console.log('http://localhost:3000/activate.html?token=' + activationToken + '&email=' + encodeURIComponent(email));
  console.log('========================================');
  res.json({ success: true, message: 'Registration successful. Please check your email to activate your account.' });
});

app.get('/activate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'activate.html'));
});

app.post('/api/activate', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ message: 'Email and token required' });
  }
  const users = loadUsers();
  const user = users[email];
  if (!user) {
    return res.status(400).json({ message: 'Invalid activation' });
  }
  if (user.activationToken !== token) {
    return res.status(400).json({ message: 'Invalid activation token' });
  }
  user.verified = true;
  delete user.activationToken;
  users[email] = user;
  saveUsers(users);
  console.log('User activated:', email);
  res.json({ success: true, message: 'Account activated successfully!' });
});

app.post('/api/login', (req, res) => {
  res.status(403).json({ message: 'Login is currently disabled' });
});

app.get('/api/check-auth', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.json({ authenticated: false });
  }
  try {
    const user = JSON.parse(authHeader);
    const users = loadUsers();
    if (users[user.email]) {
      return res.json({ authenticated: true, user });
    }
    return res.json({ authenticated: false });
  } catch (e) {
    return res.json({ authenticated: false });
  }
});

app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

const RESET_TOKENS = {};

app.post('/api/reset-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email required' });
  }
  const users = loadUsers();
  if (!users[email]) {
    return res.json({ message: 'If email exists, reset link sent' });
  }
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  RESET_TOKENS[token] = { email, expires: Date.now() + 3600000 };
  console.log('Password reset token for', email, ':', token);
  res.json({ success: true, message: 'Reset link sent (check server console for token)' });
});

app.post('/api/reset-password/confirm', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password required' });
  }
  const resetData = RESET_TOKENS[token];
  if (!resetData) {
    return res.status(400).json({ message: 'Invalid token' });
  }
  if (Date.now() > resetData.expires) {
    delete RESET_TOKENS[token];
    return res.status(400).json({ message: 'Token expired' });
  }
  const users = loadUsers();
  if (!users[resetData.email]) {
    return res.status(400).json({ message: 'User not found' });
  }
  users[resetData.email].password = hashPassword(newPassword);
  saveUsers(users);
  delete RESET_TOKENS[token];
  console.log('Password reset successful for:', resetData.email);
  res.json({ success: true, message: 'Password reset successful' });
});

const ADMIN_EMAIL = 'admin@scrapertipster.com';
const ADMIN_PASSWORD = 'admin123';

app.post('/api/admin/login', (req, res) => {
  res.status(403).json({ message: 'Login is currently disabled' });
});

app.get('/api/admin/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== ADMIN_EMAIL) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const users = loadUsers();
  const userList = Object.entries(users).map(([email, data]) => ({
    email,
    createdAt: data.createdAt,
    role: email === ADMIN_EMAIL ? 'admin' : 'user'
  }));
  res.json({ users: userList });
});

app.delete('/api/admin/users/:email', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== ADMIN_EMAIL) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { email } = req.params;
  if (email === ADMIN_EMAIL) {
    return res.status(400).json({ message: 'Cannot delete admin' });
  }
  const users = loadUsers();
  if (!users[email]) {
    return res.status(404).json({ message: 'User not found' });
  }
  delete users[email];
  saveUsers(users);
  res.json({ success: true, message: 'User deleted' });
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

app.post('/api/auth/google', async (req, res) => {
  res.status(403).json({ success: false, message: 'Login is currently disabled' });
});

app.get('/login', (req, res) => {
  res.redirect('/');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
