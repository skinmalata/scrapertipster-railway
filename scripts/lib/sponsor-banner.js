// Reusable sponsored banner slot for WinFulltime prediction grids.
// Two self-hosted 1win creatives alternate across pages (one per page, picked
// deterministically by seed so the assignment is stable per URL).
// Output mirrors the client-side renderSponsor() used by the JS-rendered pages
// (see generate-category-pages.js / index.html / author-picks.html).

const SPONSOR_HREF = 'https://one-vv5314.com/betting?open=register&p=f61e';
const SPONSOR_BANNERS = [
  '/img/banners/1win-banner-a.webp',
  '/img/banners/1win-banner-b.webp'
];

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

/**
 * @returns {string} sponsor HTML (single line) or '' if fewer than 2 places.
 */
function spliceSponsorBetweenCards(cards, seed) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const banner = renderSponsorBanner(seed);
  return cards[0] + '\n' + banner + '\n' + cards.slice(1).join('\n');
}

module.exports = {
  SPONSOR_HREF,
  SPONSOR_BANNERS,
  pickSponsorIndex,
  renderSponsorBanner,
  spliceSponsorBetweenCards
};