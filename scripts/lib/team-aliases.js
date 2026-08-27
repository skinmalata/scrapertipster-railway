'use strict';

// Canonical team-name resolution for the static-site generators.
// Used by generate-team-pages.js, generate-h2h-pages.js and update-sitemap.js
// so variant spellings from scrapers collapse onto one canonical name/slug.

const fs = require('fs');
const path = require('path');

let ALIAS_MAP = null;

function loadAliasMap() {
  if (ALIAS_MAP) return ALIAS_MAP;
  const map = new Map(); // lower-cased alias/canonical name -> canonical display name
  try {
    const file = path.join(__dirname, '..', '..', 'data', 'team-aliases.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = (data && data.aliases) || {};
    for (const [canonical, aliases] of Object.entries(entries)) {
      map.set(canonical.toLowerCase(), canonical);
      for (const alias of (aliases || [])) {
        map.set(String(alias).toLowerCase(), canonical);
      }
    }
  } catch (e) {
    console.warn('[team-aliases] Failed to load alias map:', e.message);
  }
  ALIAS_MAP = map;
  return ALIAS_MAP;
}

/** Return the canonical display name for a raw team name, or the raw name itself. */
function canonicalName(name) {
  if (!name) return name;
  const canonical = loadAliasMap().get(String(name).trim().toLowerCase());
  return canonical || String(name).trim();
}

function canonicalPair(home, away) {
  return [canonicalName(home), canonicalName(away)];
}

// Mirrors scripts/lib/layout.js exactTimes slugifyTeam (kept local to avoid
// a require cycle with generators that import both modules).
function slugify(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let VARIANTS = null;

/**
 * Map of variant slug -> canonical slug for every NON-canonical alias name.
 * e.g. 'hammarby' -> 'hammarby-ff'. Used to deprecate duplicate pages whose
 * older URL was produced from a scraper alias spelling.
 */
function aliasVariantSlugs() {
  if (VARIANTS) return VARIANTS;
  const map = new Map();
  try {
    const file = path.join(__dirname, '..', '..', 'data', 'team-aliases.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [canonical, aliases] of Object.entries((data && data.aliases) || {})) {
      const canonicalSlug = slugify(canonical);
      for (const alias of (aliases || [])) {
        const aliasSlug = slugify(alias);
        if (aliasSlug && aliasSlug !== canonicalSlug) map.set(aliasSlug, canonicalSlug);
      }
    }
  } catch (e) {
    console.warn('[team-aliases] Failed to build alias slug map:', e.message);
  }
  VARIANTS = map;
  return VARIANTS;
}

/**
 * Deprecate a duplicate page in place: point its canonical at the winning URL
 * and noindex it so search engines consolidate signals (page stays live, so
 * no 404s). Safe to re-run; skips pages that are already noindexed and never
 * touches a page that isn't an alias variant.
 */
function deprecatePage(absHtmlFile, canonicalUrl) {
  if (!fs.existsSync(absHtmlFile)) return false;
  let html;
  try {
    html = fs.readFileSync(absHtmlFile, 'utf8');
  } catch (e) {
    return false;
  }
  const robots = (html.match(/<meta name="robots"[^>]*>/i) || [''])[0];
  if (/noindex/i.test(robots)) return false;
  let out = html;
  if (/<link\s+rel=["']canonical["']\s+href=/i.test(out)) {
    out = out.replace(/(<link\s+rel=["']canonical["']\s+href=["'])[^"']+(["']\s*\/?>)/i, `$1${canonicalUrl}$2`);
  } else if (/<link\s+rel=["']canonical["']/i.test(out)) {
    out = out.replace(/(<link\s+rel=["']canonical["'][^>]*?)\/?>[\s\S]?(<title)/i, `$1/><meta name="robots" content="noindex,follow">\n$2`);
  }
  if (out === html) return false;
  out = out.replace(/(<title[^>]*>?)/i, '<meta name="robots" content="noindex,follow">\n$1');
  fs.writeFileSync(absHtmlFile, out);
  return true;
}

module.exports = { canonicalName, canonicalPair, loadAliasMap, aliasVariantSlugs, deprecatePage };