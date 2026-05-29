const axios = require('axios');

const cheerio = require('cheerio');

async function testStatarea(dateStr) {
  const url = `https://www.statarea.com/predictions/date/${dateStr}`;
  console.log(`Fetching ${url}...`);
  try {
    const res = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    console.log(`Status: ${res.status}, Length: ${res.data.length}`);
    const $ = cheerio.load(res.data);
    const matchCount = $('.match').length;
    const title = $('title').text();
    console.log(`Title: ${title}`);
    console.log(`Match elements (.match): ${matchCount}`);
    
    // Check for any error indicators
    if (res.data.includes('block') || res.data.includes('captcha') || res.data.includes('robot')) {
      console.log('WARNING: Possible blocking detected');
    }
    return matchCount;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Headers:`, JSON.stringify(err.response.headers));
    }
    return 0;
  }
}

async function main() {
  const dates = ['2026-05-24', '2026-05-25', '2026-05-26'];
  for (const d of dates) {
    await testStatarea(d);
    console.log('---');
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(e => console.error('Fatal:', e));
