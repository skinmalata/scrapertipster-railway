/* Bitmedia Prebid integration for in-feed prediction slots and analysis pages. */
(function (window, document) {
  'use strict';

  var AD_UNIT_CODE = 'classname-container-placement';
  var BITMEDIA_AD_UNIT_ID = '6ae9a1a5f30577b049914348';
  var DIRECT_FALLBACK_ID = '6ae882436485fffa717939a1';
  var PREBID_SRC = '/prebid-11.46.0.js?v=20261103';
  var BID_TIMEOUT = 1200;
  // Fixed sizes keep the slot height stable before and after the bid lands, so
  // the prediction grid does not shift (CLS). Grid slots use a 300x250
  // rectangle; full-width slots use a 728x90 leaderboard on desktop and the
  // same 300x250 rectangle on phones.
  var GRID_SIZE = { width: 300, height: 250 };
  var FULL_PHONE_SIZE = { width: 300, height: 250 };
  var FULL_DESKTOP_SIZE = { width: 728, height: 90 };

  var pbjsLoading = false;
  var prebidWaiters = [];
  var requestSeq = 0;

  function isPhoneViewport() {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 639px)').matches
      : window.innerWidth <= 639;
  }

  function insideMatchesGrid(el) {
    while (el) {
      if (el.classList && el.classList.contains('matches-grid')) return true;
      el = el.parentNode;
    }
    return false;
  }

  function fixedSizeFor(slot) {
    var explicit = slot && slot.getAttribute('data-wft-prebid-size');
    if (explicit) {
      var parts = explicit.split('x');
      var width = parseInt(parts[0], 10);
      var height = parseInt(parts[1], 10);
      if (width > 0 && height > 0) return { width: width, height: height };
    }
    if (insideMatchesGrid(slot)) return GRID_SIZE;
    return isPhoneViewport() ? FULL_PHONE_SIZE : FULL_DESKTOP_SIZE;
  }

  function reserveSlot(slot) {
    var size = fixedSizeFor(slot);
    slot.setAttribute('data-wft-prebid-size', size.width + 'x' + size.height);
    slot.style.height = size.height + 'px';
    slot.style.minHeight = size.height + 'px';
    slot.style.maxHeight = size.height + 'px';
    slot.style.overflow = 'hidden';
    return size;
  }

  function bannerSizesFor(slot) {
    var size = fixedSizeFor(slot);
    return [[size.width, size.height]];
  }

  function fallbackToDirectTag(slot) {
    if (!slot || slot.getAttribute('data-wft-hb-fallback') === 'true') return;
    slot.setAttribute('data-wft-hb-fallback', 'true');
    slot.innerHTML = '';

    var unit = document.createElement('ins');
    unit.className = DIRECT_FALLBACK_ID;
    unit.style.display = 'inline-block';
    unit.style.width = '1px';
    unit.style.height = '1px';
    slot.appendChild(unit);

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://cdn.bmcdn6.com/js/' + DIRECT_FALLBACK_ID + '.js?v=' + Date.now();
    (document.head || document.documentElement).appendChild(script);
  }

  function renderWinner(pbjs, slot, bid) {
    if (!bid || !bid.adId) {
      fallbackToDirectTag(slot);
      return;
    }

    var fixed = reserveSlot(slot);
    var width = fixed.width;
    var height = fixed.height;
    var iframe = document.createElement('iframe');
    iframe.title = 'Advertisement';
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.style.display = 'block';
    iframe.style.width = width + 'px';
    iframe.style.height = height + 'px';
    iframe.style.maxWidth = '100%';
    iframe.style.border = '0';
    iframe.style.margin = '0 auto';

    slot.innerHTML = '';
    slot.appendChild(iframe);
    try {
      pbjs.renderAd(iframe.contentDocument || iframe.contentWindow.document, bid.adId);
      slot.setAttribute('data-wft-hb-filled', 'true');
    } catch (error) {
      fallbackToDirectTag(slot);
    }
  }

  function ensurePrebid(onReady, onError) {
    if (window.pbjs && typeof window.pbjs.requestBids === 'function') {
      onReady(window.pbjs);
      return;
    }
    if (pbjsLoading) {
      prebidWaiters.push({ ready: onReady, error: onError });
      return;
    }

    pbjsLoading = true;
    var pbjs = window.pbjs = window.pbjs || {};
    pbjs.que = pbjs.que || [];

    var loader = document.createElement('script');
    loader.async = true;
    loader.src = PREBID_SRC;
    loader.onerror = function () {
      pbjsLoading = false;
      var waiters = prebidWaiters;
      prebidWaiters = [];
      waiters.forEach(function (waiter) { if (waiter.error) waiter.error(); });
      if (onError) onError();
    };
    loader.onload = function () {
      pbjsLoading = false;
      var lib = window.pbjs = window.pbjs || {};
      lib.que = lib.que || [];
      var waiters = prebidWaiters;
      prebidWaiters = [];
      waiters.forEach(function (waiter) { waiter.ready(lib); });
      onReady(lib);
    };
    (document.head || document.documentElement).appendChild(loader);
  }

  function requestBitmediaBid(slot) {
    if (!slot || slot.getAttribute('data-wft-hb-requested') === 'true') return;
    slot.setAttribute('data-wft-hb-requested', 'true');

    ensurePrebid(function (pbjs) {
      // First request keeps the canonical ad unit code; re-renders (e.g. date
      // switches) get a suffix so they never collide with a previous ad unit.
      requestSeq += 1;
      var code = requestSeq === 1 ? AD_UNIT_CODE : AD_UNIT_CODE + '-' + requestSeq;
      pbjs.que.push(function () {
        try {
          pbjs.setConfig({
            bidderTimeout: BID_TIMEOUT,
            priceGranularity: 'high'
          });
          pbjs.bidderSettings = pbjs.bidderSettings || {};
          pbjs.bidderSettings.bitmedia = Object.assign({}, pbjs.bidderSettings.bitmedia || {}, {
            storageAllowed: true
          });
          pbjs.addAdUnits([{
            code: code,
            mediaTypes: { banner: { sizes: bannerSizesFor(slot) } },
            bids: [{
              bidder: 'bitmedia',
              params: { adUnitID: BITMEDIA_AD_UNIT_ID, currency: 'USD' }
            }]
          }]);
          pbjs.requestBids({
            adUnitCodes: [code],
            timeout: BID_TIMEOUT,
            bidsBackHandler: function () {
              var winners = pbjs.getHighestCpmBids([code]) || [];
              renderWinner(pbjs, slot, winners[0]);
              try {
                if (typeof pbjs.removeAdUnit === 'function') pbjs.removeAdUnit(code);
              } catch (error) {}
            }
          });
        } catch (error) {
          fallbackToDirectTag(slot);
        }
      });
    }, function () {
      fallbackToDirectTag(slot);
    });
  }

  function bindSlot(slot) {
    if (!slot || slot.getAttribute('data-wft-hb-bound') === 'true') return;
    var consent = window.WFT && window.WFT.consent;
    if (!consent || typeof consent.whenGranted !== 'function') return;

    slot.setAttribute('data-wft-hb-bound', 'true');
    if (typeof consent.get === 'function' && consent.get() === false) {
      slot.hidden = true;
      return;
    }
    consent.whenGranted(function () { requestBitmediaBid(slot); });
  }

  function scan() {
    var slots = document.querySelectorAll('[data-wft-prebid="bitmedia"]');
    for (var i = 0; i < slots.length; i++) {
      reserveSlot(slots[i]);
      bindSlot(slots[i]);
    }
  }

  function start() {
    scan();
    if (window.MutationObserver) {
      new MutationObserver(scan).observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
    }
    // Consent can arrive after the first scan, and grids are re-rendered on
    // date switches, so keep a light poll to catch both.
    window.setInterval(scan, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(window, document);
