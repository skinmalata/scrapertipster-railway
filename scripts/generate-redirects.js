'use strict';

// Generates client-side redirect stub pages (meta-refresh + canonical) for
// URLs that 404 on GitHub Pages (which has no server-side redirects).
// Stubs carry robots:noindex so sitemap scans skip them.
// Safe to re-run: existing real pages are never overwritten.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const BASE_URL = 'https://winfulltime.com';

const STUB = (target) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Redirecting - WinFulltime</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${BASE_URL}${target}">
<meta http-equiv="refresh" content="0; url=${BASE_URL}${target}">
<script>location.replace("${BASE_URL}${target}");</script>
</head>
<body>
<p>This page has moved to <a href="${BASE_URL}${target}">${BASE_URL}${target}</a>.</p>
</body>
</html>
`;

// Legacy undated analysis slugs that 404. Three have dated counterparts on disk.
const LEGACY_WITH_DATED = {
  'cork-city-vs-athlone-town': '/analysis/2026-08-03/cork-city-vs-athlone-town/',
  'vasalunds-if-vs-sollentuna-fk': '/analysis/2026-08-03/vasalunds-if-vs-sollentuna-fk/',
  'sjk-vs-hjk-helsinki': '/analysis/2026-08-03/sjk-vs-hjk-helsinki/'
};

const LEGACY_ANALYSIS_SLUGS = [
  'cork-city-vs-athlone-town',
  'vasalunds-if-vs-sollentuna-fk',
  'sjk-vs-hjk-helsinki',
  'ifk-stocksund-vs-karlbergs-bk',
  'ansan-greeners-vs-gimhae-city',
  'hammarby-talang-ff-vs-fc-arlanda',
  'newells-old-boys-vs-boca-juniors',
  'wolfsberger-ac-vs-austria-vienna',
  'daejeon-citizen-vs-gwangju-fc',
  'fc-bihor-vs-unirea-2004-slobozia',
  'gomel-vs-vitebsk',
  'univers-cluj-vs-botosani',
  'fk-tukums-2000-vs-fk-liepaja',
  'pogon-siedlce-vs-termalica-nieciecza',
  'ik-brage-vs-landskrona-bois',
  'utah-royals-w-vs-portland-thorns-w',
  'olimpija-ljubljana-vs-aluminij',
  'fc-krasnodar-vs-fakel',
  'fc-nizhny-novgorod-vs-shinnik-yaroslavl',
  'stal-mielec-vs-podbeskidzie',
  'waterford-fc-vs-shelbourne',
  'molde-vs-sparta-sarpsborg',
  'burnley-vs-torino',
  'lorenskog-vs-honefoss',
  'polonia-warszawa-vs-unia-skierniewice',
  'austria-lustenau-vs-ried',
  'hamburger-sv-vs-everton',
  'mjondalen-vs-notodden',
  'millwall-vs-antwerp',
  'ull-kisa-vs-tromsdalen-uil',
  'ab-vs-skala',
  'petrocub-vs-politehnica-utm',
  'charlotte-independence-vs-one-knoxville-sc',
  'leicester-vs-genoa',
  'new-york-red-bulls-2-vs-new-england-revolution-ii',
  'atletico-mg-vs-juventude',
  'thailand-vs-malaysia',
  'preussen-munster-vs-southampton',
  'east-kilbride-vs-queen-of-the-south',
  'girona-vs-arsenal',
  'santos-vs-remo',
  'peterhead-vs-ross-county',
  'hannoverscher-sc-vs-kickers-emden',
  'chelsea-vs-tottenham',
  'racing-louisville-w-vs-chicago-red-stars-w'
];

// Dated analysis dirs that were never generated (not in analysis-archive.json).
const MISSING_DATED_ANALYSIS = [
  ['2026-08-05', 'podbeskidzie-vs-hutnik-nowa-huta'],
  ['2026-08-04', 'tenerife-vs-tamaraceite'],
  ['2026-08-05', 'olimpia-grudziadz-vs-swit-skolwin'],
  ['2026-08-04', 'ru-saint-gilloise-vs-bodo']
];

// Blog slug mismatches (flat .html stubs so extensionless URLs resolve).
const BLOG_REDIRECTS = {
  'next-goal-markets': '/blog/next-goal-betting.html',
  'betting-for-beginners': '/blog/beginners-guide-football-betting.html',
  'betting-strategies-that-work': '/blog/football-betting-strategies.html',
  'country-where-': '/blog/country-where-footballers-are-treated-like-religious-figures.html',
  'POST-SLUG-HERE': '/blog/'
};

// Top-level dead URLs.
const TOP_LEVEL_REDIRECTS = {
  'Home': '/',
  'in-play': '/predictions/in-play',
  'news': '/blog/'
};

// Matrix page never generated (league has no cards data) -> league hub.
const MATRIX_REDIRECTS = [
  ['uruguayan-primera-division', 'cards', '/predictions/league/uruguayan-primera-division/']
];

function writeStub(relativeFile, target) {
  if (!target) throw new Error(`No target for ${relativeFile}`);
  const abs = path.join(ROOT, relativeFile);
  if (fs.existsSync(abs)) {
    console.log(`skip (exists): ${relativeFile}`);
    return false;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, STUB(target));
  console.log(`stub: ${relativeFile} -> ${target}`);
  return true;
}

function main() {
  let count = 0;

  // 1. Legacy analysis stubs (undated, excluded from sitemap already).
  for (const slug of LEGACY_ANALYSIS_SLUGS) {
    const target = LEGACY_WITH_DATED[slug] || '/analysis.html';
    if (writeStub(path.join('analysis', slug, 'index.html'), target)) count++;
  }

  // 2. Missing dated analysis stubs (noindex skips sitemap scan).
  for (const [date, slug] of MISSING_DATED_ANALYSIS) {
    if (writeStub(path.join('analysis', date, slug, 'index.html'), '/analysis.html')) count++;
  }

  // 3. Blog slug mismatch stubs.
  for (const [slug, target] of Object.entries(BLOG_REDIRECTS)) {
    if (writeStub(path.join('blog', `${slug}.html`), target)) count++;
  }

  // 4. Top-level dead URL stubs.
  for (const [name, target] of Object.entries(TOP_LEVEL_REDIRECTS)) {
    if (writeStub(`${name}.html`, target)) count++;
  }

  // 5. Matrix stubs.
  for (const [league, market, target] of MATRIX_REDIRECTS) {
    if (writeStub(path.join('predictions', league, market, 'index.html'), target)) count++;
  }

  console.log(`\nCreated ${count} redirect stub(s).`);
}

if (require.main === module) main();

module.exports = { main };
