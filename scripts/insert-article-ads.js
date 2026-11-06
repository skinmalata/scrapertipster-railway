// Insert one in-article Bitmedia Prebid slot into the committed blog pages.
// Existing blog posts were generated before the article template gained an ad
// slot, so this post-processor keeps them in sync without regenerating content.
// It is idempotent: pages that already contain data-wft-article-ad are skipped.
const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', 'public', 'blog');
const AD_MARKER = 'data-wft-article-ad';
const AD_SLOT = '<div id="classname-container-placement-article" class="wft-ad-slot" data-wft-prebid="bitmedia" data-ad-position="in_content" data-wft-article-ad="1" aria-label="Advertisement"></div>';

function insertAd(html) {
  if (html.indexOf(AD_MARKER) !== -1) return html;
  const h1 = html.indexOf('<h1');
  if (h1 === -1) return html;

  const related = html.indexOf('<div class="related-posts">', h1);
  const footer = html.indexOf('<footer', h1);
  const end = related !== -1 ? related : (footer !== -1 ? footer : html.length);

  let count = 0;
  let from = h1;
  while (true) {
    const at = html.indexOf('<h2', from);
    if (at === -1 || at >= end) break;
    count += 1;
    if (count === 3) {
      return html.slice(0, at) + AD_SLOT + '\n' + html.slice(at);
    }
    from = at + 3;
  }

  const cta = html.indexOf('<div class="cta"', h1);
  const at = cta !== -1 && cta < end ? cta : end;
  return html.slice(0, at) + AD_SLOT + '\n' + html.slice(at);
}

let changed = 0;
let skipped = 0;
for (const name of fs.readdirSync(BLOG_DIR)) {
  if (!/\.html$/i.test(name) || name.toLowerCase() === 'index.html') continue;
  const file = path.join(BLOG_DIR, name);
  const html = fs.readFileSync(file, 'utf8');
  const next = insertAd(html);
  if (next === html) {
    skipped += 1;
    continue;
  }
  fs.writeFileSync(file, next, 'utf8');
  changed += 1;
}

console.log('insert-article-ads: ' + changed + ' updated, ' + skipped + ' unchanged');
