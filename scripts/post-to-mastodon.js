require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const INSTANCE_URL = process.env.MASTODON_INSTANCE_URL || 'https://flipboard.social';
const ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('MASTODON_ACCESS_TOKEN not set in .env');
  process.exit(1);
}

const CACHE_FILE = path.join(__dirname, '..', 'predictions-cache.json');

if (!fs.existsSync(CACHE_FILE)) {
  console.error('predictions-cache.json not found');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

const { matches, dates, totalMatches } = cache;

if (!matches || matches.length === 0) {
  console.log('No matches in cache, nothing to post');
  process.exit(0);
}

const today = new Date().toISOString().split('T')[0];
const todayMatches = matches.filter(m => m.date === today);

if (todayMatches.length === 0) {
  console.log(`No matches for ${today}, skipping post`);
  process.exit(0);
}

const sorted = [...todayMatches].sort((a, b) => {
  const pA = a.probabilities ? Math.max(a.probabilities.homeWin || 0, a.probabilities.awayWin || 0, a.probabilities.draw || 0) : 0;
  const pB = b.probabilities ? Math.max(b.probabilities.homeWin || 0, b.probabilities.awayWin || 0, b.probabilities.draw || 0) : 0;
  return pB - pA;
});

function tipText(tip) {
  if (tip === '1') return 'Home Win';
  if (tip === '2') return 'Away Win';
  if (tip === 'X') return 'Draw';
  return tip;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildStatus() {
  const dateFormatted = formatDate(today);
  let status = `📊 WinFulltime Daily Predictions\n${dateFormatted}\n\n${todayMatches.length} matches analyzed today.\n\n`;

  const topPicks = sorted.slice(0, 5);

  status += 'Top picks:\n';
  for (const m of topPicks) {
    const prob = m.probabilities ? Math.max(m.probabilities.homeWin || 0, m.probabilities.awayWin || 0, m.probabilities.draw || 0) : 0;
    const league = m.league || '';
    const leaguePrefix = league ? `[${league}] ` : '';
    status += `• ${leaguePrefix}${m.match} — ${tipText(m.tip)} (${prob}%)\n`;
  }

  status += `\n📈 Full predictions: https://winfulltime.com\n#FootballPredictions #SoccerTips`;

  if (status.length > 500) {
    status = `📊 WinFulltime Daily Predictions\n${dateFormatted}\n\n${todayMatches.length} matches analyzed.\n\nTop picks:\n`;
    for (const m of topPicks) {
      const prob = m.probabilities ? Math.max(m.probabilities.homeWin || 0, m.probabilities.awayWin || 0, m.probabilities.draw || 0) : 0;
      const line = `• ${m.match} — ${tipText(m.tip)} (${prob}%)\n`;
      if ((status + line).length > 480) break;
      status += line;
    }
    status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips`;
  }

  if (status.length > 500) {
    status = status.substring(0, 497) + '...';
  }

  return status;
}

async function postToMastodon(status) {
  const url = `${INSTANCE_URL.replace(/\/+$/, '')}/api/v1/statuses`;

  const response = await axios.post(url, {
    status,
    visibility: 'public'
  }, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `winfulltime-${today}`
    }
  });

  return response.data;
}

const status = buildStatus();
console.log('Posting to Mastodon:');
console.log('---');
console.log(status);
console.log('---');
console.log(`Length: ${status.length} chars`);

postToMastodon(status)
  .then(data => {
    console.log('Posted successfully!');
    console.log('URL:', data.url || data.uri || 'N/A');
    process.exit(0);
  })
  .catch(err => {
    const msg = err.response?.data || err.message;
    console.error('Failed to post:', JSON.stringify(msg));
    process.exit(1);
  });
