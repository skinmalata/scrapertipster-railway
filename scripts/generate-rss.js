'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const OUTPUT_FILE = path.join(ROOT, 'feed.xml');
const PREDICTIONS_OUTPUT_FILE = path.join(ROOT, 'predictions-feed.xml');
const BASE_URL = 'https://winfulltime.com';

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRssDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toUTCString();
}

function main() {
  const items = [];
  const nowUtc = new Date().toUTCString();

  // 1. Collect League Hub Pages
  const leagueDir = path.join(ROOT, 'predictions', 'league');
  if (fs.existsSync(leagueDir)) {
    fs.readdirSync(leagueDir).forEach(slug => {
      const pagePath = path.join(leagueDir, slug, 'index.html');
      if (!fs.existsSync(pagePath)) return;
      const leagueName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      items.push({
        title: `${leagueName} Predictions & Betting Tips Today`,
        link: `${BASE_URL}/predictions/league/${slug}/`,
        description: `Free ${leagueName} football predictions, 1X2 tips, over 2.5 goals, and corner statistics for today.`,
        pubDate: nowUtc,
        guid: `${BASE_URL}/predictions/league/${slug}/`
      });
    });
  }

  // 2. Collect Evergreen H2H Pages (top 25)
  const h2hDir = path.join(ROOT, 'h2h');
  if (fs.existsSync(h2hDir)) {
    const h2hSlugs = fs.readdirSync(h2hDir).filter(s => /^[\w-]+$/.test(s)).slice(0, 25);
    h2hSlugs.forEach(slug => {
      const pagePath = path.join(h2hDir, slug, 'index.html');
      if (!fs.existsSync(pagePath)) return;
      const parts = slug.split('-vs-');
      const home = parts[0] ? parts[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Home';
      const away = parts[1] ? parts[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Away';
      items.push({
        title: `${home} vs ${away} Head to Head Stats & History`,
        link: `${BASE_URL}/h2h/${slug}/`,
        description: `Evergreen head-to-head statistics, unbeaten streaks, win records, and match predictions for ${home} vs ${away}.`,
        pubDate: nowUtc,
        guid: `${BASE_URL}/h2h/${slug}/`
      });
    });
  }

  // 3. Collect Recent Match Analysis Pages (top 15)
  const analysisDir = path.join(ROOT, 'analysis');
  if (fs.existsSync(analysisDir)) {
    const dates = fs.readdirSync(analysisDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    if (dates.length > 0) {
      const latestDate = dates[0];
      const dateDir = path.join(analysisDir, latestDate);
      const matchSlugs = fs.readdirSync(dateDir).filter(s => /^[\w-]+$/.test(s)).slice(0, 15);
      matchSlugs.forEach(slug => {
        const pagePath = path.join(dateDir, slug, 'index.html');
        if (!fs.existsSync(pagePath)) return;
        const titleMatch = (fs.readFileSync(pagePath, 'utf8').match(/<title>([^<]+)<\/title>/i) || [])[1];
        items.push({
          title: titleMatch ? titleMatch.replace(' | WinFulltime', '') : `Match Analysis ${slug}`,
          link: `${BASE_URL}/analysis/${latestDate}/${slug}/`,
          description: `Data-driven match analysis, probability metrics, and prediction for ${slug} on ${latestDate}.`,
          pubDate: formatRssDate(latestDate),
          guid: `${BASE_URL}/analysis/${latestDate}/${slug}/`
        });
      });
    }
  }

  // Render RSS XML
  const itemsXml = items.map(i => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.link)}</link>
      <description>${escapeXml(i.description)}</description>
      <pubDate>${i.pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(i.guid)}</guid>
    </item>`).join('\n');

  const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WinFulltime Football Predictions &amp; Match Analysis</title>
    <link>${BASE_URL}</link>
    <description>Daily data-driven football predictions, 1X2 tips, over 2.5 goals, BTTS, corner statistics, and head to head analysis.</description>
    <language>en-us</language>
    <lastBuildDate>${nowUtc}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;

  fs.writeFileSync(OUTPUT_FILE, rssXml);
  fs.writeFileSync(PREDICTIONS_OUTPUT_FILE, rssXml);
  console.log(`[rss-generator] Generated RSS feed with ${items.length} items at ${OUTPUT_FILE}`);
}

if (require.main === module) main();

module.exports = { main };
