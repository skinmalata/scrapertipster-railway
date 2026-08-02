// Reusable 1200x630 WebP thumbnail generator for new blog posts.
// Reads a spec file (default: blog-thumbnails-spec.json in repo root) shaped like:
//   [ { "slug": "dutching-explained", "line1": "Dutching", "line2": "Explained",
//       "tagline": "Spread risk across selections", "category": "Strategy" }, ... ]
// Usage: node scripts/generate-blog-thumbnails.js [path/to/spec.json]
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_DIR = path.join(__dirname, '..', 'public', 'blog', 'thumbnails');
const ACCENT = '#ff2448';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function splitTitle(title) {
  const cleaned = String(title || '').replace(/\s*[\|\-—]+\s*WinFulltime\s*$/i, '').trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= 3) return { line1: cleaned, line2: '', tagline: '' };
  const mid = Math.ceil(words.length / 2);
  let breakAt = mid;
  while (breakAt < words.length && /^(the|a|an|of|to|in|for|and|on|with|vs|from|your|how|why|when|that)$/i.test(words[breakAt])) breakAt++;
  return { line1: words.slice(0, breakAt).join(' '), line2: words.slice(breakAt).join(' '), tagline: '' };
}

function svgFor(item) {
  const title = item.title || `${item.line1 || ''} ${item.line2 || ''}`.trim();
  const split = splitTitle(title);
  const line1 = item.line1 || split.line1;
  const line2 = item.line2 || split.line2;
  const tagline = item.tagline || split.tagline;
  const category = (item.category || 'Betting').toUpperCase();
  const seed = [...title].reduce((o, c) => (o * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const hue = 192 + (seed % 40);
  const accent = item.accent || ACCENT;
  const l1 = line1.length > 34 ? line1.slice(0, 33) + '…' : line1;
  const l2 = line2.length > 34 ? line2.slice(0, 33) + '…' : line2;
  const hasTwoLines = Boolean(line2);
  const l1Y = hasTwoLines ? 52 : 56;
  const l2Y = hasTwoLines ? 63 : 70;
  const tagY = 76;
  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="hsl(${hue} 26% 13%)"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.82" cy="0.18" r="0.55">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="14" stop-color="#000" stop-opacity="0.5"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#halo)"/>
  <path d="M0 520 C240 448 460 640 700 540 C880 462 1030 500 1200 448 V630 H0 Z" fill="#03070c" fill-opacity="0.45"/>
  <g opacity="0.5">
    <circle cx="1050" cy="86" r="120" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
    <circle cx="1050" cy="86" r="66" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
    <path d="M1050 22 l14 33 36 5 -26 26 6 36 -30 -16 -30 16 6 -36 -26 -26 36 -5z" fill="#ffffff" fill-opacity="0.10"/>
  </g>
  <rect x="72" y="56" width="${Math.max(120, category.length * 11 + 34)}" height="34" rx="17" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.4"/>
  <text x="89" y="79" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="700" font-size="15" letter-spacing="1.4" fill="${accent}">${esc(category)}</text>
  <text x="72" y="${l1Y}%" text-anchor="start" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="62" letter-spacing="-1" fill="#ffffff" filter="url(#shadow)">${esc(l1)}</text>
  <text x="72" y="${l2Y}%" text-anchor="start" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="62" letter-spacing="-1" fill="${accent}" filter="url(#shadow)">${esc(l2)}</text>
  <rect x="72" y="404" width="76" height="5" rx="2.5" fill="${accent}"/>
  <text x="72" y="452" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="500" font-size="23" fill="#c7cdd9">${esc(tagline)}</text>
  <text x="72" y="560" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600" font-size="20" fill="#9aa3b8">WIN<span style="color:${accent}">FULLTIME</span></text>
  <g transform="translate(1104, 540) scale(0.8)" fill="#9aa3b8">
    <path d="M0 30 c0-16 14-30 30-30 s30 14 30 30 c0 6-2 12-5 17 l-13-13 5-5-9-9-5 5-5-5-9 9 5 5-13 13 c-3-5-5-11-5-17z"/>
  </g>
</svg>`;
}

async function main() {
  const specPath = process.argv[2] || path.join(__dirname, '..', 'blog-thumbnails-spec.json');
  const items = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const item of items) {
    const out = path.join(OUT_DIR, `${item.slug}.webp`);
    await sharp(Buffer.from(svgFor(item)))
      .resize(WIDTH, HEIGHT, { fit: 'inside' })
      .toFormat('webp', { quality: 92 })
      .toFile(out);
    count++;
  }
  console.log(`Generated ${count} thumbnail(s) in ${OUT_DIR}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { svgFor, main };
