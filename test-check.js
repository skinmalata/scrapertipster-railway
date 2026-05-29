const scraper = require('./src/services/scraper');

// Check predictions cache
const c = scraper.loadCachedPredictions();
console.log('=== Predictions Cache ===');
console.log('Dates:', c.dates?.join(','));
console.log('Total matches:', c.totalMatches);
console.log('Over 1.5:', c.totalOver15);
console.log('Over 2.5:', c.totalOver25);
console.log('BTTS:', c.totalBtts);
console.log('Generated:', c.date);

console.log('\n=== Results Cache ===');
const r = scraper.getResultsCache();
const keys = Object.keys(r).sort();
console.log('Total date keys:', keys.length);
console.log('Latest 5:', keys.slice(-5).join(', '));
console.log('Yesterday (May 24) count:', Object.keys(r['2026-05-24'] || {}).length);
console.log('May 19 count:', Object.keys(r['2026-05-19'] || {}).length);

console.log('\n=== public/data/ ===');
const fs = require('fs');
const path = require('path');
const dataDir = path.join(process.cwd(), 'public', 'data');
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  console.log('Exists with files:', files.join(', '));
} else {
  console.log('DOES NOT EXIST');
}
