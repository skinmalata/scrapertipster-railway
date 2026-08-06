'use strict';

// Regenerates the <div id="staticContent"> block of public/blog/index.html.
// The existing index is treated as ground truth: cards already present keep
// their section + label + order verbatim. Articles that exist on disk but are
// missing from the index are appended to the matching section (or a new
// section created on demand) using metadata parsed from the article file
// itself and a manifest category -> section/label mapping table.
//
// Usage: node scripts/generate-blog-index.js
//   --check  Only report what would change without writing.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'public', 'blog', 'index.html');
const BLOG_DIR = path.join(ROOT, 'public', 'blog');
const MANIFEST_FILE = path.join(ROOT, 'articles-manifest.json');

// Map an article's manifest category to a blog-index tab section + card label.
const CATEGORY_MAP = {
  Strategy: { section: 'Betting Strategies', label: 'Strategy' },
  Analysis: { section: 'Analysis & Statistics', label: 'Analysis' },
  Guide: { section: 'Guides & Education', label: 'Guide' },
  Markets: { section: 'Betting Markets', label: 'Markets' },
  'World Cup 2026': { section: 'Football News', label: 'World Cup 2026' },
  Psychology: { section: 'Guides & Education', label: 'Psychology' },
  Bankroll: { section: 'Core Betting Strategies', label: 'Bankroll' },
  'Betting Strategies': { section: 'Betting Strategies', label: 'Betting Strategies' },
  'Analysis & Statistics': { section: 'Analysis & Statistics', label: 'Analysis & Statistics' }
};

const DEFAULT_PLACEMENT = { section: 'Football News', label: 'News' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unesc(v) {
  return String(v == null ? '' : v)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'");
}

function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  const month = parseInt(m[2], 10);
  const year = parseInt(m[1], 10);
  if (month < 1 || month > 12) return '';
  return `${MONTHS[month - 1]} ${year}`;
}

// Locate each .category-section by its opening tag. Sections are sequential
// (never nested), so the next opening tag (or the end of the body) is the
// boundary. Cards inside are <a class="post-card">...</a> blocks.
function parseIndex(page) {
  const marker = '<div id="staticContent">';
  const start = page.indexOf(marker);
  if (start < 0) throw new Error('index.html missing <div id="staticContent">');

  const scriptAnchor = page.indexOf('const POSTS_PER_PAGE');
  if (scriptAnchor < 0) throw new Error('index.html missing blog script anchor');

  const close = page.lastIndexOf('</div>', scriptAnchor);
  if (close < start) throw new Error('could not locate staticContent close tag');

  const bodyStart = start + marker.length;
  const body = page.slice(bodyStart, close);

  const cardRe = /<a\s+href="([^"]+)"\s+class="post-card">([\s\S]*?)<\/a>/g;
  const sectionOpenRe = /<div class="category-section">/g;
  const boundaries = [];
  let m;
  while ((m = sectionOpenRe.exec(body)) !== null) boundaries.push(m.index);
  boundaries.push(body.length);

  const sections = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const raw = body.slice(boundaries[i], boundaries[i + 1]);
    const titleMatch = raw.match(/<h2\s+class="category-title">\s*([^<]+?)\s*<\/h2>/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    const cards = [];
    cardRe.lastIndex = 0;
    while ((m = cardRe.exec(raw)) !== null) {
      const inner = m[2];
      const label = (inner.match(/class="post-category">\s*([^<]*?)\s*<\/span>/) || ['', ''])[1];
      const cardTitle = (inner.match(/class="post-title">\s*([^<]*?)\s*<\/h3>/) || ['', ''])[1];
      const excerpt = (inner.match(/class="post-excerpt">\s*([\s\S]*?)\s*<\/p>/) || ['', ''])[1];
      const date = (inner.match(/class="post-meta">\s*([^<]*?)\s*<\/span>/) || ['', ''])[1];
      cards.push({ href: m[1], label, title: cardTitle, excerpt, date, raw: m[0] });
    }
    sections.push({ title, cards });
  }

  return { page, bodyStart, bodyEnd: close + '</div>'.length, sections };
}

function buildCard(placement, meta) {
  const href = `/blog/${meta.slug}.html`;
  const label = esc(placement.label);
  const title = esc(meta.title);
  const excerpt = esc(meta.excerpt);
  const date = esc(meta.date || '');
  return `   <a href="${href}" class="post-card">

   <div class="post-card-content">

   <span class="post-category">${label}</span>

   <h3 class="post-title">${title}</h3>

   <p class="post-excerpt">${excerpt}</p>

   <span class="post-meta">${date}</span>

</div>

</a>`;
}

function buildSection(sectionTitle, cards) {
  const cardHtml = cards.map(c => c.raw || c).join('\n\n');
  return ` <div class="category-section">

  <h2 class="category-title"> ${sectionTitle}</h2>

   <div class="posts-grid">

${cardHtml}

   </div>

  </div>`;
}

function extractArticleMeta(slug) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  const html = fs.readFileSync(file, 'utf8');

  const titleRaw = (html.match(/<title>([\s\S]*?)<\/title>/i) || ['', ''])[1]
    .replace(/\s*\|\s*WinFulltime.*$/i, '').trim();

  const excerpt = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || ['', ''])[1].trim();

  const datePublished = (html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i) || ['', ''])[1]
    || (html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i) || ['', ''])[1];

  const sectionMeta = unesc((html.match(/<meta\s+property=["']article:section["']\s+content=["']([^"']*)["']/i) || ['', ''])[1]).trim();

  return {
    slug,
    title: titleRaw || slug,
    excerpt,
    date: datePublished ? formatMonthYear(datePublished) : '',
    sectionMeta
  };
}

function placementFor(slug, manifestCat, articleMeta) {
  if (manifestCat && CATEGORY_MAP[manifestCat]) return CATEGORY_MAP[manifestCat];
  const knownSections = new Set([
    'Football News', 'Football Facts & Rules', 'Payments & Banking',
    'Core Betting Strategies', 'Analysis & Statistics', 'Betting Markets',
    'Betting Strategies', 'Guides & Education', 'Football History'
  ]);
  if (articleMeta.sectionMeta && knownSections.has(articleMeta.sectionMeta)) {
    return { section: articleMeta.sectionMeta, label: articleMeta.sectionMeta };
  }
  return DEFAULT_PLACEMENT;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const page = fs.readFileSync(INDEX_FILE, 'utf8');
  const parsed = parseIndex(page);

  const manifestCats = {};
  if (fs.existsSync(MANIFEST_FILE)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    for (const a of manifest) manifestCats[a.slug] = a.category;
  }

  const existingSlugs = new Set();
  const byTitle = new Map();
  const order = [];
  parsed.sections.forEach(sec => {
    order.push(sec.title);
    const list = byTitle.get(sec.title) || [];
    for (const c of sec.cards) {
      const slug = c.href.replace(/^\/blog\//, '').replace(/\.html$/, '');
      existingSlugs.add(slug);
      list.push({ ...c, slug });
    }
    byTitle.set(sec.title, list);
  });

  const newSlugs = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'blog-template.html')
    .map(f => f.replace(/\.html$/, ''))
    .filter(slug => !existingSlugs.has(slug))
    .sort();

  let additions = newSlugs.map(slug => {
    const meta = extractArticleMeta(slug);
    const placement = placementFor(slug, manifestCats[slug], meta);
    return { slug, meta, placement };
  });

  if (checkOnly) {
    console.log(`Existing sections: ${order.length} (${parsed.sections.reduce((n, s) => n + s.cards.length, 0)} cards)`);
    console.log(`New articles to add: ${additions.length}`);
    for (const a of additions) {
      console.log(`  ${a.slug} -> [${a.placement.section}] label=${a.placement.label}`);
    }
    return;
  }

  const sectionsOut = [];
  for (const secTitle of byTitle.keys()) {
    const cards = byTitle.get(secTitle);
    const append = additions
      .filter(a => a.placement.section === secTitle)
      .map(a => buildCard(a.placement, a.meta));
    sectionsOut.push(buildSection(secTitle, [...cards.map(c => c.raw), ...append]));
    additions = additions.filter(a => a.placement.section !== secTitle);
  }

  const remainingSections = new Map();
  for (const a of additions) {
    if (!remainingSections.has(a.placement.section)) remainingSections.set(a.placement.section, []);
    remainingSections.get(a.placement.section).push(a);
  }
  for (const [title, items] of remainingSections) {
    const cards = items.map(a => buildCard(a.placement, a.meta));
    sectionsOut.push(buildSection(title, cards));
  }

  const newBody = sectionsOut.join('\n\n');

  // Replace the inner content of staticContent, keeping the original open and
  // close tags (and everything after the close tag) untouched.
  const newPage = page.slice(0, parsed.bodyStart) + '\n\n' + newBody + page.slice(parsed.bodyEnd - '</div>'.length);

  fs.writeFileSync(INDEX_FILE, newPage);
  console.log(`[blog-index] Updated staticContent: ${parsed.sections.reduce((n, s) => n + s.cards.length, 0)} existing + ${newSlugs.length} new cards`);

  try { require('./update-sitemap').main(); } catch (e) { console.error('[blog-index] Sitemap refresh failed:', e.message); }
}

if (require.main === module) main();

module.exports = { main };
