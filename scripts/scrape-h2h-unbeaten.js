const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.h2hstats.net';
const API_URL = `${BASE_URL}/wp-content/themes/h2hstats/lib/call.php`;
const CACHE_FILE = path.join(process.cwd(), 'h2h-unbeaten-cache.json');
const MIN_STREAK = 7;

function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

async function fetchOverview(date) {
  const params = { show_finished: 0, date, category: 'overview', filter: '', gmt: '0', sport: '1' };
  const { data } = await axios.get(API_URL, { params, timeout: 30000 });
  return data;
}

function parseUnbeatenStreaks(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('.match-card').each((_, card) => {
    const $card = $(card);
    const time = $card.find('.match-time').clone().children().remove().end().text().trim();
    const league = $card.find('.match-league-overview').text().replace('|', '').trim();
    const teams = [];
    $card.find('.match-teams .team').each((_, t) => {
      teams.push($(t).text().trim());
    });
    if (teams.length < 2) return;
    const matchKey = `${teams[0]} - ${teams[1]}`;

    const streaks = [];
    $card.find('.streak-item').each((_, item) => {
      const $item = $(item);
      const countText = $item.find('.streak-count').text().trim();
      const rawText = $item.find('.streak-text').text().trim();
      const count = parseInt(countText, 10);

      if (isNaN(count)) return;

      const isUnbeaten = rawText.toLowerCase().includes('unbeaten');
      if (!isUnbeaten) return;

      let team = '';
      let location = '';

      let m = rawText.match(/matches in a row where\s+(.+?)\s+was\s+unbeaten(?:\s+(at home|away))?$/i);
      if (!m) {
        m = rawText.match(/matches in a row with the\s+(.+?)\s+unbeaten(?:\s+(at home|away))?$/i);
      }
      if (m) {
        team = m[1].trim();
        location = (m[2] || '').toLowerCase();
      }

      streaks.push({ count, text: rawText, team, location });
    });

    if (streaks.length === 0) return;

    results.push({
      time,
      league,
      match: matchKey,
      home: teams[0],
      away: teams[1],
      streaks
    });
  });

  return results;
}

function filterByMinStreak(matches, min) {
  return matches.filter(m => m.streaks.some(s => s.count >= min));
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (raw.dates) return raw;
      if (raw.date && Array.isArray(raw.matches)) {
        return { dates: { [raw.date]: raw.matches }, lastFetch: raw.fetchTime };
      }
      return { dates: {} };
    }
  } catch (e) {}
  return { dates: {} };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  const total = Object.values(cache.dates).reduce((sum, m) => sum + m.length, 0);
  console.log(`Saved ${total} matches across ${Object.keys(cache.dates).length} dates to cache`);
}

async function scrapeDate(date) {
  console.log(`Fetching H2H overview for ${date}...`);
  const html = await fetchOverview(date);
  console.log('Parsing unbeaten streaks...');
  const allMatches = parseUnbeatenStreaks(html);
  console.log(`Found ${allMatches.length} matches with unbeaten streaks`);
  const filtered = filterByMinStreak(allMatches, MIN_STREAK);
  console.log(`Filtered to ${filtered.length} matches with streak >= ${MIN_STREAK}`);
  return filtered;
}

async function scrapeUnbeatenStreaks(dates) {
  if (!Array.isArray(dates)) dates = [dates];
  const cache = loadCache();
  for (const date of dates) {
    try {
      const matches = await scrapeDate(date);
      cache.dates[date] = matches;
    } catch (err) {
      console.error(`Failed to scrape ${date}: ${err.message}`);
      if (!cache.dates[date]) cache.dates[date] = [];
    }
  }
  cache.lastFetch = new Date().toISOString();
  saveCache(cache);
  return cache;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let dates;
  if (args.length > 0) {
    dates = args;
  } else {
    dates = [getDateStr(0), getDateStr(1)];
  }
  scrapeUnbeatenStreaks(dates)
    .then(cache => {
      console.log('\n=== UNBEATEN STREAKS >= 7 ===');
      for (const [date, matches] of Object.entries(cache.dates)) {
        console.log(`\n--- ${date} (${matches.length} matches) ---`);
        matches.forEach(m => {
          console.log(`\n${m.time} | ${m.match}`);
          m.streaks.filter(s => s.count >= MIN_STREAK).forEach(s => {
            console.log(`  [${s.count}] ${s.team}`);
          });
        });
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
} else {
  module.exports = { scrapeUnbeatenStreaks, parseUnbeatenStreaks, filterByMinStreak, loadCache };
}
