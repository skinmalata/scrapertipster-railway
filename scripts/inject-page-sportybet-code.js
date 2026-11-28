'use strict';

const fs = require('fs');
const path = require('path');
const { generatePageSportybetCode } = require('../src/services/pageSportybetCode');
const { lagosDate } = require('../src/utils/dates');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CURATED_FILE = path.join(ROOT, 'scripts', 'perfect-record-curated.json');
const CACHE_FILE = path.join(PUBLIC_DIR, 'data', 'page-sportybet-code-cache.json');
const SCRIPT_TAG = '<script src="/page-sportybet-code.js?v=2" defer></script>';
const START = '<span data-wft-page-code-start></span>';
const END = '<span data-wft-page-code-end></span>';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function curatedDate() {
  try {
    const data = JSON.parse(fs.readFileSync(CURATED_FILE, 'utf8'));
    const rows = Array.isArray(data.matches) ? data.matches : [];
    return rows.reduce(function (latest, row) {
      const date = String((row && row.date) || '');
      return date && date > latest ? date : latest;
    }, '');
  } catch (e) {
    return '';
  }
}

function codeKey(meta) {
  return String(meta.source || '') + '|' + String(meta.date || '') + '|' + String(meta.league || '');
}

function loadCodeCache(day) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data && data.date === day && data.codes && typeof data.codes === 'object' ? data.codes : {};
  } catch (e) {
    return {};
  }
}

function saveCodeCache(day, codes) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: day, codes: codes }, null, 2));
  } catch (e) {
    console.warn('[page-sportybet-code] Could not save daily cache:', e.message);
  }
}

function attrs(meta) {
  let out = ' data-page-sportybet-code data-source="' + escapeHtml(meta.source) + '"';
  if (meta.date) out += ' data-date="' + escapeHtml(meta.date) + '"';
  if (meta.league) out += ' data-league="' + escapeHtml(meta.league) + '"';
  return out;
}

function renderSkipped(data) {
  if (!Array.isArray(data.skipped) || !data.skipped.length) return '';
  const names = data.skipped.slice(0, 20).map(function (item) { return escapeHtml(item.match); }).join(', ');
  return '<div class="wft-page-code-skipped">Skipped: ' + names + '</div>';
}

function renderCard(data) {
  if (!data || !data.success) {
    const message = (data && data.error) || 'No SportyBet code was generated for this page.';
    return '<section class="wft-page-code-card">' +
      '<div class="wft-page-code-kicker">SportyBet Code</div>' +
      '<div class="wft-page-code-body"><div class="wft-page-code-error">' + escapeHtml(message) + '</div></div>' +
      '</section>';
  }

  const skippedText = data.skippedCount
    ? data.skippedCount + ' unavailable ' + (data.skippedCount === 1 ? 'fixture' : 'fixtures') + ' skipped'
    : 'All selected fixtures available';
  const capText = data.cappedCount
    ? ' &middot; ' + data.cappedCount + ' extra fixtures omitted by the 30-selection limit'
    : '';
  const odds = Number(data.totalOdds);
  const hasOdds = Number.isFinite(odds) && odds > 0;
  const details = [
    '<span class="wft-page-code-stat">Odds: <strong>' + (hasOdds ? odds.toFixed(2) : '--') + '</strong></span>',
    '<span class="wft-page-code-stat">Legs: <strong>' + Number(data.legCount || 0) + '</strong></span>',
    '<span class="wft-page-code-stat">' + skippedText + capText + '</span>'
  ].join('');

  return '<section class="wft-page-code-card">' +
    '<div class="wft-page-code-head">' +
      '<div>' +
        '<div class="wft-page-code-kicker">SportyBet Code</div>' +
        '<h2 class="wft-page-code-title">All page predictions available on SportyBet</h2>' +
      '</div>' +
    '</div>' +
    '<div class="wft-page-code-body">' +
      '<span class="wft-page-code-code" data-wft-code-value>' + escapeHtml(data.code) + '</span>' +
      '<button type="button" class="wft-page-code-copy" data-wft-code-copy>Copy code</button>' +
      details +
    '</div>' +
    '<div class="wft-page-code-note">Generated once at build time. Fixtures not offered or priced on SportyBet are skipped automatically.</div>' +
    renderSkipped(data) +
    '</section>';
}

function widgetBlock(meta, data) {
  return '\n' + START + '\n<div class="wft-page-code"' + attrs(meta) + '>' + renderCard(data) + '</div>\n' + END + '\n';
}

function placeBlock(html, block) {
  const sentinel = /<span data-wft-page-code-start><\/span>[\s\S]*?<span data-wft-page-code-end><\/span>\n?/;
  if (sentinel.test(html)) return html.replace(sentinel, block);

  const oldHolder = /<div class="wft-page-code" data-page-sportybet-code[^>]*>[\s\S]*?<\/div>\n?/;
  if (oldHolder.test(html)) return html.replace(oldHolder, block);

  const mainIndex = html.indexOf('</main>');
  const bodyIndex = html.indexOf('</body>');
  const insertIndex = mainIndex >= 0 ? mainIndex : bodyIndex;
  if (insertIndex < 0) return null;
  return html.slice(0, insertIndex) + block + html.slice(insertIndex);
}

async function inject(file, meta, codeCache) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('</html>') || /location\.replace\s*\(/.test(html)) return false;

  const key = codeKey(meta);
  let data = codeCache[key];
  if (!data) {
    try {
      data = await generatePageSportybetCode(meta);
      if (data && data.success) codeCache[key] = data;
    } catch (e) {
      console.warn('[page-sportybet-code] Generation failed for ' + path.relative(ROOT, file) + ':', e.message);
      data = { success: false, error: 'SportyBet code is temporarily unavailable.' };
    }
  }

  const placed = placeBlock(html, widgetBlock(meta, data));
  if (placed == null) return false;
  html = placed;

  if (html.includes('/page-sportybet-code.js')) {
    html = html.replace(/<script src="\/page-sportybet-code\.js(?:\?v=\d+)?(?:\s+defer)?><\/script>/, SCRIPT_TAG);
  } else {
    html = html.replace('</body>', SCRIPT_TAG + '\n</body>');
  }

  fs.writeFileSync(file, html);
  return true;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === 'index.html') out.push(full);
  });
  return out;
}

function predictionMeta(file) {
  const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
  const parts = rel.split('/');
  if (parts[parts.length - 1] !== 'index.html' || !parts.includes('1x2')) return null;
  if (fs.existsSync(path.join(path.dirname(file), '.redirect-stub'))) return null;

  const meta = { source: '1x2' };
  const dateIndex = parts.indexOf('date');
  if (dateIndex >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(parts[dateIndex + 1] || '')) {
    meta.date = parts[dateIndex + 1];
  }

  const leagueIndex = parts.indexOf('league');
  if (leagueIndex >= 0 && parts[leagueIndex + 1] && parts[leagueIndex + 1] !== '1x2') {
    meta.league = parts[leagueIndex + 1];
  } else if (parts[0] === 'predictions' && parts.length >= 4 && parts[2] === '1x2') {
    meta.league = parts[1];
  }
  return meta;
}

async function main() {
  let injected = 0;
  const day = lagosDate(0);
  const codeCache = loadCodeCache(day);
  const pages = [
    { file: path.join(PUBLIC_DIR, 'index.html'), meta: { source: 'home' } },
    { file: path.join(PUBLIC_DIR, 'predictions', 'perfect-record.html'), meta: { source: 'perfect-record', date: curatedDate() } },
    { file: path.join(PUBLIC_DIR, 'predictions', '1x2.html'), meta: { source: '1x2' } }
  ];

  for (const page of pages) {
    if (await inject(page.file, page.meta, codeCache)) injected++;
  }

  const files = walk(path.join(PUBLIC_DIR, 'predictions'), []);
  for (const file of files) {
    const meta = predictionMeta(file);
    if (meta && await inject(file, meta, codeCache)) injected++;
  }

  saveCodeCache(day, codeCache);
  console.log('[page-sportybet-code] Generated and embedded codes in ' + injected + ' page(s)');
}

main().catch(function (err) {
  console.error('[page-sportybet-code] Failed:', err.message);
  process.exitCode = 1;
});
