require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const apiRoutes = require('./src/routes/api');

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@winfulltime/videos';

let youtubeVideosCache = { videos: [], lastFetched: null };
const YOUTUBE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

let scraperService;
let predictionsCache = null;
try {
  scraperService = require('./src/services/scraper');
  console.log('Preloading predictions cache...');
  predictionsCache = scraperService.loadCachedPredictions();
  if (predictionsCache) {
    console.log('Cache preloaded successfully, matches:', predictionsCache.matches?.length);
  } else {
    console.log('No cache found, will fetch on first request');
  }
} catch (e) {
  console.log('Scraper service will load lazily:', e.message);
}

function getScraperService() {
  if (!scraperService) {
    scraperService = require('./src/services/scraper');
  }
  return scraperService;
}

function getPredictionsCache() {
  return predictionsCache;
}

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

// Redirect www to non-www
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && host.startsWith('www.')) {
    return res.redirect(301, 'https://winfulltime.com' + req.originalUrl);
  }
  next();
});

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true
}));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: https://i.ytimg.com https://yt3.ggpht.com; connect-src 'self' https: http://localhost http://127.0.0.1 ws://localhost ws://127.0.0.1 https://www.google-analytics.com https://www.googletagmanager.com; frame-src https://www.youtube.com https://youtube.com;");
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(rateLimiter);
app.use(trackVisit);

// Static files with no cache
app.use(express.static('public', {
  maxAge: 0,
  etag: false,
  lastModified: false
}));

// Railway handles HTTPS redirect at proxy level, skip in app

// API Routes
app.use('/api', apiRoutes);

// YouTube Videos API - using official YouTube Data API
const YOUTUBE_CHANNEL_ID = 'UCyDIjH4CQiITAGnjZ_ZTTYg'; // @winfulltime channel ID
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

console.log('YouTube API Key loaded:', YOUTUBE_API_KEY ? 'Yes (' + YOUTUBE_API_KEY.substring(0, 10) + '...)' : 'No');
console.log('YouTube Channel ID:', YOUTUBE_CHANNEL_ID);

app.get('/api/youtube-videos', async (req, res) => {
  const now = Date.now();
  
  if (youtubeVideosCache.videos.length > 0 && 
      youtubeVideosCache.lastFetched && 
      (now - youtubeVideosCache.lastFetched) < YOUTUBE_CACHE_DURATION) {
    return res.json({ success: true, videos: youtubeVideosCache.videos });
  }

  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API key not configured');
    if (youtubeVideosCache.videos.length > 0) {
      return res.json({ success: true, videos: youtubeVideosCache.videos, cached: true });
    }
    return res.status(500).json({ success: false, error: 'YouTube API not configured' });
  }

  try {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
      params: {
        key: YOUTUBE_API_KEY,
        channelId: YOUTUBE_CHANNEL_ID,
        part: 'snippet',
        order: 'date',
        maxResults: 4,
        type: 'video'
      },
      timeout: 15000
    });

    const videos = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      publishDate: item.snippet.publishedAt,
      youtubeUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    youtubeVideosCache = { videos, lastFetched: now };
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Error fetching YouTube videos:', error.message);
    console.error('Error details:', error.response?.data || error.code || 'Unknown error');
    if (youtubeVideosCache.videos.length > 0) {
      return res.json({ success: true, videos: youtubeVideosCache.videos, cached: true });
    }
    res.status(500).json({ success: false, error: 'Failed to fetch videos', details: error.message });
  }
});

// Frontend Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle blog posts - try both with and without .html extension
app.get('/blog/:slug', (req, res) => {
  const slug = req.params.slug;
  const fs = require('fs');
  
  // First try without .html (if already exists as static file)
  let filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath, { maxAge: 0 });
  }
  
  // If not found, redirect to blog index
  res.redirect('/blog/');
});

// Scheduled Tasks
// Run daily at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled daily prediction fetch...');
  try {
    const data = await getScraperService().fetchAndCachePredictions();
    console.log('Scheduled fetch completed. Matches found:', data.totalMatches);
  } catch (error) {
    console.error('Scheduled fetch error:', error.message);
  }
});

// Run secondary scrape at 6:00 PM to catch late-appearing matches
cron.schedule('0 18 * * *', async () => {
  console.log('Running secondary scrape to capture missed matches...');
  try {
    const data = await getScraperService().fetchPredictions();
    console.log('Secondary scrape completed. Total matches:', data.totalMatches);
    if (data.recoveredMatches) {
      console.log(`Recovered ${data.recoveredMatches} missed matches from previous scrape`);
    }
  } catch (error) {
    console.error('Secondary scrape error:', error.message);
  }
});

// Run background analysis scraping daily at 2:00 AM (only if enabled)
if (process.env.ENABLE_BACKGROUND_SCRAPING === 'true') {
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled background analysis scraping...');
    try {
      getScraperService().triggerBackgroundScraping();
    } catch (error) {
      console.error('Background scraping error:', error.message);
    }
  });
}

// Use a flag to track if initial fetch is running
let initialFetchRunning = false;

// Initial Fetch - run in background, don't block
setTimeout(async () => {
  if (initialFetchRunning) {
    console.log('Initial fetch already in progress, skipping');
    return;
  }
  
  initialFetchRunning = true;
  console.log('Running initial prediction fetch in background...');
  
  // Fire and forget - don't await
  getScraperService().fetchAndCachePredictions()
    .then(data => {
      console.log('Initial fetch completed. Matches found:', data.totalMatches);
      predictionsCache = data;
    })
    .catch(err => console.error('Initial fetch error:', err.message));
  
  // Corners, cards, and both halves scraping disabled
  // getScraperService().scrapeCorners()
  //   .then(data => console.log('Initial corners scrape completed. Matches found:', data.totalMatches))
  //   .catch(err => console.error('Initial corners error:', err.message));
  // 
  // getScraperService().scrapeCards()
  //   .then(data => console.log('Initial cards scrape completed. Matches found:', data.totalMatches))
  //   .catch(err => console.error('Initial cards error:', err.message));
  // 
  // getScraperService().scrapeBothHalves()
  //   .then(data => console.log('Initial both halves scrape completed. Matches found:', data.totalMatches))
  //   .catch(err => console.error('Initial both halves error:', err.message))
  //   .finally(() => { initialFetchRunning = false; });
}, 5000);

const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('Server failed to start:', err.message);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at http://${HOST}:${PORT}`);
});

module.exports = app;
