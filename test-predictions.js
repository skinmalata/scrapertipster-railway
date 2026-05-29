const scraper = require('./src/services/scraper');
const helpers = require('./src/utils/helpers');

async function main() {
  const dateRange = helpers.getDateRange();
  console.log('Date range:', dateRange);
  
  // Test scraping predictions for each date
  for (const dateStr of dateRange) {
    console.log(`\n=== Scraping predictions for ${dateStr} ===`);
    try {
      const data = await scraper.scrapeDate(dateStr);
      console.log(`Matches: ${data.matches.length}, Over25: ${data.over25Matches.length}, Over15: ${data.over15Matches.length}, BTTS: ${data.bttsMatches.length}`);
      if (data.matches.length > 0) {
        console.log('Sample match:', JSON.stringify(data.matches[0]));
      }
    } catch (err) {
      console.error(`Failed for ${dateStr}:`, err.message);
    }
    // Sleep between dates
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(e => console.error('Fatal:', e));
