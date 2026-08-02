// Sharp thumbnail generation script used by maintainers / CI to (re)render the
// 1200x630 WebP thumbnail for the "Football's Most Untouchable Records" post.
//
// Usage (from the repo root):
//   node public/blog/thumbnails/football-records-placeholder.js
//
// It writes the image directly to:
//   public/blog/thumbnails/football-records-that-may-never-be-broken.webp
// and is safe to delete once the binary thumbnail exists.
const sharp = require('sharp');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = path.join(__dirname, 'football-records-that-may-never-be-broken.webp');

// SVG canvas that mirrors the site's dark accent gradient + readable typography.
const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Football's Most Untouchable Records">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#1a1f2e"/>
    </linearGradient>
    <filter id="g" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" stop-color="#000" stop-opacity="0.45"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-weight="700" font-size="58" fill="#ffffff" letter-spacing="-0.4" filter="url(#g)">Football's Most</text>
  <text x="50%" y="64%" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-weight="700" font-size="58" fill="#ff2448" letter-spacing="-0.4" filter="url(#g)">Untouchable Records</text>
  <text x="50%" y="76%" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-weight="500" font-size="22" fill="#c7cdd9">The numbers that may never be broken</text>
  <g transform="translate(${WIDTH - 26}, ${HEIGHT - 26}) scale(0.55)">
    <path d="M6 34c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm0 2c2.7 0 6 2.7 6 6v6h-2v-6c0-2.2-2.2-4-4-4s-4 1.8-4 4v6H6v-6c0-2.7 2.3-6 6-6z"
          fill="#c7cdd9" transform="rotate(12 0 0)"/>
  </g>
</svg>
`;

sharp(Buffer.from(svg))
  .resize(WIDTH, HEIGHT, { fit: 'inside' })
  .toFormat('webp', { quality: 92 })
  .toFile(OUT)
  .then(() => console.log('Wrote', OUT))
  .catch((e) => {
    console.error('Thumbnail generation failed:', e.message);
    process.exit(1);
  });
