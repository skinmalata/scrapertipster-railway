// Reusable Bitmedia sponsored slot for generated prediction grids.
const BITMEDIA_UNIT = '6ae8887bf30577b049694c23';

function renderSponsorBanner(seed) {
  return '<div class="wft-sponsor" data-ad-position="sponsored_match_card"><ins class="' + BITMEDIA_UNIT + '" style="display:inline-block;width:1px;height:1px;"></ins></div>';
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
  BITMEDIA_UNIT,
  renderSponsorBanner,
  spliceSponsorBetweenCards
};
