// Wraps unlinked .match-card elements in an <a> once analysis maps are ready.
// Uses the shared resolver from analysis-maps.js when available (raw slug
// canonical fallback); falls back to a minimal exact-key lookup otherwise.
// Cards already wrapped by a page's renderer are skipped.
(function () {
  var links = {};

  function slugify(name) {
    return String(name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split('(')[0]
      .replace(/['\u2019]/g, '')
      .replace(/&/g, 'and')
      .replace(/\b(?:fc|afc|cf|sc|ac)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function miniLookup(home, away) {
    var h = String(home || '').trim().toLowerCase();
    var a = String(away || '').trim().toLowerCase();
    var slug = {};
    Object.keys(links).forEach(function (k) {
      var parts = String(k).split('|');
      if (parts.length !== 2) return;
      slug[slugify(parts[0]) + '|' + slugify(parts[1])] = links[k];
    });
    return links[h + '|' + a] ||
      links[a + '|' + h] ||
      slug[slugify(home) + '|' + slugify(away)] ||
      slug[slugify(away) + '|' + slugify(home)] ||
      '';
  }

  function wrap() {
    if (typeof window.wrapMatchCards === 'function') {
      window.wrapMatchCards(document);
      return;
    }
    var cards = document.querySelectorAll('.match-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.closest('a')) continue;
      var homeEl = card.querySelector('.team-home');
      var awayEl = card.querySelector('.team-away');
      if (!homeEl || !awayEl) continue;
      var href = miniLookup(homeEl.textContent.trim(), awayEl.textContent.trim());
      if (!href) continue;
      var a = document.createElement('a');
      a.href = href;
      a.className = 'match-card-link';
      a.setAttribute('style', 'display:block;text-decoration:none;color:inherit;');
      card.parentNode.insertBefore(a, card);
      a.appendChild(card);
    }
  }

  if (typeof window.ensureAnalysisMaps === 'function') {
    window.ensureAnalysisMaps().then(wrap);
  } else {
    fetch('/data/analysis-links.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (data) {
        links = data || {};
        wrap();
      });
  }

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