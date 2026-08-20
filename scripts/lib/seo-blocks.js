'use strict';

const { escapeHtml, generateFaqSchema, GTM_SCRIPT, HEAD_BOILERPLATE } = require('./layout');

const CHIPS_CSS = `.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip-link{display:inline-block;padding:9px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:999px;color:var(--text-primary);text-decoration:none;font-size:13px;font-weight:600;transition:all 0.2s}
.chip-link:hover{border-color:var(--accent);color:var(--accent)}`;

const FAQ_CSS = `.faq-list{display:flex;flex-direction:column;gap:8px}
.faq-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.faq-item summary{padding:16px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
.faq-item summary::after{content:'+';font-size:18px;font-weight:700;color:var(--accent)}
.faq-item[open] summary::after{content:'\\2212'}
.faq-item p{padding:0 20px 16px;font-size:14px;line-height:1.6;color:var(--text-secondary);margin:0}`;

const APPLE_MOBILE_TAGS = `<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="WinFulltime">`;

function metaTags({ title, description, keywords, canonicalUrl, extraTags, twitterUrl }) {
  return `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="keywords" content="${escapeHtml(keywords || '')}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="https://winfulltime.com/winfulltimelogo.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
${twitterUrl ? `<meta name="twitter:url" content="${twitterUrl}">` : ''}
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="https://winfulltime.com/winfulltimelogo.png">
<link rel="canonical" href="${canonicalUrl}">
${extraTags || ''}`;
}

function renderHead({ title, description, keywords, canonicalUrl, extraTags, twitterUrl }) {
  return `${GTM_SCRIPT}
${HEAD_BOILERPLATE}
${APPLE_MOBILE_TAGS}
${metaTags({ title, description, keywords, canonicalUrl, extraTags, twitterUrl })}`;
}

function collectionPageSchema({ name, description, url }) {
  return `{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${escapeHtml(name)}",
  "description": "${escapeHtml(description)}",
  "url": "${url}",
  "publisher": {
    "@type": "Organization",
    "name": "WinFulltime",
    "logo": { "@type": "ImageObject", "url": "https://winfulltime.com/winfulltimelogo.png" }
  }
}`;
}

const CHIP_INTRO_STYLE = 'color:var(--text-secondary);line-height:1.7;margin-bottom:16px;';
const FAQ_INTRO_STYLE = 'color:var(--text-secondary);line-height:1.7;margin-bottom:20px;';

function faqsList(faqs) {
  if (!faqs || !faqs.length) return '';
  const items = faqs
    .map(f => `<details class="faq-item"><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`)
    .join('\n');
  return `<div class="faq-list">
${items}
</div>`;
}

function chipsBlock({ heading, intro, chips, h2Style }) {
  if (!chips) return '';
  const h2 = h2Style ? `<h2 style="${h2Style}">${heading}</h2>` : `<h2>${heading}</h2>`;
  return `${h2}
${intro ? `<p style="${CHIP_INTRO_STYLE}">${intro}</p>` : ''}
<div class="chips">
  ${chips}
</div>`;
}

function chipsSection(opts) {
  const inner = chipsBlock(opts);
  if (!inner) return '';
  return `<section class="seo-content">
${inner}
</section>`;
}

function faqBlock({ heading, intro, faqs, introMarginBottom }) {
  const style = introMarginBottom ? `color:var(--text-secondary);line-height:1.7;margin-bottom:${introMarginBottom}px;` : FAQ_INTRO_STYLE;
  const introHtml = intro ? `<p style="${style}">${intro}</p>` : '';
  const list = faqs ? faqsList(faqs) : '';
  if (!introHtml && !list) return '';
  const parts = [`<h2>${heading}</h2>`];
  if (introHtml) parts.push(introHtml);
  if (list) parts.push(list);
  return parts.join('\n');
}

module.exports = {
  escapeHtml,
  generateFaqSchema,
  GTM_SCRIPT,
  HEAD_BOILERPLATE,
  APPLE_MOBILE_TAGS,
  CHIPS_CSS,
  FAQ_CSS,
  renderHead,
  metaTags,
  collectionPageSchema,
  faqsList,
  chipsBlock,
  chipsSection,
  faqBlock
};