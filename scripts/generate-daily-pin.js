const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const predictionsPath = path.join(__dirname, '..', 'predictions-cache.json');
const raw = JSON.parse(fs.readFileSync(predictionsPath, 'utf8'));

function getTopPick(section, tipType, label) {
  const matches = section
    .filter(m => m.tip && m.match)
    .sort((a, b) => (b.probability || 0) - (a.probability || 0));
  return matches.length ? { ...matches[0], tipType, label } : null;
}

const pick1x2 = getTopPick(raw.matches, '1X2', '1X2 Pick');
const pickOver25 = getTopPick(raw.over25Matches, 'O2.5', 'Over 2.5 Goals');
const pickBtts = getTopPick(raw.bttsMatches, 'BTTS', 'Both Teams to Score');

const pick = pick1x2 || pickOver25 || pickBtts;

if (!pick) {
  console.error('No predictions found');
  process.exit(1);
}

const teams = pick.match.split(' - ');
const homeWords = (teams[0] || '').split(' ');
const awayWords = (teams[1] || '').split(' ');
const prob = pick.probability || 0;
const league = pick.league || 'International';

function tipDisplay(tip) {
  if (tip === '1') return 'Home';
  if (tip === '2') return 'Away';
  if (tip === 'X') return 'Draw';
  if (tip === '1X') return 'Double Chance 1X';
  if (tip === 'X2') return 'Double Chance X2';
  return tip;
}

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric'
});

const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1080px; height: 1920px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      overflow: hidden;
      background: #0a0a14;
    }

    .bg {
      width: 100%; height: 100%;
      background: linear-gradient(160deg, #0a0a14 0%, #12122a 50%, #0d0d1a 100%);
      display: flex; flex-direction: column; align-items: center;
      padding: 24px 32px;
      position: relative;
    }

    .accent-line {
      position: absolute; top: 0; left: 0; right: 0; height: 6px;
      background: linear-gradient(90deg, #ff0000, #ff4444, #ff0000);
    }

    .decor-circle {
      position: absolute; border-radius: 50%; opacity: 0.04;
    }
    .c1 { width: 500px; height: 500px; background: #ff0000; top: -120px; right: -120px; }
    .c2 { width: 450px; height: 450px; background: #4444ff; bottom: -100px; left: -150px; }

    .logo-top {
      width: 100%; display: flex; justify-content: space-between; align-items: center;
      position: relative; z-index: 1;
    }
    .logo-top .brand {
      font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: -1px;
    }
    .logo-top .brand span { color: #ff0000; }
    .logo-top .date {
      font-size: 20px; color: #ffffff;
    }

    .main {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      position: relative; z-index: 1;
      gap: 0;
    }

    .type-line {
      font-size: 40px; font-weight: 700; color: #ffffff;
      text-transform: uppercase; letter-spacing: 8px;
      margin-bottom: 6px;
    }

    .league-line {
      font-size: 28px; color: #ffffff;
      text-transform: uppercase; letter-spacing: 4px;
      margin-bottom: 20px;
    }

    .team-word {
      font-size: 110px; font-weight: 900; color: #ffffff;
      line-height: 1.05; letter-spacing: -3px;
      text-align: center;
    }

    .vs-line {
      font-size: 64px; font-weight: 900; color: #ffffff;
      margin: 4px 0; letter-spacing: 12px;
      text-align: center;
    }

    .team-block-away {
      margin-bottom: 24px; text-align: center;
    }

    .pred-box {
      background: linear-gradient(135deg, #ff0000, #b30000);
      border-radius: 28px; padding: 20px 70px;
      text-align: center;
    }
    .pred-label {
      font-size: 20px; color: #ffffff;
      text-transform: uppercase; letter-spacing: 5px;
    }
    .pred-value {
      font-size: 120px; font-weight: 900; color: #ffffff;
      line-height: 1;
    }
    .pred-sub {
      font-size: 24px; color: #ffffff;
      text-transform: uppercase; letter-spacing: 3px;
    }

    .website-line {
      font-size: 60px; font-weight: 800; color: #ffffff;
      letter-spacing: 3px; margin: 18px 0 12px;
    }

    .prob-line {
      font-size: 56px; font-weight: 800; color: #ffffff;
      letter-spacing: 6px;
    }
    .prob-label {
      font-size: 18px; color: #ffffff;
      text-transform: uppercase; letter-spacing: 3px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="bg">
    <div class="accent-line"></div>
    <div class="decor-circle c1"></div>
    <div class="decor-circle c2"></div>

    <div class="logo-top">
      <div class="brand"><span>Win</span>Fulltime</div>
      <div class="date">${today}</div>
    </div>

    <div class="main">
      <div class="type-line">${pick.label}</div>
      <div class="league-line">${league}</div>

      ${homeWords.map(w => `<div class="team-word">${w}</div>`).join('')}

      <div class="vs-line">VS</div>

      <div class="team-block-away">
        ${awayWords.map(w => `<div class="team-word">${w}</div>`).join('')}
      </div>

      <div class="pred-box">
        <div class="pred-label">Tip</div>
        <div class="pred-value">${tipDisplay(pick.tip)}</div>
        <div class="pred-sub">${pick.tipType}</div>
      </div>

      <div class="website-line">winfulltime.com</div>

      <div class="prob-line">${prob}%</div>
      <div class="prob-label">Probability</div>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outPath = path.join(__dirname, '..', 'public', 'daily-tips-sample.png');
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  await browser.close();
  console.log('Sample pin saved to public/daily-tips-sample.png');
})();
