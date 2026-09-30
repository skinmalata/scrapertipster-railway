/* Lazy loader for the Monetag In-Page Push banner and Vignette.
 *
 * Monetag's own snippets append a <script> carrying a data-zone attribute,
 * which the network reads back off that element to decide which zone to
 * serve. Both entry points below reproduce that exactly -- the zone lives on
 * the script element itself, so it must not be moved to a container.
 *
 * Design constraints, matching public/adsterra.js:
 *  - Nothing is requested until consent is granted AND the slot is near the
 *    viewport, so ad bandwidth never competes with the LCP element.
 *  - Each network script is injected at most once per page.
 *  - Failures collapse the reserved slot instead of leaving a hole.
 */
(function () {
  'use strict';

  if (window.__wftMonetagLoaded) return;
  window.__wftMonetagLoaded = true;

  var IPP_ZONE = '11929270';
  var IPP_SRC = 'https://nap5k.com/tag.min.js';
  var VIGNETTE_ZONE = '11929272';
  var VIGNETTE_SRC = 'https://n6wxm.com/vignette.min.js';

  var injected = {};

  function consent() {
    return window.WFT && window.WFT.consent ? window.WFT.consent : null;
  }

  // Waits for a real decision. Outside the EU/UK the gate resolves itself as
  // granted during init, so this does not stall non-European visitors.
  function whenConsented(cb) {
    var c = consent();
    if (!c) return;
    if (c.isGranted()) { cb(); return; }
    c.whenGranted(function () { cb(); });
  }

  function injectTag(src, zone, onError) {
    if (injected[src]) return;
    injected[src] = true;

    var s = document.createElement('script');
    // The network reads the zone off this element.
    s.dataset.zone = zone;
    s.dataset.wftMonetag = '1';
    s.src = src;
    s.async = true;
    s.onerror = onError || null;
    (document.body || document.documentElement).appendChild(s);
  }

  function collapse(slot) {
    if (!slot) return;
    if (slot.parentNode) slot.parentNode.style.minHeight = '0';
    slot.style.display = 'none';
  }

  function whenNearViewport(slot, cb) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); cb(); return; }
      }
    }, { rootMargin: '400px 0px' });
    io.observe(slot);
  }

  // In-content banner: deferred until the slot is close to view, so it never
  // competes with first paint.
  function loadInPagePush() {
    var slot = document.querySelector('[data-wft-ad="ipp"]');
    if (!slot) return;
    whenNearViewport(slot, function () {
      injectTag(IPP_SRC, IPP_ZONE, function () { collapse(slot); });
    });
  }

  // Vignette has no in-content anchor -- the network decides where to present.
  // Load it once, after the page has settled, so it cannot compete with LCP.
  function loadVignette() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(function () {
        injectTag(VIGNETTE_SRC, VIGNETTE_ZONE);
      }, { timeout: 3000 });
    } else {
      window.setTimeout(function () {
        injectTag(VIGNETTE_SRC, VIGNETTE_ZONE);
      }, 1500);
    }
  }

  // Additive hook for /pred-ads.js, which creates inline slots after this file
  // has already anchored the page-level one. Monetag keys each request off the
  // data-zone attribute of the script element, so every inline slot asks for its
  // own copy instead of assuming one script fills every empty container.
  //
  // Deliberately not routed through injectTag(): that dedupes by src to keep the
  // page-level banner at a single request, which would starve inline slots.
  function requestInlineIpp(unit) {
    if (!unit || unit.dataset.wftIpp === '1') return;
    unit.dataset.wftIpp = '1';

    whenNearViewport(unit, function () {
      var s = document.createElement('script');
      // The network reads the zone off this element.
      s.dataset.zone = IPP_ZONE;
      s.dataset.wftMonetag = '1';
      s.src = IPP_SRC;
      s.async = true;
      s.onerror = function () { collapse(unit); };
      (document.body || document.documentElement).appendChild(s);
    });
  }

  window.WFT = window.WFT || {};
  window.WFT.requestInlineIpp = requestInlineIpp;

  function init() {
    whenConsented(function () {
      loadInPagePush();
      loadVignette();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
