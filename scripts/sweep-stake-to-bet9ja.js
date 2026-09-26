'use strict';
// One-time affiliate rollout: swap the baked Stake card for the Bet9ja card in
// already-committed public HTML. Source of truth (src/templates/layout.js) is
// already updated; this only refreshes the copies already baked into pages.
//
// The CI bake (scripts/bake-layout.js -> applyLayoutToHtml) intentionally skips
// pages that already contain a featured-books card, so those pages keep the old
// markup until they are rewritten. This script rewrites ONLY the card block and
// preserves each file's existing indentation and CRLF line endings.
//
// Usage: node scripts/sweep-stake-to-bet9ja.js [--apply]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const APPLY = process.argv.includes('--apply');

// Matches the Stake card specifically: the badge text must sit immediately
// after the card's opening tag + top row, so no other article can be touched.
const STAKE_CARD_RE =
  /<article class="featured-books-card" role="listitem">\s*<div class="featured-books-top">\s*<span class="featured-books-badge" style="background:linear-gradient\(135deg,#16a34a,#0f3d1e\);">Stake<\/span>[\s\S]*?<\/article>/g;

const REPLACEMENTS = [
  [
    'background:linear-gradient(135deg,#16a34a,#0f3d1e);">Stake</span>',
    'background:linear-gradient(135deg,#00a650,#00502b);">Bet9ja</span>'
  ],
  ['<span class="fm-rating-num">4.3</span>', '<span class="fm-rating-num">4.4</span>'],
  [
    'Sportsbook and casino with fast crypto deposits and withdrawals, live betting, cash-out and daily promotions.',
    'Nigerian sportsbook and casino with deep football and virtual markets, live betting, and fast Naira payouts.'
  ],
  [
    '<a class="featured-books-cta" href="https://stake.com/?c=FjhqQ3n3" target="_blank" rel="noopener noreferrer nofollow sponsored">Visit Stake &rarr;</a>',
    '<a class="featured-books-cta" href="https://rt.bet9ja.click/o/z1VLdR?site_id=147581" target="_blank" rel="noopener noreferrer nofollow sponsored">Claim Offer &rarr;</a>'
  ]
];

function listHtml(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listHtml(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function swapCard(card) {
  let out = card;
  for (const [from, to] of REPLACEMENTS) {
    if (!out.includes(from)) return null; // not the expected Stake card
    out = out.split(from).join(to);
  }
  return out;
}

const files = listHtml(ROOT);
let changed = 0;
let skipped = 0;
let badCard = 0;
const leftover = { betOn: [], prose: [], other: [] };
const crlf = { preserved: 0, mixed: 0 };

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('stake.com')) { skipped++; continue; }

  const hadCrlf = html.includes('\r\n');
  let count = 0;
  const next = html.replace(STAKE_CARD_RE, (card) => {
    const swapped = swapCard(card);
    if (swapped === null) { badCard++; return card; }
    count++;
    return swapped;
  });

  if (count > 0 && next !== html) {
    const stillCrlf = next.includes('\r\n');
    if (hadCrlf === stillCrlf) crlf.preserved++;
    else crlf.mixed++;
    changed++;
    if (APPLY) fs.writeFileSync(file, next);
    if (next.includes('stake.com')) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      // Categorise what still references stake.com so it is not mistaken for
      // an incomplete carousel swap.
      if (next.includes('wft-book--stake')) leftover.betOn.push(rel);
      else if (next.includes('class="external-link"')) leftover.prose.push(rel);
      else leftover.other.push(rel);
    }
  }
}

console.log(`mode            : ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`html files      : ${files.length}`);
console.log(`files rewritten : ${changed}`);
console.log(`files skipped   : ${skipped} (no stake.com)`);
console.log(`unexpected cards: ${badCard}`);
console.log(`line endings    : unchanged ${crlf.preserved}, changed ${crlf.mixed}`);
console.log(`\nremaining stake.com references (NOT the featured-books carousel, left as-is):`);
console.log(`  BET ON card boxes (wft-book--stake) : ${leftover.betOn.length}`);
leftover.betOn.forEach((f) => console.log(`     ${f}`));
console.log(`  in-article prose links               : ${leftover.prose.length}`);
leftover.prose.forEach((f) => console.log(`     ${f}`));
console.log(`  other                                : ${leftover.other.length}`);
leftover.other.forEach((f) => console.log(`     ${f}`));
