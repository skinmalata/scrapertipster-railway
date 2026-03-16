const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { executablePath, args } = require('./src/config/puppeteer');
const fs = require('fs');

async function testBetExplorer() {
  const url = 'https://www.betexplorer.com/football/streaks/wins/';
  console.log(`Testing BetExplorer with URL: ${url}`);
  
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('Waiting for .table-main selector...');
    const tableFound = await page.waitForSelector('.table-main', { timeout: 15000 }).catch(() => null);
    
    if (tableFound) {
      console.log('SUCCESS: .table-main element found!');
    } else {
      console.log('FAILURE: .table-main element NOT found.');
    }
    
    const html = await page.content();
    fs.writeFileSync('debug_betexplorer.html', html);
    
    const $ = cheerio.load(html);
    const rows = $('.table-main tbody tr');
    console.log(`Number of table rows found: ${rows.length}`);
    
    if (rows.length === 0) {
      const title = $('title').text();
      console.log(`Page title: ${title}`);
      if (title.includes('Just a moment')) {
        console.log('BLOCKED: Cloudflare "Just a moment" page detected.');
      }
    }

  } catch (err) {
    console.error('An error occurred:', err.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testBetExplorer();
