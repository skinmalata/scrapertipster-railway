const scraper = require('../src/services/scraper');
const { scrapeUnbeatenStreaks } = require('./scrape-h2h-unbeaten');
const { scrapeBttsNo } = require('./scrape-btts-no');
const { generateAllPages } = require('./generate-category-pages');
const buildAnalysis = require('./build-analysis');
const fs = require('fs');
const path = require('path');

function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function normalizeTeam(name) {
  const normalized = name.toLowerCase()
    .replace(/\(w\)/g, '')
    .replace(/\(u23\)/g, '')
    .replace(/\(u21\)/g, '')
    .replace(/\(u20\)/g, '')
    .replace(/\(u19\)/g, '')
    .replace(/\(u17\)/g, '')
    .replace(/\b(u\.?td|united|fc|afc|cf|sc|ac)\b/g, '')
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = { 'milton keynes dons': 'mk dons', ucd: 'uc dublin', 'uanl tigres': 'tigres uanl' };
  return aliases[normalized] || normalized;
}

function splitMatch(match) {
  const separator = String(match || '').search(/\s+-\s+|\s+vs\s+/i);
  if (separator < 0) return [];
  const token = String(match).slice(separator).match(/^\s+(?:-|vs)\s+/i);
  if (!token) return [];
  return [String(match).slice(0, separator), String(match).slice(separator + token[0].length)];
}

function getSignificantTokens(name) {
  const commonWords = new Set(['fc', 'sc', 'ac', 'rc', 'us', 'ud', 'utd', 'as', 'ss', 'cf', 'cd', 'de', 'da', 'do', 'el', 'la', 'le', 'il', 'al', 'united', 'city', 'club', 'team', 'sporting', 'athletic', 'association', 'real', 'inter', 'san', 'saint', 'st']);
  return normalizeTeam(name).split(/\s+/).filter(t => t.length > 2 && !commonWords.has(t));
}

function teamSimilarity(name1, name2) {
  const norm1 = normalizeTeam(name1);
  const norm2 = normalizeTeam(name2);
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
  if (norm1.length >= 7 && norm2.length >= 7 && editSimilarity(norm1, norm2) >= 0.85) return 0.85;
  const tokens1 = getSignificantTokens(name1);
  const tokens2 = getSignificantTokens(name2);
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  let matches = 0;
  for (const t1 of tokens1) {
    for (const t2 of tokens2) {
      if (t1.includes(t2) || t2.includes(t1)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(tokens1.length, tokens2.length);
}

function editSimilarity(first, second) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[second.length] / Math.max(first.length, second.length);
}

function enrichWithResults(predictions, resultsCache) {
  const resultsByDate = {};
  for (const dateKey of Object.keys(resultsCache)) {
    const arr = [];
    const dateResults = resultsCache[dateKey];
    for (const [resultKey, score] of Object.entries(dateResults)) {
      arr.push({ key: resultKey, score });
    }
    resultsByDate[dateKey] = arr;
  }

  const today = predictions.date || new Date().toISOString().split('T')[0];

  function findResult(predMatch, predDate) {
    const predTeams = splitMatch(predMatch);
    if (predTeams.length !== 2) return null;
    const [predHome, predAway] = predTeams;
    let bestMatch = null;
    let bestScore = 0;

    const candidates = resultsByDate[predDate] || [];
    for (const result of candidates) {
      const resultTeams = splitMatch(result.key);
      if (resultTeams.length !== 2) continue;
      const [resHome, resAway] = resultTeams;
      const comparisons = [
        { home: teamSimilarity(predHome, resHome), away: teamSimilarity(predAway, resAway), score: result.score },
        { home: teamSimilarity(predHome, resAway), away: teamSimilarity(predAway, resHome), score: { ...result.score, home: result.score.away, away: result.score.home } }
      ];
      for (const comparison of comparisons) {
        const combined = (comparison.home + comparison.away) / 2;
        // Both teams must match; averaging accepts harmless name variants when
        // the other team is an exact match, unlike the previous multiplication.
        if (comparison.home >= 0.5 && comparison.away >= 0.5 && combined > bestScore && combined >= 0.7) {
          bestScore = combined;
          bestMatch = comparison.score;
        }
      }
    }
    return bestMatch;
  }

  const enrich = (matches) => {
    if (!matches) return [];
    return matches.map(match => {
      const matchDate = (match.date || '').trim();
      if (matchDate > today) {
        return { ...match, result: null };
      }
      return { ...match, result: findResult(match.match, matchDate) };
    });
  };

  predictions.matches = enrich(predictions.matches);
  predictions.over25Matches = enrich(predictions.over25Matches);
  predictions.over15Matches = enrich(predictions.over15Matches);
  predictions.bttsMatches = enrich(predictions.bttsMatches);
  predictions.bttsNoMatches = enrich(predictions.bttsNoMatches);
  predictions.cornersMatches = enrich(predictions.cornersMatches);
  predictions.cardsMatches = enrich(predictions.cardsMatches);
  predictions.teamToScore2PlusMatches = enrich(predictions.teamToScore2PlusMatches);

  return predictions;
}

// Some markets are fetched after the core predictions. Run this once at the
// end of a build so their completed fixtures receive results as well.
function enrichPublishedPredictions(dataDir) {
  const predictionFile = path.join(dataDir, 'predictions.json');
  const resultsFile = path.join(process.cwd(), 'results-cache.json');
  if (!fs.existsSync(predictionFile) || !fs.existsSync(resultsFile)) return false;

  const predictions = JSON.parse(fs.readFileSync(predictionFile, 'utf8'));
  const resultsCache = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  enrichWithResults(predictions, resultsCache);
  fs.writeFileSync(predictionFile, JSON.stringify(predictions));
  console.log('Enriched all published markets with results');
  return true;
}

function isSameFixture(a, b) {
  if ((a.date || '') !== (b.date || '')) return false;
  const ta = splitMatch(a.match);
  const tb = splitMatch(b.match);
  if (ta.length !== 2 || tb.length !== 2) return a.match === b.match;
  const s1 = (teamSimilarity(ta[0], tb[0]) + teamSimilarity(ta[1], tb[1])) / 2;
  const s2 = (teamSimilarity(ta[0], tb[1]) + teamSimilarity(ta[1], tb[0])) / 2;
  return Math.max(s1, s2) >= 0.7;
}

// If the upstream sources drop fixtures that were present in the last
// committed snapshot (fixture churn / flaky source), recover them so
// previously generated pages don't silently lose content on redeploy. Only
// fixtures inside the current scrape window are recovered, so genuinely
// cancelled or expired matches are not kept alive forever. Mirrors the
// findMissedMatches/mergeMissedMatches recovery the runtime server performs
// via fetchPredictions, which the static build bypasses.
function recoverMissedFixtures(freshData, committed) {
  if (!committed || !Array.isArray(committed.matches) || committed.matches.length === 0) {
    return freshData;
  }

  const freshMatches = freshData.matches || [];
  const hasWindow = Array.isArray(freshData.dates) && freshData.dates.length > 0;
  const window = hasWindow ? new Set(freshData.dates) : null;
  const missed = (committed.matches || []).filter(m => {
    if (!m || !m.match) return false;
    if (window && !window.has(m.date)) return false;
    return !freshMatches.some(f => f && f.match && isSameFixture(m, f));
  });

  if (missed.length === 0) return freshData;

  const merged = { ...freshData };
  merged.matches = [...missed, ...(freshData.matches || [])].sort((a, b) => {
    if (a.date === b.date) return 0;
    return new Date(a.date) - new Date(b.date);
  });
  merged.totalMatches = merged.matches.length;
  merged.recoveredMatches = missed.length;

  const missedOver25 = missed.filter(m => m.over25 || (m.tip && m.tip.includes('Over 2.5')));
  const missedOver15 = missed.filter(m => m.over15 || (m.tip && m.tip.includes('Over 1.5')));
  const missedBtts = missed.filter(m => m.btts || (m.tip && m.tip.includes('BTTS')));
  merged.over25Matches = [...missedOver25, ...(freshData.over25Matches || [])];
  merged.over15Matches = [...missedOver15, ...(freshData.over15Matches || [])];
  merged.bttsMatches = [...missedBtts, ...(freshData.bttsMatches || [])];
  merged.totalOver25 = merged.over25Matches.length;
  merged.totalOver15 = merged.over15Matches.length;
  merged.totalBtts = merged.bttsMatches.length;

  console.log(`Recovered ${missed.length} fixture(s) missing from fresh scrape:`);
  missed.forEach(m => console.log(`  - ${m.match} (${m.date})`));

  fs.writeFileSync(path.join(process.cwd(), 'predictions-cache.json'), JSON.stringify(merged));
  return merged;
}

async function main() {
  console.log('=== GitHub Pages Scraper ===');

  const dataDir = path.join(process.cwd(), 'public', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const cacheFile = path.join(process.cwd(), 'predictions-cache.json');
  let committedCache = null;
  try {
    if (fs.existsSync(cacheFile)) {
      committedCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not read committed predictions cache for recovery:', e.message);
  }

  console.log('Fetching predictions...');
  try {
    const data = await scraper.fetchAndCachePredictions();
    console.log(`Got ${data.totalMatches} matches`);
    recoverMissedFixtures(data, committedCache);

    if (fs.existsSync(cacheFile)) {
      const predictions = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      predictions.generatedAt = new Date().toISOString();

      const resultsFile = path.join(process.cwd(), 'results-cache.json');
      if (fs.existsSync(resultsFile)) {
        const resultsCache = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        enrichWithResults(predictions, resultsCache);
        console.log('Enriched predictions with results');
      }

      fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(predictions));
      console.log('Saved predictions.json');
    }

    const resultsFile = path.join(process.cwd(), 'results-cache.json');
    if (fs.existsSync(resultsFile)) {
      // Cap results cache to last 30 days before writing static copy
      try {
        const raw = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        const pruned = scraper.pruneResultsCache
          ? scraper.pruneResultsCache(raw, 30)
          : raw;
        fs.writeFileSync(resultsFile, JSON.stringify(pruned, null, 2));
        fs.writeFileSync(path.join(dataDir, 'results.json'), JSON.stringify(pruned));
        console.log(`Saved results.json (${Object.keys(pruned).length} day(s), max 30)`);
      } catch (e) {
        fs.copyFileSync(resultsFile, path.join(dataDir, 'results.json'));
        console.log('Saved results.json (unpruned fallback)');
      }
    }
  } catch (err) {
    console.error('Predictions fetch failed:', err.message);
    if (fs.existsSync(cacheFile)) {
      const predictions = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      predictions.generatedAt = new Date().toISOString();
      predictions.fromCache = true;

      const resultsFile = path.join(process.cwd(), 'results-cache.json');
      if (fs.existsSync(resultsFile)) {
        const resultsCache = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        enrichWithResults(predictions, resultsCache);
        console.log('Enriched cached predictions with results');
      }

      fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(predictions));
      console.log('Used cached predictions.json');
    }
  }

  // H2H Unbeaten streaks
  console.log('Fetching H2H unbeaten streaks...');
  try {
    const today = getDateStr(0);
    const tomorrow = getDateStr(1);
    const h2hCache = await scrapeUnbeatenStreaks([today, tomorrow]);
    fs.writeFileSync(path.join(dataDir, 'h2h-unbeaten.json'), JSON.stringify(h2hCache, null, 2));
    console.log('Saved h2h-unbeaten.json');
  } catch (err) {
    console.error('H2H unbeaten fetch failed:', err.message);
    const h2hFile = path.join(process.cwd(), 'h2h-unbeaten-cache.json');
    if (fs.existsSync(h2hFile)) {
      const h2hData = JSON.parse(fs.readFileSync(h2hFile, 'utf8'));
      fs.writeFileSync(path.join(dataDir, 'h2h-unbeaten.json'), JSON.stringify(h2hData, null, 2));
      console.log('Used cached h2h-unbeaten.json');
    }
  }

  // BTTS No from h2hstats
  console.log('Fetching BTTS No from h2hstats...');
  try {
    const today = getDateStr(0);
    const tomorrow = getDateStr(1);
    const bttsNoData = await scrapeBttsNo([today, tomorrow]);
    if (bttsNoData && bttsNoData.matches && bttsNoData.matches.length > 0) {
      const predFile = path.join(dataDir, 'predictions.json');
      const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
      predictions.bttsNoMatches = bttsNoData.matches;
      fs.writeFileSync(predFile, JSON.stringify(predictions));
      console.log(`Merged bttsNoMatches: ${bttsNoData.matches.length} matches`);
    }
  } catch (err) {
    console.error('BTTS No fetch failed:', err.message);
    const bttsNoFile = path.join(process.cwd(), 'btts-no-cache.json');
    if (fs.existsSync(bttsNoFile)) {
      try {
        const bttsNoCache = JSON.parse(fs.readFileSync(bttsNoFile, 'utf8'));
        if (bttsNoCache.matches && bttsNoCache.matches.length > 0) {
          const predFile = path.join(dataDir, 'predictions.json');
          const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
          predictions.bttsNoMatches = bttsNoCache.matches;
          fs.writeFileSync(predFile, JSON.stringify(predictions));
          console.log(`Used cached bttsNoMatches: ${bttsNoCache.matches.length} matches`);
        }
      } catch (e) {}
    }
  }

  // Merge corners, cards, both-halves data from their separate caches/scrapers
  const mergeCacheFile = (cacheFile, key) => {
    if (fs.existsSync(cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (data.matches && data.matches.length > 0) {
          const predFile = path.join(dataDir, 'predictions.json');
          const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
          predictions[key] = data.matches;
          fs.writeFileSync(predFile, JSON.stringify(predictions));
          console.log(`Merged ${key}: ${data.matches.length} matches`);
        }
      } catch (e) {
        console.error(`Failed to merge ${key}:`, e.message);
      }
    }
  };

  try {
    console.log('Scraping corners...');
    const cornersData = await scraper.scrapeCorners();
    if (cornersData && cornersData.matches && cornersData.matches.length > 0) {
      const predFile = path.join(dataDir, 'predictions.json');
      const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
      predictions.cornersMatches = cornersData.matches;
      fs.writeFileSync(predFile, JSON.stringify(predictions));
      console.log(`Merged cornersMatches: ${cornersData.matches.length} matches`);
    }
  } catch (err) {
    console.error('Corners scrape failed:', err.message);
    mergeCacheFile(path.join(process.cwd(), 'corners-cache.json'), 'cornersMatches');
  }

  try {
    console.log('Scraping cards...');
    const cardsData = await scraper.scrapeCards();
    if (cardsData && cardsData.matches && cardsData.matches.length > 0) {
      const predFile = path.join(dataDir, 'predictions.json');
      const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
      predictions.cardsMatches = cardsData.matches;
      fs.writeFileSync(predFile, JSON.stringify(predictions));
      console.log(`Merged cardsMatches: ${cardsData.matches.length} matches`);
    }
  } catch (err) {
    console.error('Cards scrape failed:', err.message);
    mergeCacheFile(path.join(process.cwd(), 'cards-cache.json'), 'cardsMatches');
  }

  try {
    console.log('Scraping both halves...');
    const bothHalvesData = await scraper.scrapeBothHalves();
    if (bothHalvesData && bothHalvesData.matches && bothHalvesData.matches.length > 0) {
      const predFile = path.join(dataDir, 'predictions.json');
      const predictions = JSON.parse(fs.readFileSync(predFile, 'utf8'));
      predictions.teamToScore2PlusMatches = bothHalvesData.matches;
      fs.writeFileSync(predFile, JSON.stringify(predictions));
      console.log(`Merged teamToScore2PlusMatches: ${bothHalvesData.matches.length} matches`);
    }
  } catch (err) {
    console.error('Both halves scrape failed:', err.message);
    mergeCacheFile(path.join(process.cwd(), 'both-halves-cache.json'), 'teamToScore2PlusMatches');
  }

  enrichPublishedPredictions(dataDir);

  // Match analysis (statarea first, FotMob fallback). Reads the freshly
  // written predictions.json, so it must run after every market is merged.
  console.log('Building match analysis...');
  try {
    await buildAnalysis.main();
  } catch (err) {
    console.error('Analysis build failed:', err.message);
  }

  // Regenerate cross-link pages (teams, h2h, league, matrix, date archives)
  // AFTER buildAnalysis so they reference the freshly written analysis pages
  // and analysis-links.json instead of the committed stale snapshot.
  console.log('Regenerating linker pages...');
  const regenerators = [
    require('./generate-team-pages').main,
    require('./generate-h2h-pages').main,
    require('./generate-league-pages').main,
    require('./generate-matrix-pages').main,
    require('./generate-converter-pages').main
  ];
  for (const regen of regenerators) {
    try {
      regen();
    } catch (e) {
      console.error('Linker page regeneration failed:', e.message);
    }
  }
  if (fs.existsSync(path.join(process.cwd(), 'results-cache.json'))) {
    try {
      require('./generate-date-archive-pages').main();
    } catch (e) {
      console.error('Date archive regeneration failed:', e.message);
    }
  }

  console.log('All data written to public/data/');

  // Generate static category pages
  console.log('Generating category pages...');
  const categoryPagesDir = path.join(process.cwd(), 'public', 'predictions');
  generateAllPages(categoryPagesDir);

  // Refresh sitemap core URLs (blog entries preserved from existing file when present)
  try {
    updateSitemapCore();
  } catch (e) {
    console.error('Sitemap update failed:', e.message);
  }
}

/** Refresh sitemap + RSS from on-disk state, then submit programmatic URLs to Google (D8) */
function updateSitemapCore() {
  require('./update-sitemap').main();

  try {
    require('./submit-google-indexing').main();
  } catch (e) {
    console.warn('Google indexing submission note:', e.message);
  }
}

function rebuildStatic() {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const cacheFile = path.join(process.cwd(), 'predictions-cache.json');
  const resultsFile = path.join(process.cwd(), 'results-cache.json');

  if (!fs.existsSync(cacheFile)) {
    console.log('No cache file found, cannot rebuild static predictions');
    return;
  }

  const predictions = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  predictions.generatedAt = new Date().toISOString();
  delete predictions.fromCache;

  if (fs.existsSync(resultsFile)) {
    const resultsCache = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    enrichWithResults(predictions, resultsCache);
    console.log('Enriched predictions with results');
  }

  const cornersCacheFile = path.join(process.cwd(), 'corners-cache.json');
  if (fs.existsSync(cornersCacheFile)) {
    try {
      const cornersData = JSON.parse(fs.readFileSync(cornersCacheFile, 'utf8'));
      predictions.cornersMatches = cornersData.matches || [];
      console.log('Merged corners matches:', predictions.cornersMatches.length);
    } catch (e) {
      console.error('Failed to load corners cache:', e.message);
    }
  }

  const cardsCacheFile = path.join(process.cwd(), 'cards-cache.json');
  if (fs.existsSync(cardsCacheFile)) {
    try {
      const cardsData = JSON.parse(fs.readFileSync(cardsCacheFile, 'utf8'));
      predictions.cardsMatches = cardsData.matches || [];
      console.log('Merged cards matches:', predictions.cardsMatches.length);
    } catch (e) {
      console.error('Failed to load cards cache:', e.message);
    }
  }

  const bothHalvesCacheFile = path.join(process.cwd(), 'both-halves-cache.json');
  if (fs.existsSync(bothHalvesCacheFile)) {
    try {
      const bothHalvesData = JSON.parse(fs.readFileSync(bothHalvesCacheFile, 'utf8'));
      predictions.teamToScore2PlusMatches = bothHalvesData.matches || [];
      console.log('Merged both-halves matches:', predictions.teamToScore2PlusMatches.length);
    } catch (e) {
      console.error('Failed to load both-halves cache:', e.message);
    }
  }

  const bttsNoCacheFile = path.join(process.cwd(), 'btts-no-cache.json');
  if (fs.existsSync(bttsNoCacheFile)) {
    try {
      const bttsNoData = JSON.parse(fs.readFileSync(bttsNoCacheFile, 'utf8'));
      if (bttsNoData.matches && bttsNoData.matches.length > 0) {
        predictions.bttsNoMatches = bttsNoData.matches;
        console.log('Merged btts-no matches:', predictions.bttsNoMatches.length);
      }
    } catch (e) {
      console.error('Failed to load btts-no cache:', e.message);
    }
  }

  fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(predictions));
  console.log('Saved predictions.json');
  enrichPublishedPredictions(dataDir);

  if (fs.existsSync(resultsFile)) {
    fs.copyFileSync(resultsFile, path.join(dataDir, 'results.json'));
    console.log('Saved results.json');
  }

  const h2hFile = path.join(process.cwd(), 'h2h-unbeaten-cache.json');
  if (fs.existsSync(h2hFile)) {
    fs.copyFileSync(h2hFile, path.join(dataDir, 'h2h-unbeaten.json'));
    console.log('Saved h2h-unbeaten.json');
  }

  // Generate static category pages
  console.log('Generating category pages...');
  const categoryPagesDir = path.join(process.cwd(), 'public', 'predictions');
  generateAllPages(categoryPagesDir);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
} else {
  module.exports = { enrichWithResults, enrichPublishedPredictions, rebuildStatic, updateSitemapCore, recoverMissedFixtures, main };
}
