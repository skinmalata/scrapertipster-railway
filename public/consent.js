/* Site-wide consent gate.
 *
 * Why this exists: the cookie banner used to live only inside
 * public/privacy.html, so every ad loader on every other page was requesting
 * personalised ad networks with no recorded consent. Ad loaders now wait on
 * this gate before touching the network.
 *
 * API (window.WFT.consent):
 *   get()               -> true | false | null   (null = not yet decided)
 *   isGranted()         -> boolean
 *   whenGranted(fn)     -> runs fn once consent is granted, now or later
 *   decide(true|false)  -> records the choice and notifies listeners
 *   reset()             -> clears the decision so the banner shows again
 *
 * Storage is best-effort: private-mode Safari throws on localStorage, and the
 * banner still functions for the current page view when that happens.
 */
(function () {
  'use strict';

  if (window.WFT && window.WFT.consent) return;
  if (!window.WFT) window.WFT = {};

  var KEY = 'wft-consent-v1';
  var BANNER_ID = 'wft-consent-banner';

  var state = null;
  var listeners = [];
  var bannerInjected = false;

  // Legacy gate: public/privacy.html already stored this cookie to gate Google
  // Analytics. Honouring it means existing visitors are never asked twice, and
  // the older privacy-page logic keeps working unchanged.
  function readLegacyCookie() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)cookie_consent=(accepted|rejected)/);
      if (!m) return null;
      return m[1] === 'accepted';
    } catch (e) { return null; }
  }

  function writeLegacyCookie(granted) {
    try {
      document.cookie = 'cookie_consent=' + (granted ? 'accepted' : 'rejected')
        + '; path=/; max-age=31536000';
    } catch (e) {}
  }

  function readStored() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw === 'granted') return true;
      if (raw === 'denied') return false;
    } catch (e) {}
    return readLegacyCookie();
  }

  function persist(value) {
    try {
      window.localStorage.setItem(KEY, value ? 'granted' : 'denied');
    } catch (e) {}
    writeLegacyCookie(value);
  }

  function notify() {
    var granted = state === true;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](granted); } catch (e) {}
    }
  }

  function hideBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.hidden = true;
  }

  function decide(value) {
    if (state !== null) return;
    state = value === true;
    persist(state);
    hideBanner();
    notify();
  }

  function buildBanner() {
    if (bannerInjected || document.getElementById(BANNER_ID)) return;
    bannerInjected = true;

    var el = document.createElement('div');
    el.id = BANNER_ID;
    el.className = 'wft-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Cookie and advertising consent');

    var text = document.createElement('p');
    text.innerHTML = 'We use cookies and advertising partners to analyse traffic and improve our predictions. '
      + 'Accepting allows personalised ads from Adsterra and Monetag. '
      + 'See our <a href="/privacy.html">Privacy Policy</a>.';

    var actions = document.createElement('div');
    actions.className = 'wft-consent-actions';

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'wft-consent-btn wft-consent-accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', function () { decide(true); });

    var reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'wft-consent-btn wft-consent-reject';
    reject.textContent = 'Reject';
    reject.addEventListener('click', function () { decide(false); });

    actions.appendChild(accept);
    actions.appendChild(reject);
    el.appendChild(text);
    el.appendChild(actions);
    document.body.appendChild(el);
  }

  // Injected after the DOM is ready and off the critical path, so the banner
  // never delays first paint.
  function init() {
    state = readStored();
    if (state === null) {
      // A small delay keeps the banner out of the LCP window entirely.
      window.setTimeout(buildBanner, 600);
    }
    exposeResetTriggers();
  }

  function exposeResetTriggers() {
    var nodes = document.querySelectorAll('[data-wft-consent-reset]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].addEventListener('click', function (e) {
        e.preventDefault();
        window.WFT.consent.reset();
      });
    }
  }

  window.WFT.consent = {
    get: function () { return state; },
    isGranted: function () { return state === true; },
    whenGranted: function (fn) {
      if (typeof fn !== 'function') return;
      if (state === true) { try { fn(true); } catch (e) {} return; }
      if (state === false) return;
      listeners.push(fn);
    },
    decide: decide,
    reset: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) {}
      state = null;
      buildBanner();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
