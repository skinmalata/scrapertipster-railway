const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://www.h2hstats.net/wp-content/themes/h2hstats/lib/call.php';
const CACHE_FILE = path.join(process.cwd(), 'btts-no-cache.json');

function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

async function fetchBttsNo(date) {
  const params = { show_finished: 1, date, category: 'h2hstreaks', filter: 'btsno', gmt: '0', sport: '1' };
  const { data } = await axios.get(API_URL, { params, timeout: 30000 });
  return data;
}

function parseBttsNoMatches(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('.match-card-second').each((_, card) => {
    const $card = $(card);
    const time = $card.find('.match-time').text().trim();
    const teamsText = $card.find('.match-teams').text().trim();
    const teams = teamsText.split(' - ').map(t => t.trim());
    if (teams.length < 2) return;
    const matchKey = `${teams[0]} - ${teams[1]}`;

    const subheader = $card.find('.match-subheader').text().trim();
    const oddsMatch = subheader.match(/BTTS - No:\s*([\d.]+)/);
    const odds = oddsMatch ? parseFloat(oddsMatch[1]) : 0;
    const leagueMatch = subheader.match(/»\s*(.+?)\s*$/);
    const league = leagueMatch ? leagueMatch[1].replace(/&raquo;/g, '|').trim() : '';

    const lines = $card.find('.match-history .match-line');
    if (lines.length < 3) return;

    let bttsNoCount = 0;
    const total = lines.length;

    lines.each((_, line) => {
      const lineText = $(line).text().trim();
      const scoreMatch = lineText.match(/(\d+)\s*:\s*(\d+)/);
      if (!scoreMatch) return;
      const h = parseInt(scoreMatch[1], 10);
      const a = parseInt(scoreMatch[2], 10);
      if (h > 0 && a > 0) return;
      bttsNoCount++;
    });

    if (total < 3) return;
    const probability = Math.round((bttsNoCount / total) * 100);
    if (probability < 60) return;

    results.push({
      match: matchKey,
      tip: 'BTTS NO',
      probability,
      league,
      date: new Date().toISOString().split('T')[0],
      time,
      odds,
      insights: [`${bttsNoCount}/${total} H2H BTTS No`, `Odds: ${odds}`, league]
    });
  });

  return results;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cached.date === new Date().toISOString().split('T')[0]) return cached;
      if (cached.matches && cached.matches.length > 0) return cached;
    }
  } catch (e) {}
  return null;
}

async function scrapeBttsNo(dates) {
  if (!Array.isArray(dates)) dates = [dates];
  const allMatches = [];

  for (const date of dates) {
    try {
      console.log(`[BTTS No] Fetching for ${date}...`);
      const html = await fetchBttsNo(date);
      const matches = parseBttsNoMatches(html);
      console.log(`[BTTS No] Found ${matches.length} matches for ${date}`);
      allMatches.push(...matches);
    } catch (err) {
      console.error(`[BTTS No] Failed for ${date}: ${err.message}`);
    }
  }

  const seen = new Set();
  const unique = allMatches.filter(m => {
    if (seen.has(m.match)) return false;
    seen.add(m.match);
    return true;
  });

  const result = {
    success: true,
    date: dates[0] || new Date().toISOString().split('T')[0],
    totalMatches: unique.length,
    matches: unique
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
  console.log(`[BTTS No] Saved ${unique.length} matches to cache`);
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dates = args.length > 0 ? args : [getDateStr(0), getDateStr(1)];
  scrapeBttsNo(dates)
    .then(r => {
      console.log(`\n=== BTTS NO MATCHES: ${r.totalMatches} ===`);
      r.matches.forEach(m => {
        console.log(`${m.match} | ${m.probability}% | ${m.league}`);
      });
    })
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
} else {
  module.exports = { scrapeBttsNo, loadCache };
}
