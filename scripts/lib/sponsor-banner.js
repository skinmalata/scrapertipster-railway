// Reusable 1xBet affiliate banner slot for WinFulltime prediction grids.
// The refbanners.com iframe (owner account 6034393) is appended after the last
// match card of the grid, server-side via buildGridHtml() / insert script and
// client-side by public/sponsor-banner.js.

const AFFILIATE_IFRAME = "<iframe scrolling='no' frameBorder='0' style='padding:0px; margin:0px; border:0px;border-style:none;' width='320' height='320' src=\"https://refbanners.com/I?tag=d_6034393m_78736c_&site=6034393&ad=78736\" ></iframe>";

function renderAffiliateBanner() {
  return '<div class="wft-affiliate">' + AFFILIATE_IFRAME + '</div>';
}

/**
 * Full grid slot assembly: cards joined together plus the 1xBet affiliate
 * iframe appended after the last card. Returns '' when there are no cards.
 */
function buildGridHtml(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return cards.join('\n') + '\n\n' + renderAffiliateBanner();
}

module.exports = {
  AFFILIATE_IFRAME,
  renderAffiliateBanner,
  buildGridHtml
};