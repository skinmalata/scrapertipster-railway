const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 1000px; height: 1500px; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }

    .bg {
      width: 100%; height: 100%;
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 40%, #0d0d1a 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 60px 40px; position: relative;
    }

    .accent-line {
      position: absolute; top: 0; left: 0; right: 0; height: 8px;
      background: linear-gradient(90deg, #ff0000, #cc0000, #ff4444);
    }

    .logo-area {
      display: flex; align-items: center; gap: 14px; margin-bottom: 40px;
    }
    .logo-text {
      font-size: 42px; font-weight: 900; color: white; letter-spacing: -1px;
    }
    .logo-text span { color: #ff0000; }

    .badge {
      background: rgba(255,0,0,0.15); border: 1px solid rgba(255,0,0,0.3);
      padding: 10px 28px; border-radius: 30px; font-size: 18px; color: #ff4444;
      font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
      margin-bottom: 50px;
    }

    .match-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px; padding: 50px 60px;
      width: 100%; max-width: 800px;
      backdrop-filter: blur(10px);
    }

    .league {
      text-align: center; font-size: 16px; color: #888;
      text-transform: uppercase; letter-spacing: 3px; margin-bottom: 30px;
    }

    .teams {
      display: flex; align-items: center; justify-content: center;
      gap: 30px; margin-bottom: 40px;
    }
    .team {
      text-align: center;
    }
    .team-name {
      font-size: 36px; font-weight: 800; color: white;
    }
    .team-label {
      font-size: 14px; color: #666; margin-top: 6px;
      text-transform: uppercase; letter-spacing: 1px;
    }
    .vs {
      font-size: 28px; font-weight: 900; color: #ff0000;
    }

    .prediction-box {
      background: linear-gradient(135deg, #ff0000, #cc0000);
      border-radius: 16px; padding: 28px 40px;
      text-align: center; margin: 0 20px 30px;
    }
    .prediction-label {
      font-size: 16px; color: rgba(255,255,255,0.7);
      text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px;
    }
    .prediction-value {
      font-size: 52px; font-weight: 900; color: white;
    }

    .stats-row {
      display: flex; justify-content: center; gap: 40px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 28px; font-weight: 800; color: #ff4444;
    }
    .stat-label {
      font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;
    }

    .divider {
      width: 60%; height: 1px; background: rgba(255,255,255,0.1);
      margin: 50px auto;
    }

    .footer-text {
      text-align: center;
    }
    .footer-text .url {
      font-size: 22px; font-weight: 600; color: #ff4444;
    }
    .footer-text .tagline {
      font-size: 15px; color: #555; margin-top: 8px;
    }

    .decor-circle {
      position: absolute; border-radius: 50%; opacity: 0.04;
    }
    .c1 { width: 500px; height: 500px; background: #ff0000; top: -100px; right: -100px; }
    .c2 { width: 400px; height: 400px; background: #4444ff; bottom: -80px; left: -120px; }
  </style>
</head>
<body>
  <div class="bg">
    <div class="accent-line"></div>
    <div class="decor-circle c1"></div>
    <div class="decor-circle c2"></div>

    <div class="logo-area">
      <span class="logo-text"><span>Win</span>Fulltime</span>
    </div>
    <div class="badge">&#9201; Football Predictions</div>

    <div class="match-card">
      <div class="league">&#9917; Premier League</div>
      <div class="teams">
        <div class="team">
          <div class="team-name">Man City</div>
          <div class="team-label">Home</div>
        </div>
        <div class="vs">vs</div>
        <div class="team">
          <div class="team-name">Liverpool</div>
          <div class="team-label">Away</div>
        </div>
      </div>
      <div class="prediction-box">
        <div class="prediction-label">Prediction</div>
        <div class="prediction-value">BTTS YES</div>
      </div>
      <div class="stats-row">
        <div class="stat">
          <div class="stat-value">78%</div>
          <div class="stat-label">Probability</div>
        </div>
        <div class="stat">
          <div class="stat-value">1.65</div>
          <div class="stat-label">Avg Odds</div>
        </div>
        <div class="stat">
          <div class="stat-value">85%</div>
          <div class="stat-label">Confidence</div>
        </div>
      </div>
    </div>

    <div class="divider"></div>
    <div class="footer-text">
      <div class="url">winfulltime.com</div>
      <div class="tagline">Free AI Football Predictions &bull; Daily Tips</div>
    </div>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1500 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outPath = path.join(__dirname, '..', 'public', 'pin-template.png');
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log('Pin image saved to public/pin-template.png');
})();
