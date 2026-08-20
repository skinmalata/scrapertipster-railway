'use strict';

const fs = require('fs');
const path = require('path');

const OVERRIDES = {
  'other-leagues': 'Other Leagues',
  'other-league': 'Other Leagues'
};

const STOPWORDS = new Set([
  'a', 'and', 'da', 'das', 'de', 'del', 'di', 'do', 'dos', 'du',
  'el', 'en', 'la', 'las', 'los', 'norte', 'of', 'sur', 'the', 'vs'
]);

const ACRONYMS = new Set([
  'ac', 'afc', 'az', 'cf', 'cska', 'fc', 'fifa', 'mls', 'mx',
  'nb', 'nba', 'nfl', 'nhl', 'pga', 'psv', 'sc', 'uefa'
]);

function slugifyLeague(name) {
  if (!name) return '';
  let s = String(name).toLowerCase().trim();
  s = s.replace(/^(england|spain|italy|germany|france|netherlands|portugal|brazil|argentina|turkey)\s*-\s*/i, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

function fallbackTitleCase(slug) {
  if (OVERRIDES[slug]) return OVERRIDES[slug];
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(function (w) {
      if (STOPWORDS.has(w)) return w;
      if (ACRONYMS.has(w) || w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function buildLeagueLabelBySlug() {
  const names = new Set();

  try {
    const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'predictions-cache.json'), 'utf8'));
    const arr = Array.isArray(cache.matches) ? cache.matches : [];
    (arr.length ? arr : []).forEach(function (m) {
      if (m && m.league) names.add(String(m.league));
    });
  } catch (e) { /* cache optional */ }

  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'leagues.js'), 'utf8');
    const re = /['"`]([^'"`]+)['"`]\s*:\s*\{\s*league\s*:\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(src))) names.add(m[2]);
  } catch (e) { /* leagues map optional */ }

  const map = {};
  names.forEach(function (name) {
    const slug = slugifyLeague(name);
    if (slug && !OVERRIDES[slug]) map[slug] = String(name);
  });
  return map;
}

function readableLeagueLabel(slug, labelBySlug) {
  if (labelBySlug && labelBySlug[slug]) return labelBySlug[slug];
  return fallbackTitleCase(slug);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateChipLabel(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('-');
  const y = +parts[0];
  const m = +parts[1];
  const d = +parts[2];
  if (!y || !m || m < 1 || m > 12 || !d) return dateStr;
  return d + ' ' + MONTHS[m - 1] + ' ' + y;
}

function formatDateChips(slugs, max) {
  const limit = typeof max === 'number' ? max : 14;
  return (slugs || [])
    .slice()
    .sort()
    .reverse()
    .slice(0, limit)
    .map(function (ds) {
      return `<a href="/predictions/date/${ds}/" class="chip-link">${formatDateChipLabel(ds)}</a>`;
    });
}

module.exports = {
  slugifyLeague,
  fallbackTitleCase,
  buildLeagueLabelBySlug,
  readableLeagueLabel,
  formatDateChipLabel,
  formatDateChips
};