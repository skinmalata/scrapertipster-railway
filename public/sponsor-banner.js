// Shared sponsored-banner slot for WinFulltime prediction grids.
// Loaded by the JS-rendered pages (index.html, author-picks.html,
// predictions/<slug>.html). Mirrors scripts/lib/sponsor-banner.js used by the
// server-rendered matrix and league pages. One banner per page, inserted
// between the first and second match card, creative chosen deterministically
// per page load (stable across date-tab re-renders).
(function () {
  var SPONSOR_HREF = 'https://one-vv5314.com/betting?open=register&p=f61e';
  var SPONSOR_BANNERS = ['/img/banners/1win-banner-a.webp', '/img/banners/1win-banner-b.webp'];

  function pickSponsorIndex(seed) {
    var s = String(seed == null ? '' : seed);
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h * 31) + s.charCodeAt(i)) >>> 0;
    }
    return h % SPONSOR_BANNERS.length;
  }

  var index = pickSponsorIndex(window.location.pathname);

  function insertSponsor(gridHtml) {
    var marker = '<div class="match-card fade-in"';
    var first = gridHtml.indexOf(marker);
    if (first < 0) return gridHtml;
    var second = gridHtml.indexOf(marker, first + marker.length);
    if (second < 0) return gridHtml;
    var banner = '<div class="wft-sponsor"><a href="' + SPONSOR_HREF +
      '" target="_blank" rel="noopener nofollow sponsored" title="1Win" aria-label="1Win">' +
      '<img src="' + SPONSOR_BANNERS[index] + '" alt="1Win" width="800" height="800" ' +
      'loading="lazy" decoding="async" style="display:block;width:100%;height:auto;border-radius:12px;">' +
      '</a></div>';
    var insertAt = second;
    while (insertAt > 0 && (gridHtml[insertAt - 1] === '\n' || gridHtml[insertAt - 1] === ' ')) insertAt--;
    return gridHtml.slice(0, insertAt) + '\n\n' + banner + '\n\n  ' + gridHtml.slice(second);
  }

  window.wftSponsor = { insertSponsor: insertSponsor };
})();