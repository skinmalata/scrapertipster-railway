const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { executablePath, args } = require('./src/config/puppeteer');
const fs = require('fs');

async function testScraper() {
  const url = 'https://www.statarea.com/predictions';
  console.log(`Testing scraper with URL: ${url}`);
  console.log(`Executable path: ${executablePath}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath,
    args: args
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    
    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Waiting for .match selector...');
    const matchFound = await page.waitForSelector('.match', { timeout: 15000 }).catch(() => null);
    
    if (matchFound) {
      console.log('SUCCESS: .match element found!');
    } else {
      console.log('FAILURE: .match element NOT found within 15 seconds.');
    }
    
    const html = await page.content();
    fs.writeFileSync('debug_statarea.html', html);
    console.log('Page content saved to debug_statarea.html');
    
    const $ = cheerio.load(html);
    const matches = $('.match');
    console.log(`Number of .match elements found with cheerio: ${matches.length}`);
    
    if (matches.length === 0) {
      const title = $('title').text();
      console.log(`Page title: ${title}`);
      if (title.includes('Just a moment')) {
        console.log('BLOCKED: Cloudflare "Just a moment" page detected.');
      } else if (title.includes('Access Denied') || title.includes('403')) {
        console.log('BLOCKED: Access Denied / 403 Forbidden.');
      }
    } else {
        const firstMatch = matches.first();
        const homeTeam = firstMatch.find('.hostteam .name').text().trim();
        const awayTeam = firstMatch.find('.guestteam .name').text().trim();
        console.log(`First match: ${homeTeam} vs ${awayTeam}`);
    }

  } catch (err) {
    console.error('An error occurred during scraping:', err.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testScraper();
