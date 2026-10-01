/* Lazy loader for the Mondiad Banner and Native zones.
 *
 * The dashboard snippet is a bare <script async src=...> for <head> plus a
 * container div carrying the zone id:
 *
 *   <script async src="https://ss.mrmnd.com/banner.js"></script>
 *   <div data-mndbanid="f2f6108f-b311-432a-b65d-06b00bb8132b"></div>
 *
 * That snippet is deliberately not baked into the page. Baking it would make
 * every EU/UK visitor request a personalised ad before /consent.js has
 * collected a decision, which is the one thing the gate exists to prevent.
 * This file runs after the baked slots are in the DOM, waits for consent, and
 * then appends the same script to <head> -- so the network gets the markup it
 * expects without the gate being bypassed.
 *
 * Design constraints, matching public/monetag.js:
 *  - Nothing is requested until consent is granted AND the slot is near the
 *    viewport, so ad bandwidth never competes with the LCP element.
 *  - Each network script is injected at most once per page, and only when a
 *    matching zone div is actually present on that page.
 *  - Failures collapse the reserved slot instead of leaving a hole. */
(function () {
  'use strict';

  if (window.__wftMondiadLoaded) return;
  window.__wftMondiadLoaded = true;

  var FORMATS = [
    { src: 'https://ss.mrmnd.com/banner.js', slot: '[data-mndbanid]' },
    { src: 'https://ss.mrmnd.com/native.js', slot: '[data-mndazid]' }
  ];

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

  function whenNearViewport(slot, cb) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); cb(); return; }
      }
    }, { rootMargin: '400px 0px' });
    io.observe(slot);
  }

  // The reserved height lives on the slot itself (see /ads.css), so hiding it
  // is what reclaims the space.
  function collapse(slot) {
    if (!slot) return;
    slot.style.minHeight = '0';
    slot.style.display = 'none';
  }

  // The network scans the document for its zone attribute when the script
  // runs. The div is baked and this loader is deferred, so it is already
  // present. Appending to <head> matches the snippet the dashboard hands out.
  function injectScript(src, slot) {
    if (injected[src]) return;
    injected[src] = true;

    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onerror = function () { collapse(slot); };
    (document.head || document.documentElement).appendChild(s);
  }

  function loadFormat(fmt) {
    var slot = document.querySelector(fmt.slot);
    if (!slot) return;
    whenNearViewport(slot, function () { injectScript(fmt.src, slot); });
  }

  function init() {
    whenConsented(function () {
      for (var i = 0; i < FORMATS.length; i++) loadFormat(FORMATS[i]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
