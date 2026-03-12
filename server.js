require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const apiRoutes = require('./src/routes/api');
const scraperService = require('./src/services/scraper');

const app = express();
const PORT = process.env.PORT || 3002;

// Visitor Analytics (in-memory storage)
const visitorData = {
  visits: [],
  dailyStats: {},
  pageViews: {}
};

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

app.use(cors());
app.use(express.json());
app.use(rateLimiter);
app.use(trackVisit);

// Static files
app.use(express.static('public'));

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

// Initial Fetch
setTimeout(async () => {
  const SKIP_INITIAL_FETCH = process.env.SKIP_INITIAL_FETCH === 'true' || process.argv.includes('--skip-fetch');
  if (SKIP_INITIAL_FETCH) {
    console.log('Skipping initial fetch');
    return;
  }
  
  console.log('Running initial prediction fetch...');
  try {
    const data = await scraperService.fetchAndCachePredictions();
    console.log('Initial fetch completed. Matches found:', data.totalMatches);
  } catch (error) {
    console.error('Initial fetch error:', error.message);
  }
}, 5000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
});

module.exports = app;
