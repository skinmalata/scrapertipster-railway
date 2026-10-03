/* Consent gate and slot handling for the Mondiad Banner and Native zones.
 *
 * The dashboard snippet is a bare <script async src=...> for <head> plus a
 * container div carrying the zone id:
 *
 *   <script async src="https://ss.mrmnd.com/banner.js"></script>
 *   <div data-mndbanid="f2f6108f-b311-432a-b65d-06b00bb8132b"></div>
 *
 * Both delivery scripts ARE baked into <head> now. They were not at first, on
 * the reasoning that a bare tag would request a personalised ad before
 * /consent.js has collected a decision. That reasoning was wrong in a way that
 * mattered: Mondiad validates the *static* HTML, so a tag created here at
 * runtime is invisible to their crawler and the zone read as never implemented.
 * Their account manager confirmed exactly that and asked for the snippet to be
 * in <head>.
 *
 * So the tag is static, per their instructions, and this file keeps what the
 * tag cannot do: it exposes loadMondiadFormat() for the runtime slots
 * /pred-ads.js injects between prediction cards, watches for no-fill so the
 * reserved space collapses, and retains the consent gate for those late slots.
 *
 * Design constraints, matching public/monetag.js:
 *  - Never double-load a network script: if the baked tag is present, it wins.
 *  - Each network script is injected at most once per page, and only when a
 *    matching zone div is actually present on that page.
 *  - Failures collapse the reserved slot instead of leaving a hole. */
(function () {
  'use strict';

  if (window.__wftMondiadLoaded) return;
  window.__wftMondiadLoaded = true;

  var FORMATS = [
    { name: 'banner', src: 'https://ss.mrmnd.com/banner.js', slot: '[data-mndbanid]' },
    { name: 'native', src: 'https://ss.mrmnd.com/native.js', slot: '[data-mndazid]' }
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
  // runs. Both delivery scripts are now baked into <head> per the dashboard
  // instructions, because Mondiad's validator reads the static HTML and cannot
  // see tags created here. So this only injects as a fallback for a page whose
  // head never got them, and must not double-load: if the network's own tag is
  // already in the document, that tag wins and this returns.
  function alreadyBaked(src) {
    var tags = document.getElementsByTagName('script');
    for (var i = 0; i < tags.length; i++) {
      if ((tags[i].src || '').indexOf(src) !== -1) return true;
    }
    return false;
  }

  function injectScript(src, slot) {
    if (injected[src] || alreadyBaked(src)) return;
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

  // Shared entry point for slots that appear later in the page lifetime: the
  // inline units /pred-ads.js injects between prediction cards cannot be baked,
  // so they call this instead of re-declaring the script URLs or their own copy
  // of the "already injected" guard. Consent is re-checked here rather than
  // trusted from the caller, so the gate remains the single authority on when a
  // personalised request may go out.
  function requestFormat(name, slot) {
    var fmt = null;
    for (var i = 0; i < FORMATS.length; i++) { if (FORMATS[i].name === name) { fmt = FORMATS[i]; break; } }
    if (!fmt) return false;
    if (injected[fmt.src]) return true;
    var c = consent();
    if (!c) return false;
    if (c.isGranted()) { injectScript(fmt.src, slot); return true; }
    c.whenGranted(function () { injectScript(fmt.src, slot); });
    return true;
  }

  window.WFT = window.WFT || {};
  window.WFT.loadMondiadFormat = requestFormat;

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
