const fs = require('fs');
const path = require('path');
const { scrapeVip, closeVipBrowser, selectHshPicks, HSH_MIN_PROB, HSH_MAX_PICKS, HSH_MARGIN_MIN, HSH_MIN_GOALS, HSH_SHARE_PRIOR, HSH_SHARE_REG, TTS_MIN_PROB, MUST_SCORE_MIN, TTS_WIN_CERT_MIN_PROB } = require('../src/services/forebetVip');
const { lagosDate } = require('../src/utils/dates');

const CACHE_FILE = path.join(process.cwd(), 'forebet-vip-cache.json');
const HSH_CACHE_FILE = path.join(process.cwd(), 'highest-scoring-half-cache.json');
// The free HSH tab reads a STATIC file on the public (GitHub Pages) host - the
// same cache is mirrored here so the scrape publishes to the real site.
const HSH_STATIC_FILE = path.join(process.cwd(), 'public', 'data', 'highest-scoring-half.json');
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
    markets: ['match-winner', 'team-to-score'],
    winCertMinProb: TTS_WIN_CERT_MIN_PROB,
    minTeamScoreProb: TTS_MIN_PROB,
    mustScoreMin: MUST_SCORE_MIN
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log('Saved ' + CACHE_FILE);

  hshCache.lastFetch = new Date().toISOString();
  hshCache.meta = {
    minProb: HSH_MIN_PROB,
    maxPicks: HSH_MAX_PICKS,
    marginMin: HSH_MARGIN_MIN,
    minGoals: HSH_MIN_GOALS,
    sharePrior: HSH_SHARE_PRIOR,
    shareReg: HSH_SHARE_REG,
    free: true
  };
  fs.writeFileSync(HSH_CACHE_FILE, JSON.stringify(hshCache, null, 2));
  console.log('Saved ' + HSH_CACHE_FILE);
  fs.writeFileSync(HSH_STATIC_FILE, JSON.stringify(hshCache, null, 2));
  console.log('Saved ' + HSH_STATIC_FILE);

  const total = Object.values(cache.dates || {}).reduce((s, m) => s + m.length, 0);
  console.log('\n=== VIP PICKS (match-winner record certs + team-to-score, score prob >= ' + TTS_MIN_PROB + ', must-score >= ' + MUST_SCORE_MIN + '/100) ===');
  console.log('Total VIP tips cached: ' + total);
  for (const [date, matches] of Object.entries(cache.dates || {})) {
    console.log('\n--- ' + date + ' (' + matches.length + ') ---');
    matches.forEach(m => {
      const tag = m.market === 'match-winner' ? 'WIN' : 'TTS';
      console.log('[' + tag + '] ' + m.home + ' v ' + m.away + ' | team=' + m.team + ' p=' + (m.market === 'match-winner' ? m.winProb + '% win' : m.teamScoreProb + '% score') + ' conf=' + m.confidence + ' mustScore=' + m.mustScore);
    });
  }

  const totalHsh = Object.values(hshCache.dates || {}).reduce((s, m) => s + m.length, 0);
  console.log('\n=== HIGHEST-SCORING-HALF PICKS (free, prob >= ' + HSH_MIN_PROB + ', margin >= ' + HSH_MARGIN_MIN + ', max ' + HSH_MAX_PICKS + '/day) ===');
  console.log('Total HSH picks cached: ' + totalHsh);
  for (const [date, picks] of Object.entries(hshCache.dates || {})) {
    console.log('\n--- ' + date + ' (' + picks.length + ') ---');
    picks.forEach(p => {
      console.log('[' + p.hsh.label + '] ' + p.home + ' v ' + p.away + ' | p=' + (p.hsh.prob * 100).toFixed(0) + '% margin=' + (p.hsh.margin * 100).toFixed(0) + '% (1H ' + (p.hsh.firstHalfExp) + ' vs 2H ' + (p.hsh.secondHalfExp) + ' xG, share ' + (p.hsh.firstHalfShare).toFixed(2) + ')');
    });
  }
}

main()
  .catch(err => {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closeVipBrowser().catch(() => {}));