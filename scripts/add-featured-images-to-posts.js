/* Adds the matching local thumbnail directly below each legacy article title. */
const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const excluded = new Set(['index.html', 'blog-template.html']);
const decode = value => String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&eacute;/g, 'é').replace(/&#233;/g, 'é');
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let added = 0;
for (const file of fs.readdirSync(blogDir).filter(name => name.endsWith('.html') && !excluded.has(name))) {
  const slug = file.slice(0, -5);
  const articlePath = path.join(blogDir, file);
  let html = fs.readFileSync(articlePath, 'utf8');
  const thumbnail = `thumbnails/${slug}.webp`;
  if (!fs.existsSync(path.join(blogDir, thumbnail))) throw new Error(`Missing thumbnail for ${slug}`);
  if (html.includes(`src="${thumbnail}"`)) continue;
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || slug)
    .replace(/\s*\|\s*WinFulltime\s*$/i, '').trim();
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const featured = `${eol}${eol} <figure class="post-featured-image" style="margin:24px 0 28px;">${eol}  <img src="${thumbnail}" alt="${esc(title)}" width="1200" height="630" loading="eager" decoding="async" style="display:block;width:100%;height:auto;margin:0;border-radius:12px;">${eol} </figure>`;
  if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html)) throw new Error(`No article title found for ${slug}`);
  html = html.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${featured}`);
  fs.writeFileSync(articlePath, html);
  added++;
}
console.log(`Added visible featured images to ${added} post pages.`);
