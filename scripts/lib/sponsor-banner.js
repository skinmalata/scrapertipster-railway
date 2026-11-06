// Reusable Bitmedia slots for generated prediction grids.
const BITMEDIA_UNIT = '6ae8887bf30577b049694c23';
const PREBID_SLOT_ID = 'classname-container-placement';

// First in-feed slot: the Bitmedia Prebid unit (header bidding). Picked up by
// public/bitmedia-prebid.js, which waits for consent and for this element.
function renderPrebidSlot() {
  return '<div id="' + PREBID_SLOT_ID + '" class="wft-ad-slot" data-wft-prebid="bitmedia" data-ad-position="in_content" aria-label="Advertisement"></div>';
}

function renderSponsorBanner(seed) {
  return '<div class="wft-sponsor" data-ad-position="sponsored_match_card"><ins class="' + BITMEDIA_UNIT + '" style="display:inline-block;width:1px;height:1px;"></ins></div>';
}

/**
 * Splice the in-feed ads into a rendered card list:
 *   - Prebid slot between the 1st and 2nd card (first ad on the page).
 *   - Existing sponsored banner after the 3rd card (or at the end when the
 *     page has fewer than 3 cards). The prebid slot already occupies the
 *     second cell of the desktop grid, so placing the full-width banner after
 *     card 3 completes two full rows and avoids an empty grid cell.
 * @returns {string} card HTML or null if fewer than 2 cards.
 */
function spliceSponsorBetweenCards(cards, seed) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    out.push(cards[i]);
    if (i === 0) out.push(renderPrebidSlot());
    if (i === 2) out.push(renderSponsorBanner(seed));
  }
  if (cards.length < 3) out.push(renderSponsorBanner(seed));
  return out.join('\n');
}

module.exports = {
  BITMEDIA_UNIT,
  PREBID_SLOT_ID,
  renderPrebidSlot,
  renderSponsorBanner,
  spliceSponsorBetweenCards
};
