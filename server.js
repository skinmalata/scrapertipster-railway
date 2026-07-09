require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
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


// Noindex category query params on homepage (must be before static middleware)
app.use('/', (req, res, next) => {
  if (req.path === '/' && req.query.category) {
    res.set('X-Robots-Tag', 'noindex, follow');
  }
  next();
});

// Static files with no cache
app.use(express.static('public', {
  maxAge: 0,
  etag: false,
  lastModified: false
}));

// Railway handles HTTPS redirect at proxy level, skip in app

// API Routes
app.use('/api', apiRoutes);
app.use('/api', chatRoutes);

// RSS Feed
const RSS_FEED_ARTICLES_FILE = path.join(__dirname, 'articles-manifest.json');

app.get('/feed.xml', (req, res) => {
  try {
    const rssFs = require('fs');
    const data = rssFs.readFileSync(RSS_FEED_ARTICLES_FILE, 'utf8');
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
    const subscriberFs = require('fs');
    let subscribers = [];
    if (subscriberFs.existsSync(SUBSCRIBERS_FILE)) {
      subscribers = JSON.parse(subscriberFs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
    if (!subscribers.some(s => s.email === email)) {
      subscribers.push({ email, subscribedAt: new Date().toISOString() });
      subscriberFs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
      console.log('New subscriber:', email);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Subscribe error:', e.message);
    res.json({ success: false });
  }
});

// View subscribers (GET for admin)
app.get('/api/subscribers', (req, res) => {
  try {
    const subscriberFs = require('fs');
    if (subscriberFs.existsSync(SUBSCRIBERS_FILE)) {
      const data = JSON.parse(subscriberFs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
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
  const fs = require('fs');
  
  // First try without .html (if already exists as static file)
  let filePath = path.join(__dirname, 'public', 'blog', slug + '.html');
  
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath, { maxAge: 0 });
  }
  
  // If not found, redirect to blog index
  res.redirect('/blog/');
});

// Rebuild static public/data/predictions.json from cache files
function rebuildStaticPredictions() {
  try {
    const ghPagesScraper = require('./scripts/gh-pages-scraper');
    if (typeof ghPagesScraper.rebuildStatic === 'function') {
      ghPagesScraper.rebuildStatic();
    } else {
      // Fallback: run the script as a child process
      const { execSync } = require('child_process');
      execSync('node scripts/gh-pages-scraper.js', { timeout: 120000, cwd: __dirname });
    }
  } catch (e) {
    console.error('Failed to rebuild static predictions:', e.message);
  }
}

// Scheduled Tasks
// Run daily at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled daily prediction fetch...');
  try {
    const data = await getScraperService().fetchAndCachePredictions();
    console.log('Scheduled fetch completed. Matches found:', data.totalMatches);
    rebuildStaticPredictions();
  } catch (error) {
    console.error('Scheduled fetch error:', error.message);
  }
});

// Run secondary scrape at 6:00 AM to catch late-appearing matches
cron.schedule('0 6 * * *', async () => {
  console.log('Running secondary scrape to capture missed matches...');
  try {
    const data = await getScraperService().fetchPredictions();
    console.log('Secondary scrape completed. Total matches:', data.totalMatches);
    if (data.recoveredMatches) {
      console.log(`Recovered ${data.recoveredMatches} missed matches from previous scrape`);
    }
    rebuildStaticPredictions();
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

// Pinterest auto-posting - daily pin generation + posting
async function runPinterestPipeline() {
  if (process.env.PINTEREST_AUTO_POST !== 'true') {
    console.log('Pinterest auto-posting disabled (PINTEREST_AUTO_POST != true)');
    return;
  }
  if (!process.env.PINTEREST_ACCESS_TOKEN || !process.env.PINTEREST_BOARD_ID) {
    console.log('Pinterest credentials missing, skipping auto-post');
    return;
  }

  console.log('Running Pinterest pipeline...');

  try {
    const { execSync } = require('child_process');
    const scriptDir = __dirname;

    // Generate fresh pins from predictions cache
    console.log('Generating daily pins...');
    execSync('node scripts/generate-daily-pins.js', {
      cwd: scriptDir,
      timeout: 180000,
      stdio: 'pipe'
    });
    console.log('Pin generation complete.');

    // Check if we should also post (not just generate)
    const shouldPost = process.env.PINTEREST_POST === 'true';
    if (shouldPost) {
      console.log('Posting pins to Pinterest...');
      execSync('node scripts/post-to-pinterest.js', {
        cwd: scriptDir,
        timeout: 300000,
        stdio: 'pipe'
      });
      console.log('Pinterest posting complete.');
    }
  } catch (error) {
    console.error('Pinterest pipeline error:', error.message);
  }
}

// Run Pinterest pipeline daily at 3:00 AM (after prediction fetches)
cron.schedule('0 3 * * *', () => {
  runPinterestPipeline();
});

// H2H Unbeaten Streaks Scraper - daily at 12:10 AM WAT
const scrapeH2h = require('./scripts/scrape-h2h-unbeaten');
const { scrapeUnbeatenStreaks } = scrapeH2h;
cron.schedule('10 23 * * *', async () => {
  console.log('Running H2H unbeaten streaks scrape...');
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await scrapeUnbeatenStreaks([today, tomorrow]);
    console.log('H2H unbeaten streaks scrape completed');
  } catch (error) {
    console.error('H2H unbeaten streaks error:', error.message);
  }
});

// Auto-publish scheduled articles daily at 6:00 AM
const fs = require('fs');
const ARTICLES_FILE = path.join(__dirname, 'articles-manifest.json');

function loadArticlesManifest() {
  try {
    const data = fs.readFileSync(ARTICLES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.log('No articles manifest found:', e.message);
    return [];
  }
}

function saveArticlesManifest(articles) {
  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2));
}

function publishScheduledArticles() {
  console.log('Checking for scheduled articles to publish...');
  const articles = loadArticlesManifest();
  const today = new Date().toISOString().split('T')[0];
  
  let published = 0;
  const updatedArticles = articles.map(article => {
    if (!article.published && article.publishDate === today) {
      console.log(`Publishing article: ${article.title}`);
      published++;
      return { ...article, published: true };
    }
    return article;
  });
  
  if (published > 0) {
    saveArticlesManifest(updatedArticles);
    updateSitemap();
    console.log(`Published ${published} article(s) today`);
  } else {
    console.log('No articles scheduled for today');
  }
}

function updateSitemap() {
  const fs = require('fs');
  const articles = loadArticlesManifest();
  const today = new Date().toISOString().split('T')[0];
  
  let blogUrls = '';
  
  articles.forEach(article => {
    if (article.published) {
      blogUrls += `  <url>
    <loc>https://winfulltime.com/blog/${article.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }
  });
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://winfulltime.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/options.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/analysis.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/about.html</loc>
    <lastmod>2026-04-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/contact.html</loc>
    <lastmod>2026-04-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/privacy.html</loc>
    <lastmod>2026-04-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://winfulltime.com/terms.html</loc>
    <lastmod>2026-04-06</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <!-- Blog Index -->
  <url>
    <loc>https://winfulltime.com/blog/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${blogUrls}
</urlset>`;
  
  fs.writeFileSync(path.join(__dirname, 'public', 'sitemap.xml'), sitemap);
  console.log('Sitemap updated with published articles');
}

// Run at 6:00 AM daily to check for articles to publish
cron.schedule('0 6 * * *', () => {
  publishScheduledArticles();
});

// Also check on server startup
setTimeout(() => {
  publishScheduledArticles();
}, 10000);

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
  
  getScraperService().fetchAndCachePredictions()
    .then(data => {
      console.log('Initial fetch completed. Matches found:', data.totalMatches);
      predictionsCache = data;
      rebuildStaticPredictions();
    })
    .catch(err => console.error('Initial fetch error:', err.message));
  
  // Initial H2H unbeaten scrape
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    scrapeUnbeatenStreaks([today, tomorrow])
      .then(() => console.log('Initial H2H unbeaten scrape completed'))
      .catch(err => console.error('Initial H2H unbeaten error:', err.message));
  } catch (err) {
    console.error('Initial H2H unbeaten error:', err.message);
  }
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
