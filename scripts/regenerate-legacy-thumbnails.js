/* Generates unbranded, topic-specific 1200x630 WebP thumbnails for legacy blog posts. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const thumbDir = path.join(blogDir, 'thumbnails');
const keep = new Set([
  'one-football-rule-would-change-everything',
  'football-analytics-misses-most-important-factor',
  'title-races-won-best-defense',
  'assistant-referee-flag-changed-game-more-than-var',
]);

const esc = value => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const decode = value => String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&eacute;/g, 'é')
  .replace(/&#233;/g, 'é').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
const hash = value => [...value].reduce((out, char) => ((out << 5) - out + char.charCodeAt(0)) | 0, 0) >>> 0;

function kindFor(title) {
  const value = title.toLowerCase();
  if (/(world cup|player|footballer|club|coach|legend|career|debut|history|messi|ronaldo|mbapp|bayern|barcelona|premier league)/.test(value)) return 'story';
  if (/(statistic|analytics|xg|analysis|data|poisson|model|form|head.to.head|h2h)/.test(value)) return 'analysis';
  if (/(betting|bet|odds|over.?under|btts|handicap|scorecast|accumulator|martingale|value|bankroll|1x2|cards|corners|goals)/.test(value)) return 'market';
  return 'guide';
}

function topicFor(title, kind) {
  const value = title.toLowerCase();
  if (/(btts|both teams)/.test(value)) return 'BOTH TEAMS TO SCORE';
  if (/(over.?under)/.test(value)) return 'TOTAL GOALS MARKET';
  if (/1x2/.test(value)) return 'MATCH OUTCOMES';
  if (/(cards|yellow|red)/.test(value)) return 'CARD MARKETS';
  if (/corners/.test(value)) return 'CORNER MARKETS';
  if (/(world cup)/.test(value)) return 'WORLD CUP FOOTBALL';
  if (/(statistics|analytics|xg|data)/.test(value)) return 'FOOTBALL DATA';
  if (kind === 'story') return 'FOOTBALL STORY';
  if (kind === 'market') return 'BETTING EXPLAINER';
  if (kind === 'analysis') return 'MATCH ANALYSIS';
  return 'FOOTBALL GUIDE';
}

function wrap(title) {
  const words = title.split(/\s+/); const lines = []; let line = '';
  const target = title.length > 72 ? 25 : title.length > 49 ? 29 : 34;
  for (const word of words) {
    if (`${line} ${word}`.trim().length > target && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function svgFor({ title, category, slug }) {
  const kind = kindFor(title); const seed = hash(slug); const hue = 192 + (seed % 36);
  const accent = kind === 'market' ? '#f6c84a' : kind === 'story' ? '#f26a4f' : kind === 'analysis' ? '#61d3ff' : '#76d6a5';
  const lines = wrap(title); const font = lines.length === 1 ? 61 : lines.length === 2 ? 53 : 43;
  const titleSvg = lines.map((line, index) => `<text x="68" y="${190 + index * (font + 12)}" class="headline">${esc(line)}</text>`).join('');
  const lowerY = 190 + lines.length * (font + 12) + 20;
  const visual = kind === 'market'
    ? `<g transform="translate(820 116)"><circle cx="130" cy="176" r="154" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/><path d="M-4 176 H264 M130 42 V310" stroke="#fff" stroke-opacity=".22" stroke-width="3"/><circle cx="130" cy="176" r="48" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="3"/><g fill="${accent}"><circle cx="51" cy="105" r="19"/><circle cx="206" cy="105" r="19"/><circle cx="51" cy="248" r="19"/><circle cx="206" cy="248" r="19"/></g><path d="M130 34 l20 38 42 6 -30 29 7 42 -39 -21 -39 21 7 -42 -30 -29 42 -6z" fill="#fff" fill-opacity=".92"/></g>`
    : kind === 'analysis'
      ? `<g transform="translate(798 92)"><rect width="322" height="322" rx="26" fill="#041b35" fill-opacity=".58" stroke="#fff" stroke-opacity=".16"/><path d="M42 245 L101 194 L154 217 L222 119 L278 75" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><g fill="${accent}"><circle cx="42" cy="245" r="9"/><circle cx="101" cy="194" r="9"/><circle cx="154" cy="217" r="9"/><circle cx="222" cy="119" r="9"/><circle cx="278" cy="75" r="9"/></g><path d="M42 276 H281 M42 214 H281 M42 152 H281 M42 90 H281" stroke="#fff" stroke-opacity=".12" stroke-width="2"/></g>`
      : kind === 'story'
        ? `<g transform="translate(770 80)"><circle cx="204" cy="192" r="174" fill="${accent}" fill-opacity=".13"/><path d="M204 45 C110 45 74 128 74 223 C74 300 127 341 204 341 C281 341 334 300 334 223 C334 128 298 45 204 45z" fill="#07192d" fill-opacity=".55" stroke="#fff" stroke-opacity=".2" stroke-width="3"/><circle cx="204" cy="151" r="49" fill="#fff" fill-opacity=".76"/><path d="M116 322 Q204 224 292 322" fill="#fff" fill-opacity=".76"/><path d="M32 350 H376" stroke="${accent}" stroke-width="6"/></g>`
        : `<g transform="translate(796 88)"><circle cx="176" cy="176" r="142" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="4"/><path d="M176 32 l31 57 64 10 -45 45 10 65 -60 -31 -60 31 10 -65 -45 -45 64 -10z" fill="${accent}"/><path d="M176 43 V310 M43 176 H309" stroke="#fff" stroke-opacity=".18" stroke-width="3"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06172d"/><stop offset="1" stop-color="hsl(${hue} 56% 20%)"/></linearGradient><radialGradient id="halo"><stop stop-color="${accent}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><style>.headline{font-family:Arial,sans-serif;font-size:${font}px;font-weight:800;fill:#fff}.small{font-family:Arial,sans-serif;fill:#d8e9f1}</style></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1015" cy="205" r="390" fill="url(#halo)"/><path d="M0 515 C285 430 514 633 736 526 C906 444 1044 487 1200 431 V630 H0Z" fill="#03111f" fill-opacity=".42"/><g opacity=".36">${[0,1,2,3,4,5].map(i => `<circle cx="${852 + i * 56}" cy="54" r="10" fill="#dff8ff"/>`).join('')}</g><rect x="68" y="65" width="${Math.max(170, topicFor(title, kind).length * 11)}" height="36" rx="18" fill="#fff" fill-opacity=".11" stroke="#fff" stroke-opacity=".22"/><text x="84" y="89" class="small" font-size="15" font-weight="700" letter-spacing="1.6">${esc(topicFor(title, kind))}</text>${titleSvg}<path d="M68 ${lowerY} H${Math.min(605, 68 + title.length * 7)}" stroke="${accent}" stroke-width="3"/><text x="68" y="${lowerY + 42}" class="small" font-size="20" font-weight="700">${esc(category || 'Football')}</text><text x="68" y="${lowerY + 72}" class="small" font-size="17" opacity=".78">Football insight, explained clearly</text>${visual}</svg>`;
}

function upsertMeta(html, name, content) {
  const attribute = name.startsWith('og:') ? 'property' : 'name';
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${name}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${name}" content="${content}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

async function main() {
  const files = fs.readdirSync(blogDir).filter(file => file.endsWith('.html') && file !== 'index.html');
  const tasks = [];
  for (const file of files) {
    const slug = file.slice(0, -5);
    if (keep.has(slug) || slug === 'blog-template') continue;
    const articlePath = path.join(blogDir, file); let html = fs.readFileSync(articlePath, 'utf8');
    const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || slug).replace(/\s*\|\s*WinFulltime\s*$/i, '').trim();
    const category = decode((html.match(/<meta name=["']keywords["'] content=["']([^"']*)/i) || [])[1] || '').split(',')[0].replace(/\bbetting\b/i, 'Betting Guide').trim() || 'Football Guide';
    const imageUrl = `https://winfulltime.com/blog/thumbnails/${slug}.webp`;
    html = upsertMeta(html, 'og:image', imageUrl);
    html = upsertMeta(html, 'twitter:card', 'summary_large_image');
    html = upsertMeta(html, 'twitter:image', imageUrl);
    fs.writeFileSync(articlePath, html);
    tasks.push({ slug, title, category, svg: svgFor({ title, category, slug }) });
  }
  for (let start = 0; start < tasks.length; start += 6) {
    await Promise.all(tasks.slice(start, start + 6).map(task => sharp(Buffer.from(task.svg)).webp({ quality: 88 }).toFile(path.join(thumbDir, `${task.slug}.webp`))));
    console.log(`Generated ${Math.min(start + 6, tasks.length)} of ${tasks.length}`);
  }
  console.log(`Done: ${tasks.length} legacy thumbnails regenerated.`);
}
main().catch(error => { console.error(error); process.exit(1); });
