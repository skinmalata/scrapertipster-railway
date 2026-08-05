'use strict';

// Standalone sitemap + RSS sync for the static site.
// Scans the on-disk page trees (teams/, h2h/, analysis/, predictions/league/,
// predictions/<league>/<market>/, predictions/date/, blog/) and rewrites
// public/sitemap.xml, then refreshes public/feed.xml via ./generate-rss.
// Safe to run standalone or at the end of any generator's main() so the
// sitemap always reflects what is actually deployed.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const BASE_URL = 'https://winfulltime.com';
const ANALYSIS_SITEMAP_DAYS = 60;

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
    { loc: 'https://winfulltime.com/', changefreq: 'daily', priority: '1.0' },
    { loc: 'https://winfulltime.com/options.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/analysis.html', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/about.html', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://winfulltime.com/contact.html', changefreq: 'monthly', priority: '0.5' },
    { loc: 'https://winfulltime.com/policy.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/privacy.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/terms.html', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://winfulltime.com/advertise.html', changefreq: 'monthly', priority: '0.6' },
    { loc: 'https://winfulltime.com/ticket-builder.html', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://winfulltime.com/blog/', changefreq: 'weekly', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/1x2', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/over-1-5', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/over-2-5', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/btts', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://winfulltime.com/predictions/btts-no', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/unbeaten', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/winning-streak', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/losing-streak', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/draws-streak', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/corners', changefreq: 'daily', priority: '0.8' },
    { loc: 'https://winfulltime.com/predictions/cards', changefreq: 'daily', priority: '0.8' }
  ];
  const coreXml = coreUrls.map(u => urlEntry(u.loc, today, u.changefreq, u.priority)).join('\n');

  // Blog posts. The HTML files are the source of truth — a post can be live
  // before it is added to articles-manifest.json.
  const blogDir = path.join(ROOT, 'blog');
  const blogEntries = fs.readdirSync(blogDir)
    .filter(file => file.endsWith('.html') && file !== 'index.html' && file !== 'blog-template.html')
    .sort()
    .map(file => {
      const html = fs.readFileSync(path.join(blogDir, file), 'utf8');
      const canonical = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1]
        || `https://winfulltime.com/blog/${file}`;
      const modified = (html.match(/["']dateModified["']\s*:\s*["'](\d{4}-\d{2}-\d{2})/i) || [])[1] || today;
      return urlEntry(canonical, modified, 'monthly', '0.7');
    })
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
        analysisEntries.push(urlEntry(`https://winfulltime.com/analysis/${d}/${slug}/`, today, 'daily', '0.8'));
      });
    });
  }
  const analysisXml = analysisEntries.join('\n');

  // Prerendered League Hub Pages (/predictions/league/slug/).
  const leagueEntries = listPageSlugs('predictions/league').map(slug =>
    urlEntry(`https://winfulltime.com/predictions/league/${slug}/`, today, 'daily', '0.8')
  ).join('\n');

  // Prerendered Evergreen H2H Pages (/h2h/slug/).
  const h2hEntries = listPageSlugs('h2h').map(slug =>
    urlEntry(`https://winfulltime.com/h2h/${slug}/`, today, 'weekly', '0.7')
  ).join('\n');

  // Prerendered Team Profile Pages (/teams/slug/).
  const teamEntries = listPageSlugs('teams').map(slug =>
    urlEntry(`https://winfulltime.com/teams/${slug}/`, today, 'weekly', '0.7')
  ).join('\n');

  // Prerendered Date Archive Pages (/predictions/date/YYYY-MM-DD/).
  const dateEntries = listPageSlugs('predictions/date').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(d =>
    urlEntry(`https://winfulltime.com/predictions/date/${d}/`, today, 'never', '0.6')
  ).join('\n');

  // Prerendered Matrix Pages (/predictions/{league}/{market}/).
  const matrixEntries = [];
  if (fs.existsSync(path.join(ROOT, 'predictions'))) {
    const MARKET_SLUGS = ['1x2', 'over-1-5', 'over-2-5', 'btts', 'btts-no', 'corners', 'cards'];
    fs.readdirSync(path.join(ROOT, 'predictions')).forEach(leagueSlug => {
      if (!/^[\w-]+$/.test(leagueSlug)) return;
      const leagueDir = path.join(ROOT, 'predictions', leagueSlug);
      if (!fs.existsSync(leagueDir) || !fs.statSync(leagueDir).isDirectory()) return;
      MARKET_SLUGS.forEach(marketSlug => {
        const page = path.join(leagueDir, marketSlug, 'index.html');
        if (!fs.existsSync(page)) return;
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
${dateEntries}
${blogEntries}
</urlset>
`;
}

function main() {
  fs.writeFileSync(SITEMAP_PATH, buildSitemap());
  console.log('Sitemap updated from on-disk page trees');

  try {
    require('./generate-rss').main();
  } catch (e) {
    console.warn('RSS feed generation warning:', e.message);
  }
}

if (require.main === module) main();

module.exports = { main, buildSitemap };
