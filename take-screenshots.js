const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 900 });

  const mockupPath = 'file://' + path.resolve(__dirname, 'ad-mockup.html');
  await page.goto(mockupPath, { waitUntil: 'networkidle0', timeout: 30000 });

  // Desktop full page
  await page.screenshot({ path: path.join(__dirname, 'screenshot-all-ads-desktop.png'), fullPage: true });
  console.log('screenshot-all-ads-desktop.png saved');

  // Desktop viewport
  await page.screenshot({ path: path.join(__dirname, 'screenshot-all-ads-viewport.png'), fullPage: false });
  console.log('screenshot-all-ads-viewport.png saved');

  // Mobile
  await page.setViewport({ width: 375, height: 812 });
  await page.goto(mockupPath, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(__dirname, 'screenshot-all-ads-mobile.png'), fullPage: true });
  console.log('screenshot-all-ads-mobile.png saved');

  await browser.close();
  console.log('All done.');
})();
