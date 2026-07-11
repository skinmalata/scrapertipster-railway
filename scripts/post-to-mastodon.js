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
const UNBEATEN_CACHE = path.join(__dirname, '..', 'h2h-unbeaten-cache.json');

if (!fs.existsSync(CACHE_FILE)) {
  console.error('predictions-cache.json not found');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const today = new Date().toISOString().split('T')[0];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function truncateStatus(status) {
  if (status.length > 500) {
    return status.substring(0, 497) + '...';
  }
  return status;
}

// ─── Category builders ────────────────────────────────────────────

function build1x2() {
  const matches = (cache.matches || []).filter(m => m.date === today);
  if (!matches.length) return null;

  const sorted = [...matches].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const top = sorted.slice(0, 5);

  const tipText = t => t === '1' ? 'Home Win' : t === '2' ? 'Away Win' : t === 'X' ? 'Draw' : t;

  let status = `📊 WinFulltime — 1X2 Picks\n${formatDate(today)}\n${matches.length} matches analyzed.\n\nTop picks:\n`;
  for (const m of top) {
    const prob = m.probability || 0;
    const line = `• ${m.match} — ${tipText(m.tip)} (${prob}%)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #1X2`;
  return truncateStatus(status);
}

function buildOver15() {
  const matches = (cache.over15Matches || []).filter(m => m.date === today);
  if (!matches.length) return null;

  const sorted = [...matches].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const top = sorted.slice(0, 5);

  let status = `📊 WinFulltime — Over 1.5 Picks\n${formatDate(today)}\n${matches.length} matches analyzed.\n\nTop picks:\n`;
  for (const m of top) {
    const prob = m.probability || 0;
    const line = `• ${m.match} (${prob}%)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #Over1_5`;
  return truncateStatus(status);
}

function buildOver25() {
  const matches = (cache.over25Matches || []).filter(m => m.date === today);
  if (!matches.length) return null;

  const sorted = [...matches].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const top = sorted.slice(0, 5);

  let status = `📊 WinFulltime — Over 2.5 Picks\n${formatDate(today)}\n${matches.length} matches analyzed.\n\nTop picks:\n`;
  for (const m of top) {
    const prob = m.probability || 0;
    const line = `• ${m.match} (${prob}%)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #Over2_5`;
  return truncateStatus(status);
}

function buildBttsYes() {
  const matches = (cache.bttsMatches || []).filter(m => m.date === today);
  if (!matches.length) return null;

  const sorted = [...matches].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const top = sorted.slice(0, 5);

  let status = `📊 WinFulltime — BTTS Yes Picks\n${formatDate(today)}\n${matches.length} matches analyzed.\n\nTop picks:\n`;
  for (const m of top) {
    const prob = m.probability || 0;
    const line = `• ${m.match} (${prob}%)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #BTTS`;
  return truncateStatus(status);
}

function buildBttsNo() {
  const matches = (cache.bttsNoMatches || []).filter(m => m.date === today);
  if (!matches.length) return null;

  const sorted = [...matches].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  const top = sorted.slice(0, 5);

  let status = `📊 WinFulltime — BTTS No Picks\n${formatDate(today)}\n${matches.length} matches analyzed.\n\nTop picks:\n`;
  for (const m of top) {
    const prob = m.probability || 0;
    const line = `• ${m.match} (${prob}%)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #BTTSNo`;
  return truncateStatus(status);
}

function buildUnbeaten() {
  if (!fs.existsSync(UNBEATEN_CACHE)) return null;
  const ucache = JSON.parse(fs.readFileSync(UNBEATEN_CACHE, 'utf8'));
  const dayData = ucache.dates?.[today];
  if (!dayData || !dayData.length) return null;

  const top = dayData.slice(0, 5);
  let status = `📊 WinFulltime — Unbeaten Streaks\n${formatDate(today)}\n${dayData.length} streaks tracked.\n\nTop picks:\n`;
  for (const m of top) {
    const best = m.streaks?.[0];
    if (!best) continue;
    const line = `• ${m.match} — ${best.team} (${best.count} games)\n`;
    if ((status + line).length > 480) break;
    status += line;
  }
  status += `\nhttps://winfulltime.com\n#FootballPredictions #SoccerTips #Unbeaten`;
  return truncateStatus(status);
}

// ─── Post to Mastodon ─────────────────────────────────────────────

async function postToMastodon(status, idempotencyKey) {
  const url = `${INSTANCE_URL.replace(/\/+$/, '')}/api/v1/statuses`;

  const response = await axios.post(url, {
    status,
    visibility: 'public'
  }, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    }
  });

  return response.data;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: '1X2',         key: '1x2',         build: build1x2 },
  { name: 'Over 1.5',    key: 'over15',      build: buildOver15 },
  { name: 'Over 2.5',    key: 'over25',      build: buildOver25 },
  { name: 'BTTS Yes',    key: 'btts',        build: buildBttsYes },
  { name: 'BTTS No',     key: 'bttsno',      build: buildBttsNo },
  { name: 'Unbeaten',    key: 'unbeaten',    build: buildUnbeaten },
];

async function main() {
  let posted = 0;
  let failed = 0;

  for (const cat of CATEGORIES) {
    const status = cat.build();
    if (!status) {
      console.log(`[${cat.name}] No data for ${today}, skipping`);
      continue;
    }

    const key = `winfulltime-${today}-${cat.key}`;
    console.log(`\n[${cat.name}] Posting (${status.length} chars):`);
    console.log('---');
    console.log(status);
    console.log('---');

    try {
      const data = await postToMastodon(status, key);
      console.log(`[${cat.name}] Posted! URL: ${data.url || data.uri || 'N/A'}`);
      posted++;
    } catch (err) {
      const msg = err.response?.data || err.message;
      console.error(`[${cat.name}] Failed:`, JSON.stringify(msg));
      failed++;
    }

    // 2 second delay between posts to avoid rate limits
    await delay(2000);
  }

  console.log(`\nDone. ${posted} posted, ${failed} failed.`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
