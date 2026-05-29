const fs = require('fs');
const data = require('./public/data/predictions.json');

console.log('=== Enriched Predictions Check ===');
console.log('Dates:', data.dates?.join(','));
console.log('Total 1X2 matches:', data.matches?.length);
console.log('Total Over 1.5:', data.over15Matches?.length);

// Check yesterday's matches for result enrichment
const yesterdayMatches = data.matches?.filter(m => m.date === '2026-05-24') || [];
const todayMatches = data.matches?.filter(m => m.date === '2026-05-25') || [];

console.log('\nYesterday (May 24) 1X2 matches:', yesterdayMatches.length);
const withResult = yesterdayMatches.filter(m => m.result != null);
console.log('With result:', withResult.length);
if (withResult.length > 0) {
  console.log('Sample enriched match:', JSON.stringify(withResult[0], null, 2));
}
if (withResult.length > 0) {
  console.log('First 5 enriched matches:');
  withResult.slice(0, 5).forEach(m => {
    console.log(`  ${m.match} -> ${m.result.home}-${m.result.away}`);
  });
}

// Check today matches (should NOT have results)
console.log('\nToday (May 25) 1X2 matches:', todayMatches.length);
const withResultToday = todayMatches.filter(m => m.result != null);
console.log('With result (should be 0):', withResultToday.length);

// Check over15/over25/btts enrichment
const over15WithResult = data.over15Matches?.filter(m => m.date === '2026-05-24' && m.result != null).length || 0;
const over25WithResult = data.over25Matches?.filter(m => m.date === '2026-05-24' && m.result != null).length || 0;
const bttsWithResult = data.bttsMatches?.filter(m => m.date === '2026-05-24' && m.result != null).length || 0;
console.log('\nOver 1.5 yesterday with result:', over15WithResult);
console.log('Over 2.5 yesterday with result:', over25WithResult);
console.log('BTTS yesterday with result:', bttsWithResult);
