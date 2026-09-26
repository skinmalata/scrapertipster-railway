'use strict';
// Normalise the in-page prediction menu to one canonical list.
//
// index.html already carries the requested list; the individual market pages
// drifted (different tab ids, HT/FT + GG2+ + Highest Scoring Half missing, a
// different order, and Win/Loss/Draw Streak tabs that only exist on some pages).
// This rewrites each tabs container to the canonical order, keeps the page's own
// tab marked active, and preserves any extra tabs that page already had so the
// streak pages keep their inbound links.
//
// Usage: node scripts/normalize-prediction-menu.js [--apply]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const APPLY = process.argv.includes('--apply');

// Canonical order, keyed by href. Ids match the index.html convention.
const CANONICAL = [
  ['/predictions/1x2', 'tab-1x2', '1X2'],
  ['/predictions/over-1-5', 'tab-over15', 'Over 1.5'],
  ['/predictions/over-2-5', 'tab-over25', 'Over 2.5'],
  ['/predictions/under-2-5', 'tab-under25', 'Under 2.5'],
  ['/predictions/ht-ft', 'tab-htft', 'HT/FT'],
  ['/predictions/gg2', 'tab-gg2', 'GG2+'],
  ['/predictions/highest-scoring-half', 'tab-highest-scoring-half', 'Highest Scoring Half'],
  ['/predictions/unbeaten', 'tab-unbeaten', 'Unbeaten'],
  ['/predictions/btts', 'tab-btts', 'BTTS YES'],
  ['/predictions/btts-no', 'tab-bttsno', 'BTTS NO'],
  ['/predictions/corners', 'tab-corners', 'Corners'],
  ['/predictions/cards', 'tab-cards', 'Cards'],
  ['/author-picks.html', 'tab-author-picks', 'H2H Picks']
];

// Tabs only some pages have. Appended after the canonical list, in this order.
const EXTRAS = [
  ['/predictions/winning-streak', 'tab-winning-streak', 'Win Streak'],
  ['/predictions/losing-streak', 'tab-losing-streak', 'Loss Streak'],
  ['/predictions/draws-streak', 'tab-draws-streak', 'Draw Streak']
];

const BLOCK_RE = /<div class="tabs-container" id="category(?:Links|Tabs)">[\s\S]*?<\/div>/;
const ITEM_RE = /<a\s+href="([^"]+)"[\s\S]*?<\/a>/g;

function parseItems(block) {
  return [...block.matchAll(ITEM_RE)].map((x) => ({
    href: x[1],
    raw: x[0],
    active: /class="[^"]*\bactive\b/.test(x[0])
  }));
}

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) files.push(full);
  }
})(ROOT);

let changed = 0, untouched = 0, noBlock = 0;
const report = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(BLOCK_RE);
  if (!m) continue;

  const block = m[0];
  const items = parseItems(block);
  if (items.length === 0) { untouched++; continue; }

  const present = new Set(items.map((i) => i.href));
  const activeHref = (items.find((i) => i.active) || {}).href || null;

  // The full canonical list is always present. Streak tabs are only kept on the
  // pages that already had them, so those pages keep their inbound links.
  // Anything unrecognised (e.g. the hand-written VIP tab on vip.html, which
  // carries an inline gradient) is preserved verbatim at the end.
  const knownHrefs = new Set(CANONICAL.concat(EXTRAS).map(([href]) => href));
  const wanted = CANONICAL.concat(EXTRAS.filter(([href]) => present.has(href)));
  const unknown = items.filter((i) => !knownHrefs.has(i.href));

  // Preserve the indent and line ending of the page's existing block.
  const eol = block.includes('\r\n') ? '\r\n' : '\n';
  const firstItemLine = block.split(eol).find((l) => l.includes('<a '));
  const indent = (firstItemLine.match(/^[ ]*/) || [''])[0];
  const containerId = (block.match(/id="(category(?:Links|Tabs))"/) || [])[1];

  const rendered = wanted.map(([href, id, label]) => {
    const cls = href === activeHref ? 'tab-btn active' : 'tab-btn';
    return `${indent}<a href="${href}" id="${id}" class="${cls}">${label}</a>`;
  });
  // VIP last: vip-tab.js appends it at runtime everywhere else.
  const body = rendered
    .concat(unknown.map((u) => indent + u.raw))
    .join(eol);

  const next = `<div class="tabs-container" id="${containerId}">${eol}${body}${eol}</div>`;
  if (next === block) { untouched++; continue; }

  // Safety guard: never lose a tab that was already on the page.
  const afterHrefs = new Set([...next.matchAll(ITEM_RE)].map((x) => x[1]));
  const lost = [...present].filter((h) => !afterHrefs.has(h));
  if (lost.length) {
    console.error(`ABORT ${path.relative(ROOT, file)}: would drop ${lost.join(', ')}`);
    process.exitCode = 1;
    continue;
  }

  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  report.push(
    `  ${rel}\n` +
    `     container: ${containerId} | tabs ${items.length} -> ${wanted.length + unknown.length} | ` +
    `added: ${wanted.filter(([h]) => !present.has(h)).map(([h]) => h).join(', ') || '(none)'} | ` +
    `active: ${activeHref || '(none)'} | kept: ${unknown.map((u) => u.href).join(', ') || '(none)'}`
  );
  changed++;
  if (APPLY) fs.writeFileSync(file, html.replace(block, next));
}

console.log(`mode      : ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`rewritten : ${changed}`);
console.log(`unchanged : ${untouched}`);
console.log(`no block  : ${noBlock}`);
console.log('');
report.forEach((r) => console.log(r));
