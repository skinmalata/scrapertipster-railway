// Shared in-feed ad slots for WinFulltime prediction grids.
// Loaded by the JS-rendered pages (index.html, author-picks.html,
// predictions/<slug>.html). Mirrors scripts/lib/sponsor-banner.js used by the
// server-rendered matrix and league pages.
//
// Placement:
//   1. Bitmedia Prebid unit first, between the 1st and 2nd match card.
//   2. Existing sponsored Bitmedia banner pushed below the 8th card.
(function () {
  var BITMEDIA_UNIT = '6ae8887bf30577b049694c23';
  var PREBID_SLOT_ID = 'classname-container-placement';
  var MARKER = '<div class="match-card fade-in"';

  function renderPrebidSlot() {
    return '<div id="' + PREBID_SLOT_ID + '" class="wft-ad-slot" data-wft-prebid="bitmedia" data-ad-position="in_content" aria-label="Advertisement" style="grid-column:1/-1;"></div>';
  }

  function renderLegacySlot() {
    return '<div class="wft-sponsor" data-ad-position="sponsored_match_card"><ins class="' + BITMEDIA_UNIT + '" style="display:inline-block;width:1px;height:1px;"></ins></div>' +
      '<div class="wft-ad-slot" data-ad-position="in_content" aria-label="Advertisement"></div>';
  }

  function insertAt(html, index, markup) {
    var at = index;
    while (at > 0 && (html.charAt(at - 1) === '\n' || html.charAt(at - 1) === ' ')) at--;
    return html.slice(0, at) + '\n\n' + markup + '\n\n  ' + html.slice(index);
  }

  function insertSponsor(gridHtml) {
    var positions = [];
    var at = gridHtml.indexOf(MARKER);
    while (at >= 0) {
      positions.push(at);
      at = gridHtml.indexOf(MARKER, at + MARKER.length);
    }
    if (positions.length < 2) return gridHtml;

    // Existing in-feed sponsored banner moves below the 8th card. When the grid
    // has fewer cards it falls to the end of the grid.
    var sponsorAt = positions.length >= 9 ? positions[8] : gridHtml.length;
    gridHtml = insertAt(gridHtml, sponsorAt, renderLegacySlot());

    // The Bitmedia Prebid unit is the first in-feed ad (after card 1).
    gridHtml = insertAt(gridHtml, positions[1], renderPrebidSlot());
    return gridHtml;
  }

  window.wftSponsor = { insertSponsor: insertSponsor };
})();
