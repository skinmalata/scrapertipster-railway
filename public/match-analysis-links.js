(function () {
  var links = {};

  function wrap() {
    if (!document.body) return;
    var cards = document.querySelectorAll('.match-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.closest('a')) continue;
      var homeEl = card.querySelector('.team-home');
      var awayEl = card.querySelector('.team-away');
      if (!homeEl || !awayEl) continue;
      var key = (homeEl.textContent.trim() + '|' + awayEl.textContent.trim()).toLowerCase();
      var href = links[key];
      if (!href) continue;
      var a = document.createElement('a');
      a.href = href;
      a.className = 'match-card-link';
      a.setAttribute('style', 'display:block;text-decoration:none;color:inherit;');
      card.parentNode.insertBefore(a, card);
      a.appendChild(card);
    }
  }

  fetch('/data/analysis-links.json')
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (data) {
      links = data || {};
      wrap();
    });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap);
  } else {
    wrap();
  }

  if (document.body) {
    new MutationObserver(wrap).observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      new MutationObserver(wrap).observe(document.body, { childList: true, subtree: true });
    });
  }
})();
