// Builds complete SEO blog article HTML files from structured content data.
// Usage: node scripts/generate-article.js <data-file.json>
// Each item in the data file:
// {
//   "slug": "...", "title": "...", "description": "...", "keywords": "...",
//   "category": "Strategy", "section": "Core Betting Strategies",
//   "h1": "...", "lead": "...",
//   "content": "<p>...full body HTML...</p>",
//   "related": [{ "href": "/blog/x.html", "label": "X" }],
//   "share": "Short share text",
//   "date": "2026-08-02T09:00:00+01:00"
// }
const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', 'public', 'blog');
const ADDENDA_FILE = path.join(__dirname, '..', 'blog-data', 'addenda.json');
const FAQS_FILE = path.join(__dirname, '..', 'blog-data', 'faqs.json');
const DOMAIN = 'https://winfulltime.com';

function esc(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function enc(v) { return encodeURIComponent(String(v || '')); }

function slugifyTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadTeamEntries() {
  const teamsDir = path.join(__dirname, '..', 'public', 'teams');
  const entries = [];
  if (!fs.existsSync(teamsDir)) return entries;
  fs.readdirSync(teamsDir).forEach(slug => {
    const p = path.join(teamsDir, slug);
    if (!fs.statSync(p).isDirectory()) return;
    const f = path.join(p, 'index.html');
    if (!fs.existsSync(f)) return;
    const html = fs.readFileSync(f, 'utf8');
    const m = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const name = (m ? m[1] : slug).replace(/&amp;/g, '&').trim();
    if (!name) return;
    entries.push({ name, slug });
  });
  return entries;
}

function loadH2hSlugs() {
  const h2hDir = path.join(__dirname, '..', 'public', 'h2h');
  const slugs = [];
  if (!fs.existsSync(h2hDir)) return slugs;
  fs.readdirSync(h2hDir).forEach(slug => {
    const p = path.join(h2hDir, slug);
    if (fs.statSync(p).isDirectory()) slugs.push(slug);
  });
  return slugs;
}

const GENERIC_TEAM_WORDS = new Set(['start', 'city', 'united', 'inter', 'derby', 'union', 'real', 'club', 'team', 'elite']);

function matchTeamsInText(entries, text) {
  if (!entries || !entries.length || !text) return [];
  const hay = ' ' + text.replace(/\s+/g, ' ').trim() + ' ';
  const sorted = entries.slice().sort((a, b) => b.name.length - a.name.length);
  const matched = [];
  const used = new Set();
  for (const e of sorted) {
    const name = e.name;
    if (name.length < 4) continue;
    if (GENERIC_TEAM_WORDS.has(name.toLowerCase())) continue;
    const needleLower = name.toLowerCase();
    if ([...used].some(u => needleLower.includes(u))) continue;
    const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(hay)) {
      matched.push(e);
      used.add(needleLower);
    }
    if (matched.length >= 8) break;
  }
  return matched;
}

function relatedStatsHtml(teamEntries, h2hSlugs, text) {
  const matched = matchTeamsInText(teamEntries, text);
  if (!matched.length) return '';
  const h2hSet = new Set(h2hSlugs);
  const teamLinks = matched.map(e => `    <li><a href="/teams/${e.slug}/">${esc(e.name)}</a></li>`).join('\n');
  const h2hLinks = [];
  for (let i = 0; i < matched.length && h2hLinks.length < 4; i++) {
    for (let j = i + 1; j < matched.length && h2hLinks.length < 4; j++) {
      const a = slugifyTeam(matched[i].name);
      const b = slugifyTeam(matched[j].name);
      const s1 = a + '-vs-' + b;
      const s2 = b + '-vs-' + a;
      const slug = h2hSet.has(s1) ? s1 : h2hSet.has(s2) ? s2 : '';
      if (slug) h2hLinks.push(`    <li><a href="/h2h/${slug}/">${esc(matched[i].name)} vs ${esc(matched[j].name)} Head to Head</a></li>`);
    }
  }
  const h2hBlock = h2hLinks.length
    ? `<li style="margin-top:6px;padding-top:10px;border-top:1px solid var(--border);font-weight:600;">H2H Matchups</li>\n${h2hLinks.join('\n')}`
    : '';
  return `  <div class="related-posts" data-related-teams="wf">
   <h3>Related Teams &amp; H2H</h3>
   <ul>
${teamLinks}
${h2hBlock}
   </ul>
  </div>
`;
}

function slugifyHeading(text) {
  const base = String(text || '').toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || 'section';
}

// Give every H2/H3 an id (when missing) and return the content + a TOC list.
function addHeadingIds(content) {
  let seen = {};
  const processed = String(content || '').replace(/<h([23])([^>]*)>(.*?)<\/h\1>/g, function(m, level, attrs, inner) {
    const hasId = /id\s*=\s*["']/.test(attrs);
    if (hasId) return m;
    const raw = inner.replace(/<[^>]+>/g, '').trim();
    let id = slugifyHeading(raw);
    if (seen[id]) {
      seen[id]++;
      id = id + '-' + seen[id];
    } else {
      seen[id] = 1;
    }
    return '<h' + level + ' id="' + id + '">' + inner + '</h' + level + '>';
  });
  const toc = [];
  const re = /<h2[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/g;
  let m;
  while ((m = re.exec(processed)) !== null) {
    toc.push({ id: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() });
  }
  return { content: processed, toc };
}

function tocHtml(toc) {
  if (!toc || toc.length < 3) return '';
  const items = toc.map(t => `    <li><a href="#${esc(t.id)}">${esc(t.label)}</a></li>`).join('\n');
  return `  <nav class="toc" aria-label="Table of contents">
   <h3>Contents</h3>
   <ul>
${items}
   </ul>
  </nav>
`;
}

function faqSchema(faqs, url) {
  if (!faqs || !faqs.length) return '';
  const list = faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }));
  return `<!-- FAQPage schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": ${JSON.stringify(list)}
}
</script>
`;
}

function faqHtml(faqs) {
  if (!faqs || !faqs.length) return '';
  const items = faqs.map(f => `   <div class="faq-item">
    <h3>${esc(f.q)}</h3>
    <p>${f.a}</p>
   </div>`).join('\n');
  return `  <section class="faq">
   <h2 id="faq">Frequently Asked Questions</h2>
${items}
  </section>
`;
}

function relatedHtml(related) {
  return (related || []).map(r => `    <li><a href="${r.href}">${r.label}</a></li>`).join('\n');
}

function articleHtml(a, relatedBox) {
  const url = `${DOMAIN}/blog/${a.slug}.html`;
  const image = `${DOMAIN}/blog/thumbnails/${a.slug}.webp`;
  const breadcrumb = a.title.replace(/\s*[\|—]\s*WinFulltime.*$/, '').trim();
  const faqs = Array.isArray(a.faqs) ? a.faqs : [];
  const { content: bodyContent, toc } = addHeadingIds(a.content);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Preload hero font -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.description)}">
<meta name="keywords" content="${esc(a.keywords)}">
<link rel="canonical" href="${url}">
<meta name="author" content="Tochukwu Mesigo">
<meta name="robots" content="index, follow">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d1117">
<!-- Open Graph -->
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(a.description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="WinFulltime">
<meta property="article:published_time" content="${a.date}">
<meta property="article:modified_time" content="${a.date}">
<meta property="article:section" content="${esc(a.section)}">
<meta property="article:author" content="https://winfulltime.com/author-bio.html">
<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${url}">
<meta name="twitter:title" content="${esc(a.title)}">
<meta name="twitter:description" content="${esc(a.description)}">
<meta name="twitter:image" content="${image}">
<link rel="alternate" type="application/rss+xml" href="https://winfulltime.com/feed.xml" title="WinFulltime — Latest Posts">
<link rel="alternate" type="application/rss+xml" href="https://winfulltime.com/predictions-feed.xml" title="WinFulltime — Match Predictions">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="icon" type="image/png" href="/icons/favicon-32x32.png">
<script>
 window.startedAt = window.performance && performance.now();
</script>
<!-- Global site stylesheet -->
<style>
:root {
  --bg-primary: #0f1424;
  --bg-secondary: #151b30;
  --bg-card: rgba(19, 25, 46, 0.85);
  --bg-elevated: #1c2440;
  --text-primary: #e8edf5;
  --text-secondary: #c6cfdd;
  --text-muted: #8a96ad;
  --accent: #ff2448;
  --accent-dark: #d41a38;
  --accent-gradient: linear-gradient(135deg, #ff2448, #d41a38);
  --border: rgba(255,255,255,0.07);
  --border-hover: rgba(255,255,255,0.16);
  --radius: 16px;
  --radius-sm: 12px;
  --shadow: 0 14px 36px rgba(0,0,0,0.38);
  --font: 'Inter', system-ui, -apple-system, sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html { scroll-behavior: smooth; scroll-padding-top: 88px; }

body {
  font-family: var(--font);
  background: var(--bg-primary);
  background-image:
    radial-gradient(ellipse 75% 45% at 50% -12%, rgba(255,36,72,0.10), transparent),
    radial-gradient(ellipse 40% 30% at 100% 0%, rgba(124,58,237,0.07), transparent);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

.container { width: 100%; max-width: 840px; margin: 0 auto; padding: 0 20px; }

a { color: var(--accent); text-decoration: none; transition: color 0.2s ease; }
a:hover { color: var(--accent-dark); }

img { max-width: 100%; display: block; }

.post { padding: 44px 0 64px; }

.post .meta-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: var(--text-muted); margin: 0 0 22px; }
.post .meta-bar .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px rgba(255,36,72,0.15); }
.meta { color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.by { color: var(--text-muted); font-size: 13px; }
.by a { font-weight: 600; }

.post h1 {
  font-size: clamp(30px, 5vw, 44px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.12;
  margin: 0 0 18px;
  background: linear-gradient(180deg, #ffffff, #aab6cc);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.post .lead {
  font-size: clamp(16px, 2.2vw, 19px);
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.post h2 {
  font-size: clamp(24px, 3.4vw, 30px);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 48px 0 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  scroll-margin-top: 90px;
}
.post h2::before {
  content: "";
  flex-shrink: 0;
  width: 6px;
  height: 26px;
  border-radius: 99px;
  background: var(--accent-gradient);
}

.post h3 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 28px 0 12px; scroll-margin-top: 90px; }

.post p { line-height: 1.85; margin-bottom: 18px; color: var(--text-secondary); font-size: 16px; }
.post p:last-child { margin-bottom: 0; }
.post ul, .post ol { margin-bottom: 20px; padding-left: 24px; }
.post li { line-height: 1.8; margin-bottom: 10px; color: var(--text-secondary); font-size: 16px; }
.post li::marker { color: var(--accent); }
.post li > ul, .post li > ol { margin-top: 8px; }
.post a { font-weight: 500; }

.post blockquote {
  margin: 24px 0;
  padding: 18px 22px;
  border-left: 3px solid var(--accent);
  background: linear-gradient(135deg, rgba(255,36,72,0.08), rgba(255,36,72,0.03));
  border-radius: 0 12px 12px 0;
  font-style: italic;
  color: var(--text-muted);
}
.post blockquote p { margin: 0; }

.figure { text-align: center; margin: 28px 0; }
.figure img { border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); }
.post figcaption { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 10px; }

.highlight {
  background: linear-gradient(135deg, rgba(255,36,72,0.10), rgba(255,36,72,0.04));
  border: 1px solid rgba(255,36,72,0.25);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 20px 22px;
  margin: 28px 0;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text-secondary);
}
.highlight strong { color: #ff6b85; }

.stats-table {
  width: 100%;
  border-collapse: collapse;
  margin: 24px 0;
  font-size: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.stats-table th, .stats-table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); }
.stats-table th { color: var(--text-muted); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-elevated); }
.stats-table td { color: var(--text-secondary); }
.stats-table tr:last-child td { border-bottom: none; }

.tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 999px;
  background: rgba(255,36,72,0.12);
  border: 1px solid rgba(255,36,72,0.3);
  color: #ff8fa3;
  font-size: 12px;
  font-weight: 600;
  margin-right: 6px;
  margin-bottom: 6px;
}

.toc {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 24px;
  margin: 28px 0 36px;
  backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
.toc h3 {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.toc h3::before {
  content: "";
  width: 6px;
  height: 18px;
  border-radius: 99px;
  background: var(--accent-gradient);
}
.toc ul { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 28px; }
.toc li { margin-bottom: 8px; font-size: 14px; break-inside: avoid; }
.toc li a { color: var(--text-secondary); font-weight: 500; }
.toc li a:hover { color: var(--accent); }

.faq { margin: 40px 0; }
.faq h2 { margin: 0 0 8px; }
.faq-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 20px 22px;
  margin: 14px 0;
  backdrop-filter: blur(14px);
  transition: border-color 0.25s ease;
}
.faq-item:hover { border-color: var(--border-hover); }
.faq-item h3 { margin: 0 0 8px; font-size: 17px; }
.faq-item p { margin: 0; color: var(--text-muted); font-size: 15px; }

.cta {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px 32px;
  text-align: center;
  margin: 44px 0;
  backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
.cta h3 { font-size: 20px; font-weight: 700; margin-bottom: 10px; }
.cta p { color: var(--text-muted); font-size: 15px; }

.related-posts {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px 26px;
  margin: 32px 0;
  backdrop-filter: blur(14px);
}
.related-posts h3 {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin: 0 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.related-posts h3::before {
  content: "";
  width: 6px;
  height: 18px;
  border-radius: 99px;
  background: var(--accent-gradient);
}
.related-posts ul { list-style: none; margin: 0; padding: 0; }
.related-posts li { margin-bottom: 10px; font-size: 15px; }
.related-posts li:last-child { margin-bottom: 0; }
.related-posts li::before { content: "→"; color: var(--accent); margin-right: 8px; font-weight: 700; }
.related-posts li a { color: var(--text-secondary); font-weight: 500; }
.related-posts li a:hover { color: var(--accent); }

.social-share {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  margin: 40px 0 24px;
  padding: 24px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.social-share span { color: var(--text-muted); font-size: 14px; font-weight: 700; margin-right: 8px; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-gradient);
  color: #ffffff;
  padding: 12px 26px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  border: 0;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(255,36,72,0.28);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}
.btn:hover { color: #fff; transform: translateY(-2px); box-shadow: 0 12px 30px rgba(255,36,72,0.42); filter: brightness(1.05); }

.q {
  float: left;
  font-size: 64px;
  line-height: 0.78;
  font-weight: 800;
  color: var(--accent);
  padding: 8px 10px 0 0;
}

footer { background: var(--bg-secondary); border-top: 1px solid var(--border); padding: 40px 16px 24px; margin-top: auto; }
.footer-content { max-width: 960px; margin: 0 auto; text-align: center; }
.footer-links { display: flex; justify-content: center; gap: 28px; margin-bottom: 20px; flex-wrap: wrap; }
.footer-links a { color: var(--text-muted); text-decoration: none; font-weight: 500; font-size: 14px; transition: color 0.2s; }
.footer-links a:hover { color: var(--accent); }
.footer-copyright { color: var(--text-muted); font-size: 13px; }

@media (max-width: 640px) {
  .container { padding: 0 16px; }
  .post { padding: 34px 0 48px; }
  .toc ul { columns: 1; }
  .social-share { gap: 8px; }
}

:root[data-theme="light"] {
  --bg-primary: #f4f6fb;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255,255,255,0.92);
  --bg-elevated: #e9edf6;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --border: rgba(15,23,42,0.08);
  --border-hover: rgba(15,23,42,0.18);
  --shadow: 0 14px 36px rgba(15,23,42,0.12);
}
:root[data-theme="light"] .post h1 { background: linear-gradient(180deg, #0f172a, #475569); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
:root[data-theme="light"] .highlight strong { color: #d41a38; }
:root[data-theme="light"] .tag { color: #c22038; }
:root[data-theme="light"] .toc,
:root[data-theme="light"] .faq-item,
:root[data-theme="light"] .cta,
:root[data-theme="light"] .related-posts { box-shadow: none; }
</style>
<!-- wf-layout-styles -->
<style>
html{font-size:16px}
@media(max-width:700px){
  .hero h1{font-size:28px}
  .container{padding:0 12px}
}
body > header, header {
  background: rgba(24,30,48,0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}
body > header .header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  max-width: 960px;
  margin: 0 auto;
}
body > header .logo {
  display: flex;
  align-items: center;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  text-align: left;
  margin: 0;
}
body > header .logo a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
}
body > header .logo-icon {
  height: 28px;
  width: auto;
  flex-shrink: 0;
  margin-right: 8px;
}
body > header .logo span { color: #ff7e7e; }
body > header .hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  z-index: 1001;
}
body > header .hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--text-primary, #e8edf5);
  margin: 5px 0;
  transition: all 0.3s;
  border-radius: 2px;
}
body > header .hamburger.active span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
body > header .hamburger.active span:nth-child(2) { opacity: 0; }
body > header .hamburger.active span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
body > header nav { display: flex; gap: 24px; }
body > header nav a {
  color: var(--text-muted, #94a3b8);
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: color 0.2s;
  padding: 4px 0;
  position: relative;
}
body > header nav a:hover,
body > header nav a.active { color: var(--text-primary, #e8edf5); }
body > header nav .wft-auth-login,
body > header nav .wft-auth-account { display: inline-block; }
body > header nav .wft-auth-login:hover,
body > header nav .wft-auth-account:hover { color: #fff; opacity: 0.92; }
@media (max-width: 640px) {
  body > header .hamburger { display: block; }
  body > header nav {
    display: none !important;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary, #181e30);
    border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    z-index: 1000;
  }
  body > header nav.open { display: flex !important; }
}
</style>
<!-- Schema.org JSON-LD structured data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "${url}"
  },
  "headline": "${esc(breadcrumb)}",
  "description": "${esc(a.description)}",
  "image": "${image}",
  "author": { "@type": "Person", "name": "Tochukwu Mesigo", "url": "https://winfulltime.com/author-bio.html" },
  "publisher": { "@type": "Organization", "name": "WinFulltime", "logo": { "@type": "ImageObject", "url": "https://winfulltime.com/icons/icon-192.png" } },
  "datePublished": "${a.date}",
  "dateModified": "${a.date}",
  "articleSection": "${esc(a.section)}",
  "keywords": "${esc(a.keywords)}"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://winfulltime.com/"},
    {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://winfulltime.com/blog/"},
    {"@type": "ListItem", "position": 3, "name": "${esc(breadcrumb)}", "item": "${url}"}
  ]
}
</script>
${faqSchema(faqs, url)}
</head>
<body>
<header>
 <div class="header-content">
  <div class="logo">
   <a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a>
  </div>
  <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
  <nav id="nav">
   <a href="/">Home</a>
   <a href="/ticket-builder.html">Ticket Builder</a>
   <a href="/best-picks.html">Best Picks</a>
   <a href="/author-picks.html">Author Picks</a>
   <a href="/predictions/in-play">In-Play</a>
   <a href="/blog/" class="active">Blog</a>
   <span class="nav-auth" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
    <a href="/login.html" class="wft-auth-login" style="display:inline-block;background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;">Login</a>
    <a href="/account.html" class="wft-auth-account" style="display:none;background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;">Account</a>
   </span>
  </nav>
 </div>
</header>

<article class="post">
 <div class="container">

  <p class="meta-bar"><span class="meta">${esc(a.section)}</span><span class="dot"></span><span class="by">By <a href="/author-bio.html">Tochukwu Mesigo</a></span></p>

  <h1>${esc(a.h1)}</h1>

  <p class="lead">${esc(a.lead)}</p>

   <figure class="figure">
    <img src="/blog/thumbnails/${a.slug}.webp" alt="${esc(a.title)}" width="1200" height="630" loading="eager">
    <figcaption>${esc(a.thumbCaption || a.title)}</figcaption>
   </figure>

${tocHtml(toc)}

   ${bodyContent}

${faqHtml(faqs)}

${relatedBox || ''}

   <div class="cta">
   <h3>Put These Principles Into Practice Today</h3>
   <p>Every strategy on this page is only as good as the markets you apply it to. Check the latest predictions, odds, and in-play opportunities below.</p>
   <p style="margin:16px 0"><a href="/predictions/1x2" class="btn">1X2 Predictions</a> <a href="/predictions/in-play" class="btn">Live In-Play Tips</a></p>
  </div>

  <p class="by">Last updated: August 2026 | By <a href="/author-bio.html">Tochukwu Mesigo</a> | <span class="meta">Category: ${esc(a.section)}</span></p>

  <div class="related-posts">
   <h3>Keep Reading</h3>
   <ul>
${relatedHtml(a.related)}
   </ul>
  </div>

  <div style="margin: 0 auto 32px; max-width: 560px; background: linear-gradient(135deg, #151a2c, #20273b); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 28px 32px; text-align: center;">
   <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: rgba(255,36,72,0.6); margin-bottom: 8px;">Featured Tool</div>
   <h3 style="margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #e8edf5;">Build Winning Accumulator Tickets</h3>
   <p style="margin: 0 auto 16px; font-size: 14px; line-height: 1.6; max-width: 440px; color: rgba(232,237,245,0.55);">Generate optimized accumulator combinations from today's AI-powered predictions. Set your target odds and get instant ticket suggestions.</p>
   <a href="/ticket-builder.html" style="display: inline-block; background: linear-gradient(135deg, #ff2448, #d41a38); color: #fff; padding: 12px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">Pro Ticket Builder &rarr;</a>
  </div>

 </div>
</article>

<div class="social-share">
 <span>Share:</span>
 <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#1877f2;color:#fff;border-radius:8px;font-size:13px;font-weight:600" aria-label="Share on Facebook">Facebook</a>
 <a href="https://twitter.com/intent/tweet?text=${enc(a.share)}&url=${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#000;color:#fff;border-radius:8px;font-size:13px;font-weight:600" aria-label="Share on X">X (Twitter)</a>
 <a href="https://wa.me/?text=${enc(a.share)}%20${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#25d366;color:#fff;border-radius:8px;font-size:13px;font-weight:600" aria-label="Share on WhatsApp">WhatsApp</a>
</div>

<footer>
 <div class="footer-content container">
  <div style="text-align:center;margin-bottom:24px;">
   <p style="margin:0 0 12px;font-size:14px;color:var(--text-muted);">Catch live matches as they happen. Get golden tips and in-play alerts.</p>
   <a href="/predictions/in-play" style="display:inline-block;background:linear-gradient(135deg,#ff2448,#d41a38);color:white;padding:10px 28px;border-radius:8px;font-weight:600;font-size:14px;">In-Play Tips</a>
  </div>
  <div class="footer-links">
   <a href="/">Home</a>
   <a href="/ticket-builder.html">Ticket Builder</a>
   <a href="/2-odds-of-the-day.html">2 Odds</a>
   <a href="/best-picks.html">Best Picks</a>
   <a href="/author-picks.html">Author Picks</a>
   <a href="/blog/">Blog</a>
   <a href="/predictions/in-play">In-Play</a>
   <a href="/predictions/1x2">1X2</a>
   <a href="/predictions/over-1-5">Over 1.5</a>
   <a href="/predictions/over-2-5">Over 2.5</a>
   <a href="/predictions/btts">BTTS Yes</a>
   <a href="/predictions/btts-no">BTTS No</a>
   <a href="/predictions/unbeaten">Unbeaten</a>
   <a href="/predictions/corners">Corners</a>
   <a href="/predictions/cards">Cards</a>
   <a href="/advertise.html">Advertise</a>
   <a href="/contact.html">Contact</a>
   <a href="/terms.html">Terms</a>
   <a href="/privacy.html">Privacy</a>
  </div>
  <p class="footer-copyright">&copy; 2026 WinFulltime. All rights reserved.</p>
 </div>
 <div style="text-align:center;padding:12px 0;"><button id="themeToggle" class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">Light</button></div>
</footer>

 <script>
 document.getElementById('hamburger')?.addEventListener('click', function() {
   this.classList.toggle('active');
   document.getElementById('nav')?.classList.toggle('open');
 });
 </script>
 <script>
 (function() {
   const saved = localStorage.getItem("wf-theme");
   const theme = saved || "dark";
   document.documentElement.setAttribute("data-theme", theme === "dark" ? "" : "light");
   const btn = document.getElementById("themeToggle");
   if (btn) btn.textContent = theme === "dark" ? "Light" : "Dark";
 })();
 document.addEventListener("DOMContentLoaded", function() {
   const btn = document.getElementById("themeToggle");
   if (!btn) return;
   btn.addEventListener("click", function() {
     const html = document.documentElement;
     const isLight = html.getAttribute("data-theme") === "light";
     if (isLight) {
       html.removeAttribute("data-theme");
       btn.textContent = "Light";
       localStorage.setItem("wf-theme", "dark");
     } else {
       html.setAttribute("data-theme", "light");
       btn.textContent = "Dark";
       localStorage.setItem("wf-theme", "light");
     }
   });
 });
 </script>
 <!-- Google Analytics 4 -->
 <script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
 <script>
 window.dataLayer = window.dataLayer || [];
 function gtag(){dataLayer.push(arguments);}
 gtag('js', new Date());
 gtag('config', 'G-HMGZMW9EDP');
 </script>
 <script>window.__initialFcp = window.performance ? performance.getEntriesByName('first-contentful-paint')[0]?.startTime : 0;</script>
 <script src="/config.js"></script>
 <script src="/supabase-client.js"></script>
 <script src="/auth.js?v=20260801"></script>
<script src="/chat-widget.js" async></script>
<script src="/responsible-gambling.js"></script>
</body>
</html>
`;
}

function main() {
  const dataFile = process.argv[2];
  if (!dataFile) { console.error('Usage: node scripts/generate-article.js <data-file.json>'); process.exit(1); }
  const items = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  let addenda = {};
  if (fs.existsSync(ADDENDA_FILE)) {
    try {
      const list = JSON.parse(fs.readFileSync(ADDENDA_FILE, 'utf8'));
      for (const a of list) addenda[a.slug] = a.addendum;
    } catch (e) { console.error('Could not load addenda.json:', e.message); }
  }
  let faqsBySlug = {};
  if (fs.existsSync(FAQS_FILE)) {
    try {
      const list = JSON.parse(fs.readFileSync(FAQS_FILE, 'utf8'));
      for (const f of list) faqsBySlug[f.slug] = f.faqs;
    } catch (e) { console.error('Could not load faqs.json:', e.message); }
  }
  let count = 0;
  const teamEntries = loadTeamEntries();
  const h2hSlugs = loadH2hSlugs();
  for (const a of items) {
    if (!a.slug) { console.error('Missing slug for an item'); continue; }
    if (addenda[a.slug]) a.content += addenda[a.slug];
    if (faqsBySlug[a.slug]) a.faqs = faqsBySlug[a.slug];
    const searchText = `${a.title} ${a.h1 || ''} ${a.lead || ''} ${a.content || ''}`;
    const relatedBox = relatedStatsHtml(teamEntries, h2hSlugs, searchText);
    const html = articleHtml(a, relatedBox);
    fs.writeFileSync(path.join(BLOG_DIR, `${a.slug}.html`), html);
    console.log(`Wrote ${a.slug}.html`);
    count++;
  }
  console.log(`Done: ${count} article(s).`);
  if (count > 0) {
    const { main: regenerateBlogIndex } = require('./generate-blog-index');
    regenerateBlogIndex();
  }

  try { require('./update-sitemap').main(); } catch (e) { console.error('[article] Sitemap refresh failed:', e.message); }
}

if (require.main === module) main();
module.exports = { articleHtml, esc, slugifyTeam, loadTeamEntries, loadH2hSlugs, matchTeamsInText, relatedStatsHtml };
