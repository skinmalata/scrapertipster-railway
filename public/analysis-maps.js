// Shared analysis-link resolution for prediction cards.
// Looks up /data/analysis-links.json (raw "home|away") and
// /data/analysis-links-by-slug.json (canonical slug-keyed map) and resolves a
// card's home/away against both, including reversed order and a strong
// canonicalized form (strips FC/AFC/utd/boldklub-style prefixes and suffixes
// and accents). Guarantees a card is NEVER left with a dead look: when no
// analysis page exists it returns a fallback URL that still resolves to the
// live analysis router.
(function () {
  var maps = { raw: {}, slug: {}, canon: {} };
  var loaded = null;

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

  function canonize(name) {
    return String(name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\(w\)/g, '')
      .replace(/\(u\d+\)/g, '')
      .replace(/\b(?:u\.?td|united|utd|fc|afc|cf|sc|ac|bk|if|fk|ff|ss|sk|klub|boldklub|fodbold|calcio|club)\b/g, ' ')
      .replace(/[.'\u2019]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildMaps(rawLinks, slugLinks) {
    maps.raw = rawLinks || {};
    maps.slug = {};
    maps.canon = {};
    Object.keys(maps.raw).forEach(function (k) {
      var parts = String(k).split('|');
      if (parts.length !== 2) return;
      var sk = slugify(parts[0]) + '|' + slugify(parts[1]);
      if (sk === '|') return;
      if (!maps.slug[sk]) maps.slug[sk] = maps.raw[k];
      var ck = canonize(parts[0]) + '|' + canonize(parts[1]);
      if (ck === '|') return;
      if (!maps.canon[ck]) maps.canon[ck] = maps.raw[k];
    });
    Object.keys(slugLinks || {}).forEach(function (k) {
      if (!maps.slug[k]) maps.slug[k] = slugLinks[k];
    });
  }

  function lookup(home, away) {
    var h = String(home || '').trim().toLowerCase();
    var a = String(away || '').trim().toLowerCase();
    if (!h || !a) return '';
    return maps.raw[h + '|' + a] ||
      maps.raw[a + '|' + h] ||
      maps.slug[slugify(home) + '|' + slugify(away)] ||
      maps.slug[slugify(away) + '|' + slugify(home)] ||
      maps.canon[canonize(home) + '|' + canonize(away)] ||
      maps.canon[canonize(away) + '|' + canonize(home)] ||
      '';
  }

  // Resolve a home/away pair inside an arbitrary key/object map (used against
  // analysis.json's raw "home|away" keys) using the same raw/slug/canon order.
  function resolveKeyMap(home, away, map) {
    var k = String(home).trim().toLowerCase() + '|' + String(away).trim().toLowerCase();
    if (map[k]) return map[k];
    var rev = String(away).trim().toLowerCase() + '|' + String(home).trim().toLowerCase();
    if (map[rev]) return map[rev];
    var sh = slugify(home) + '|' + slugify(away);
    var sr = slugify(away) + '|' + slugify(home);
    var ch = canonize(home) + '|' + canonize(away);
    var cr = canonize(away) + '|' + canonize(home);
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var parts = String(keys[i]).split('|');
      if (parts.length !== 2) continue;
      var pk = slugify(parts[0]) + '|' + slugify(parts[1]);
      var pc = canonize(parts[0]) + '|' + canonize(parts[1]);
      if (pk === sh || pk === sr || pc === ch || pc === cr) return map[keys[i]];
    }
    return null;
  }

  function loadAll() {
    if (loaded) return loaded;
    loaded = Promise.all([
      fetch('/data/analysis-links.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch('/data/analysis-links-by-slug.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (res) {
      buildMaps(res[0], res[1]);
      if (typeof window.afterAnalysisMaps === 'function') window.afterAnalysisMaps();
    });
    return loaded;
  }

  // Fallback URL that always resolves: the live analysis router handles
  // ?home=&away= (or a bare ?home= for single-team cards) and shows the
  // fixture's analysis page when one exists, or a clean "Analysis Unavailable"
  // state otherwise.
  function fallbackLink(match, home, away) {
    var h = String(home || '').trim();
    var a = String(away || '').trim();
    if (h && a) return '/analysis.html?home=' + encodeURIComponent(h) + '&away=' + encodeURIComponent(a);
    var team = String((match && (match.match || '')) || '').trim();
    if (team) return '/analysis.html?home=' + encodeURIComponent(team);
    return '';
  }

  // Resolve a card to its best (analysis | fallback) URL. Caller decides
  // whether to wrap the card in an <a> based on the result.
  function resolve(home, away, match) {
    return lookup(home, away) || fallbackLink(match, home, away);
  }

  function wrapCards(root) {
    var cards = (root || document).querySelectorAll('.match-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.closest('a')) continue;
      var homeEl = card.querySelector('.team-home');
      var awayEl = card.querySelector('.team-away');
      var href = '';
      if (homeEl && awayEl) {
        href = lookup(homeEl.textContent.trim(), awayEl.textContent.trim());
      }
      href = href || fallbackForCard(card);
      if (!href) continue;
      var a = document.createElement('a');
      a.href = href;
      a.className = 'match-card-link';
      a.setAttribute('style', 'display:block;text-decoration:none;color:inherit;');
      if (!card.parentNode) continue;
      card.parentNode.insertBefore(a, card);
      a.appendChild(card);
    }
  }

  function fallbackForCard(card) {
    var team = '';
    var homeEl = card.querySelector('.team-home');
    var awayEl = card.querySelector('.team-away');
    if (homeEl && awayEl && homeEl.textContent.trim() && awayEl.textContent.trim()) {
      return fallbackLink(null, homeEl.textContent.trim(), awayEl.textContent.trim());
    }
    if (homeEl) team = homeEl.textContent.trim();
    if (!team && awayEl) team = awayEl.textContent.trim();
    return team ? fallbackLink({ match: team }) : '';
  }

  window.analysisSlugify = slugify;
  window.analysisCanonize = canonize;
  window.findAnalysisLink = lookup;
  window.analysisFallbackLink = fallbackLink;
  window.resolveAnalysisLink = resolve;
  window.wrapMatchCards = wrapCards;
  window.ensureAnalysisMaps = loadAll;
  window.resolveAnalysisKey = resolveKeyMap;
  window.getAnalysisRaw = function () { return maps.raw; };

  loadAll();
})();