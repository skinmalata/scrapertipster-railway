/* Bitmedia Prebid integration for the header leaderboard. */
(function (window, document) {
  'use strict';

  var AD_UNIT_CODE = 'classname-container-placement';
  var BITMEDIA_AD_UNIT_ID = '6ae9a1a5f30577b049914348';
  var PREBID_SRC = '/prebid-11.46.0.js?v=20261103';
  var BID_TIMEOUT = 1200;
  var BANNER_SIZES = [[728, 90], [468, 60], [468, 90], [300, 100]];
  var started = false;

  function fallbackToHouseAd(slot) {
    if (!slot || slot.getAttribute('data-wft-hb-no-bid') === 'true') return;
    slot.setAttribute('data-wft-hb-no-bid', 'true');
    slot.innerHTML = '';
    if (window.WFTAds && typeof window.WFTAds.refresh === 'function') window.WFTAds.refresh();
  }

  function renderWinner(pbjs, slot, bid) {
    if (!bid || !bid.adId) {
      fallbackToHouseAd(slot);
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
      fallbackToHouseAd(slot);
    }
  }

  function requestBitmediaBid(slot) {
    var pbjs = window.pbjs = window.pbjs || {};
    pbjs.que = pbjs.que || [];

    var loader = document.createElement('script');
    loader.async = true;
    loader.src = PREBID_SRC;
    loader.onerror = function () { fallbackToHouseAd(slot); };
    loader.onload = function () {
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
            code: AD_UNIT_CODE,
            mediaTypes: { banner: { sizes: BANNER_SIZES } },
            bids: [{
              bidder: 'bitmedia',
              params: { adUnitID: BITMEDIA_AD_UNIT_ID, currency: 'USD' }
            }]
          }]);
          pbjs.requestBids({
            adUnitCodes: [AD_UNIT_CODE],
            timeout: BID_TIMEOUT,
            bidsBackHandler: function () {
              var winners = pbjs.getHighestCpmBids([AD_UNIT_CODE]) || [];
              renderWinner(pbjs, slot, winners[0]);
            }
          });
        } catch (error) {
          fallbackToHouseAd(slot);
        }
      });
    };
    (document.head || document.documentElement).appendChild(loader);
  }

  function waitForConsent() {
    var slot = document.getElementById(AD_UNIT_CODE);
    if (!slot || started) return;

    var consent = window.WFT && window.WFT.consent;
    if (!consent || typeof consent.whenGranted !== 'function') {
      window.setTimeout(waitForConsent, 100);
      return;
    }

    started = true;
    if (typeof consent.get === 'function' && consent.get() === false) {
      slot.hidden = true;
      return;
    }
    consent.whenGranted(function () { requestBitmediaBid(slot); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForConsent, { once: true });
  } else {
    waitForConsent();
  }
})(window, document);
