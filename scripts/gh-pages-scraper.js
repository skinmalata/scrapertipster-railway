const scraper = require('../src/services/scraper');
const { scrapeUnbeatenStreaks } = require('./scrape-h2h-unbeaten');
const { scrapeBttsNo } = require('./scrape-btts-no');
const { generateAllPages } = require('./generate-category-pages');
const fs = require('fs');
const path = require('path');

function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function normalizeTeam(name) {
  return name.toLowerCase()
    .replace(/\(w\)/g, '')
    .replace(/\(u23\)/g, '')
    .replace(/\(u21\)/g, '')
    .replace(/\(u20\)/g, '')
    .replace(/\(u19\)/g, '')
    .replace(/\(u17\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSignificantTokens(name) {
  const commonWords = new Set(['fc', 'sc', 'ac', 'rc', 'us', 'ud', 'as', 'ss', 'cf', 'cd', 'de', 'da', 'do', 'el', 'la', 'le', 'il', 'al', 'united', 'city', 'club', 'team', 'sporting', 'athletic', 'association', 'real', 'inter', 'san', 'saint', 'st']);
  return normalizeTeam(name).split(/\s+/).filter(t => t.length > 2 && !commonWords.has(t));
}

function teamSimilarity(name1, name2) {
  const norm1 = normalizeTeam(name1);
  const norm2 = normalizeTeam(name2);
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
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
    const predTeams = predMatch.split(/ - | vs /);
    if (predTeams.length !== 2) return null;
    const [predHome, predAway] = predTeams;
    let bestMatch = null;
    let bestScore = 0;

    const candidates = resultsByDate[predDate] || [];
    for (const result of candidates) {
      const resultTeams = result.key.split(/ - | vs /);
      if (resultTeams.length !== 2) continue;
      const [resHome, resAway] = resultTeams;
      const homeSim = teamSimilarity(predHome, resHome);
      const awaySim = teamSimilarity(predAway, resAway);
      const combined = homeSim * awaySim;
      if (combined > bestScore && combined > 0.6) {
        bestScore = combined;
        bestMatch = result.score;
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

async function main() {
  console.log('=== GitHub Pages Scraper ===');

  const dataDir = path.join(process.cwd(), 'public', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('Fetching predictions...');
  try {
    const data = await scraper.fetchAndCachePredictions();
    console.log(`Got ${data.totalMatches} matches`);

    const cacheFile = path.join(process.cwd(), 'predictions-cache.json');
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
      fs.copyFileSync(resultsFile, path.join(dataDir, 'results.json'));
      console.log('Saved results.json');
    }
  } catch (err) {
    console.error('Predictions fetch failed:', err.message);
    const cacheFile = path.join(process.cwd(), 'predictions-cache.json');
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

  console.log('All data written to public/data/');

  // Generate static category pages
  console.log('Generating category pages...');
  const categoryPagesDir = path.join(process.cwd(), 'public', 'predictions');
  generateAllPages(categoryPagesDir);
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
  module.exports = { enrichWithResults, rebuildStatic, main };
}
