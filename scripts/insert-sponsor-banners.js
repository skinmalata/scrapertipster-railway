'use strict';

// Bulk-inject the shared sponsor banners into already-deployed static prediction
// grids (public/predictions/<league>/<market>/index.html and
// public/predictions/league/<slug>/index.html). Idempotent: injects the 1win
// banner between the first and second match card (skip any page that already
// carries a .wft-sponsor slot) and appends the refbanners.com affiliate iframe
// after the last card (skip any page that already has a .wft-affiliate slot).
// Generators that (re)create these pages already splice the banners themselves
// (see generate-matrix-pages.js and generate-league-pages.js); this script is a
// one-time migration for committed pages.

const fs = require('fs');
const path = require('path');
const { renderSponsorBanner, renderAffiliateBanner } = require('./lib/sponsor-banner');

const PREDICTIONS_DIR = path.join(__dirname, '..', 'public', 'predictions');
const GUARD = '<div class="wft-sponsor">';
const AFFILIATE_GUARD = '<div class="wft-affiliate">';
const CARD_MARKER = '<div class="match-card fade-in"';
const GRID_MARKER = '<div class="matches-grid">';

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
  if (second < 0) {
    const affIdx = html.indexOf(AFFILIATE_GUARD);
    const anchor = affIdx > -1 ? affIdx : html.indexOf(GRID_MARKER);
    let start = anchor;
    while (start > 0 && /\s/.test(html[start - 1])) start--;
    if (anchor < 0) return { html, inserted: false, reason: 'grid close not found' };
    return {
      html: html.slice(0, start) + '\n' + renderSponsorBanner(seed) + '\n\n  ' + html.slice(anchor),
      inserted: true,
      reason: 'single card'
    };
  }

  let runStart = second;
  while (runStart > 0 && /\s/.test(html[runStart - 1])) runStart--;

  return {
    html: html.slice(0, runStart) + '\n' + renderSponsorBanner(seed) + '\n\n  ' + html.slice(second),
    inserted: true,
    reason: 'ok'
  };
}

function findGridClose(html, openIdx) {
  let depth = 1;
  let i = openIdx + GRID_MARKER.length;
  while (i < html.length) {
    const openTag = html.indexOf('<div', i);
    const closeTag = html.indexOf('</div>', i);
    if (closeTag < 0) return -1;
    if (openTag !== -1 && openTag < closeTag) {
      depth += 1;
      i = openTag + 4;
    } else {
      depth -= 1;
      if (depth === 0) return closeTag;
      i = closeTag + 6;
    }
  }
  return -1;
}

function appendAffiliateBanner(html) {
  if (html.indexOf(AFFILIATE_GUARD) !== -1) return { html, inserted: false, reason: 'already has affiliate' };
  if (!pageHasCards(html)) return { html, inserted: false, reason: 'no match-card grid' };

  const openIdx = html.indexOf(GRID_MARKER);
  if (openIdx < 0) return { html, inserted: false, reason: 'no matches-grid' };
  const closeIdx = findGridClose(html, openIdx);
  if (closeIdx < 0) return { html, inserted: false, reason: 'grid close not found' };

  return {
    html: html.slice(0, closeIdx) + '\n  ' + renderAffiliateBanner() + '\n' + html.slice(closeIdx),
    inserted: true,
    reason: 'ok'
  };
}

function ensureTrailingNewline(s) {
  return s.endsWith('\n') ? s : s + '\n';
}

function processFile(filePath, seed) {
  let current = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const results = {};

  const sponsor = insertBanner(current, seed);
  if (sponsor.inserted) {
    current = sponsor.html;
    changed = true;
  }
  results.sponsor = sponsor;

  const affiliate = appendAffiliateBanner(current);
  if (affiliate.inserted) {
    current = affiliate.html;
    changed = true;
  }
  results.affiliate = affiliate;

  if (changed) {
    fs.writeFileSync(filePath, ensureTrailingNewline(current));
  }
  return results;
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
  const inserted = { sponsor: 0, affiliate: 0 };
  const skippedReasons = { sponsor: {}, affiliate: {} };

  targets.forEach(({ file, seed }) => {
    const result = processFile(file, seed);
    if (result.sponsor.inserted) {
      inserted.sponsor += 1;
      console.log(`[sponsor] ${seed}`);
    } else {
      skippedReasons.sponsor[result.sponsor.reason] = (skippedReasons.sponsor[result.sponsor.reason] || 0) + 1;
    }
    if (result.affiliate.inserted) {
      inserted.affiliate += 1;
      console.log(`[affiliate] ${seed}`);
    } else {
      skippedReasons.affiliate[result.affiliate.reason] = (skippedReasons.affiliate[result.affiliate.reason] || 0) + 1;
    }
  });

  console.log(`[sponsor] Inserted into ${inserted.sponsor} pages, skipped ${targets.length - inserted.sponsor}`);
  Object.keys(skippedReasons.sponsor).forEach(r => console.log(`[sponsor]   skipped (${r}): ${skippedReasons.sponsor[r]}`));
  console.log(`[affiliate] Inserted into ${inserted.affiliate} pages, skipped ${targets.length - inserted.affiliate}`);
  Object.keys(skippedReasons.affiliate).forEach(r => console.log(`[affiliate]   skipped (${r}): ${skippedReasons.affiliate[r]}`));
}

if (require.main === module) main();

module.exports = { insertBanner, appendAffiliateBanner, findGridClose, processFile, collectTargets, main };