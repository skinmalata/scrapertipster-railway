const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

const THUMBS_DIR = path.join(__dirname, '..', 'public', 'blog', 'thumbnails');
const BLOG_DIR = path.join(__dirname, '..', 'public', 'blog');

const missing = [
  'gainsborough-trinity-never-relegated', 'makana-fa-prison-football', 'reece-wabara-retired-millionaire',
  'ferenc-puskas-seniors-debut', 'usain-bolt-100m-wind-aided', 'nicolas-jacksons-double-golden-boot', 'aberdeen-bayern-munich-2008',
  '1x2-betting-guide', 'accumulator-betting-strategy', 'asian-handicap-betting-guide',
  'avoid-betting-site-scams', 'bankroll-management-guide', 'bayern-psg-champions-league-preview-may-2026',
  'beginners-guide-football-betting', 'best-football-leagues-to-bet-on', 'best-football-prediction-apps',
  'best-payment-methods-kenya-nigeria', 'betting-community-vs-solo', 'betting-dictionary',
  'betting-exchanges-vs-bookmakers', 'betting-on-african-football-leagues', 'betting-on-draws',
  'betting-on-international-tournaments', 'betting-portfolio-multi-league', 'betting-site-verification-kyc',
  'betting-terms-glossary', 'booking-code-betting', 'bundesliga-betting-guide', 'cash-out-feature',
  'champions-league-betting-guide', 'corner-kick-betting-markets', 'cryptocurrency-betting-africa',
  'currency-conversion-fees-betting', 'decimal-vs-fractional-odds', 'deposits-withdrawals-m-pesa',
  'derby-betting-strategy', 'european-vs-african-football-betting', 'excel-betting-tracker',
  'expected-goals-xg-betting', 'fixture-congestion-fatigue-betting', 'football-betting-strategies',
  'football-tactics-betting', 'free-vs-paid-tipsters', 'home-away-form-betting',
  'how-to-read-football-betting-odds', 'injury-news-betting', 'inplay-betting-strategies',
  'la-liga-betting-guide', 'live-streaming-betting', 'mobile-vs-desktop-betting',
  'multi-outcome-betting', 'nigerian-bank-transfers-betting', 'premier-league-betting-guide',
  'premier-league-title-prediction-2026-who-will-win', 'referee-statistics-betting',
  'research-football-match-30-minutes', 'responsible-gambling-guide', 'serie-a-betting-guide',
  'set-piece-analysis-betting', 'setting-betting-limits', 'signs-problem-gambling',
  'time-based-betting', 'time-based-goal-betting', 'using-statistics-for-betting',
  'value-betting-explained', 'what-is-over-under-betting'
];

function slugToCategory(slug) {
  if (slug.includes('gainsborough') || slug.includes('makana-fa') || slug.includes('wabara') || slug.includes('puskas') || slug.includes('usain-bolt') || slug.includes('jacksons-double') || slug.includes('aberdeen-bayern')) return 'Stories';
  if (slug.includes('guide') && !slug.includes('betting')) return 'Guide';
  if (slug.includes('strategy') || slug.includes('system') || slug.includes('method') || slug.includes('kelly') || slug.includes('matched') || slug.includes('arbitrage') || slug.includes('contrarian') || slug.includes('hedge') || slug.includes('fibonacci') || slug.includes('in-play') || slug.includes('inplay') || slug.includes('motivation')) return 'Strategy';
  if (slug.includes('premier-league') || slug.includes('bayern') || slug.includes('bundesliga') || slug.includes('la-liga') || slug.includes('serie-a') || slug.includes('champions-league') || slug.includes('derby') || slug.includes('european-vs-african') || slug.includes('best-football-leagues') || slug.includes('referee') || slug.includes('research') || slug.includes('set-piece') || slug.includes('fixture') || slug.includes('tactics')) return 'Analysis';
  if (slug.includes('dictionary') || slug.includes('glossary') || slug.includes('terms') || slug.includes('beginner') || slug.includes('betting-community') || slug.includes('tipster') || slug.includes('portfolio') || slug.includes('sites') || slug.includes('bet9ja') || slug.includes('sportybet') || slug.includes('payment') || slug.includes('deposit') || slug.includes('currency') || slug.includes('crypto') || slug.includes('bank') || slug.includes('mobile') || slug.includes('live-streaming') || slug.includes('cash-out') || slug.includes('new-betting') || slug.includes('enhanced') || slug.includes('kyc') || slug.includes('scam') || slug.includes('bookmakers') || slug.includes('exchanges') || slug.includes('odds') || slug.includes('decimal') || slug.includes('fractional') || slug.includes('m-pesa') || slug.includes('nigerian') || slug.includes('live-betting') || slug.includes('accumulator-betting-sites') || slug.includes('best-betting-apps') || slug.includes('best-live') || slug.includes('signs') || slug.includes('responsible') || slug.includes('limits') || slug.includes('how-to-read')) return 'Guide';
  return 'Markets';
}

function getIcon(slug) {
  if (slug.includes('gainsborough')) return '🏛️';
  if (slug.includes('makana-fa')) return '⛓️';
  if (slug.includes('wabara')) return '👔';
  if (slug.includes('puskas')) return '🇭🇺';
  if (slug.includes('usain-bolt')) return '⚡';
  if (slug.includes('jacksons-double')) return '🥾';
  if (slug.includes('aberdeen-bayern')) return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  if (slug.includes('1x2') || slug.includes('match-result')) return '⚽';
  if (slug.includes('accumulator') || slug.includes('acca')) return '📊';
  if (slug.includes('asian-handicap')) return '📐';
  if (slug.includes('over-under') || slug.includes('what-is-over')) return '⬆️⬇️';
  if (slug.includes('btts') || slug.includes('both-teams')) return '🤝';
  if (slug.includes('value-betting') || slug.includes('value')) return '💰';
  if (slug.includes('statistics') || slug.includes('using-statistics') || slug.includes('head-to-head')) return '📈';
  if (slug.includes('bankroll') || slug.includes('kelly') || slug.includes('flat') || slug.includes('variable')) return '🏦';
  if (slug.includes('beginner') || slug.includes('beginners')) return '🎯';
  if (slug.includes('premier-league') || slug.includes('bundesliga') || slug.includes('la-liga') || slug.includes('serie-a')) return '🏆';
  if (slug.includes('champions-league') || slug.includes('bayern')) return '⭐';
  if (slug.includes('dictionary') || slug.includes('glossary') || slug.includes('terms')) return '📖';
  if (slug.includes('betting-on') || slug.includes('betting-community') || slug.includes('solo')) return '🌍';
  if (slug.includes('free-vs-paid') || slug.includes('tipster')) return '💡';
  if (slug.includes('cash-out')) return '💵';
  if (slug.includes('booking-code') || slug.includes('cards') || slug.includes('fouls')) return '🟨';
  if (slug.includes('corner')) return '🚩';
  if (slug.includes('penalty') || slug.includes('penalties')) return '⚪';
  if (slug.includes('offside') || slug.includes('throw') || slug.includes('possession') || slug.includes('shots')) return '📋';
  if (slug.includes('time-based') || slug.includes('multi-outcome') || slug.includes('multi-goals')) return '⏱️';
  if (slug.includes('draw-no-bet') || slug.includes('double-chance')) return '🛡️';
  if (slug.includes('correct-score') || slug.includes('scorecast')) return '🎯';
  if (slug.includes('half-time') || slug.includes('score-both') || slug.includes('winning-margin')) return '🔄';
  if (slug.includes('first-goal') || slug.includes('next-goal') || slug.includes('team-to-score') || slug.includes('goal-scorer') || slug.includes('clean-sheet')) return '🥅';
  if (slug.includes('fixed-match') || slug.includes('scam') || slug.includes('avoid')) return '🚫';
  if (slug.includes('crypto') || slug.includes('bitcoin') || slug.includes('usdt')) return '₿';
  if (slug.includes('currency') || slug.includes('conversion') || slug.includes('fees')) return '💱';
  if (slug.includes('m-pesa') || slug.includes('mpesa') || slug.includes('deposit')) return '📱';
  if (slug.includes('bank') || slug.includes('payment') || slug.includes('nigerian-bank')) return '🏦';
  if (slug.includes('live') || slug.includes('in-play') || slug.includes('inplay')) return '🔴';
  if (slug.includes('mobile') || slug.includes('app')) return '📲';
  if (slug.includes('live-streaming')) return '📺';
  if (slug.includes('bet9ja') || slug.includes('sportybet')) return '🥊';
  if (slug.includes('kitchen') || slug.includes('portfolio') || slug.includes('multi-league')) return '💼';
  if (slug.includes('referee') || slug.includes('stats')) return '👨‍⚖️';
  if (slug.includes('motivation') || slug.includes('psychology')) return '🧠';
  if (slug.includes('injury') || slug.includes('news')) return '🤕';
  if (slug.includes('weather') || slug.includes('rain') || slug.includes('wind')) return '🌧️';
  if (slug.includes('fixture') || slug.includes('fatigue') || slug.includes('congestion')) return '📅';
  if (slug.includes('tactics') || slug.includes('formation')) return '📋';
  if (slug.includes('poisson') || slug.includes('expected') || slug.includes('xg') || slug.includes('statistical') || slug.includes('model')) return '📊';
  if (slug.includes('form-analysis') || slug.includes('research')) return '🔍';
  if (slug.includes('european') || slug.includes('african')) return '🌐';
  if (slug.includes('new-betting-sites') || slug.includes('best-betting-sites') || slug.includes('best-accumulator') || slug.includes('best-live') || slug.includes('best-enhanced') || slug.includes('best-betting-apps') || slug.includes('betting-sites-fast')) return '🏅';
  if (slug.includes('kyc') || slug.includes('verification')) return '🪪';
  if (slug.includes('signs') || slug.includes('problem') || slug.includes('responsible') || slug.includes('gambling') || slug.includes('limits') || slug.includes('setting')) return '⚠️';
  if (slug.includes('betting-exchange') || slug.includes('bookmaker')) return '🔄';
  if (slug.includes('odd-even') || slug.includes('even')) return '🔢';
  if (slug.includes('over-under') || slug.includes('35-goals')) return '⚽⚽⚽⚽';
  if (slug.includes('multi') || slug.includes('range')) return '🔗';
  if (slug.includes('set-piece') || slug.includes('analysis')) return '📐';
  if (slug.includes('premier-league-title') || slug.includes('prediction')) return '🔮';
  if (slug.includes('how-to-read') || slug.includes('odds')) return '📏';
  if (slug.includes('decimal') || slug.includes('fractional')) return '🔢';
  return '⚽';
}

function getTitleFromHtml(slug) {
  const filePath = path.join(BLOG_DIR, slug + '.html');
  if (!fs.existsSync(filePath)) return slug.replace(/-/g, ' ');
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim();
  if (title) return title;
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return ogTitle;
  const metaTitle = $('title').text().trim();
  if (metaTitle) return metaTitle;
  return slug.replace(/-/g, ' ');
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let count = 0;
  for (const slug of missing) {
    const outPath = path.join(THUMBS_DIR, slug + '.webp');
    if (fs.existsSync(outPath)) {
      console.log(`SKIP (exists): ${slug}`);
      continue;
    }

    const title = getTitleFromHtml(slug);
    const category = slugToCategory(slug);
    const icon = getIcon(slug);

    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1200px; height: 630px; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }

    .bg {
      width: 1200px; height: 630px;
      background: #ffffff;
      display: flex; align-items: center;
      padding: 40px 60px; position: relative; gap: 50px;
      border: 1px solid #e5e5e5;
    }

    .accent-line {
      position: absolute; top: 0; left: 0; right: 0; height: 6px;
      background: linear-gradient(90deg, #ff0000, #cc0000);
    }

    .logo-text {
      position: absolute; top: 20px; left: 60px;
      font-size: 26px; font-weight: 900; color: #18181b; letter-spacing: -1px;
    }
    .logo-text span { color: #ff0000; }

    .category-badge {
      position: absolute; top: 22px; right: 60px;
      background: #fff0f0; border: 1px solid #ffcccc;
      padding: 6px 18px; border-radius: 20px; font-size: 13px; color: #ff0000;
      font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    }

    .left-panel {
      flex: 1; display: flex; flex-direction: column;
      justify-content: center; z-index: 1;
      padding-top: 10px;
    }

    .guide-label {
      font-size: 15px; color: #ff0000; font-weight: 700;
      text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;
    }

    h1 {
      font-size: 48px; font-weight: 900; color: #18181b;
      line-height: 1.08; margin-bottom: 12px;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      overflow: hidden; max-width: 95%;
    }

    .desc {
      font-size: 20px; color: #666; line-height: 1.4;
      margin-bottom: 16px; max-width: 90%;
    }

    .meta-row {
      display: flex; gap: 24px;
    }
    .meta-item {
      font-size: 14px; color: #888;
    }

    .right-panel {
      flex-shrink: 0; z-index: 1;
      display: flex; flex-direction: column; align-items: center;
      gap: 14px;
    }

    .icon-circle {
      width: 130px; height: 130px;
      background: #fff0f0; border: 2px solid #ffcccc;
      border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 52px;
    }

    .pill {
      background: #ff0000; border: none;
      padding: 10px 28px; border-radius: 30px;
      font-size: 14px; color: white; font-weight: 700;
    }

    .bottom-bar {
      position: absolute; bottom: 18px; left: 60px; right: 60px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .bottom-bar .url { font-size: 16px; font-weight: 700; color: #ff0000; }
    .bottom-bar .tagline { font-size: 13px; color: #999; }

    .decor-circle {
      position: absolute; border-radius: 50%;
    }
    .c1 { width: 300px; height: 300px; background: #fff5f5; top: -80px; right: -60px; }
    .c2 { width: 200px; height: 200px; background: #fff5f5; bottom: -50px; left: -40px; }
  </style>
</head>
<body>
  <div class="bg">
    <div class="accent-line"></div>
    <div class="decor-circle c1"></div>
    <div class="decor-circle c2"></div>

    <span class="logo-text"><span>Win</span>Fulltime</span>
    <span class="category-badge">&#128214; ${category}</span>

    <div class="left-panel">
      <div class="guide-label">${icon} ${category} Guide</div>
      <h1>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>
      <div class="desc">Expert football betting guide and strategies at WinFulltime</div>
      <div class="meta-row">
        <span class="meta-item">&#128197; Updated 2026</span>
        <span class="meta-item">&#9201; 10 min read</span>
        <span class="meta-item">&#128200; ${category}</span>
      </div>
    </div>

    <div class="right-panel">
      <div class="icon-circle">${icon}</div>
      <div class="pill">Free Predictions</div>
    </div>

    <div class="bottom-bar">
      <span class="url">winfulltime.com/blog</span>
      <span class="tagline">Free Football Predictions &amp; Betting Guides</span>
    </div>
  </div>
</body>
</html>`;

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await page.close();
    count++;
    console.log(`[${count}/59] ${slug}.webp`);
  }

  await browser.close();
  console.log(`\nDone! Generated ${count} thumbnails.`);
})();
