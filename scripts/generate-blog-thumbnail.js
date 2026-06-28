const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
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
      font-size: 56px; font-weight: 900; color: #18181b;
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
    <span class="category-badge">&#128214; Blog</span>

    <div class="left-panel">
      <div class="guide-label">&#128218; Beginner's Guide</div>
      <h1>Beginner's Guide to Football Betting in 2026</h1>
      <div class="desc">Learn how odds work, types of bets, bankroll management, and responsible gambling.</div>
      <div class="meta-row">
        <span class="meta-item">&#128197; Updated 2026</span>
        <span class="meta-item">&#9201; 10 min read</span>
        <span class="meta-item">&#128200; Beginner</span>
      </div>
    </div>

    <div class="right-panel">
      <div class="icon-circle">&#9917;</div>
      <div class="pill">Free Predictions</div>
    </div>

    <div class="bottom-bar">
      <span class="url">winfulltime.com/blog</span>
      <span class="tagline">Free AI Football Predictions &amp; Betting Guides</span>
    </div>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outPath = path.join(__dirname, '..', 'public', 'blog-thumbnail-sample.png');
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log('Blog thumbnail saved to public/blog-thumbnail-sample.png');
})();
