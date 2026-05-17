const scraper = require('../src/services/scraper');
const fs = require('fs');
const path = require('path');

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
      fs.writeFileSync(path.join(dataDir, 'predictions.json'), JSON.stringify(predictions));
      console.log('Used cached predictions.json');
    }
  }

  console.log('All data written to public/data/');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
