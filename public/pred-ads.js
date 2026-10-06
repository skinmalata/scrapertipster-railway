/* Inline banner slots between prediction cards.
 *
 * The market pages build their cards client-side from /data/predictions.json,
 * so slots cannot be baked into the static HTML the way the footer slot in
 * src/templates/layout.js is. This creates them once the grid exists, and
 * re-syncs whenever the grid is rebuilt (date switch).
 *
 * Placement: the units sit inside the pick list, directly under the second card,
 * where a reader is already looking. The page-level <aside class="wft-ads"> that
 * src/templates/layout.js bakes used to be the only position, but on these pages
 * it lands ~4,400px down -- below the fold for almost every visit, so it was
 * never seen. Once the inline slots are in place the baked block is removed from
 * the page, which also stops the same zones being requested twice per view.
 *
 * Deliberate constraints:
 *  - Nothing is created before consent is granted, so an EU/UK visitor who has
 *    not decided never receives ad markup at all.
 *  - Only on pages that actually have a card grid, so the utility/legal screens
 *    that share this template never get an ad injected.
 *  - A slot the network does not fill collapses. Mondiad returns no creative on
 *    a zone with no demand, so an empty container is a legitimate outcome and
 *    must not be left behind as a hole in the list.
 */
(function () {
  'use strict';

  if (window.__wftPredAds) return;
  window.__wftPredAds = true;

  var MIN_CARDS = 3;    // shorter lists cannot host a slot after the 2nd card
  var AFTER = [2, 6];   // 1-based card index each slot follows
  var GRACE_MS = 8000;  // how long an empty slot is kept before collapsing
  var FORMAT = 'native'; // in-content format; the page-level slot is removed

  function consent() {
    return (window.WFT && window.WFT.consent) || null;
  }

  // Mondiad inserts a *blank* iframe (no src) when a zone returns no creative,
  // so a bare iframe match is not evidence of a fill -- only a loaded one is.
  function isFilled(slot) {
    return !!slot.querySelector('iframe[src], img[src], video[src], ins');
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
    unit.className = 'wft-ad wft-ad-native';
    unit.setAttribute('data-wft-ad', 'mondiad-native');
    unit.setAttribute('data-mndazid', '147781a6-7f81-43a0-8c85-f9cf3a461f5a');
    aside.appendChild(unit);
    return aside;
  }

  // The zone div must be in the DOM before the network script scans for it.
  // /mondiad.js re-runs the delivery code once after all inline zones exist.
  // Retry briefly rather than dropping a slot if this file runs too early.
  function askForFill(slot, attemptsLeft) {
    if (window.WFT && typeof window.WFT.loadMondiadFormat === 'function') {
      if (window.WFT.loadMondiadFormat(FORMAT, slot, true)) return;
    }
    if (attemptsLeft > 0) {
      window.setTimeout(function () { askForFill(slot, attemptsLeft - 1); }, 200);
    } else {
      collapse(slot);
    }
  }

  function watch(slot) {
    var c = consent();
    if (!c) { collapse(slot); return; }

    function requestAndWatch() {
      askForFill(slot, 8);
      window.setTimeout(function () {
        if (!isFilled(slot)) collapse(slot);
      }, GRACE_MS);
    }

    if (c.isGranted()) {
      requestAndWatch();
    } else {
      c.whenGranted(function (granted) {
        if (granted) requestAndWatch();
        else collapse(slot);
      });
    }
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

  // The page-level block is now redundant on any page that hosts inline slots.
  // Removed only once placement succeeded, so a page that unexpectedly has no
  // grid keeps its original unit.
  function dropPageLevelBlock() {
    var blocks = document.querySelectorAll('aside.wft-ads:not(.wft-ads-inline)');
    Array.prototype.forEach.call(blocks, collapse);
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

    var slots = [];
    for (var i = 0; i < want; i++) {
      var slot = buildSlot();
      // state.cards is a snapshot, so the element references stay valid across
      // insertions.
      state.grid.insertBefore(slot, state.cards[AFTER[i] - 1].nextSibling);
      slots.push(slot);
    }
    dropPageLevelBlock();
    // All zones must exist before the shared delivery script scans the page.
    Array.prototype.forEach.call(slots, watch);
  }

  function onlyOurSlots(nodes) {
    const list = Array.prototype.slice.call(nodes || []);
    // An empty list trivially contains nothing but our own slots. Returning
    // false here made every pure-removal record look like foreign churn, so
    // collapsing an unfilled slot immediately re-armed sync() to rebuild it:
    // remove at 8s, re-add, remove at 8s, ad request each cycle.
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
    // Deliberately not a path allow-list. The homepage and /predictions/* were
    // the only callers when this was Monetag-only, but the card grid is also
    // what league, matrix and date-archive pages render. Gating on the grid
    // itself (gridState) keeps the utility/legal screens -- which share this
    // template but have no picks -- ad-free without hardcoding every URL.
    var c = consent();
    if (!c) return;
    if (c.isGranted()) {
      start();
      return;
    }
    c.whenGranted(function (granted) { if (granted) start(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
