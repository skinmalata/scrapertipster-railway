// Reusable ad slots for generated prediction grids. Bitmedia is disabled.

function renderSponsorBanner() {
  return '<div class="wft-ad-slot wft-sponsor" data-ad-position="sponsored_match_card" aria-label="Advertisement"></div>';
}

/**
 * Splice the in-feed sponsor into a rendered card list:
 *   - Existing sponsored banner after the 3rd card (or at the end when the
 *     page has fewer than 3 cards).
 * @returns {string} card HTML or null if fewer than 2 cards.
 */
function spliceSponsorBetweenCards(cards, seed) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    out.push(cards[i]);
    if (i === 2) out.push(renderSponsorBanner(seed));
  }
  if (cards.length < 3) out.push(renderSponsorBanner(seed));
  return out.join('\n');
}

module.exports = {
  renderSponsorBanner,
  spliceSponsorBetweenCards
};
