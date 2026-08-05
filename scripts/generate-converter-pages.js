'use strict';

// Generates the programmatic SEO /convert/<from>-to-<to>/ tree from the
// authored content model in ./lib/converter-content.js, plus the /convert/
// hub page, and patches public/converter.html with "popular conversions"
// chips and the Bet9ja status notice.
//
// Anti-doorway guard: validateContent() runs first and aborts the build if any
// page would be thin (duplicate FAQ questions, missing bookmaker mentions,
// copied intros). All body copy is hand-authored per pair on purpose.

const fs = require('fs');
const path = require('path');
const {
  BOOKMAKERS, PAIRS, HUB, slugFor, validateContent
} = require('./lib/converter-content');
const { wrapPage, escapeHtml, generateFaqSchema } = require('./lib/layout');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONVERT_DIR = path.join(PUBLIC_DIR, 'convert');
const CONVERTER_PATH = path.join(PUBLIC_DIR, 'converter.html');
const SITE_URL = 'https://winfulltime.com';

const BET9JA_DISCLAIMER =
  'Bet9ja code conversion is experiencing issues at present, and our technical team is working on it. SportyBet, MSport and Betway conversions are unaffected.';

const PAIR_CSS = `
.converter-hero { padding: 28px 0 8px; }
.converter-hero h1 { font-size: clamp(24px, 4vw, 34px); line-height: 1.2; margin: 0 0 10px; color: var(--text, #111); }
.converter-hero-sub { color: var(--text-secondary, #555); font-size: 15.5px; line-height: 1.7; margin: 0 0 14px; }
.converter-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.converter-badges span { font-size: 12px; font-weight: 700; color: var(--accent, #ff2448); border: 1px solid var(--border, #eee); background: var(--bg-card, #fff); padding: 6px 12px; border-radius: 999px; }
.cv-embed-wrap { margin: 26px 0; }
.cv-embed { width: 100%; height: 1150px; border: 1px solid var(--border, #eee); border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,0.06); background: #fff; }
.howto-list { counter-reset: step; list-style: none; padding: 0; margin: 0 0 8px; }
.howto-list li { counter-increment: step; position: relative; padding: 0 0 14px 38px; color: var(--text-secondary, #555); line-height: 1.7; font-size: 15px; }
.howto-list li::before { content: counter(step); position: absolute; left: 0; top: 2px; width: 26px; height: 26px; border-radius: 50%; background: var(--accent, #ff2448); color: #fff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.faq-item { border: 1px solid var(--border, #eee); border-radius: 12px; background: var(--bg-card, #fff); margin-bottom: 10px; padding: 14px 16px; }
.faq-item summary { cursor: pointer; font-weight: 700; font-size: 15px; color: var(--text, #111); }
.faq-item p { color: var(--text-secondary, #555); line-height: 1.7; font-size: 14.5px; margin: 10px 0 0; }
.convert-links { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.convert-links a { display: block; padding: 12px 14px; border: 1px solid var(--border, #eee); border-radius: 10px; background: var(--bg-card, #fff); text-decoration: none; color: var(--text, #111); font-size: 14px; font-weight: 600; }
.convert-links a:hover { border-color: var(--accent, #ff2448); }
.pair-disclaimer { margin: 4px 0 22px; padding: 16px 18px; border: 1px solid var(--border, #eee); border-left: 4px solid var(--accent, #ff2448); border-radius: 10px; background: var(--bg-card, #fff); }
.pair-disclaimer p { margin: 2px 0; font-size: 13.5px; line-height: 1.7; color: var(--text-secondary, #555); }
.pair-disclaimer p:first-child { font-weight: 700; color: var(--accent, #ff2448); }
.convert-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; margin: 20px 0; }
.convert-card { display: block; padding: 18px; border: 1px solid var(--border, #eee); border-radius: 14px; background: var(--bg-card, #fff); text-decoration: none; transition: transform 0.12s ease, border-color 0.12s ease; }
.convert-card:hover { transform: translateY(-2px); border-color: var(--accent, #ff2448); }
.convert-card-title { display: block; font-weight: 800; font-size: 15.5px; color: var(--text, #111); margin-bottom: 6px; }
.convert-card-blurb { display: block; color: var(--text-secondary, #555); font-size: 13.5px; line-height: 1.6; }
`;

function esc(v) {
  return escapeHtml(String(v));
}

function pairPageBody(pair) {
  const src = BOOKMAKERS[pair.from];
  const tgt = BOOKMAKERS[pair.to];
  const slug = slugFor(pair.from, pair.to);

  const howTo = pair.howTo.map(s =>
    `<li><strong>${esc(s.title)}.</strong> ${esc(s.body)}</li>`
  ).join('\n');

  const findSteps = src.findSteps.map(s =>
    `<li>${esc(s)}</li>`
  ).join('\n');

  const faq = pair.faq.map(f =>
    `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
  ).join('\n');

  const related = PAIRS
    .filter(p => p !== pair)
    .map(p => {
      const s2 = slugFor(p.from, p.to);
      return `<a href="/convert/${s2}/">${esc(BOOKMAKERS[p.from].name)} &rarr; ${esc(BOOKMAKERS[p.to].name)}</a>`;
    })
    .join('\n');

  const disclaimer = pair.to === 'bet9ja'
    ? `<div class="pair-disclaimer"><p>Taking a while? Bet9ja code conversion is experiencing issues at present, and our technical team is working on it.</p><p>Your ${esc(src.name)} code is decoded fine — only the Bet9ja re-issue step may be delayed. SportyBet, MSport and Betway conversions are unaffected.</p></div>`
    : '';

  return `
  <div class="converter-hero">
   <h1>${esc(src.name)} to ${esc(tgt.name)} Code Converter — Free</h1>
   <p class="converter-hero-sub">${esc(pair.blurb)}</p>
   <div class="converter-badges">
    <span>Free to use</span><span>No sign-in</span><span>Up to 30 selections</span><span>Nigeria (NG)</span>
   </div>
  </div>

  ${disclaimer}

  <section class="seo-content">
   <h2>Convert ${esc(src.name)} codes to ${esc(tgt.name)}</h2>
   <p>${esc(pair.intro)}</p>
  </section>

  <section class="cv-embed-wrap seo-content">
   <h2>${esc(src.name)} to ${esc(tgt.name)} converter</h2>
   <p>Paste your ${esc(src.name)} ${esc(src.codeType)} below to decode and convert it. For the full tool, <a href="/converter.html?from=${pair.from}&amp;to=${pair.to}">open the booking code converter</a>.</p>
   <iframe class="cv-embed" src="/converter.html?from=${pair.from}&amp;to=${pair.to}" loading="lazy" title="${esc(src.name)} to ${esc(tgt.name)} code converter"></iframe>
  </section>

  <section class="seo-content">
   <h2>How to convert a ${esc(src.name)} code to ${esc(tgt.name)}</h2>
   <ol class="howto-list">
${howTo}
   </ol>

   <h3>Find your ${esc(src.name)} ${esc(src.codeType)}</h3>
   <ol class="howto-list">
${findSteps}
   </ol>

   <h3>Load the new ${esc(tgt.name)} ${esc(tgt.codeType)}</h3>
   <p>${esc(tgt.redeemHint)}</p>
   <p>${esc(tgt.marketNote)}</p>
  </section>

  <section class="seo-content">
   <h2>${esc(src.name)} to ${esc(tgt.name)} — frequently asked questions</h2>
${faq}
  </section>

  <section class="seo-content">
   <h2>More booking code conversions</h2>
   <div class="convert-links">
${related}
   </div>
   <p style="margin-top:14px;"><a href="/convert/">See every supported conversion &rarr;</a></p>
  </section>
`;
}

function buildPairPage(pair) {
  const src = BOOKMAKERS[pair.from];
  const tgt = BOOKMAKERS[pair.to];
  const slug = slugFor(pair.from, pair.to);
  const canonical = `${SITE_URL}/convert/${slug}/`;
  const title = `${src.name} to ${tgt.name} Code Converter (Free) | WinFulltime`;
  const description = `Convert ${src.name} codes to ${tgt.name} free. Paste a ${src.name} ${src.codeType} and get a fresh ${tgt.name} ${tgt.codeType} with the same selections and odds — no sign-in, up to 30 legs.${pair.to === 'bet9ja' ? ' Bet9ja conversion currently supports 1X2 selections.' : ''}`;
  const keywords = `${src.name} to ${tgt.name} code converter, convert ${src.name} code to ${tgt.name} free, ${src.name} to ${tgt.name} converter, ${src.name} to ${tgt.name} booking code`;

  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `${src.name} to ${tgt.name} Code Converter`,
    url: canonical,
    description,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      `Convert ${src.name} booking codes to ${tgt.name}`,
      'Decode and preview every selection, market and odds line',
      'No sign-in required, up to 30 selections'
    ],
    publisher: { '@type': 'Organization', name: 'WinFulltime', url: SITE_URL }
  };
  const schemaJson = JSON.stringify([webApp, JSON.parse(generateFaqSchema(pair.faq))], null, 2);

  return wrapPage({
    title,
    description,
    keywords,
    canonicalUrl: canonical,
    schemaJson,
    pageCss: PAIR_CSS,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Code Converter', href: '/convert/' },
      { label: `${src.name} to ${tgt.name}` }
    ],
    body: pairPageBody(pair)
  });
}

function hubPageBody() {
  const faq = HUB.faq.map(f =>
    `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
  ).join('\n');

  const cards = PAIRS.map(p => {
    const src = BOOKMAKERS[p.from];
    const tgt = BOOKMAKERS[p.to];
    return `<a class="convert-card" href="/convert/${slugFor(p.from, p.to)}/">
   <span class="convert-card-title">${esc(src.name)} &rarr; ${esc(tgt.name)}</span>
   <span class="convert-card-blurb">${esc(p.blurb)}</span>
  </a>`;
  }).join('\n');

  return `
  <div class="converter-hero">
   <h1>Booking Code Converter</h1>
   <p class="converter-hero-sub">${esc(HUB.intro)}</p>
   <div class="converter-badges">
    <span>Free to use</span><span>No sign-in</span><span>Up to 30 selections</span><span>SportyBet · MSport · Bet9ja · Betway</span>
   </div>
  </div>

  <div class="pair-disclaimer"><p>Taking a while? Bet9ja code conversion is experiencing issues at present, and our technical team is working on it.</p><p>SportyBet, MSport and Betway conversions are unaffected.</p></div>

  <p style="margin:0 0 8px;"><a class="btn" href="/converter.html">Open the full booking code converter</a></p>

  <section class="seo-content">
   <h2>Convert between ${Object.keys(BOOKMAKERS).map(k => BOOKMAKERS[k].name).join(', ')}</h2>
   <p>Choose a conversion below. Every pair page explains how the code is decoded and re-issued, which markets survive the jump, and how long the new code stays valid — so you know exactly what you are pasting before you stake.</p>
   <div class="convert-grid">
${cards}
   </div>
  </section>

  <section class="seo-content">
   <h2>Booking code conversion FAQ</h2>
${faq}
  </section>

  <section class="seo-content">
   <h2>Learn about booking codes</h2>
   <ul>
    <li><a href="/blog/booking-code-betting.html">Booking Code Betting: How to Bet on Match Events</a></li>
    <li><a href="/blog/accumulator-betting-strategy.html">Accumulator Betting Strategy</a></li>
    <li><a href="/blog/single-bets-vs-multiples.html">Single Bets vs Multiples: The Real Math</a></li>
   </ul>
  </section>
`;
}

function buildHubPage() {
  const canonical = `${SITE_URL}/convert/`;
  const title = 'Booking Code Converter — SportyBet, MSport, Bet9ja, Betway | WinFulltime';
  const description = 'Free booking code converter for SportyBet, MSport, Bet9ja and Betway. Decode any code, preview selections and odds, and generate a fresh playable code for the bookmaker you use — no sign-in, up to 30 selections.';
  const keywords = 'booking code converter, convert betting code, SportyBet to Bet9ja, Betway to SportyBet, MSport code converter, Bet9ja code converter';

  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Booking Code Converter',
    url: canonical,
    description,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Convert booking codes between SportyBet, MSport, Bet9ja and Betway',
      'Decode and preview every selection, market and odds line',
      'No sign-in required, up to 30 selections'
    ],
    publisher: { '@type': 'Organization', name: 'WinFulltime', url: SITE_URL }
  };
  const schemaJson = JSON.stringify([webApp, JSON.parse(generateFaqSchema(HUB.faq))], null, 2);

  return wrapPage({
    title,
    description,
    keywords,
    canonicalUrl: canonical,
    schemaJson,
    pageCss: PAIR_CSS,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Code Converter' }
    ],
    body: hubPageBody()
  });
}

const TOOL_ANCHOR = '  <section class="cv-intro" aria-label="About the booking code converter">';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectBlock(html, name, block) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const wrapped = `${start}\n${block}\n${end}`;
  if (html.includes(start)) {
    const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
    return html.replace(re, wrapped);
  }
  return html.replace(TOOL_ANCHOR, `${wrapped}\n${TOOL_ANCHOR}`);
}

function patchTool() {
  let html = fs.readFileSync(CONVERTER_PATH, 'utf8');

  const disclaimer = `<div class="disclaimer">
   <p>Taking a while? Bet9ja code conversion is experiencing issues at present, and our technical team is working on it.</p>
   <p>SportyBet, MSport and Betway conversions are unaffected.</p>
  </div>`;
  html = injectBlock(html, 'bet9ja-status-notice', disclaimer);

  const chipPairs = PAIRS.slice(0, 6);
  const chips = chipPairs.map(p => {
    const src = BOOKMAKERS[p.from];
    const tgt = BOOKMAKERS[p.to];
    return `    <a class="cv-chip" style="text-decoration:none;" href="/convert/${slugFor(p.from, p.to)}/">${esc(src.name)} &rarr; ${esc(tgt.name)}</a>`;
  }).join('\n');
  const chipsBlock = `  <div class="cv-limit-chips" style="justify-content:center;margin:16px 0 0;">
${chips}
    <a class="cv-chip" style="text-decoration:none;" href="/convert/">All conversions &rarr;</a>
  </div>`;
  html = injectBlock(html, 'popular-conversions', chipsBlock);

  fs.writeFileSync(CONVERTER_PATH, html);
  console.log('Patched public/converter.html (Bet9ja notice + popular conversion chips)');
}

function main() {
  validateContent();
  console.log(`Converter content valid: ${PAIRS.length} pairs`);

  fs.mkdirSync(CONVERT_DIR, { recursive: true });

  for (const pair of PAIRS) {
    const slug = slugFor(pair.from, pair.to);
    const dir = path.join(CONVERT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildPairPage(pair));
  }
  fs.writeFileSync(path.join(CONVERT_DIR, 'index.html'), buildHubPage());
  console.log(`Generated ${PAIRS.length} pair pages + /convert/ hub`);

  patchTool();

  try {
    require('./update-sitemap').main();
  } catch (e) {
    console.error('[converter-pages] Sitemap refresh failed:', e.message);
  }
}

if (require.main === module) main();

module.exports = { main, buildPairPage, buildHubPage, patchTool };
