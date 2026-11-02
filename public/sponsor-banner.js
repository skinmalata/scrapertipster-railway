// Shared sponsored-banner slot for WinFulltime prediction grids.
// Loaded by the JS-rendered pages (index.html, author-picks.html,
// predictions/<slug>.html). Mirrors scripts/lib/sponsor-banner.js used by the
// server-rendered matrix and league pages. One Bitmedia unit goes between the
// first and second match card.
(function () {
  var BITMEDIA_UNIT = '6ae8887bf30577b049694c23';

  function insertSponsor(gridHtml) {
    var marker = '<div class="match-card fade-in"';
    var first = gridHtml.indexOf(marker);
    if (first < 0) return gridHtml;
    var second = gridHtml.indexOf(marker, first + marker.length);
    if (second < 0) return gridHtml;
    var banner = '<div class="wft-sponsor" data-ad-position="sponsored_match_card"><ins class="' + BITMEDIA_UNIT + '" style="display:inline-block;width:1px;height:1px;"></ins></div>' +
      '<div class="wft-ad-slot" data-ad-position="in_content" aria-label="Advertisement"></div>';
    var insertAt = second;
    while (insertAt > 0 && (gridHtml[insertAt - 1] === '\n' || gridHtml[insertAt - 1] === ' ')) insertAt--;
    return gridHtml.slice(0, insertAt) + '\n\n' + banner + '\n\n  ' + gridHtml.slice(second);
  }

  window.wftSponsor = { insertSponsor: insertSponsor };
})();
