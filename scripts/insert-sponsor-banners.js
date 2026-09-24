'use strict';

// Migrate/sync the 1xBet affiliate slot on committed static prediction grids
// (public/predictions/<league>/<market>/index.html and
// public/predictions/league/<slug>/index.html). Idempotent: strips any legacy
// 1win .wft-sponsor block (one-time cleanup), replaces any existing
// refbanners.com iframe with the current active tag, and appends the affiliate
// slot after the last card on pages that lack it. Generators that (re)create
// these pages already splice the affiliate slot themselves (see
// generate-matrix-pages.js and generate-league-pages.js); this script is a
// one-time migration for committed pages.

const fs = require('fs');
const path = require('path');
const { renderAffiliateBanner, AFFILIATE_IFRAME } = require('./lib/sponsor-banner');

const PREDICTIONS_DIR = path.join(__dirname, '..', 'public', 'predictions');
const AFFILIATE_GUARD = '<div class="wft-affiliate">';
const CARD_RE = /<div class="match-card\b/;
const GRID_MARKER = '<div class="matches-grid">';

function pageHasCards(html) {
  return html.indexOf(GRID_MARKER) !== -1 && CARD_RE.test(html);
}

function stripLegacySponsor(html) {
  // Remove single-line legacy 1win sponsor blocks: <div class="wft-sponsor">...</div>
  const without = html.replace(/<div class="wft-sponsor">.*?<\/div>/g, '');
  const changed = without !== html;
  return { html: without, changed };
}

function setAffiliateIframe(html) {
  // Replace any existing refbanners.com iframe with the current active tag.
  const replaced = html.replace(/<iframe[^>]*refbanners\.com[^>]*><\/iframe>/g, AFFILIATE_IFRAME);
  return { html: replaced, changed: replaced !== html };
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
  if (!pageHasCards(html)) return { html, inserted: false, reason: 'no match-card grid' };
  if (html.indexOf(AFFILIATE_GUARD) !== -1) return { html, inserted: false, reason: 'already has affiliate' };

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

function processFile(filePath) {
  let current = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const legacy = stripLegacySponsor(current);
  if (legacy.changed) {
    current = legacy.html;
    changed = true;
  }

  const iframe = setAffiliateIframe(current);
  if (iframe.changed) {
    current = iframe.html;
    changed = true;
  }

  const affiliate = appendAffiliateBanner(current);
  if (affiliate.inserted) {
    current = affiliate.html;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, ensureTrailingNewline(current));
  }
  return { legacy, iframe, affiliate };
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
        if (fs.existsSync(file)) targets.push(file);
      });
    });

    const leagueHubDir = path.join(PREDICTIONS_DIR, 'league');
    if (fs.existsSync(leagueHubDir)) {
      fs.readdirSync(leagueHubDir).forEach(slug => {
        const file = path.join(leagueHubDir, slug, 'index.html');
        if (fs.existsSync(file)) targets.push(file);
      });
    }
  }

  return targets;
}

function main() {
  const targets = collectTargets();
  let stripped = 0;
  let iframeReplaced = 0;
  let appended = 0;
  const skipped = { noMatchCards: 0, intro: 0, noGrid: 0, gridClose: 0 };

  targets.forEach(file => {
    const r = processFile(file);
    if (r.legacy.changed) stripped += 1;
    if (r.iframe.changed) iframeReplaced += 1;
    if (r.affiliate.inserted) appended += 1;
    else skipped[r.affiliate.reason] = (skipped[r.affiliate.reason] || 0) + 1;
  });

  console.log(`[cleanup] stripped 1win sponsor blocks: ${stripped}`);
  console.log(`[iframe] replaced refbanners iframe: ${iframeReplaced}`);
  console.log(`[affiliate] appended to ${appended} pages, skipped ${targets.length - appended}`);
  Object.keys(skipped).forEach(k => console.log(`[affiliate]   skipped (${k}): ${skipped[k]}`));
}

if (require.main === module) main();

module.exports = { stripLegacySponsor, setAffiliateIframe, findGridClose, appendAffiliateBanner, processFile, collectTargets, main };