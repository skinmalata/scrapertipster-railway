/*
 * WinFulltime analytics events helper
 * Pushes events to dataLayer (GTM-ready) and gtag (GA4 now).
 * Manual use: wftTrack('event_name', { param: 'value' })
 */
(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  function wftTrack(name, params) {
    var p = params || {};
    try {
      window.dataLayer.push(Object.assign({ event: name }, p));
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, p);
      }
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('[wft-track]', name, p);
      }
    } catch (e) { /* never break the page over analytics */ }
  }

  window.wftTrack = wftTrack;

  function page() {
    return window.location.pathname;
  }

  function text(el) {
    return (el && el.textContent || '').trim().toLowerCase();
  }

  var EVENT_MAP = [
    { sel: '#htbGenerate, #genBtn', name: 'generate_ticket' },
    { sel: '#htbShuffle, #shuffleBtn', name: 'shuffle_ticket' },
    { sel: '#cvDecodeBtn', name: 'decode_code' },
    { sel: '#cvConvertBtn', name: 'convert_code' },
    { sel: '#cvCopyBtn, #caCopy', name: 'copy_code' },
    { sel: '#caAnalyze', name: 'analyze_code' },
    { sel: '#login-btn', name: 'login_attempt' },
    { sel: '#signup-btn', name: 'sign_up', params: function () { return { method: 'card' }; } },
    { sel: '#signup-btn-paypal', name: 'sign_up', params: function () { return { method: 'paypal' }; } },
    { sel: '.locked-btn, a[href*="pricing.html"]', name: 'click_upgrade' },
    { sel: 'a[href*="ko-fi.com"]', name: 'click_kofi' },
    { sel: 'a[href*="t.me/"]', name: 'click_telegram' },
    { sel: '.code-btn', name: 'copy_booking_code', params: function (el) {
        var bookmaker = 'unknown';
        ['sportybet', 'betway', 'betpawa', 'bet9ja', 'msport'].forEach(function (b) {
          if (el.classList.contains(b)) bookmaker = b;
        });
        return { bookmaker: bookmaker };
      } },
    { sel: '.match-card-link', name: 'view_analysis' },
    { sel: '#categoryTabs a, #categoryTabs .tab-btn', name: 'select_market', params: function (el) {
        return { market: el.id ? el.id.replace('tab-', '') : text(el) };
      } },
    { sel: '.btn-subscribe', name: 'begin_subscribe', params: function (el) {
        var oc = el.getAttribute('onclick') || '';
        return { plan: oc.indexOf('monthly') !== -1 ? 'monthly' : oc.indexOf('yearly') !== -1 ? 'yearly' : 'unknown' };
      } }
  ];

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a, button, [role="button"]') : null;
    if (!el) return;

    for (var i = 0; i < EVENT_MAP.length; i++) {
      var m = EVENT_MAP[i];
      if (el.matches && el.matches(m.sel)) {
        var params = Object.assign({ page: page() }, m.params ? m.params(el) : {});
        wftTrack(m.name, params);
        break;
      }
    }

    if (el.tagName === 'A' && el.matches('a[href^="http"]')) {
      try {
        var host = new URL(el.href).hostname;
        if (host && host !== window.location.hostname) {
          wftTrack('outbound_click', { link_host: host, link_url: el.href, page: page() });
        }
      } catch (err) { /* ignore bad URLs */ }
    }
  }, true);
})();
