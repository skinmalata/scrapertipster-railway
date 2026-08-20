'use strict';

// Generates client-side redirect stub pages (meta-refresh + canonical) for
// URLs that 404 on GitHub Pages (which has no server-side redirects).
// Stubs carry robots:noindex so sitemap scans skip them.
// Safe to re-run: existing real pages are never overwritten.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'public');
const BASE_URL = 'https://winfulltime.com';
const KNOWN_404_FILE = path.join(__dirname, 'data', 'known-404-redirects.json');

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
  'team-to-score-first': '/blog/first-goalscorer-betting.html',
  'over-under-betting-strategy': '/blog/what-is-over-under-betting.html',
  'POST-SLUG-HERE': '/blog/'
};

// Merged 1xBet country reviews -> the single comprehensive 1xBet review.
const BLOG_1XBET_COUNTRY_REDIRECTS = ['bangladesh', 'canada', 'ghana', 'india',
  'kenya', 'nigeria', 'pakistan', 'south-africa', 'uganda']
  .map(slug => [slug, '/blog/1xbet-review.html']);

// Top-level dead URLs.
const TOP_LEVEL_REDIRECTS = {
  'Home': '/',
  'in-play': '/predictions/in-play',
  'live': '/predictions/in-play',
  'latest-news': '/blog/',
  'blog': '/blog/',
  'news': '/blog/',
  'watch-live': '/predictions/in-play'
};

// Nested dead URLs (dir stubs or flat files under public/).
const NESTED_REDIRECTS = [
  ['predictions/live.html', '/predictions/in-play'],
  ['predictions/leagues/index.html', '/predictions/']
];

// Legacy team URLs with no page on this site (team pages are generated only
// for teams in today's matches). Redirect to the match analysis hub.
const TEAM_REDIRECTS = {
  'forge': '/analysis.html'
};

// Matrix page never generated (league has no cards data) -> league hub.
const MATRIX_REDIRECTS = [
  ['uruguayan-primera-division', 'cards', '/predictions/league/uruguayan-primera-division/']
];

function writeStub(relativeFile, target) {
  if (!target) throw new Error(`No target for ${relativeFile}`);
  const abs = path.join(ROOT, relativeFile);
  const isDirStub = path.basename(abs) === 'index.html';
  if (fs.existsSync(abs)) {
    if (!fs.statSync(abs).isFile()) {
      console.log(`skip (not a file): ${relativeFile}`);
      return false;
    }
    const existing = fs.readFileSync(abs, 'utf8');
    if (isDirStub && /location\.replace/.test(existing)) {
      fs.writeFileSync(path.join(path.dirname(abs), '.redirect-stub'), '');
      console.log(`mark:  ${relativeFile}`);
    } else {
      const marker = isDirStub ? path.join(path.dirname(abs), '.redirect-stub') : null;
      if (marker && fs.existsSync(marker)) {
        fs.rmSync(marker, { force: true });
      }
      console.log(`skip (exists): ${relativeFile}`);
    }
    return false;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, STUB(target));
  if (isDirStub) {
    fs.writeFileSync(path.join(path.dirname(abs), '.redirect-stub'), '');
  }
  console.log(`stub: ${relativeFile} -> ${target}`);
  return true;
}

function loadKnown404Map() {
  const map = {};
  try {
    if (fs.existsSync(KNOWN_404_FILE)) {
      Object.assign(map, JSON.parse(fs.readFileSync(KNOWN_404_FILE, 'utf8')));
    }
  } catch (e) {
    console.warn('[redirects] Could not load known-404 table:', e.message);
  }
  return map;
}

const FLAT_SLUGS = new Set([
  '1x2', 'over-1-5', 'over-2-5', 'btts', 'btts-no', 'unbeaten',
  'winning-streak', 'losing-streak', 'draws-streak', 'corners', 'cards',
  'in-play', 'live', 'leagues', 'index'
]);

function toFile(pathKey) {
  let p = String(pathKey);
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (p.startsWith('/')) p = p.slice(1);
  if (p.endsWith('.html')) return p;
  if (p.startsWith('blog/')) return p + '.html';
  if (FLAT_SLUGS.has(p) || (p.startsWith('predictions/') && p.split('/').length === 2 && FLAT_SLUGS.has(p.split('/')[1]))) {
    return p + '.html';
  }
  return p + '/index.html';
}

// Directory pages have a request URL (/teams/x/) but live at x/index.html.
function underlyingPage(pathKey) {
  const rel = toFile(pathKey);
  const asPage = path.join(ROOT, rel);
  if (fs.existsSync(asPage) && fs.statSync(asPage).isFile()) return asPage;
  return null;
}

// Pages that were committed (published) but are missing after a fresh CI
// regenerate would otherwise hard-404. Stub them to the closest live page.
function scanCommittedMissing() {
  const map = {};
  let tracked = [];
  try {
    const out = execFileSync('git', ['ls-files', 'public/teams', 'public/h2h', 'public/analysis', 'public/predictions', 'public/convert', 'public/blog'], { encoding: 'utf8', cwd: path.join(__dirname, '..') });
    tracked = out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    console.warn('[redirects] git ls-files unavailable:', e.message);
    return map;
  }
  for (const file of tracked) {
    if (!file.endsWith('.html')) continue;
    const abs = path.join(__dirname, '..', file);
    if (fs.existsSync(abs)) continue;
    const rel = file.replace(/^public\//, '');
    const reqPath = '/' + rel;
    let target = null;
    if (/^teams\/[^/]+\/index\.html$/.test(rel)) {
      target = '/analysis.html';
    } else if (/^h2h\/[^/]+\/index\.html$/.test(rel)) {
      target = '/analysis.html';
    } else if (/^analysis\//.test(rel)) {
      target = '/analysis.html';
    } else if (/^predictions\/date\/\d{4}-\d{2}-\d{2}\/index\.html$/.test(rel)) {
      target = '/predictions/';
    } else if (/^predictions\/league\/[^/]+\/index\.html$/.test(rel)) {
      target = '/predictions/';
    } else if (/^predictions\/[^/]+\/[^/]+\/index\.html$/.test(rel)) {
      const league = rel.split('/')[1];
      const leagueHub = path.join(ROOT, 'predictions', 'league', league, 'index.html');
      target = fs.existsSync(leagueHub) ? `/predictions/league/${league}/` : '/predictions/';
    } else if (/^convert\/[^/]+\/index\.html$/.test(rel)) {
      target = '/convert/';
    } else if (/^blog\/.+\.html$/.test(rel)) {
      target = '/blog/';
    }
    if (target) map[reqPath] = target;
  }
  return map;
}

function collectTargets() {
  const unified = {};
  function add(pathKey, target) {
    if (!target || !pathKey) return;
    const trimmed = pathKey.startsWith('/') ? pathKey : '/' + pathKey;
    if (unified[trimmed]) return;
    unified[trimmed] = target;
  }

  for (const [slug, target] of Object.entries(BLOG_REDIRECTS)) {
    add(`blog/${slug}.html`, target);
  }
  for (const [slug, target] of BLOG_1XBET_COUNTRY_REDIRECTS) {
    add(`blog/1xbet-${slug}-review.html`, target);
  }
  for (const [name, target] of Object.entries(TOP_LEVEL_REDIRECTS)) {
    add(`${name}.html`, target);
  }
  for (const [file, target] of NESTED_REDIRECTS) {
    add(file, target);
  }
  for (const [date, slug] of MISSING_DATED_ANALYSIS) {
    add(`analysis/${date}/${slug}/index.html`, '/analysis.html');
  }
  for (const [league, market, target] of MATRIX_REDIRECTS) {
    add(`predictions/${league}/${market}/index.html`, target);
  }
  for (const [slug, target] of Object.entries(TEAM_REDIRECTS)) {
    add(`teams/${slug}/index.html`, target);
  }
  for (const slug of LEGACY_ANALYSIS_SLUGS) {
    const target = LEGACY_WITH_DATED[slug] || '/analysis.html';
    add(`analysis/${slug}/index.html`, target);
  }
  for (const [pathKey, target] of Object.entries(loadKnown404Map())) {
    add(pathKey.replace(/^\//, ''), target);
  }
  for (const [pathKey, target] of Object.entries(scanCommittedMissing())) {
    add(pathKey.replace(/^\//, ''), target);
  }
  return unified;
}

// A generator can later write a real page over a stub dir's index.html. Drop
// the stale .redirect-stub marker so the URL is never tracked as a redirect
// candidate again (markers must exist only when the page really is a stub).
function cleanStaleMarkers() {
  const trackedTrees = ['teams', 'h2h', 'analysis', 'predictions', 'convert'];
  let cleaned = 0;
  trackedTrees.forEach(tree => {
    const dir = path.join(ROOT, tree);
    if (!fs.existsSync(dir)) return;
    (function walk(d) {
      let entries;
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch (e) {
        return;
      }
      entries.forEach(entry => {
        const abs = path.join(d, entry.name);
        if (entry.isDirectory()) return walk(abs);
        if (entry.name !== '.redirect-stub') return;
        const indexHtml = path.join(d, 'index.html');
        if (!fs.existsSync(indexHtml)) {
          return;
        }
        try {
          if (!/location\.replace/.test(fs.readFileSync(indexHtml, 'utf8'))) {
            fs.rmSync(abs, { force: true });
            cleaned++;
          }
        } catch (e) {}
      });
    })(dir);
  });
  if (cleaned) console.log(`[redirects] Removed ${cleaned} stale redirect-stub marker(s).`);
}

function main() {
  cleanStaleMarkers();
  const unified = collectTargets();
  let count = 0;
  for (const [pathKey, target] of Object.entries(unified)) {
    const rel = toFile(pathKey);
    if (underlyingPage(pathKey)) continue;
    if (writeStub(rel, target)) count++;
  }
  console.log(`\nCreated ${count} redirect stub(s).`);
}

if (require.main === module) main();

module.exports = { main };
