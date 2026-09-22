const fs = require('fs');
const path = require('path');
const { scrapeVip, closeVipBrowser, selectHshPicks, HSH_MIN_PROB, HSH_MAX_PICKS, TTS_MIN_PROB, MUST_SCORE_MIN } = require('../src/services/forebetVip');
const { lagosDate } = require('../src/utils/dates');

const CACHE_FILE = path.join(process.cwd(), 'forebet-vip-cache.json');
const HSH_CACHE_FILE = path.join(process.cwd(), 'highest-scoring-half-cache.json');
// Calendar days kept in the cache. Old dates are pruned on every write so the
// file cannot grow without bound across daily scraper runs.
const KEEP_DAYS = 3;

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { dates: {}, lastFetch: null };
}

function loadHshCache() {
  try {
    if (fs.existsSync(HSH_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(HSH_CACHE_FILE, 'utf8'));
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
    dates = [lagosDate(0), lagosDate(1)];
  }
  console.log('Scraping Forebet VIP for dates: ' + dates.join(', '));

  const byDate = await scrapeVip(dates);
  const cache = loadCache();
  const hshCache = loadHshCache();
  cache.dates = cache.dates || {};
  hshCache.dates = hshCache.dates || {};

  for (const date of dates) {
    const matches = byDate[date] || [];
    if (matches.length === 0) {
      const existingVip = cache.dates[date];
      const existingHsh = hshCache.dates[date];
      console.log('Empty scrape for ' + date + ', keeping existing ' +
        ((existingVip && existingVip.length) || 0) + ' VIP and ' +
        ((existingHsh && existingHsh.length) || 0) + ' HSH picks');
      continue;
    }
    // Strongest calls first so the API/page show the best value at the top.
    const gated = matches
      .filter(m => m.passesGate)
      .sort((a, b) => (b.confidence - a.confidence) || (b.mustScore - a.mustScore));
    const hshPicks = selectHshPicks(matches);
    console.log(date + ': ' + matches.length + ' fixtures, ' + gated.length + ' pass the confidence gate, ' + hshPicks.length + ' highest-scoring-half picks');
    // On a successful (non-empty) scrape the result is authoritative: an empty
    // selection legitimately means "no picks today", for both markets.
    cache.dates[date] = gated;
    hshCache.dates[date] = hshPicks;
  }
  // Prune stale days so neither cache grows forever. Keep the just-scraped
  // dates plus yesterday as grace for timezone/scheduler edges.
  const keep = new Set(dates.concat([lagosDate(-1)]));
  for (const key of Object.keys(cache.dates)) {
    if (!keep.has(key)) delete cache.dates[key];
  }
  for (const key of Object.keys(hshCache.dates)) {
    if (!keep.has(key)) delete hshCache.dates[key];
  }
  cache.lastFetch = new Date().toISOString();
  cache.meta = {
    market: 'team-to-score',
    minTeamScoreProb: TTS_MIN_PROB,
    mustScoreMin: MUST_SCORE_MIN
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log('Saved ' + CACHE_FILE);

  hshCache.lastFetch = new Date().toISOString();
  hshCache.meta = {
    minProb: HSH_MIN_PROB,
    maxPicks: HSH_MAX_PICKS,
    free: true
  };
  fs.writeFileSync(HSH_CACHE_FILE, JSON.stringify(hshCache, null, 2));
  console.log('Saved ' + HSH_CACHE_FILE);

  const total = Object.values(cache.dates || {}).reduce((s, m) => s + m.length, 0);
  console.log('\n=== VIP PICKS (team-to-score, scoring prob >= ' + TTS_MIN_PROB + ', must-score >= ' + MUST_SCORE_MIN + '/100) ===');
  console.log('Total team-to-score tips cached: ' + total);
  for (const [date, matches] of Object.entries(cache.dates || {})) {
    console.log('\n--- ' + date + ' (' + matches.length + ') ---');
    matches.forEach(m => {
      console.log('[TTS] ' + m.home + ' v ' + m.away + ' | team=' + m.team + ' p=' + m.teamScoreProb + '% conf=' + m.confidence + ' mustScore=' + m.mustScore);
    });
  }

  const totalHsh = Object.values(hshCache.dates || {}).reduce((s, m) => s + m.length, 0);
  console.log('\n=== HIGHEST-SCORING-HALF PICKS (free, prob >= ' + HSH_MIN_PROB + ', max ' + HSH_MAX_PICKS + '/day) ===');
  console.log('Total HSH picks cached: ' + totalHsh);
  for (const [date, picks] of Object.entries(hshCache.dates || {})) {
    console.log('\n--- ' + date + ' (' + picks.length + ') ---');
    picks.forEach(p => {
      console.log('[' + p.hsh.label + '] ' + p.home + ' v ' + p.away + ' | p=' + (p.hsh.prob * 100).toFixed(0) + '% (1H ' + (p.hsh.firstHalfExp) + ' vs 2H ' + (p.hsh.secondHalfExp) + ' xG)');
    });
  }
}

main()
  .catch(err => {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closeVipBrowser().catch(() => {}));