/* Lazy loader for Adsterra units.
 *
 * Design constraints:
 *  - Nothing is requested until a slot is near the viewport, so ad
 *    bandwidth never competes with the LCP element on page load.
 *  - Each network script is injected at most once per page. The 300x250
 *    loader also depends on the global `atOptions`, which a second
 *    invocation would clobber.
 *  - Failures are swallowed. If the network is blocked, slow or
 *    unavailable, the reserved slot collapses instead of leaving a gap
 *    or throwing into unrelated page scripts.
 *
 * Slots are marked in markup as:
 *   <div data-wft-ad="native"> ... </div>
 *   <div data-wft-ad="rect">   ... </div>
 */
(function () {
  'use strict';

  if (window.__wftAdsterraLoaded) return;
  window.__wftAdsterraLoaded = true;

  var NATIVE_SRC = 'https://pl31551121.profitableratecpmnetwork.com/c31a1718b62d775ad47181a89eb1cb93/invoke.js';
  var NATIVE_ID = 'container-c31a1718b62d775ad47181a89eb1cb93';
  var RECT_KEY = '1c8085c28be2ef042fe8ac2b7e0c51b0';
  var RECT_SRC = 'https://www.highrevenueformat.com/' + RECT_KEY + '/invoke.js';

  var injected = {};

  function inject(src, attrs, onDone) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) s.setAttribute(k, attrs[k]);
      }
    }
    s.onerror = onDone || null;
    (document.body || document.head).appendChild(s);
    return s;
  }

  function collapse(slot) {
    if (slot && slot.parentNode) slot.parentNode.style.minHeight = '0';
    if (slot) slot.style.display = 'none';
  }

  function loadNative() {
    if (injected.native) return;
    var host = document.getElementById(NATIVE_ID);
    if (!host) return;
    injected.native = true;
    inject(NATIVE_SRC, { 'data-cfasync': 'false' }, function () {
      // Network unreachable and nothing rendered. Drop the slot rather
      // than leave a 180px hole in the page.
      var slot = host.closest ? host.closest('[data-wft-ad]') : null;
      if (slot && !host.childNodes.length) collapse(slot);
    });
  }

  function loadRect() {
    if (injected.rect) return;
    var slot = document.querySelector('[data-wft-ad="rect"]');
    if (!slot) return;
    injected.rect = true;

    // Must be set before invoke.js executes.
    window.atOptions = {
      key: RECT_KEY,
      format: 'iframe',
      height: 250,
      width: 300,
      params: {}
    };

    inject(RECT_SRC, null, function () { collapse(slot); });
  }

  var LOADERS = { native: loadNative, rect: loadRect };

  function whenNearViewport(slot, cb) {
    if (!('IntersectionObserver' in window)) {
      cb();
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          cb();
          return;
        }
      }
    }, { rootMargin: '400px 0px' });
    io.observe(slot);
  }

  function init() {
    var slots = document.querySelectorAll('[data-wft-ad]');
    for (var i = 0; i < slots.length; i++) {
      (function (slot) {
        var fn = LOADERS[slot.getAttribute('data-wft-ad')];
        if (fn) whenNearViewport(slot, fn);
      })(slots[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
