// Shared 1xBet affiliate slot for WinFulltime prediction grids (client-side).
// Loaded by the JS-rendered pages (index.html, author-picks.html,
// predictions/<slug>.html). Mirrors scripts/lib/sponsor-banner.js used by the
// server-rendered matrix and league pages. The refbanners.com affiliate iframe
// is appended after the last card of the grid.
(function () {
  var AFFILIATE_IFRAME = "<iframe scrolling='no' frameBorder='0' style='padding:0px; margin:0px; border:0px;border-style:none;' width='320' height='320' src=\"https://refbanners.com/I?tag=d_6034393m_78736c_&site=6034393&ad=78736\" ></iframe>";

  function renderAffiliateBanner() {
    return '<div class="wft-affiliate">' + AFFILIATE_IFRAME + '</div>';
  }

  function insertSponsor(gridHtml) {
    var marker = '<div class="match-card fade-in"';
    if (gridHtml.indexOf(marker) === -1) return gridHtml;
    return gridHtml + '\n\n' + renderAffiliateBanner();
  }

  window.wftSponsor = { insertSponsor: insertSponsor };
})();