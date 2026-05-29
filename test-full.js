const scraper = require('./src/services/scraper');

async function main() {
  console.log('=== Testing full fetchAndCachePredictions ===');
  console.log('This will take a few minutes...\n');
  
  try {
    const data = await scraper.fetchAndCachePredictions();
    console.log('\n=== SUCCESS ===');
    console.log('Total matches:', data.totalMatches);
    console.log('Dates:', data.dates?.join(', '));
    console.log('Over 2.5:', data.totalOver25);
    console.log('Over 1.5:', data.totalOver15);
    console.log('BTTS:', data.totalBtts);
    console.log('Win streaks:', data.totalWinstreak);
    console.log('Loss streaks:', data.totalLosestreak);
    console.log('Draw streaks:', data.totalDrawstreak);
  } catch (err) {
    console.error('\n=== FAILED ===');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(e => console.error('Fatal:', e));
