require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const apiRoutes = require('./src/routes/api');
const chatRoutes = require('./src/routes/chat');

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
app.set('trust proxy', 1);

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
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['https://winfulltime.com', 'https://www.winfulltime.com']
}));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: https://i.ytimg.com https://yt3.ggpht.com; connect-src 'self' https: http://localhost http://127.0.0.1 ws://localhost ws://127.0.0.1 https://www.google-analytics.com https://www.googletagmanager.com; frame-src https://www.youtube.com https://youtube.com;");
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(rateLimiter);
app.use(trackVisit);


// Redirect old ?category= query params to clean URLs
const CATEGORY_REDIRECTS = {
  'unbeaten': 'unbeaten',
  'over15': 'over-1-5',
  'over25': 'over-2-5',
  'bttsno': 'btts-no',
  '1x2': '1x2',
  'btts': 'btts',
  'cards': 'cards'
};

app.get('/', (req, res, next) => {
  if (req.query.category) {
    const newSlug = CATEGORY_REDIRECTS[req.query.category];
    if (newSlug) {
      return res.redirect(301, '/predictions/' + newSlug);
    }
  }
  next();
});

// Consolidate the retired in-play betting article with the current guide.
app.get('/blog/in-play-betting-strategy.html', (req, res) => {
  res.redirect(301, '/blog/inplay-betting-strategies.html');
});

// Static files with no cache
app.use(express.static('public', {
  maxAge: 0,
  etag: false,
  lastModified: false,
  extensions: ['html']
}));

// API Routes (optional local/dev API — production site is GitHub Pages)
app.use('/api', apiRoutes);
app.use('/api', chatRoutes);

// RSS Feed
const RSS_FEED_ARTICLES_FILE = path.join(__dirname, 'articles-manifest.json');

app.get('/feed.xml', (req, res) => {
  try {
    const data = fs.readFileSync(RSS_FEED_ARTICLES_FILE, 'utf8');
    const articles = JSON.parse(data);
    const published = articles.filter(a => a.published).sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
    const now = new Date().toUTCString();

    let items = '';
    for (const article of published) {
      const pubDate = new Date(article.publishDate).toUTCString();
      const url = `https://winfulltime.com/blog/${article.slug}`;
      items += `    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${article.category}</category>
      <description><![CDATA[${article.excerpt}]]></description>
    </item>
`;
    }

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WinFullTime - Football Betting Tips &amp; Predictions</title>
    <link>https://winfulltime.com/</link>
    <description>Daily football betting predictions, analysis, and strategy guides. Get BTTS, Over 2.5, Over 1.5, win streak, and draw streak tips.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="https://winfulltime.com/feed.xml" rel="self" type="application/rss+xml"/>
${items}  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(feed);
  } catch (e) {
    console.error('RSS feed error:', e.message);
    res.status(500).send('Failed to generate RSS feed');
  }
});

// Predictions RSS Feed (for Flipboard / content distribution)
app.get('/predictions-feed.xml', (req, res) => {
  try {
    const cache = getPredictionsCache();
    if (!cache || !cache.matches || cache.matches.length === 0) {
      return res.status(503).send('Predictions data not available yet');
    }

    const now = new Date().toUTCString();
    const matches = cache.matches;
    const dates = [...new Set(matches.map(m => m.date))].sort();
    const catTotals = { '1X2': 0, 'Over 2.5': 0, 'Over 1.5': 0, 'BTTS YES': 0, 'BTTS NO': 0 };

    let items = '';
    for (const dateStr of dates) {
      const dayMatches = matches.filter(m => m.date === dateStr);
      const d = new Date(dateStr + 'T12:00:00');
      const pubDate = d.toUTCString();
      const matchCount = dayMatches.length;

      // Reset category counts
      for (const k in catTotals) catTotals[k] = 0;

      let matchRows = '';
      for (const m of dayMatches) {
        const tip = m.tip || '';
        const prob = m.probability || 0;
        const key = tip === '1' || tip === 'X' || tip === '2' ? '1X2' :
                    tip === 'Over 2.5' ? 'Over 2.5' :
                    tip === 'Over 1.5' ? 'Over 1.5' :
                    tip === 'BTTS YES' ? 'BTTS YES' : 'BTTS NO';
        catTotals[key]++;
        matchRows += `${m.match} → ${tip} (${prob}%)\n`;
      }

      const catSummary = Object.entries(catTotals)
        .filter(([,v]) => v > 0)
        .map(([k,v]) => `${v} ${k}`)
        .join(', ');

      items += `    <item>
      <title>Football Predictions for ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</title>
      <link>https://winfulltime.com/</link>
      <guid>https://winfulltime.com/predictions/${dateStr}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${matchCount} match predictions: ${catSummary}.

${matchRows}]]></description>
    </item>
`;
    }

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WinFulltime Daily Football Predictions</title>
    <link>https://winfulltime.com/</link>
    <description>Daily AI-powered football predictions for 1X2, Over/Under, BTTS, and Team to Score markets. Updated daily.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="https://winfulltime.com/predictions-feed.xml" rel="self" type="application/rss+xml"/>
${items}  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(feed);
  } catch (e) {
    console.error('Predictions RSS feed error:', e.message);
    res.status(500).send('Failed to generate predictions RSS feed');
  }
});

// Email subscription endpoint
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@') || email === 'skipped@guest') {
    return res.json({ success: false });
  }
  try {
    let subscribers = [];
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      subscribers = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
    if (!subscribers.some(s => s.email === email)) {
      subscribers.push({ email, subscribedAt: new Date().toISOString() });
      fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
      console.log('New subscriber:', email);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Subscribe error:', e.message);
    res.json({ success: false });
  }
});

// Admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  next();
}

// View subscribers (GET for admin)
app.get('/api/subscribers', requireAdmin, (req, res) => {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
      return res.json({ success: true, count: data.length, subscribers: data });
    }
    res.json({ success: true, count: 0, subscribers: [] });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

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
  
  // First try without .html (if already exists as static file)
  let filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath, { maxAge: 0 });
  }
  
  // If not found, redirect to blog index
  res.redirect('/blog/');
});

// Production site is static on GitHub Pages.
// Scraping, social posting, and deploys run via GitHub Actions only.
// This Express app is optional for local API/dev use — no scheduled jobs.

const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('Server failed to start:', err.message);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at http://${HOST}:${PORT}`);
  console.log('Scheduled scrapes disabled — use GitHub Actions (scrape-and-deploy.yml)');
});

module.exports = app;
