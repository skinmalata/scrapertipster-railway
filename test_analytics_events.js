// Verifies analytics-events.js fires the right dataLayer/GA4 events on key pages.
// Run: node test_analytics_events.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chrome = require('./src/config/puppeteer');

const ROOT = path.join(__dirname, 'public');
const PORT = 8199;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function events(page) {
  return page.evaluate(() => (window.dataLayer || []).filter(e => e && e.event).map(e => e.event));
}

async function expectEvent(page, clickFn, name) {
  const before = await events(page);
  await clickFn();
  await new Promise(r => setTimeout(r, 300));
  const after = await events(page);
  const found = after.slice(before.length).includes(name);
  console.log((found ? 'PASS' : 'FAIL') + ' - ' + name + ' (got: ' + JSON.stringify(after.slice(before.length)) + ')');
  return found;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: chrome.executablePath, args: chrome.args });
  const page = await browser.newPage();
  let ok = true;

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  ok = await expectEvent(page, () => page.click('#htbGenerate'), 'generate_ticket') && ok;
  ok = await expectEvent(page, () => page.evaluate(() => { document.getElementById('htbShuffle').disabled = false; document.getElementById('htbShuffle').click(); }), 'shuffle_ticket') && ok;
  ok = await expectEvent(page, () => page.evaluate(() => {
    const el = document.getElementById('tab-over25');
    el.addEventListener('click', e => e.preventDefault(), { once: true });
    el.click();
  }), 'select_market') && ok;
  ok = await expectEvent(page, () => page.evaluate(() => {
    const el = document.querySelector('a[href*="ko-fi.com"]');
    el.addEventListener('click', e => e.preventDefault(), { once: true });
    el.click();
  }), 'click_kofi') && ok;

  await page.goto(`http://localhost:${PORT}/converter.html`, { waitUntil: 'domcontentloaded' });
  const hasGa4 = await page.evaluate(() => typeof window.gtag === 'function');
  console.log((hasGa4 ? 'PASS' : 'FAIL') + ' - GA4 gtag present on converter.html');
  ok = ok && hasGa4;
  ok = await expectEvent(page, () => page.click('#cvDecodeBtn'), 'decode_code') && ok;
  ok = await expectEvent(page, () => page.click('#cvConvertBtn'), 'convert_code') && ok;

  await page.goto(`http://localhost:${PORT}/pricing.html`, { waitUntil: 'domcontentloaded' });
  // handleSubscribe redirects when logged out, so read dataLayer synchronously after click()
  const subResult = await page.evaluate(() => {
    document.querySelectorAll('.btn-subscribe')[1].click();
    return (window.dataLayer || []).filter(e => e && e.event).map(e => e.event);
  });
  const subFound = subResult.includes('begin_subscribe');
  console.log((subFound ? 'PASS' : 'FAIL') + ' - begin_subscribe (got: ' + JSON.stringify(subResult) + ')');
  ok = ok && subFound;

  await page.goto(`http://localhost:${PORT}/login.html`, { waitUntil: 'domcontentloaded' });
  ok = await expectEvent(page, () => page.click('#login-btn'), 'login_attempt') && ok;

  await page.goto(`http://localhost:${PORT}/signup.html`, { waitUntil: 'domcontentloaded' });
  const gaSignup = await page.evaluate(() => typeof window.gtag === 'function');
  console.log((gaSignup ? 'PASS' : 'FAIL') + ' - GA4 gtag present on signup.html');
  ok = ok && gaSignup;

  await browser.close();
  server.close();
  console.log(ok ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
