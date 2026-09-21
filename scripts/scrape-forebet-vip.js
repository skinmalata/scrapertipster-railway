const fs = require('fs');
const path = require('path');
const { scrapeVip, closeVipBrowser, MIN_CONFIDENCE, MIN_TEAM_SCORE_ODD } = require('../src/services/forebetVip');

const CACHE_FILE = path.join(process.cwd(), 'forebet-vip-cache.json');

function getDateStr(offsetDays) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(Date.now() + (offsetDays || 0) * 86400000));
  return parts.find(p => p.type === 'year').value + '-' +
    parts.find(p => p.type === 'month').value + '-' +
    parts.find(p => p.type === 'day').value;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { dates: {}, lastFetch: null };
}

async function main() {
  const args = process.argv.slice(2);
  let dates;
  if (args.length > 0) {
    dates = args;
  } else {
    dates = [getDateStr(0), getDateStr(1)];
  }
  console.log('Scraping Forebet VIP for dates: ' + dates.join(', '));

  const byDate = await scrapeVip(dates);
  const cache = loadCache();

  for (const date of dates) {
    const matches = byDate[date] || [];
    if (matches.length === 0) {
      const existing = cache.dates && cache.dates[date];
      if (Array.isArray(existing) && existing.length > 0) {
        console.log('Empty scrape for ' + date + ', keeping existing ' + existing.length + ' matches');
        continue;
      }
    }
    const gated = matches.filter(m => m.passesGate);
    console.log(date + ': ' + matches.length + ' fixtures, ' + gated.length + ' pass the confidence gate');
    cache.dates = cache.dates || {};
    cache.dates[date] = gated;
  }
  cache.lastFetch = new Date().toISOString();
  cache.meta = {
    minConfidence: MIN_CONFIDENCE,
    minTeamScoreOdd: MIN_TEAM_SCORE_ODD
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log('Saved ' + CACHE_FILE);

  const total = Object.values(cache.dates || {}).reduce((s, m) => s + m.length, 0);
  console.log('\n=== VIP PICKS (confidence >= ' + MIN_CONFIDENCE + ' gate) ===');
  console.log('Team-to-score props qualify when estimated odd >= ' + MIN_TEAM_SCORE_ODD);
  console.log('Total gated picks cached: ' + total);
  for (const [date, matches] of Object.entries(cache.dates || {})) {
    console.log('\n--- ' + date + ' (' + matches.length + ') ---');
    matches.forEach(m => {
      const ts = (m.teamScoreProps || []).map(p => 'TS ' + p.team + '@' + p.estimatedOdd).join(', ');
      console.log('[' + m.pick + '] ' + m.home + ' v ' + m.away + ' | conf=' + m.confidence + ' edge=' + m.edge + (m.bestOdds ? ' best=' + m.bestOdds : '') + (ts ? ' | ' + ts : ''));
    });
  }
}

main()
  .catch(err => {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closeVipBrowser().catch(() => {}));