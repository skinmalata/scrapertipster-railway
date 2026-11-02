'use strict';

// Replace legacy 1win banners in committed static prediction grids with the
// shared Bitmedia slot. Page generators use the same renderer going forward.

const fs = require('fs');
const path = require('path');
const { renderSponsorBanner } = require('./lib/sponsor-banner');

const PREDICTIONS_DIR = path.join(__dirname, '..', 'public', 'predictions');
const LEGACY_1WIN_RE = /<div class="wft-sponsor">\s*<a\b[^>]*href="https:\/\/one-vv5314\.com\/betting[^\"]*"[^>]*>[\s\S]*?<img\b[^>]*alt="1Win"[^>]*>[\s\S]*?<\/a>\s*<\/div>/i;

function insertBanner(html, seed) {
  if (LEGACY_1WIN_RE.test(html)) {
    return { html: html.replace(LEGACY_1WIN_RE, renderSponsorBanner(seed)), inserted: true, reason: 'replaced 1win' };
  }
  return { html, inserted: false, reason: 'no legacy 1win banner' };
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
      console.log(`[sponsor] ${result.reason === 'replaced 1win' ? 'Replaced 1win at ' : 'Added Bitmedia at '}${seed}`);
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
