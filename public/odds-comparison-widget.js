(function () {
  'use strict';

  if (window.__WF_ODDS_COMPARISON) return;
  window.__WF_ODDS_COMPARISON = true;

  var API_BASE = (window.WFT_API) || 'https://winfulltime-api.onrender.com';
  var AFFILIATE_URL = 'https://reffpa.com/L?tag=d_6034393m_97c_&site=6034393&ad=97';

  function dateFromPath() {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(window.location.pathname || '');
    return m ? m[1] : '';
  }

  function isoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function normaliseName(name) {
    return String(name == null ? '' : name)
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(?:fc|afc|cf|sc|ac|bk|if|sk|ss|us|utd|ud|cd|club|deportivo)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function is1xBet(bookmaker) {
    return normaliseName(bookmaker.title) === '1xbet' ||
           normaliseName(bookmaker.title).indexOf('1xbet') !== -1 ||
           normaliseName(bookmaker.key).indexOf('1xbet') !== -1;
  }

  function price(value) {
    if (value == null || value === '' || value === 'null') return null;
    var num = Number.parseFloat(value);
    return Number.isFinite(num) && num > 1 ? num : null;
  }

  function bestPrice(rows, key) {
    var best = 0;
    for (var i = 0; i < rows.length; i++) {
      var p = price(rows[i][key]);
      if (p && p > best) best = p;
    }
    return best;
  }

  function ods(val) {
    return val ? val.toFixed(2) : '–';
  }

  function buildTable(data) {
    var rows = data.bookmakers.map(function (bookmaker) {
      return {
        key: bookmaker.key || '',
        title: bookmaker.title || bookmaker.key || 'Bookmaker',
        home: price(bookmaker.home),
        draw: price(bookmaker.draw),
        away: price(bookmaker.away),
        link: bookmaker.link || null
      };
    });
    if (!rows.length) return null;

    var bestHome = bestPrice(rows, 'home');
    var bestDraw = bestPrice(rows, 'draw');
    var bestAway = bestPrice(rows, 'away');

    var bodyHtml = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var sponsored = is1xBet(r);
      var book = '<strong>' + escapeHtml(r.title) + '</strong>';
      if (sponsored) book += ' <span class="odds-sponsored">Sponsored</span>';
      var homeCls = bestHome && r.home === bestHome ? ' class="odds-best"' : '';
      var drawCls = bestDraw && r.draw === bestDraw ? ' class="odds-best"' : '';
      var awayCls = bestAway && r.away === bestAway ? ' class="odds-best"' : '';
      var link = sponsored ? AFFILIATE_URL : r.link;
      var betCell = link
        ? '<a href="' + escapeAttr(link) + '" target="_blank" rel="noopener nofollow' + (sponsored ? ' sponsored' : '') + '" class="odds-bet-link">Bet</a>'
        : '<span class="odds-no-link">–</span>';
      bodyHtml += '<tr>' +
        '<td class="odds-book">' + book + '</td>' +
        '<td' + homeCls + '>' + ods(r.home) + '</td>' +
        '<td' + drawCls + '>' + ods(r.draw) + '</td>' +
        '<td' + awayCls + '>' + ods(r.away) + '</td>' +
        '<td class="odds-bet">' + betCell + '</td>' +
        '</tr>';
    }

    return '' +
      '<div class="odds-comparison">' +
        '<h3>Odds Comparison</h3>' +
        '<p class="odds-comp-meta">1X2 match odds from ' + data.bookmakers.length + ' bookmakers &middot; ' + escapeHtml(data.home_team) + ' vs ' + escapeHtml(data.away_team) + '</p>' +
        '<div class="odds-table-wrap">' +
          '<table class="odds-table">' +
            '<thead><tr><th>Bookmaker</th><th>1</th><th>X</th><th>2</th><th></th></tr></thead>' +
            '<tbody>' + bodyHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="odds-comp-note">Best price in each column is highlighted. Odds are indicative and change in real time; always confirm on the bookmaker before betting. 1xBet links are affiliate links and WinFulltime may receive a commission. 18+ | T&amp;Cs apply | Gamble responsibly.</p>' +
      '</div>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function render(cta, data) {
    if (cta.getAttribute('data-wf-odds-comp')) return;
    var wrap = cta.closest ? cta.closest('.wft-1xbet-wrap') : null;
    var anchor = wrap || cta;
    var existing = anchor.nextElementSibling;
    if (existing && existing.classList && existing.classList.contains('odds-comparison')) return;

    var html = buildTable(data);
    if (!html) return;

    var div = document.createElement('div');
    div.innerHTML = html;
    var node = div.firstElementChild;
    if (!node) return;
    anchor.parentNode.insertBefore(node, anchor.nextSibling);
    cta.setAttribute('data-wf-odds-comp', '1');
  }

  function loadComparison(cta) {
    var home = cta.getAttribute('data-home');
    var away = cta.getAttribute('data-away');
    var date = cta.getAttribute('data-date') || dateFromPath();
    var league = cta.getAttribute('data-league') || '';
    if (!home || !away || !date) return;

    // The Odds API only returns upcoming events — past days always fail, skip.
    if (date < isoDate()) return;

    var qs = [
      'home=' + encodeURIComponent(home),
      'away=' + encodeURIComponent(away),
      'date=' + encodeURIComponent(date),
      'league=' + encodeURIComponent(league)
    ];
    fetch(API_BASE + '/api/odds/comparison?' + qs.join('&'), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (data) {
        if (data && data.available && Array.isArray(data.bookmakers)) {
          render(cta, data);
        }
      })
      .catch(function () { /* comparison unavailable — CTA stays as-is */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ctas = document.querySelectorAll('.wft-1xbet-cta');
    for (var i = 0; i < ctas.length; i++) {
      loadComparison(ctas[i]);
    }
  });
})();