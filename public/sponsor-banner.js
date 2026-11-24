// Shared in-feed ad slots for WinFulltime prediction grids.
// Loaded by the JS-rendered pages (index.html, author-picks.html,
// predictions/<slug>.html). Mirrors scripts/lib/sponsor-banner.js used by the
// server-rendered matrix and league pages.
//
// Placement:
//   1. A site ad slot after the 3rd card on phones and after the 5th card on
//      wider screens. Bitmedia is no longer used.
(function () {
  var MARKER = '<div class="match-card fade-in"';

  function renderLegacySlot() {
    return '<div class="wft-ad-slot wft-sponsor" data-ad-position="sponsored_match_card" aria-label="Advertisement"></div>' +
      '<div class="wft-ad-slot" data-ad-position="in_content" aria-label="Advertisement"></div>';
  }

  function insertAt(html, index, markup) {
    var at = index;
    while (at > 0 && (html.charAt(at - 1) === '\n' || html.charAt(at - 1) === ' ')) at--;
    return html.slice(0, at) + '\n\n' + markup + '\n\n  ' + html.slice(index);
  }

  function isPhone() {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 639px)').matches
      : window.innerWidth <= 639;
  }

  function insertSponsor(gridHtml) {
    var positions = [];
    var at = gridHtml.indexOf(MARKER);
    while (at >= 0) {
      positions.push(at);
      at = gridHtml.indexOf(MARKER, at + MARKER.length);
    }
    if (positions.length < 2) return gridHtml;

    // Phones see one card per row, so the second ad moves to card 3. On wider
    // screens it follows card 5.
    var afterCard = isPhone() ? 3 : (positions.length >= 5 ? 5 : 3);
    var sponsorAt = positions.length > afterCard ? positions[afterCard] : gridHtml.length;
    gridHtml = insertAt(gridHtml, sponsorAt, renderLegacySlot());
    return gridHtml;
  }

  window.wftSponsor = { insertSponsor: insertSponsor };
})();
