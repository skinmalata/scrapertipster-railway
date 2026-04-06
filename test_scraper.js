const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const url = 'https://www.statarea.com/predictions/date/2026-04-05';
  console.log('Fetching:', url);
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  
  const $ = cheerio.load(response.data);
  const matchElements = $('.match');
  console.log('Match elements found:', matchElements.length);
  
  if (matchElements.length > 0) {
    const first = matchElements.first();
    const time = first.find('.date').text().trim();
    const homeTeam = first.find('.hostteam .name').text().trim();
    const awayTeam = first.find('.guestteam .name').text().trim();
    console.log('First match:', time, homeTeam, '-', awayTeam);
  }
}

test().catch(console.error);
