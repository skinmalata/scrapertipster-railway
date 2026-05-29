const scraper = require('./src/services/scraper');
const fs = require('fs');

// Check public/data/predictions.json
const predFile = require('./public/data/predictions.json');
console.log('=== predictions.json ===');
console.log('Dates:', predFile.dates?.join(','));
console.log('Total matches:', predFile.totalMatches);
console.log('Has result field on matches:', predFile.matches?.some(m => m.result != null));
console.log('Has score field on matches:', predFile.matches?.some(m => m.score != null));
console.log('Sample match:', JSON.stringify(predFile.matches?.[0], null, 2));
console.log('Categories: 1x2:', predFile.matches?.length, 'Over1.5:', predFile.over15Matches?.length, 'BTTS:', predFile.bttsMatches?.length);

// Check results.json
const resFile = require('./public/data/results.json');
const resKeys = Object.keys(resFile).sort();
console.log('\n=== results.json ===');
console.log('Date keys:', resKeys.slice(-3).join(', '));
console.log('Yesterday results:', Object.keys(resFile['2026-05-24'] || {}).length);

// Compare with what API would produce
console.log('\n=== Enrichment Check ===');
const cached = scraper.loadCachedPredictions();
const resultsCache = scraper.getResultsCache();
console.log('Results cache has 2026-05-24:', resultsCache['2026-05-24'] ? Object.keys(resultsCache['2026-05-24']).length + ' entries' : 'NO');
console.log('results.json has 2026-05-24:', resFile['2026-05-24'] ? Object.keys(resFile['2026-05-24']).length + ' entries' : 'NO');
