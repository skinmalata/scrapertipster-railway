/* Bitmedia Prebid integration for in-feed prediction slots and analysis pages. */
(function (window, document) {
  'use strict';

  var AD_UNIT_CODE = 'classname-container-placement';
  var BITMEDIA_AD_UNIT_ID = '6ae9a1a5f30577b049914348';
  var DIRECT_FALLBACK_ID = '6ae882436485fffa717939a1';
  var PREBID_SRC = '/prebid-11.46.0.js?v=20261103';
  var BID_TIMEOUT = 1200;
  var BANNER_SIZES = [[250, 250], [336, 280], [300, 250], [300, 100], [728, 90], [468, 60], [200, 200], [468, 90], [320, 1200]];

  var pbjsLoading = false;
  var prebidWaiters = [];
  var requestSeq = 0;

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

    var size = String(bid.size || '').split('x');
    var width = Number(size[0]) || Number(bid.width) || 728;
    var height = Number(size[1]) || Number(bid.height) || 90;
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
    slot.style.minHeight = height + 'px';
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
            mediaTypes: { banner: { sizes: BANNER_SIZES } },
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
    for (var i = 0; i < slots.length; i++) bindSlot(slots[i]);
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
