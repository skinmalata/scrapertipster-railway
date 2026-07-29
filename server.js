require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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
  const now = Date.now();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
  
  for (const dateKey of Object.keys(visitorData.dailyStats)) {
    if (dateKey < cutoffDate) {
      delete visitorData.dailyStats[dateKey];
    }
  }

  if (visitorData.visits.length > 5000) {
    visitorData.visits = visitorData.visits.slice(-3000);
  }

  const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  console.log('[memory] Heap:', memMB + 'MB | visits:', visitorData.visits.length, '| dailyStats:', Object.keys(visitorData.dailyStats).length);
}, 10 * 60 * 1000);

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
  
  // Keep only last 3000 visits
  if (visitorData.visits.length > 3000) {
    visitorData.visits = visitorData.visits.slice(-3000);
  }
  
  next();
}

// Make visitorData available to routes
app.set('visitorData', visitorData);

// Rate Limiter
const ipRateLimit = new Map();
const RATE_LIMIT = 100;
const TIME_WINDOW = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRateLimit.entries()) {
    if (now > data.resetTime) {
      ipRateLimit.delete(ip);
    }
  }
}, 60 * 1000);

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!ipRateLimit.has(ip)) {
    ipRateLimit.set(ip, { count: 1, resetTime: now + TIME_WINDOW });
    return next();
  }
  
  const data = ipRateLimit.get(ip);
  
  if (now > data.resetTime) {
    ipRateLimit.set(ip, { count: 1, resetTime: now + TIME_WINDOW });
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
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: https://www.googletagmanager.com https://www.google-analytics.com https://unpkg.com https://app.lemonsqueezy.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: https://i.ytimg.com https://yt3.ggpht.com; connect-src 'self' https: http://localhost http://127.0.0.1 ws://localhost ws://127.0.0.1 https://www.google-analytics.com https://www.googletagmanager.com https://xogkqpjtxfemcxzsuwke.supabase.co https://api.lemonsqueezy.com; frame-src https://www.youtube.com https://youtube.com https://app.lemonsqueezy.com;");
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(function (req, res, next) {
  if (req.path === '/api/webhook/payment') {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      try { req.body = JSON.parse(req.rawBody); } catch (e) { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});
app.use(rateLimiter);
app.use(trackVisit);

// Stricter rate limits for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use('/api/golden-tips', apiLimiter);
app.use('/api/live-tips', apiLimiter);



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
function serveBlogPost(req, res, next) {
  const slug = req.params.slug;
  if (!slug || slug === 'index' || slug === 'blog-template') return next();

  const filePath = path.join(__dirname, 'public', 'blog', `${slug}.html`);
  if (!fs.existsSync(filePath)) return next();

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const enhancedHtml = html.includes('/article-tools-cta.js')
      ? html
      : html.replace(/<\/body>/i, '<script src="/article-tools-cta.js" defer></script></body>');
    return res.type('html').send(enhancedHtml);
  } catch (error) {
    return next(error);
  }
}

// Serve article pages through one reusable conversion panel, including direct .html URLs.
app.get('/blog/:slug.html', serveBlogPost);

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
app.get('/blog/:slug', (req, res, next) => {
  serveBlogPost(req, res, (error) => {
    if (error) return next(error);
    res.redirect('/blog/');
  });
});

// FotMob live scraping + API-Football stats — replaces Forebet (Cloudflare blocked axios on Render).
const { startLiveScrapeLoop, getCachedLive } = require('./src/services/scrapeLive');
const { buildGoldenTips } = require('./src/services/goldenOpportunities');
const { startTelegramBot } = require('./src/services/telegramBot');
const { startMastodonBot } = require('./src/services/mastodonBot');
startLiveScrapeLoop();

// Refresh pre-match predictions on startup if stale or missing, then every 12h.
(async function refreshPredictionsOnBoot() {
  try {
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (memMB > 350) {
      console.warn('[startup] Skipping pre-match refresh — memory too high (' + memMB + 'MB)');
      return;
    }
    const cached = getScraperService().loadCachedPredictions();
    if (!cached || cached.isStale || !cached.matches || !cached.matches.length) {
      console.log('[startup] Pre-match cache missing or stale, refreshing...');
      await getScraperService().fetchPredictions();
      console.log('[startup] Pre-match predictions refreshed');
    } else {
      console.log('[startup] Pre-match cache OK, matches:', cached.matches.length);
    }
  } catch (e) {
    console.error('[startup] Pre-match refresh failed:', e.message);
  }
})();
setInterval(async function() {
  try {
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (memMB > 380) {
      console.warn('[cron] Skipping pre-match refresh — memory too high (' + memMB + 'MB)');
      return;
    }
    console.log('[cron] Refreshing pre-match predictions...');
    await getScraperService().fetchPredictions();
    console.log('[cron] Pre-match predictions refreshed');
  } catch (e) {
    console.error('[cron] Pre-match refresh failed:', e.message);
  }
}, 12 * 60 * 60 * 1000);

function getLiveTipsFromCache() {
  var liveData = getCachedLive();
  if (!liveData || !liveData.matches || !liveData.matches.length) return [];
  return buildGoldenTips(liveData);
}

startTelegramBot(
  getLiveTipsFromCache,
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TELEGRAM_CHAT_ID
);

startMastodonBot(
  getLiveTipsFromCache,
  process.env.MASTODON_INSTANCE_URL || 'https://flipboard.social',
  process.env.MASTODON_ACCESS_TOKEN
);

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
