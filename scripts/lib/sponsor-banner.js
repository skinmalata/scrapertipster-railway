// Reusable sponsored banner slots for WinFulltime prediction grids.
// Two self-hosted 1win creatives alternate across pages (one per page, picked
// deterministically by seed so the assignment is stable per URL), spliced
// between the first and second match card. A refbanners.com affiliate iframe is
// appended after the last card of the grid.
// Output mirrors the client-side renderSponsor() used by the JS-rendered pages
// (see generate-category-pages.js / index.html / author-picks.html).

const SPONSOR_HREF = 'https://one-vv5314.com/betting?open=register&p=f61e';
const SPONSOR_BANNERS = [
  '/img/banners/1win-banner-a.webp',
  '/img/banners/1win-banner-b.webp'
];

const AFFILIATE_IFRAME = "<iframe scrolling='no' frameBorder='0' loading='lazy' referrerpolicy='no-referrer' title='Affiliate promotion' style='padding:0px; margin:0px; border:0px;border-style:none;' width='100%' height='320' src=\"https://refbanners.com/I?tag=d_6034393m_196840c_&site=6034393&ad=196840\"></iframe>";

function pickSponsorIndex(seed) {
  const s = String(seed == null ? '' : seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  }
  return h % SPONSOR_BANNERS.length;
}

function renderSponsorBanner(seed) {
  var idx = pickSponsorIndex(seed);
  return '<div class="wft-sponsor"><a href="' + SPONSOR_HREF +
    '" target="_blank" rel="noopener nofollow sponsored" title="1Win" aria-label="1Win">' +
    '<img src="' + SPONSOR_BANNERS[idx] + '" alt="1Win" width="800" height="800" ' +
    'loading="lazy" decoding="async" style="display:block;width:100%;height:auto;border-radius:12px;">' +
    '</a></div>';
}

function renderAffiliateBanner() {
  return '<div class="wft-affiliate">' + AFFILIATE_IFRAME + '</div>';
}

/**
 * @returns {string} sponsor HTML (single line) or '' if fewer than 2 places.
 */
function spliceSponsorBetweenCards(cards, seed) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const banner = renderSponsorBanner(seed);
  return cards[0] + '\n' + banner + '\n' + cards.slice(1).join('\n');
}

/**
 * Full grid slot assembly: 1win banner (if >=2 cards) plus the affiliate
 * iframe appended after the last card. Returns '' when there are no cards.
 */
function buildGridHtml(cards, seed) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  const body = spliceSponsorBetweenCards(cards, seed) || cards.join('\n');
  return body + '\n\n' + renderAffiliateBanner();
}

module.exports = {
  SPONSOR_HREF,
  SPONSOR_BANNERS,
  AFFILIATE_IFRAME,
  pickSponsorIndex,
  renderSponsorBanner,
  renderAffiliateBanner,
  spliceSponsorBetweenCards,
  buildGridHtml
};