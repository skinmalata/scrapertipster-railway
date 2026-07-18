const axios = require('axios');

async function test() {
  const resp = await axios.get('https://statsbet.org/football/predictions/corners', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 30000
  });
  const html = resp.data;
  const unescaped = html.replace(/\\"/g, '"');

  const homePattern = '"className":"font-medium text-sm text-white truncate","children":"([^"]+)"';
  const homeMatches = [...unescaped.matchAll(new RegExp(homePattern, 'g'))];

  const awayPattern = '"vs"," ","([^"]+)"';
  const awayMatches = [...unescaped.matchAll(new RegExp(awayPattern, 'g'))];

  const hitPattern = '"children":"(\\d{2,3})%"';
  const hitMatches = [...unescaped.matchAll(new RegExp(hitPattern, 'g'))];

  const oddsPattern = '"children":"(1\\.\\d{2})"';
  const oddsMatches = [...unescaped.matchAll(new RegExp(oddsPattern, 'g'))];

  const marketPattern = '"children":"(Over [89]\\.5 Corners)"';
  const marketMatches = [...unescaped.matchAll(new RegExp(marketPattern, 'g'))];

  console.log('Homes:', homeMatches.length);
  console.log('Aways:', awayMatches.length);
  console.log('Hits:', hitMatches.length);
  console.log('Odds:', oddsMatches.length);
  console.log('Markets:', marketMatches.length);

  for (let i = 0; i < homeMatches.length; i++) {
    const home = homeMatches[i]?.[1];
    const away = awayMatches[i]?.[1];
    const hit = parseInt(hitMatches[i]?.[1] || '0', 10);
    const odds = oddsMatches[i]?.[1] || '';
    const market = marketMatches[i]?.[1] || '';
    if (hit <= 80) continue;
    console.log(`${home} vs ${away} | ${market} | ${hit}% | Odds: ${odds}`);
  }
}

test().catch(e => console.error(e.message));
