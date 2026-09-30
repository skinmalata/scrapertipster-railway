/* Inline banner slots between prediction cards.
 *
 * The market pages build their cards client-side from /data/predictions.json,
 * so slots cannot be baked into the static HTML the way the footer slot in
 * src/templates/layout.js is. This creates them once the grid exists, and
 * re-syncs whenever the grid is rebuilt (date switch).
 *
 * Deliberate constraints:
 *  - Nothing is created before consent is granted, so an EU/UK visitor who has
 *    not decided never receives ad markup at all.
 *  - At most 2 slots, and never above the 4th card, so the strongest picks keep
 *    the top of the list uninterrupted.
 *  - A slot the network does not fill collapses. Monetag serves one banner per
 *    zone request, so an empty container is a legitimate outcome and must not be
 *    left behind as a hole in the list.
 */
(function () {
  'use strict';

  if (window.__wftPredAds) return;
  window.__wftPredAds = true;

  var MIN_CARDS = 9;    // shorter lists are not worth interrupting
  var AFTER = [4, 10];  // 1-based card index each slot follows
  var GRACE_MS = 8000;  // how long an empty slot is kept before collapsing

  function onPredictionPage() {
    return /^\/predictions\/[^/]+\/?$/.test(window.location.pathname);
  }

  function consent() {
    return (window.WFT && window.WFT.consent) || null;
  }

  function isFilled(slot) {
    return !!slot.querySelector('iframe, img, video, ins');
  }

  function collapse(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function buildSlot() {
    var aside = document.createElement('aside');
    aside.className = 'wft-ads wft-ads-inline';
    aside.setAttribute('aria-label', 'Advertisements');
    aside.setAttribute('data-wft-pred-ad', '1');
    var unit = document.createElement('div');
    unit.className = 'wft-ad wft-ad-ipp';
    unit.setAttribute('data-wft-ad', 'ipp');
    aside.appendChild(unit);
    return aside;
  }

  function askForFill(unit) {
    if (window.WFT && typeof window.WFT.requestInlineIpp === 'function') {
      window.WFT.requestInlineIpp(unit);
      return;
    }
    // /monetag.js is not on the page (ads disabled): drop the slot rather than
    // leaving a reserved hole.
    collapse(unit.parentNode);
  }

  function watch(slot, unit) {
    askForFill(unit);
    window.setTimeout(function () {
      if (!isFilled(slot)) collapse(slot);
    }, GRACE_MS);
  }

  function gridState() {
    var grid = document.querySelector('#content .matches-grid');
    if (!grid) return null;
    return {
      grid: grid,
      cards: Array.prototype.slice.call(grid.querySelectorAll('.match-card'))
    };
  }

  function slotsToAdd(totalCards) {
    var n = 0;
    for (var i = 0; i < AFTER.length && totalCards >= AFTER[i]; i++) n++;
    return n;
  }

  function sync() {
    var state = gridState();
    if (!state) return;

    var want = state.cards.length >= MIN_CARDS ? slotsToAdd(state.cards.length) : 0;
    var existing = state.grid.querySelectorAll('.wft-ads-inline');
    // The site replaces the grid wholesale on a date switch, which drops our
    // slots; a count mismatch also catches a rebuild that changed the card
    // total while keeping the same slot count.
    if (existing.length === want) return;

    Array.prototype.forEach.call(existing, function (el) {
      collapse(el);
    });
    if (want === 0) return;

    for (var i = 0; i < want; i++) {
      var slot = buildSlot();
      // state.cards is a snapshot, so the element references stay valid across
      // insertions.
      state.grid.insertBefore(slot, state.cards[AFTER[i] - 1].nextSibling);
      watch(slot, slot.querySelector('[data-wft-ad="ipp"]'));
    }
  }

  function onlyOurSlots(nodes) {
    var list = Array.prototype.slice.call(nodes || []);
    if (!list.length) return false;
    return list.every(function (n) {
      return n.nodeType === 1 && n.getAttribute && n.getAttribute('data-wft-pred-ad') === '1';
    });
  }

  function start() {
    var content = document.getElementById('content');
    if (!content) return;

    var timer = null;
    function schedule() {
      if (timer) return;
      timer = window.setTimeout(function () {
        timer = null;
        sync();
      }, 60);
    }

    if ('MutationObserver' in window) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          // Skip the churn our own inserts and removals cause, otherwise each
          // sync would schedule another one.
          if (!onlyOurSlots(records[i].addedNodes) || !onlyOurSlots(records[i].removedNodes)) {
            schedule();
            return;
          }
        }
      }).observe(content, { childList: true, subtree: true });
    }

    schedule();
  }

  function init() {
    if (!onPredictionPage()) return;
    var c = consent();
    if (!c) return;
    if (c.isGranted()) {
      start();
      return;
    }
    c.whenGranted(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
