(function () {
  'use strict';

  if (window.__WF_1XBET_WIDGET) return;
  window.__WF_1XBET_WIDGET = true;

  var API_BASE = (window.WFT_API) || 'https://winfulltime-api.onrender.com';
  var BOOKMAKER = '1xBet';

  function normaliseTeam(name) {
    return String(name == null ? '' : name)
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(?:fc|afc|cf|sc|ac|bk|if|sk|ss|us)\b/g, ' ')
      .replace(/['’]/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  function valueEquals(betValue, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (normaliseTeam(betValue) === normaliseTeam(candidates[i])) return true;
    }
    return false;
  }

  // Map a page tip string to the API-Football market name + acceptable values.
  function resolveMarket(tip) {
    var t = String(tip || '').trim().toLowerCase();
    if (!t) return null;

    if (t === '1' || t === 'x' || t === '2') {
      return { market: 'Match Winner', values: [t === '1' ? 'home' : t === 'x' ? 'draw' : 'away'] };
    }
    if (t === '1x' || t === '12' || t === 'x2') {
      var dc = { '1x': ['home', 'draw'], '12': ['home', 'away'], 'x2': ['draw', 'away'] }[t];
      return { market: 'Double Chance', values: dc };
    }
    if (t === 'both teams to score' || t === 'btts yes' || t === 'btts') {
      return { market: 'Both Teams Score', values: ['yes'] };
    }
    if (t === 'btts no') {
      return { market: 'Both Teams Score', values: ['no'] };
    }
    if (t.indexOf('corners') !== -1 && /over \d+(\.\d+)?/.test(t)) {
      var cLine = t.match(/over (\d+(\.\d+)?)/)[1];
      return { market: 'Corners Over/Under', values: ['Over ' + cLine, 'Over ' + cLine + ' Corners'] };
    }
    if (t.indexOf('cards') !== -1 && /over \d+(\.\d+)?/.test(t)) {
      var ccLine = t.match(/over (\d+(\.\d+)?)/)[1];
      return { market: 'Cards Over/Under', values: ['Over ' + ccLine, 'Over ' + ccLine + ' Cards'] };
    }
    if (/over \d+(\.\d+)?/.test(t) || /under \d+(\.\d+)?/.test(t)) {
      var gLine = t.match(/over (\d+(\.\d+)?)/);
      var gVal = gLine ? 'Over ' + gLine[1] : t;
      return { market: 'Goals Over/Under', values: [gVal] };
    }
    return null;
  }

  function findOdds(fixture, tip) {
    if (!fixture || !Array.isArray(fixture.bookmakers)) return null;
    var target = resolveMarket(tip);
    if (!target) return null;

    for (var bi = 0; bi < fixture.bookmakers.length; bi++) {
      var book = fixture.bookmakers[bi];
      if (normaliseTeam(book.name) !== normaliseTeam(BOOKMAKER)) continue;
      var bets = Array.isArray(book.bets) ? book.bets : [];
      for (var mi = 0; mi < bets.length; mi++) {
        var bet = bets[mi];
        if (normaliseTeam(bet.name) !== normaliseTeam(target.market)) continue;
        var values = Array.isArray(bet.values) ? bet.values : [];
        for (var vi = 0; vi < values.length; vi++) {
          if (valueEquals(values[vi].value, target.values)) {
            var price = Number.parseFloat(values[vi].odd);
            if (Number.isFinite(price) && price > 1) return Number(price.toFixed(2));
          }
        }
      }
    }
    return null;
  }

  function findFixture(oddsResponse, home, away) {
    if (!oddsResponse || !Array.isArray(oddsResponse)) return null;
    var h = normaliseTeam(home);
    var a = normaliseTeam(away);
    if (!h || !a) return null;
    for (var i = 0; i < oddsResponse.length; i++) {
      var f = oddsResponse[i];
      if (!f || !f.teams) continue;
      if (normaliseTeam(f.teams.home && f.teams.home.name) === h &&
          normaliseTeam(f.teams.away && f.teams.away.name) === a) {
        return f;
      }
    }
    return null;
  }

  function enhanceCard(card, oddsResponse) {
    var btn = card.querySelector('.wft-1xbet-cta');
    if (!btn || btn.getAttribute('data-wf-enriched')) return;
    var home = btn.getAttribute('data-home') || card.getAttribute('data-home');
    var away = btn.getAttribute('data-away') || card.getAttribute('data-away');
    var tip = btn.getAttribute('data-tip') || card.getAttribute('data-tip');
    if (!home || !away) return;

    var fixture = findFixture(oddsResponse, home, away);
    if (!fixture) return;

    var odds = findOdds(fixture, tip);
    if (odds == null) return;

    btn.setAttribute('data-wf-enriched', '1');
    var span = btn.querySelector('.wft-1xbet-odds');
    if (span) {
      span.textContent = ' ' + odds.toFixed(2);
      span.style.color = '#facc15';
    }
    var label = btn.childNodes[0];
    if (label && label.nodeType === 3) {
      label.textContent = (tip ? '1xBet ' + tip + ' ' : '1xBet ') + '@ ' + odds.toFixed(2) + '   Bet';
    }
  }

  var enrichAll = function (oddsResponse) {
    var cards = document.querySelectorAll('.wft-1xbet-cta');
    for (var i = 0; i < cards.length; i++) {
      enhanceCard(cards[i].closest('.match-card') || cards[i], oddsResponse);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    fetch(API_BASE + '/api/football-odds?date=' + encodeURIComponent(new Date().toISOString().slice(0, 10)), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (data) {
        var fixtures = data && Array.isArray(data.response) ? data.response : null;
        if (!fixtures || fixtures.length === 0) return;
        enrichAll(fixtures);

        var mo = new MutationObserver(function () {
          enrichAll(fixtures);
        });
        mo.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function () { /* odds feed unavailable - static CTA remains */ });
  });
})();
