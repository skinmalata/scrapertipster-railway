const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const predictionsPath = path.join(__dirname, '..', 'predictions-cache.json');
const outDir = path.join(__dirname, '..', 'public', 'pins');

if (!fs.existsSync(predictionsPath)) {
  console.error('predictions-cache.json not found');
  process.exit(1);
}
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const raw = JSON.parse(fs.readFileSync(predictionsPath, 'utf8'));

function getTopPicks(section, tipType, label, count) {
  return section
    .filter(m => m.tip && m.match && m.match.includes(' - '))
    .sort((a, b) => (b.probability || 0) - (a.probability || 0))
    .slice(0, count)
    .map(m => ({ ...m, tipType, label }));
}

const picks = [
  ...getTopPicks(raw.matches, '1X2', '1X2 Pick', 5),
  ...getTopPicks(raw.over25Matches, 'O2.5', 'Over 2.5 Goals', 5),
  ...getTopPicks(raw.over15Matches, 'O1.5', 'Over 1.5 Goals', 5),
  ...getTopPicks(raw.bttsMatches, 'BTTS', 'Both Teams to Score', 5)
];

if (!picks.length) {
  console.error('No predictions found');
  process.exit(1);
}

console.log(`Generating ${picks.length} pins...`);

function tipDisplay(tip, tipType) {
  if (tip === '1') return 'Home';
  if (tip === '2') return 'Away';
  if (tip === 'X') return 'Draw';
  return tip;
}

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric'
});

function buildHtml(pick) {
  const teams = pick.match.split(' - ');
  const homeWords = (teams[0] || '').split(' ');
  const awayWords = (teams[1] || '').split(' ');
  const prob = pick.probability || 0;
  const league = pick.league || 'International';

  return `<!DOCTYPE html>
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
    .logo-top .brand { font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: -1px; }
    .logo-top .brand span { color: #ff0000; }
    .logo-top .date { font-size: 20px; color: #ffffff; }
    .main {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      position: relative; z-index: 1;
    }
    .type-line {
      font-size: 40px; font-weight: 700; color: #ffffff;
      text-transform: uppercase; letter-spacing: 8px; margin-bottom: 6px;
    }
    .league-line {
      font-size: 28px; color: #ffffff;
      text-transform: uppercase; letter-spacing: 4px; margin-bottom: 20px;
    }
    .team-word {
      font-size: 110px; font-weight: 900; color: #ffffff;
      line-height: 1.05; letter-spacing: -3px; text-align: center;
    }
    .vs-line {
      font-size: 64px; font-weight: 900; color: #ffffff;
      margin: 4px 0; letter-spacing: 12px; text-align: center;
    }
    .team-block-away { margin-bottom: 24px; text-align: center; }
    .pred-box {
      background: linear-gradient(135deg, #ff0000, #b30000);
      border-radius: 28px; padding: 20px 70px; text-align: center;
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
        <div class="pred-value">${tipDisplay(pick.tip, pick.tipType)}</div>
        <div class="pred-sub">${pick.tipType}</div>
      </div>
      <div class="website-line">winfulltime.com</div>
      <div class="prob-line">${prob}%</div>
      <div class="prob-label">Probability</div>
    </div>
  </div>
</body>
</html>`;
}

function sanitizeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const slug = sanitizeSlug(pick.match);
    const filename = `${String(i + 1).padStart(2, '0')}-${slug}.png`;
    const outPath = path.join(outDir, filename);

    const html = buildHtml(pick);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await page.close();
    const size = fs.statSync(outPath).size;
    console.log(`[${i + 1}/${picks.length}] ${filename} (${Math.round(size / 1024)}KB)`);
  }

  // Save metadata manifest for the poster script
  const manifest = picks.map((pick, i) => {
    const slug = sanitizeSlug(pick.match);
    const filename = `${String(i + 1).padStart(2, '0')}-${slug}.png`;
    const teams = pick.match.split(' - ');
    return {
      filename,
      match: pick.match,
      home: teams[0] || '',
      away: teams[1] || '',
      tip: pick.tip,
      tipType: pick.tipType,
      label: pick.label,
      probability: pick.probability,
      league: pick.league || 'International'
    };
  });
  fs.writeFileSync(path.join(outDir, '.manifest.json'), JSON.stringify(manifest, null, 2));

  await browser.close();
  console.log(`\nDone! ${picks.length} pins saved to public/pins/`);
})();
