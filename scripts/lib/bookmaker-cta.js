// =============================================================================
// Reusable "BET ON" bookmaker CTA component for WinFulltime prediction cards.
// -----------------------------------------------------------------------------
// USAGE
//   const { renderBookmakerCTA } = require('./lib/bookmaker-cta');
//   html += renderBookmakerCTA({ home, away, tip, date, league });
//
// The output is SERVER-RENDERED static HTML (no fake links, no JS required to
// see the links) so it stays crawler-visible for SEO. Each bookmaker box is an
// independent <a> opening its own affiliate URL via target="_blank" and
// rel="noopener nofollow sponsored" (correct affiliate disclosure).
//
// HOW TO CONFIGURE (edit the AFFILIATE_LINKS object below):
//   * Add/remove bookmakers by editing the array.
//   * Change a bookmaker's affiliate URL here.
//   * Change the logo rendering/text, CTA label, or colors here / in app.css.
// A bookmaker is only rendered once its URL is a real http(s) link. Keep it as
// "" or "YOUR_..._LINK" and the box is hidden until you paste the real URL.
// =============================================================================

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESCAPE_MAP[c]; });
}

function isRealUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(String(url || '').trim());
}

// -----------------------------------------------------------------------------
// CONFIGURATION — put your real affiliate links here.
// Keep placeholders ("" or "YOUR_..._LINK") for any you have not filled in yet:
// that bookmaker box will simply be skipped until a real URL is supplied.
// -----------------------------------------------------------------------------
const AFFILIATE_LINKS = {
  oneXBet: 'https://reffpa.com/L?tag=d_6034393m_97c_&site=6034393&ad=97',
  stake: 'https://stake.com/?c=FjhqQ3n3',
  oneWin: 'https://one-vv6198.com/betting?open=register&p=f61e'
};

// CTA label shown on the red "BET ON" pill. Change freely.
const CTA_LABEL = 'BET ON';

// Bookmaker display config (order here = display order).
// logoImg: path to the official transparent logo wordmark served from /img/logos/
//          (self-hosted so the static site stays reliable). Render is an <img>
//          inside the box; the brand name stays available for a11y via aria-label.
// logoW/logoH: intrinsic pixel dimensions of the asset (used as width/height
//          attributes so the browser reserves space before the image loads).
const BOOKMAKERS = [
  {
    key: 'oneXBet',
    name: '1xBet',
    logoImg: '/img/logos/1xbet.png',
    logoW: 359,
    logoH: 102,
    brandClass: 'wft-book--1xbet'
  },
  {
    key: 'stake',
    name: 'Stake',
    logoImg: '/img/logos/stake.png',
    logoW: 284,
    logoH: 169,
    brandClass: 'wft-book--stake'
  },
  {
    key: 'oneWin',
    name: '1Win',
    logoImg: '/img/logos/1win.png',
    logoW: 676,
    logoH: 284,
    brandClass: 'wft-book--1win'
  }
];

function renderBookmakerBox(book) {
  var url = (AFFILIATE_LINKS[book.key] || '').trim();
  if (!isRealUrl(url)) return ''; // skip bookmakers without a real URL yet

  // Each box is a clean click target showing the official logo wordmark on the
  // white bar. The brandClass is kept so the live-odds widget can still find
  // the 1xBet box (.wft-book--1xbet) and the odds widget can append its price
  // (<span class="wft-book-price">) inside it.
  return '' +
    '<a class="wft-book ' + book.brandClass + '" href="' + esc(url) + '" ' +
      'target="_blank" rel="noopener nofollow sponsored" data-book="' + esc(book.key) + '" ' +
      'aria-label="' + esc(book.name) + '" title="' + esc(book.name) + '">' +
      '<span class="wft-book-logo">' +
        '<img src="' + esc(book.logoImg) + '" alt="' + esc(book.name) + '" ' +
          'width="' + book.logoW + '" height="' + book.logoH + '" loading="lazy" ' +
          'decoding="async" class="wft-book-logo-img">' +
      '</span>' +
    '</a>';
}

/**
 * Render the static, copy-invariant BODY of the component (the red BET ON pill,
 * the independent bookmaker boxes, and the live-odds fill span). This carries no
 * per-match data attributes, so it can be pre-rendered once and reused in
 * client-side card builders (see generate-category-pages.js).
 * @returns {string} server-rendered HTML string ('' if no bookmaker has a URL).
 */
function renderBookmakerCTABody() {
  var boxes = BOOKMAKERS.map(renderBookmakerBox).join('');
  if (!boxes) return ''; // no real bookmaker URLs configured yet

  return '' +
    '<span class="wft-beton-label" aria-hidden="true">' +
      '<span class="wft-beton-text">' + esc(CTA_LABEL) + '</span>' +
      '<span class="wft-beton-chevron">&#8250;</span>' +
    '</span>' +
    '<span class="wft-bookmakers">' + boxes + '</span>' +
    // Fill target for the live-odds enhancement on the 1xBet box.
    '<span class="wft-1xbet-odds"></span>';
}

/**
 * Render the full BET ON component.
 * @param {object} opts - { home, away, tip, date, league }
 * @returns {string} server-rendered HTML string ('' if no bookmaker has a URL).
 */
function renderBookmakerCTA(opts) {
  opts = opts || {};
  var body = renderBookmakerCTABody();
  if (!body) return ''; // no real bookmaker URLs configured yet

  // data-* attributes are used by the 1xbet-odds widget to enrich the 1xBet box.
  return '' +
    '<div class="wft-bet-on" ' +
      'data-home="' + esc(opts.home || '') + '" ' +
      'data-away="' + esc(opts.away || '') + '" ' +
      'data-tip="' + esc(opts.tip || '') + '" ' +
      (opts.date ? 'data-date="' + esc(opts.date) + '" ' : '') +
      (opts.league ? 'data-league="' + esc(opts.league) + '"' : '') +
    '>' + body + '</div>';
}

module.exports = {
  AFFILIATE_LINKS: AFFILIATE_LINKS,
  BOOKMAKERS: BOOKMAKERS,
  CTA_LABEL: CTA_LABEL,
  renderBookmakerCTA: renderBookmakerCTA,
  renderBookmakerCTABody: renderBookmakerCTABody
};
