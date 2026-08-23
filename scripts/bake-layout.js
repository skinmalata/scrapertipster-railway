'use strict';

// Bake the shared nav/footer layout into every static HTML page in public/.
// Runs in CI before the GitHub Pages upload so the static site carries the
// same canonical menu/footer as the Node server-rendered pages.

const fs = require('fs');
const path = require('path');
const { applyLayoutToHtml, SKIP_PAGES } = require('../src/templates/layout');

const ROOT = path.join(__dirname, '..', 'public');
const SKIP_FILES = new Set(['pinterest-ea6fdcfb1731666c03500a5d385f306f.html', 'yandex_7d24d4a4103b655d.html', '404.html']);

function listHtml(dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out = out.concat(listHtml(full));
    } else if (name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

// Convert an absolute public path into the URL path used for active-nav matching.
function urlPathFor(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  const first = rel.split('/')[0];
  if (SKIP_PAGES.has(first)) return null;
  let url = '/' + rel;
  if (url.endsWith('/index.html')) url = url.slice(0, -'index.html'.length);
  else if (url.endsWith('.html')) url = url.slice(0, -5);
  return url;
}

function main() {
  const files = listHtml(ROOT);
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const base = path.basename(file);
    if (SKIP_FILES.has(base)) { skipped++; continue; }

    const url = urlPathFor(file);
    if (url === null) { skipped++; continue; }

    try {
      const html = fs.readFileSync(file, 'utf8');
      const baked = applyLayoutToHtml(html, url);
      if (baked !== html) {
        fs.writeFileSync(file, baked);
        changed++;
      }
    } catch (err) {
      errors++;
      console.error(`FAIL ${file}: ${err.message}`);
    }
  }

  console.log(`Baked layout into ${changed} page(s), skipped ${skipped}, errors ${errors}`);
  if (errors > 0) process.exit(1);
}

if (require.main === module) main();
module.exports = { main, listHtml, urlPathFor };
