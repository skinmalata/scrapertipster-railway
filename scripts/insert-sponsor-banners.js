'use strict';

// Bulk-inject the shared sponsor banner into already-deployed static prediction
// grids (public/predictions/<league>/<market>/index.html and
// public/predictions/league/<slug>/index.html). Idempotent: skips any page that
// already carries a .wft-sponsor slot. Generators that (re)create these pages
// already splice the banner themselves (see generate-matrix-pages.js and
// generate-league-pages.js); this script is a one-time migration for committed
// pages.

const fs = require('fs');
const path = require('path');
const { renderSponsorBanner } = require('./lib/sponsor-banner');

const PREDICTIONS_DIR = path.join(__dirname, '..', 'public', 'predictions');
const GUARD = '<div class="wft-sponsor">';
const CARD_MARKER = '<div class="match-card fade-in"';

function pageHasCards(html) {
  return html.indexOf('<div class="matches-grid">') !== -1 && html.indexOf(CARD_MARKER) !== -1;
}

function insertBanner(html, seed) {
  if (html.indexOf(GUARD) !== -1) return { html, inserted: false, reason: 'already has sponsor' };
  if (!pageHasCards(html)) return { html, inserted: false, reason: 'no match-card grid' };

  let count = 0;
  let second = -1;
  let from = 0;
  while (count < 2) {
    const idx = html.indexOf(CARD_MARKER, from);
    if (idx < 0) break;
    count += 1;
    if (count === 2) second = idx;
    from = idx + CARD_MARKER.length;
  }
  if (second < 0) return { html, inserted: false, reason: 'fewer than 2 cards' };

  let runStart = second;
  while (runStart > 0 && /\s/.test(html[runStart - 1])) runStart--;

  return {
    html: html.slice(0, runStart) + '\n' + renderSponsorBanner(seed) + '\n\n  ' + html.slice(second),
    inserted: true,
    reason: 'ok'
  };
}

function ensureTrailingNewline(s) {
  return s.endsWith('\n') ? s : s + '\n';
}

function processFile(filePath, seed) {
  const original = fs.readFileSync(filePath, 'utf8');
  const result = insertBanner(original, seed);
  if (result.inserted) {
    fs.writeFileSync(filePath, ensureTrailingNewline(result.html));
  }
  return result;
}

function collectTargets() {
  const targets = [];

  if (fs.existsSync(PREDICTIONS_DIR)) {
    fs.readdirSync(PREDICTIONS_DIR).forEach(leagueSlug => {
      if (leagueSlug === 'league' || leagueSlug === 'date') return;
      const leagueDir = path.join(PREDICTIONS_DIR, leagueSlug);
      if (!fs.statSync(leagueDir).isDirectory()) return;
      fs.readdirSync(leagueDir).forEach(marketSlug => {
        const file = path.join(leagueDir, marketSlug, 'index.html');
        if (fs.existsSync(file)) targets.push({ file, seed: `${leagueSlug}/${marketSlug}` });
      });
    });

    const leagueHubDir = path.join(PREDICTIONS_DIR, 'league');
    if (fs.existsSync(leagueHubDir)) {
      fs.readdirSync(leagueHubDir).forEach(slug => {
        const file = path.join(leagueHubDir, slug, 'index.html');
        if (fs.existsSync(file)) targets.push({ file, seed: `league/${slug}` });
      });
    }
  }

  return targets;
}

function main() {
  const targets = collectTargets();
  let inserted = 0;
  let skipped = 0;
  const skippedReasons = {};

  targets.forEach(({ file, seed }) => {
    const result = processFile(file, seed);
    if (result.inserted) {
      inserted += 1;
      console.log(`[sponsor] ${seed}`);
    } else {
      skipped += 1;
      skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1;
    }
  });

  console.log(`[sponsor] Inserted into ${inserted} pages, skipped ${skipped}`);
  Object.keys(skippedReasons).forEach(r => console.log(`[sponsor]   skipped (${r}): ${skippedReasons[r]}`));
}

if (require.main === module) main();

module.exports = { insertBanner, processFile, collectTargets, main };