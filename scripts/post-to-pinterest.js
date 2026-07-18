require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const PINS_DIR = path.join(__dirname, '..', 'public', 'pins');
const POSTED_LOG = path.join(PINS_DIR, '.posted.json');
const MANIFEST = path.join(PINS_DIR, '.manifest.json');

const ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN;
const BOARD_ID = process.env.PINTEREST_BOARD_ID;

const API_BASE = process.env.PINTEREST_SANDBOX === 'true'
  ? 'https://api-sandbox.pinterest.com/v5'
  : 'https://api.pinterest.com/v5';

if (!ACCESS_TOKEN) {
  console.error('PINTEREST_ACCESS_TOKEN not set in .env');
  process.exit(1);
}
if (!BOARD_ID) {
  console.error('PINTEREST_BOARD_ID not set in .env');
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  console.error('No manifest found. Run generate-daily-pins.js first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

function loadPosted() {
  try {
    if (fs.existsSync(POSTED_LOG)) {
      return JSON.parse(fs.readFileSync(POSTED_LOG, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function savePosted(posted) {
  fs.writeFileSync(POSTED_LOG, JSON.stringify(posted, null, 2));
}

function tipDisplay(tip) {
  if (tip === '1') return 'Home Win';
  if (tip === '2') return 'Away Win';
  if (tip === 'X') return 'Draw';
  if (tip === '1X') return 'Double Chance 1X';
  if (tip === 'X2') return 'Double Chance X2';
  return tip;
}

function sanitizeTitle(match, tipType) {
  const teams = match.replace(/\s*-\s*/g, ' vs ');
  return `${teams} - ${tipType} Prediction | WinFulltime`;
}

function buildDescription(match, tipType, tip, probability, league) {
  const teams = match.replace(/\s*-\s*/g, ' vs ');
  return `🔥 ${teams} - ${tipType} Prediction

📊 Tip: ${tipDisplay(tip)}
📈 Probability: ${probability}%
🏆 ${league}

Get more free daily predictions at winfulltime.com

#FootballPredictions #BettingTips #${tipType.replace(/[\s.]+/g, '')} #Soccer #DailyTips #WinFulltime`;
}

function buildAltText(match, tipType, tip, probability) {
  const teams = match.replace(/\s*-\s*/g, ' vs ');
  return `Football prediction: ${teams} - ${tipType} tip ${tipDisplay(tip)} with ${probability}% probability. Visit WinFulltime.com for free daily predictions.`;
}

async function postPin(imagePath, title, description, altText) {
  const imgData = fs.readFileSync(imagePath);
  const b64 = imgData.toString('base64');

  const response = await axios.post(`${API_BASE}/pins`, {
    board_id: BOARD_ID,
    title,
    description,
    alt_text: altText,
    media_source: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data: b64
    }
  }, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });

  return response.data;
}

(async () => {
  const posted = loadPosted();
  const toPost = manifest.filter(m => !posted.includes(m.filename));

  if (!toPost.length) {
    console.log('All pins already posted today');
    process.exit(0);
  }

  console.log(`Posting ${toPost.length} pins to Pinterest...\n`);

  let postedCount = 0;

  for (const item of toPost) {
    try {
      const imagePath = path.join(PINS_DIR, item.filename);
      if (!fs.existsSync(imagePath)) {
        console.log(`  - ${item.filename} not found, skipping`);
        continue;
      }

      const title = sanitizeTitle(item.match, item.tipType);
      const description = buildDescription(item.match, item.tipType, item.tip, item.probability, item.league);
      const altText = buildAltText(item.match, item.tipType, item.tip, item.probability);

      const result = await postPin(imagePath, title, description, altText);
      posted.push(item.filename);
      savePosted(posted);
      postedCount++;
      console.log(`  ✓ ${item.filename} → pin/${result.id}`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error(`  ✗ ${item.filename}: ${msg}`);

      if (err.response?.status === 429) {
        console.log('Rate limited. Stopping.');
        break;
      }
      if (err.response?.status === 403 || err.response?.status === 401) {
        console.error('Auth/access error. Upgrade app or check token.');
        break;
      }
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! Posted ${postedCount} pins`);
})();
