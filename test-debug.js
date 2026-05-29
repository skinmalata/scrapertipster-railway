const scraper = require('./src/services/scraper');
const helpers = require('./src/utils/helpers');

async function main() {
  console.log('=== Testing scraper ===');
  
  // Test 1: Check cached predictions
  const cached = scraper.loadCachedPredictions();
  console.log('Cached predictions:', cached ? `dates: ${cached.dates?.join(',')}, matches: ${cached.totalMatches}` : 'NONE');
  
  // Test 2: Check cached results  
  const resultsCache = scraper.getResultsCache();
  const dateKeys = Object.keys(resultsCache).sort();
  console.log('Results cache date keys:', dateKeys.join(', '));
  console.log('Results cache total dates:', dateKeys.length);
  console.log('Latest results date:', dateKeys[dateKeys.length - 1]);
  
  // Test 3: Check today's date range
  console.log('Date range:', helpers.getDateRange());
  console.log('Local date:', helpers.getLocalDateStr());
  
  // Test 4: Quick scrape test of yesterday results
  console.log('\n=== Attempting to scrape yesterday results ===');
  try {
    const results = await scraper.scrapeYesterdayResults();
    const keys = Object.keys(results);
    console.log('Results found:', keys.length);
    if (keys.length > 0) {
      console.log('Sample:', keys[0], '->', JSON.stringify(results[keys[0]]));
    }
  } catch (err) {
    console.error('Scrape failed:', err.message);
    console.error('Stack:', err.stack?.split('\n').slice(0, 3).join('\n'));
  }
  
  // Test 5: Check public/data directory
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(process.cwd(), 'public', 'data');
  console.log('\n=== Checking public/data ===');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    console.log('Files:', files.join(', '));
  } else {
    console.log('public/data/ DOES NOT EXIST');
  }
}

main().catch(e => console.error('Fatal:', e));
