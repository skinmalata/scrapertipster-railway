'use strict';

// Standalone sitemap + RSS sync for the static site.
// Scans the on-disk page trees (teams/, h2h/, analysis/, predictions/league/,
// predictions/<league>/<market>/, predictions/date/, blog/) and rewrites
// public/sitemap.xml as a sitemap index plus sharded child sitemaps under
// public/sitemaps/. Then refreshes public/feed.xml via ./generate-rss.
// Safe to run standalone or at the end of any generator's main() so the
// sitemap always reflects what is actually deployed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'public');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITEMAPS_DIR = path.join(ROOT, 'sitemaps');
const STATE_PATH = path.join(__dirname, '..', 'data', 'sitemap-lastmod.json');
const BASE_URL = 'https://winfulltime.com';
const ANALYSIS_SITEMAP_DAYS = 60;

// The protocol caps a sitemap at 50,000 URLs / 50 MB uncompressed. Shard well
// below that so a single fast-growing tree (analysis, h2h, teams) can never
// push a child over the limit, and so the index stays small and cacheable.
const SHARD_URL_LIMIT = 10000;
const MAX_URLS_PER_SITEMAP = 50000;
const MAX_BYTES_PER_SITEMAP = 50 * 1024 * 1024;

// <lastmod> is a crawl signal, so it must only move when the page actually
// changes. These generators rewrite thousands of files on every run (the layout
// baker touches every page), so stamping `today` on everything made Google
// re-crawl the whole sitemap daily and it learned to ignore the signal.
//
// Three truthful strategies are used instead:
//   1. Dated archive URLs (/analysis/YYYY-MM-DD/..., /predictions/date/...) are
//      immutable - lastmod is the date in the path.
//   2. Genuinely daily hubs (home, market hubs, league + matrix pages) reflect
//      the current prediction run, so `today` is accurate.
//   3. Evergreen pages (teams, h2h, convert, static) keep their previous
//      lastmod until their content hash changes, tracked in data/sitemap-lastmod.json.
let lastmodState = null;

function loadState() {
  if (lastmodState) return lastmodState;
  lastmodState = {};
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (raw && typeof raw === 'object') lastmodState = raw;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('sitemap lastmod state unreadable:', err.message);
  }
  return lastmodState;
}

function saveState() {
  if (!lastmodState) return;
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(lastmodState));
}

function hashOf(absPath) {
  try {
    return crypto.createHash('md5').update(fs.readFileSync(absPath)).digest('hex');
  } catch (err) {
    return null;
  }
}

// Returns the lastmod to publish for an evergreen URL, and records the new
// state. Stable across runs: identical content keeps its original date.
function evergreenLastmod(url, absPath, today) {
  const hash = hashOf(absPath);
  if (!hash) return today;
  const state = loadState();
  const prev = state[url];
  const lastmod = prev && prev.hash === hash ? prev.lastmod : today;
  state[url] = { hash, lastmod };
  return lastmod;
}

function listPageSlugs(subDir) {
  const dir = path.join(ROOT, subDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(e => {
    try {
      return fs.statSync(path.join(dir, e)).isDirectory();
    } catch (err) {
      return false;
    }
  }).sort();
}

function canonicalOf(html) {
  return (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1] || null;
}

function absoluteUrl(value) {
  try {
    return new URL(value, BASE_URL + '/').href;
  } catch (err) {
    return value;
  }
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, '');
}

// A URL belongs in the sitemap only when its page exists, is indexable, and
// is its own canonical. Redirect stubs (meta refresh + noindex + canonical to
// a hub) and empty leftover directories are skipped.
function indexablePage(page, loc) {
  if (!fs.existsSync(page)) return false;
  const html = fs.readFileSync(page, 'utf8');
  if (/<meta name="robots"[^>]*noindex/i.test(html)) return false;
  const canonical = canonicalOf(html);
  return !canonical || normalizeUrl(absoluteUrl(canonical)) === normalizeUrl(loc);
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return { loc, lastmod, changefreq, priority };
}

function renderUrlEntry(entry) {
  return `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter(entry => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
}

function chunk(entries, size) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks;
}

function maxLastmod(entries) {
  return entries.reduce((max, entry) => entry.lastmod > max ? entry.lastmod : max, '1970-01-01');
}

function renderUrlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderUrlEntry).join('\n')}
</urlset>
`;
}

function renderIndex(files) {
  const children = files.map(file => `  <sitemap>
    <loc>${BASE_URL}/sitemaps/${file.name}</loc>
    <lastmod>${file.lastmod}</lastmod>
  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children}
</sitemapindex>
`;
}

function buildSitemaps() {
  const today = new Date().toISOString().split('T')[0];

  const coreUrls = [
    // daily: reflects the current prediction run
    { loc: 'https://winfulltime.com/', file: 'index.html', changefreq: 'daily', priority: '1.0' },
    { loc: 'https://winfulltime.com/analysis.html', file: 'analysis.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/', file: 'predictions/index.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/1x2', file: 'predictions/1x2.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/over-1-5', file: 'predictions/over-1-5.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/over-2-5', file: 'predictions/over-2-5.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/under-2-5', file: 'predictions/under-2-5.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/btts', file: 'predictions/btts.html', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/btts-no', file: 'predictions/btts-no.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/unbeaten', file: 'predictions/unbeaten.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/winning-streak', file: 'predictions/winning-streak.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/losing-streak', file: 'predictions/losing-streak.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/draws-streak', file: 'predictions/draws-streak.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/corners', file: 'predictions/corners.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/cards', file: 'predictions/cards.html', changefreq: 'daily', priority: '0.8' },
    // evergreen: only moves when the file itself changes
    { loc: 'https://winfulltime.com/options.html', file: 'options.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/about.html', file: 'about.html', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://winfulltime.com/contact.html', file: 'contact.html', changefreq: 'monthly', priority: '0.5' },
    { loc: 'https://winfulltime.com/policy.html', file: 'policy.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/privacy.html', file: 'privacy.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/terms.html', file: 'terms.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/advertise.html', file: 'advertise.html', changefreq: 'monthly', priority: '0.6' },
    { loc: 'https://winfulltime.com/ticket-builder.html', file: 'ticket-builder.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/converter.html', file: 'converter.html', changefreq: 'weekly', priority: '0.9' },
    { loc: 'https://winfulltime.com/code-splitter.html', file: 'code-splitter.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/code-merger.html', file: 'code-merger.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/code-analyzer.html', file: 'code-analyzer.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/blog/', file: 'blog/index.html', changefreq: 'weekly', priority: '0.9' }
  ];
  const DAILY_FILES = new Set(coreUrls.slice(0, 16).map(u => u.file));
  const coreEntries = coreUrls.map(u => urlEntry(
    u.loc,
    DAILY_FILES.has(u.file) ? today : evergreenLastmod(u.loc, path.join(ROOT, u.file), today),
    u.changefreq,
    u.priority
  ));

  // Blog posts. The HTML files are the source of truth - a post can be live
  // before it is added to articles-manifest.json.
  const blogDir = path.join(ROOT, 'blog');
  const blogEntries = fs.readdirSync(blogDir)
    .filter(file => file.endsWith('.html') && file !== 'index.html' && file !== 'blog-template.html')
    .sort()
    .map(file => {
      const page = path.join(blogDir, file);
      const html = fs.readFileSync(page, 'utf8');
      if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
      const canonical = absoluteUrl(canonicalOf(html) || `https://winfulltime.com/blog/${file}`);
      const modified = (html.match(/["']dateModified["']\s*:\s*["'](\d{4}-\d{2}-\d{2})/i) || [])[1]
        || evergreenLastmod(canonical, page, today);
      return urlEntry(canonical, modified, 'monthly', '0.7');
    })
    .filter(Boolean);

  // Prerendered match-analysis pages. Pages live under dated directories
  // (/analysis/YYYY-MM-DD/slug/) so archives persist; only recent, indexable
  // ones are listed. The 60-day window also bounds how large this shard can get.
  const analysisEntries = [];
  if (fs.existsSync(path.join(ROOT, 'analysis'))) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ANALYSIS_SITEMAP_DAYS);
    const cutoffISO = cutoff.toISOString().split('T')[0];
    fs.readdirSync(path.join(ROOT, 'analysis')).sort().forEach(d => {
      const dateDir = path.join(ROOT, 'analysis', d);
      if (!fs.statSync(dateDir).isDirectory()) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (d < cutoffISO) return;
      fs.readdirSync(dateDir).sort().forEach(slug => {
        if (!/^[\w-]+$/.test(slug)) return;
        const page = path.join(dateDir, slug, 'index.html');
        if (!fs.existsSync(page)) return;
        const robots = (fs.readFileSync(page, 'utf8').match(/<meta name="robots"[^>]*>/i) || [''])[0];
        if (/noindex/i.test(robots)) return;
        // The match date is part of the URL and the page is an immutable
        // archive of that fixture, so it is the accurate lastmod.
        analysisEntries.push(urlEntry(`https://winfulltime.com/analysis/${d}/${slug}/`, d, 'monthly', '0.8'));
      });
    });
  }

  // Prerendered League Hub Pages (/predictions/league/slug/). Only pages that
  // exist, are indexable, and canonicalise to themselves are submitted.
  const leagueEntries = listPageSlugs('predictions/league').map(slug => {
    const loc = `https://winfulltime.com/predictions/league/${slug}/`;
    const page = path.join(ROOT, 'predictions', 'league', slug, 'index.html');
    return indexablePage(page, loc) ? urlEntry(loc, today, 'daily', '0.8') : null;
  }).filter(Boolean);

  // Prerendered Evergreen H2H Pages (/h2h/slug/). Stub + deprecated variant
  // pages carry robots:noindex and a canonical pointing elsewhere - they are
  // skipped so only the canonical matchup URL is submitted.
  const h2hEntries = listPageSlugs('h2h').map(slug => {
    const page = path.join(ROOT, 'h2h', slug, 'index.html');
    if (!fs.existsSync(page)) return null;
    const html = fs.readFileSync(page, 'utf8');
    if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
    const canonical = absoluteUrl(canonicalOf(html) || `https://winfulltime.com/h2h/${slug}/`);
    return urlEntry(canonical, evergreenLastmod(canonical, page, today), 'weekly', '0.7');
  }).filter(Boolean);

  // Prerendered Team Profile Pages (/teams/slug/). Same treatment - stubs and
  // variant spelling pages are noindexed and canonicalized, not submitted.
  const teamEntries = listPageSlugs('teams').map(slug => {
    const page = path.join(ROOT, 'teams', slug, 'index.html');
    if (!fs.existsSync(page)) return null;
    const html = fs.readFileSync(page, 'utf8');
    if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
    const canonical = absoluteUrl(canonicalOf(html) || `https://winfulltime.com/teams/${slug}/`);
    return urlEntry(canonical, evergreenLastmod(canonical, page, today), 'weekly', '0.7');
  }).filter(Boolean);

  // Prerendered Date Archive Pages (/predictions/date/YYYY-MM-DD/). Immutable
  // per date, so lastmod is the date in the path. Missing pages and noindex
  // redirect stubs are skipped.
  const dateEntries = listPageSlugs('predictions/date')
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map(d => {
      const loc = `https://winfulltime.com/predictions/date/${d}/`;
      const page = path.join(ROOT, 'predictions', 'date', d, 'index.html');
      return indexablePage(page, loc) ? urlEntry(loc, d, 'never', '0.6') : null;
    })
    .filter(Boolean);

  // Prerendered Booking Code Converter Pages (/convert/ hub + /convert/<from>-to-<to>/).
  const convertHub = 'https://winfulltime.com/convert/';
  const convertEntries = [
    indexablePage(path.join(ROOT, 'convert', 'index.html'), convertHub)
      ? urlEntry(convertHub, evergreenLastmod(convertHub, path.join(ROOT, 'convert', 'index.html'), today), 'weekly', '0.8')
      : null,
    ...listPageSlugs('convert').map(slug => {
      const page = path.join(ROOT, 'convert', slug, 'index.html');
      const loc = `https://winfulltime.com/convert/${slug}/`;
      return indexablePage(page, loc)
        ? urlEntry(loc, evergreenLastmod(loc, page, today), 'weekly', '0.7')
        : null;
    })
  ].filter(Boolean);

  // Prerendered Matrix Pages (/predictions/{league}/{market}/). "league" and
  // "date" are reserved hub directories, not league slugs, so they must never
  // be treated as a league/market pair.
  const matrixEntries = [];
  if (fs.existsSync(path.join(ROOT, 'predictions'))) {
    const MARKET_SLUGS = ['1x2', 'over-1-5', 'over-2-5', 'under-2-5', 'btts', 'btts-no', 'corners', 'cards'];
    const RESERVED_DIRS = new Set(['league', 'date']);
    fs.readdirSync(path.join(ROOT, 'predictions')).sort().forEach(leagueSlug => {
      if (!/^[\w-]+$/.test(leagueSlug)) return;
      if (RESERVED_DIRS.has(leagueSlug)) return;
      const leagueDir = path.join(ROOT, 'predictions', leagueSlug);
      if (!fs.existsSync(leagueDir) || !fs.statSync(leagueDir).isDirectory()) return;
      MARKET_SLUGS.forEach(marketSlug => {
        const page = path.join(leagueDir, marketSlug, 'index.html');
        const loc = `https://winfulltime.com/predictions/${leagueSlug}/${marketSlug}/`;
        if (!indexablePage(page, loc)) return;
        matrixEntries.push(urlEntry(loc, today, 'daily', '0.6'));
      });
    });
  }

  const groups = [
    { name: 'pages', entries: dedupe([...coreEntries, ...leagueEntries, ...matrixEntries, ...convertEntries, ...dateEntries, ...blogEntries]) },
    { name: 'analysis', entries: dedupe(analysisEntries) },
    { name: 'h2h', entries: dedupe(h2hEntries) },
    { name: 'teams', entries: dedupe(teamEntries) }
  ];

  const files = [];
  for (const group of groups) {
    const chunks = chunk(group.entries, SHARD_URL_LIMIT);
    chunks.forEach((entries, i) => {
      const xml = renderUrlset(entries);
      if (entries.length > MAX_URLS_PER_SITEMAP) {
        throw new Error(`${group.name} shard ${i + 1} exceeds ${MAX_URLS_PER_SITEMAP} URLs`);
      }
      if (Buffer.byteLength(xml) > MAX_BYTES_PER_SITEMAP) {
        throw new Error(`${group.name} shard ${i + 1} exceeds 50 MB`);
      }
      files.push({
        name: `${group.name}-${i + 1}.xml`,
        xml,
        lastmod: maxLastmod(entries),
        count: entries.length
      });
    });
  }

  if (!files.length) throw new Error('sitemap generation produced no URLs');
  if (files.length > 50000) throw new Error('sitemap index exceeds 50,000 child sitemaps');

  return {
    files,
    index: renderIndex(files),
    total: groups.reduce((sum, group) => sum + group.entries.length, 0)
  };
}

function buildSitemap() {
  return buildSitemaps().index;
}

function main() {
  const { files, index, total } = buildSitemaps();
  fs.mkdirSync(SITEMAPS_DIR, { recursive: true });
  const keep = new Set(files.map(file => file.name));
  for (const file of files) {
    fs.writeFileSync(path.join(SITEMAPS_DIR, file.name), file.xml);
  }
  for (const existing of fs.readdirSync(SITEMAPS_DIR)) {
    if (existing.endsWith('.xml') && !keep.has(existing)) {
      fs.rmSync(path.join(SITEMAPS_DIR, existing), { force: true });
    }
  }
  fs.writeFileSync(SITEMAP_PATH, index);
  saveState();
  console.log(`Sitemap index updated: ${total} URLs across ${files.length} child sitemaps`);

  try {
    require('./generate-rss').main();
  } catch (e) {
    console.warn('RSS feed generation warning:', e.message);
  }
}

if (require.main === module) main();

module.exports = { main, buildSitemap, buildSitemaps };
