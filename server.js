require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const apiRoutes = require('./src/routes/api');
const scraperService = require('./src/services/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Visitor Analytics (in-memory storage)
const visitorData = {
  visits: [],
  dailyStats: {},
  pageViews: {}
};

setInterval(() => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
  
  for (const dateKey of Object.keys(visitorData.dailyStats)) {
    if (dateKey < cutoffDate) {
      delete visitorData.dailyStats[dateKey];
    }
  }
}, 60 * 60 * 1000);

function trackVisit(req, res, next) {
  const today = new Date().toISOString().split('T')[0];
  const page = req.path || '/';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const referer = req.get('referer') || 'direct';
  const userAgent = req.get('user-agent') || 'unknown';
  
  // Track unique daily visitors
  const dateKey = today;
  if (!visitorData.dailyStats[dateKey]) {
    visitorData.dailyStats[dateKey] = {
      visitors: new Set(),
      pageViews: 0,
      pages: {}
    };
  }
  
  visitorData.dailyStats[dateKey].visitors.add(ip);
  visitorData.dailyStats[dateKey].pageViews++;
  
  if (!visitorData.dailyStats[dateKey].pages[page]) {
    visitorData.dailyStats[dateKey].pages[page] = 0;
  }
  visitorData.dailyStats[dateKey].pages[page]++;
  
  // Track all visits for detailed analysis (last 1000)
  visitorData.visits.push({
    ip,
    page,
    referer,
    userAgent,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 5000 visits
  if (visitorData.visits.length > 5000) {
    visitorData.visits = visitorData.visits.slice(-5000);
  }
  
  next();
}

// Make visitorData available to routes
app.set('visitorData', visitorData);

// Rate Limiter
const rateLimit = new Map();
const RATE_LIMIT = 100;
const TIME_WINDOW = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimit.entries()) {
    if (now > data.resetTime) {
      rateLimit.delete(ip);
    }
  }
}, 60 * 1000);

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
  next();
}

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false
}));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com;");
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(rateLimiter);
app.use(trackVisit);

// Static files
app.use(express.static('public'));

// Redirect www to non-www
app.use((req, res, next) => {
  if (req.hostname && req.hostname.startsWith('www.')) {
    const newUrl = 'https://' + req.hostname.slice(4) + req.originalUrl;
    return res.redirect(301, newUrl);
  }
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Frontend Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Scheduled Tasks
// Run daily at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled daily prediction fetch...');
  try {
    const data = await scraperService.fetchAndCachePredictions();
    console.log('Scheduled fetch completed. Matches found:', data.totalMatches);
  } catch (error) {
    console.error('Scheduled fetch error:', error.message);
  }
});

// Run background analysis scraping daily at 2:00 AM (only if enabled)
if (process.env.ENABLE_BACKGROUND_SCRAPING === 'true') {
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled background analysis scraping...');
    try {
      scraperService.triggerBackgroundScraping();
    } catch (error) {
      console.error('Background scraping error:', error.message);
    }
  });
}

// Use a flag to track if initial fetch is running
let initialFetchRunning = false;

// Initial Fetch
setTimeout(async () => {
  if (initialFetchRunning) {
    console.log('Initial fetch already in progress, skipping');
    return;
  }
  
  const SKIP_INITIAL_FETCH = process.env.SKIP_INITIAL_FETCH === 'true' || process.argv.includes('--skip-fetch');
  if (SKIP_INITIAL_FETCH) {
    console.log('Skipping initial fetch');
    return;
  }
  
  initialFetchRunning = true;
  console.log('Running initial prediction fetch...');
  try {
    const data = await scraperService.fetchAndCachePredictions();
    console.log('Initial fetch completed. Matches found:', data.totalMatches);
  } catch (error) {
    console.error('Initial fetch error:', error.message);
  } finally {
    initialFetchRunning = false;
  }
}, 5000);

const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at http://${HOST}:${PORT}`);
});

module.exports = app;
