'use strict';

// Standalone sitemap + RSS sync for the static site.
// Scans the on-disk page trees (teams/, h2h/, analysis/, predictions/league/,
// predictions/<league>/<market>/, predictions/date/, blog/) and rewrites
// public/sitemap.xml, then refreshes public/feed.xml via ./generate-rss.
// Safe to run standalone or at the end of any generator's main() so the
// sitemap always reflects what is actually deployed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'public');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const STATE_PATH = path.join(__dirname, '..', 'data', 'sitemap-lastmod.json');
const BASE_URL = 'https://winfulltime.com';
const ANALYSIS_SITEMAP_DAYS = 60;

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

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildSitemap() {
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
    { loc: 'https://winfulltime.com/blog/', file: 'blog/index.html', changefreq: 'weekly', priority: '0.9' }
  ];
  const DAILY_FILES = new Set(coreUrls.slice(0, 16).map(u => u.file));
  const coreXml = coreUrls.map(u => {
    const lastmod = DAILY_FILES.has(u.file)
      ? today
      : evergreenLastmod(u.loc, path.join(ROOT, u.file), today);
    return urlEntry(u.loc, lastmod, u.changefreq, u.priority);
  }).join('\n');

  // Blog posts. The HTML files are the source of truth — a post can be live
  // before it is added to articles-manifest.json.
  const blogDir = path.join(ROOT, 'blog');
  const blogEntries = fs.readdirSync(blogDir)
    .filter(file => file.endsWith('.html') && file !== 'index.html' && file !== 'blog-template.html')
    .sort()
    .map(file => {
      const html = fs.readFileSync(path.join(blogDir, file), 'utf8');
      if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
      const canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1]
        || `https://winfulltime.com/blog/${file}`;
      const modified = (html.match(/["']dateModified["']\s*:\s*["'](\d{4}-\d{2}-\d{2})/i) || [])[1]
        || evergreenLastmod(canonical, path.join(blogDir, file), today);
      return urlEntry(canonical, modified, 'monthly', '0.7');
    })
    .filter(Boolean)
    .join('\n');

  // Prerendered match-analysis pages. Pages live under dated directories
  // (/analysis/YYYY-MM-DD/slug/) so archives persist; only recent, indexable
  // ones are listed. Legacy undated directories are excluded.
  const analysisEntries = [];
  if (fs.existsSync(path.join(ROOT, 'analysis'))) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ANALYSIS_SITEMAP_DAYS);
    const cutoffISO = cutoff.toISOString().split('T')[0];
    fs.readdirSync(path.join(ROOT, 'analysis')).forEach(d => {
      const dateDir = path.join(ROOT, 'analysis', d);
      if (!fs.statSync(dateDir).isDirectory()) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (d < cutoffISO) return;
      fs.readdirSync(dateDir).forEach(slug => {
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
  const analysisXml = analysisEntries.join('\n');

  // Prerendered League Hub Pages (/predictions/league/slug/).
  const leagueEntries = listPageSlugs('predictions/league').map(slug =>
    urlEntry(`https://winfulltime.com/predictions/league/${slug}/`, today, 'daily', '0.8')
  ).join('\n');

  // Prerendered Evergreen H2H Pages (/h2h/slug/). Stub + deprecated variant
  // pages carry robots:noindex and a canonical pointing elsewhere - they are
  // skipped so only the canonical matchup URL is submitted.
  const h2hEntries = listPageSlugs('h2h').map(slug => {
    const page = path.join(ROOT, 'h2h', slug, 'index.html');
    if (!fs.existsSync(page)) return null;
    const html = fs.readFileSync(page, 'utf8');
    if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
    const canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1]
      || `https://winfulltime.com/h2h/${slug}/`;
    return urlEntry(canonical, evergreenLastmod(canonical, page, today), 'weekly', '0.7');
  }).filter(Boolean).join('\n');

  // Prerendered Team Profile Pages (/teams/slug/). Same treatment - stubs and
  // variant spelling pages are noindexed and canonicalized, not submitted.
  const teamEntries = listPageSlugs('teams').map(slug => {
    const page = path.join(ROOT, 'teams', slug, 'index.html');
    if (!fs.existsSync(page)) return null;
    const html = fs.readFileSync(page, 'utf8');
    if (/<meta name="robots"[^>]*noindex/i.test(html)) return null;
    const canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1]
      || `https://winfulltime.com/teams/${slug}/`;
    return urlEntry(canonical, evergreenLastmod(canonical, page, today), 'weekly', '0.7');
  }).filter(Boolean).join('\n');

  // Prerendered Date Archive Pages (/predictions/date/YYYY-MM-DD/). Immutable
  // per date, so lastmod is the date in the path.
  const dateEntries = listPageSlugs('predictions/date').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(d =>
    urlEntry(`https://winfulltime.com/predictions/date/${d}/`, d, 'never', '0.6')
  ).join('\n');

  // Prerendered Booking Code Converter Pages (/convert/ hub + /convert/<from>-to-<to>/).
  const convertHub = 'https://winfulltime.com/convert/';
  const convertEntries = [
    urlEntry(convertHub, evergreenLastmod(convertHub, path.join(ROOT, 'convert', 'index.html'), today), 'weekly', '0.8'),
    ...listPageSlugs('convert').map(slug => {
      const page = path.join(ROOT, 'convert', slug, 'index.html');
      const loc = `https://winfulltime.com/convert/${slug}/`;
      return urlEntry(loc, evergreenLastmod(loc, page, today), 'weekly', '0.7');
    })
  ].join('\n');

  // Prerendered Matrix Pages (/predictions/{league}/{market}/).
  const matrixEntries = [];
  if (fs.existsSync(path.join(ROOT, 'predictions'))) {
    const MARKET_SLUGS = ['1x2', 'over-1-5', 'over-2-5', 'under-2-5', 'btts', 'btts-no', 'corners', 'cards'];
    fs.readdirSync(path.join(ROOT, 'predictions')).forEach(leagueSlug => {
      if (!/^[\w-]+$/.test(leagueSlug)) return;
      const leagueDir = path.join(ROOT, 'predictions', leagueSlug);
      if (!fs.existsSync(leagueDir) || !fs.statSync(leagueDir).isDirectory()) return;
      MARKET_SLUGS.forEach(marketSlug => {
        const page = path.join(leagueDir, marketSlug, 'index.html');
        if (!fs.existsSync(page)) return;
        const robots = (fs.readFileSync(page, 'utf8').match(/<meta name="robots"[^>]*>/i) || [''])[0];
        if (/noindex/i.test(robots)) return;
        matrixEntries.push(urlEntry(`https://winfulltime.com/predictions/${leagueSlug}/${marketSlug}/`, today, 'daily', '0.6'));
      });
    });
  }
  const matrixXml = matrixEntries.join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${coreXml}
${analysisXml}
${leagueEntries}
${h2hEntries}
${matrixXml}
${teamEntries}
${convertEntries}
${dateEntries}
${blogEntries}
</urlset>
`;
}

function main() {
  fs.writeFileSync(SITEMAP_PATH, buildSitemap());
  saveState();
  console.log('Sitemap updated from on-disk page trees');

  try {
    require('./generate-rss').main();
  } catch (e) {
    console.warn('RSS feed generation warning:', e.message);
  }
}

if (require.main === module) main();

module.exports = { main, buildSitemap };
