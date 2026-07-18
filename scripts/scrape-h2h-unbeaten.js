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

async function fetchNoLosses(date) {
  const params = { show_finished: 1, date, category: 'h2hstreaks', filter: 'nolosses', gmt: '0', sport: '1' };
  const { data } = await axios.get(API_URL, { params, timeout: 30000 });
  return data;
}

function parseUnbeatenStreaks(html) {
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
    const leagueMatch = subheader.match(/-\s*(.+?)\s*$/);
    const league = leagueMatch ? leagueMatch[1].replace(/&raquo;/g, '|').trim() : '';

    const streaks = [];
    const lines = $card.find('.match-history .match-line');
    if (lines.length === 0) return;

    const homeTeam = teams[0];
    const awayTeam = teams[1];

    let homeStreak = 0;
    let awayStreak = 0;

    lines.each((_, line) => {
      const lineText = $(line).text().trim();
      const scoreMatch = lineText.match(/(\d+)\s*:\s*(\d+)/);
      if (!scoreMatch) return;

      const homeScore = parseInt(scoreMatch[1], 10);
      const awayScore = parseInt(scoreMatch[2], 10);

      const boldTeam = $(line).find('strong').text().trim();
      const isHomeBold = boldTeam === homeTeam;

      const resultTeam = isHomeBold ? 'home' : 'away';
      const teamScore = isHomeBold ? homeScore : awayScore;
      const opponentScore = isHomeBold ? awayScore : homeScore;

      const won = teamScore > opponentScore;
      const drew = teamScore === opponentScore;
      const unbeaten = won || drew;

      if (unbeaten) {
        if (resultTeam === 'home') homeStreak++;
        else awayStreak++;
      } else {
        if (resultTeam === 'home') homeStreak = 0;
        else awayStreak = 0;
      }
    });

    if (homeStreak >= MIN_STREAK) {
      streaks.push({
        count: homeStreak,
        text: `${homeStreak} consecutive unbeaten H2H matches`,
        team: homeTeam,
        location: ''
      });
    }
    if (awayStreak >= MIN_STREAK) {
      streaks.push({
        count: awayStreak,
        text: `${awayStreak} consecutive unbeaten H2H matches`,
        team: awayTeam,
        location: ''
      });
    }

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
  console.log(`Fetching H2H no-losses for ${date}...`);
  const html = await fetchNoLosses(date);
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
