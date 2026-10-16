// WinFulltime advertisement runtime.
//
// Every ad position on the site is rendered as a placeholder <div> carrying a
// data-ad-position attribute (injected by src/templates/layout.js or placed by
// page/grid generators). This script:
//   1. draws a labelled "Advertise here" placeholder for each empty slot, so no
//      position is ever blank;
//   2. fetches the active creatives from /api/ads and swaps in the best creative
//      for each position (rotating by weight, stable per URL);
//   3. records impressions (batched, fire-and-forget) and routes clicks through
//      the tracking redirect /api/ads/click/:id;
//   4. upgrades slots injected later by client-side grid rendering.
(function () {
  'use strict';

  if (window.__WF_ADS) return;
  window.__WF_ADS = true;

  var API = window.WFT_API || '';
  var ADVERTISE_URL = '/advertise.html';

  var POSITIONS = {
    global_leaderboard: { label: 'Global Leaderboard', w: 728, h: 90 },
    end_of_content: { label: 'End of Content Leaderboard', w: 728, h: 90 },
    global_rectangle: { label: 'Global Rectangle', w: 300, h: 250 },
    global_skyscraper: { label: 'Global Skyscraper', w: 160, h: 600 },
    mobile_banner: { label: 'Mobile Banner', w: 320, h: 100 },
    in_content: { label: 'In-Content', w: 728, h: 90 },
    homepage_featured: { label: 'Homepage Featured', w: 728, h: 90 },
    carousel_slot: { label: 'Homepage Carousel Slot', w: null, h: null },
    sticky_banner: { label: 'Sticky Banner', w: null, h: null },
    sponsored_match_card: { label: 'Sponsored Match Card', w: 800, h: 800 }
  };

  var STYLE_ID = 'wf-ads-style';
  var cached = null;
  var requested = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch];
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.wft-ad-slot{display:block;width:100%;max-width:960px;margin:16px auto;padding:0 16px;box-sizing:border-box;}',
      '.wft-ad-slot[data-ad-position="sponsored_match_card"]{max-width:100%;padding:0;grid-column:1/-1;}',
      '.wft-sponsor{grid-column:1/-1;}',
      '.wft-ad-ph{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;text-align:center;',
      ' min-height:var(--wft-ad-min,120px);border:1px dashed rgba(255,255,255,0.22);border-radius:12px;',
      ' background:rgba(126,162,255,0.04);padding:14px;}',
      '.wft-ad-ph-label{font-size:12px;font-weight:700;letter-spacing:0.4px;color:#94a3b8;text-transform:uppercase;}',
      '.wft-ad-ph-cta{font-size:12px;font-weight:700;color:#ff6b8a;text-decoration:none;border:1px solid rgba(255,36,72,0.4);',
      ' border-radius:20px;padding:4px 12px;white-space:nowrap;}',
      '.wft-ad-ph-cta:hover{background:rgba(255,36,72,0.12);}',
      '.wft-ad-fill{display:block;text-decoration:none;color:inherit;}',
      '.wft-ad-img{display:block;width:100%;height:auto;border-radius:12px;}',
      '.wft-ad-text{display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:12px;',
      ' background:linear-gradient(135deg,rgba(37,46,64,0.9),rgba(21,26,44,0.9));border:1px solid rgba(255,255,255,0.10);}',
      '.wft-ad-brand{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7ea2ff;}',
      '.wft-ad-headline{font-size:16px;font-weight:800;color:#fff;}',
      '.wft-ad-body{font-size:13px;color:#cbd5e1;line-height:1.5;}',
      '.wft-ad-cta{align-self:flex-start;margin-top:6px;font-size:12px;font-weight:700;color:#fff;',
      ' background:linear-gradient(135deg,#ff2448,#d41a38);padding:8px 16px;border-radius:8px;}',
      '.wft-ad-slot--sticky{position:fixed;left:0;right:0;bottom:0;z-index:900;max-width:100%;margin:0;padding:0;',
      ' background:rgba(11,15,28,0.96);border-top:1px solid rgba(255,255,255,0.08);}',
      '.wft-ad-slot--sticky .wft-ad-ph{min-height:50px;border:0;border-radius:0;background:transparent;}',
      '.wft-ad-slot--sticky .wft-ad-img{border-radius:0;max-height:110px;object-fit:cover;}',
      '.wft-ad-close{position:absolute;top:2px;right:6px;background:none;border:0;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;z-index:2;}',
      '.wft-ad-slot[data-ad-position="mobile_banner"]{display:none;position:fixed;left:0;right:0;bottom:0;z-index:900;max-width:100%;margin:0;padding:0;',
      ' background:rgba(11,15,28,0.96);border-top:1px solid rgba(255,255,255,0.08);}',
      '.wft-ad-slot[data-ad-position="mobile_banner"] .wft-ad-ph{min-height:50px;border:0;border-radius:0;background:transparent;}',
      '.wft-ad-slot[data-ad-position="mobile_banner"] .wft-ad-img{border-radius:0;max-height:100px;object-fit:contain;background:#0b0f1c;}',
      '@media (max-width:768px){.wft-ad-ph{min-height:90px;}.wft-ad-slot{padding:0 8px;}',
      ' .wft-ad-slot[data-ad-position="mobile_banner"]{display:block;}',
      ' .wft-ad-slot[data-ad-position="sticky_banner"]{display:none;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function placeholderHTML(key) {
    var p = POSITIONS[key] || {};
    var dim = (p.w && p.h) ? ' &middot; ' + p.w + '&times;' + p.h : '';
    var min = p.h ? Math.min(p.h, 260) : 120;
    if (key === 'sticky_banner' || key === 'mobile_banner') min = 50;
    if (key === 'sponsored_match_card') min = 260;
    return '<div class="wft-ad-ph" style="--wft-ad-min:' + min + 'px">' +
      '<span class="wft-ad-ph-label">Ad space &middot; ' + escapeHtml(p.label || key) + dim + '</span>' +
      '<a class="wft-ad-ph-cta" href="' + ADVERTISE_URL + '">Advertise here</a>' +
      '</div>';
  }

  function pickCreative(key, list) {
    var weighted = [];
    for (var i = 0; i < list.length; i++) {
      var w = Math.max(1, Math.min(100, parseInt(list[i].weight, 10) || 1));
      for (var j = 0; j < w; j++) weighted.push(list[i]);
    }
    if (!weighted.length) return null;
    var seed = String(key) + '|' + window.location.pathname;
    var h = 0;
    for (var k = 0; k < seed.length; k++) h = ((h * 31) + seed.charCodeAt(k)) >>> 0;
    return weighted[h % weighted.length];
  }

  function creativeHTML(ad) {
    var target = ad.linkUrl || ADVERTISE_URL;
    var href = ad.id ? (API + '/ads/click/' + encodeURIComponent(ad.id)) : target;
    var title = escapeHtml(ad.advertiser || 'Advertisement');
    var inner;
    if (ad.imageUrl) {
      inner = '<img class="wft-ad-img" src="' + escapeHtml(ad.imageUrl) + '" alt="' + title +
        '" loading="lazy" decoding="async">';
    } else {
      inner = '<span class="wft-ad-text">' +
        '<span class="wft-ad-brand">' + escapeHtml(ad.advertiser || 'Sponsored') + '</span>' +
        (ad.headline ? '<span class="wft-ad-headline">' + escapeHtml(ad.headline) + '</span>' : '') +
        (ad.body ? '<span class="wft-ad-body">' + escapeHtml(ad.body) + '</span>' : '') +
        '<span class="wft-ad-cta">' + escapeHtml(ad.ctaText || 'Learn more') + '</span>' +
        '</span>';
    }
    return '<a class="wft-ad-fill" href="' + escapeHtml(href) + '" target="_blank" rel="noopener nofollow sponsored" ' +
      'title="' + title + '">' + inner + '</a>';
  }

  function trackImpressions(ids) {
    if (!ids.length) return;
    var payload = JSON.stringify({ ids: ids });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API + '/ads/impression', new Blob([payload], { type: 'application/json' }));
        return;
      }
    } catch (e) {}
    try {
      fetch(API + '/ads/impression', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
    } catch (e) {}
  }

  function addStickyClose(el) {
    var key = el.getAttribute('data-ad-position');
    if (key !== 'sticky_banner' && key !== 'mobile_banner') return;
    if (el.querySelector('.wft-ad-close')) return;
    var btn = document.createElement('button');
    btn.className = 'wft-ad-close';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close advertisement');
    btn.textContent = '\u00d7';
    btn.addEventListener('click', function () { el.style.display = 'none'; });
    el.appendChild(btn);
  }

  function processNode(el, impressions) {
    var key = el.getAttribute('data-ad-position');
    if (!key) return;
    el.classList.add('wft-ad-slot');
    if (key === 'sticky_banner') el.classList.add('wft-ad-slot--sticky');

    var list = cached && cached[key];
    if (list && list.length) {
      var ad = pickCreative(key, list);
      el.innerHTML = creativeHTML(ad);
      if (impressions && ad && ad.id) impressions.push(ad.id);
      addStickyClose(el);
      return;
    }

    // No creative: draw the placeholder only when the slot is empty so any
    // baked fallback (e.g. the 1win banner) stays visible.
    if (!el.innerHTML.trim()) el.innerHTML = placeholderHTML(key);
    addStickyClose(el);
  }

  function processAll(root) {
    var scope = root || document;
    // Adopt legacy in-feed sponsor banners baked before this system existed.
    var legacy = scope.querySelectorAll ? scope.querySelectorAll('.wft-sponsor:not([data-ad-position])') : [];
    for (var s = 0; s < legacy.length; s++) legacy[s].setAttribute('data-ad-position', 'sponsored_match_card');

    var els = scope.querySelectorAll ? scope.querySelectorAll('[data-ad-position]') : [];
    var impressions = [];
    for (var i = 0; i < els.length; i++) processNode(els[i], impressions);
    trackImpressions(impressions);
  }

  function loadAds() {
    if (requested) return;
    requested = true;
    if (!window.fetch) return;
    fetch(API + '/ads', { headers: { 'Accept': 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        cached = (data && data.positions) || {};
        requested = false;
        processAll(document);
      })
      .catch(function () { requested = false; /* keep placeholders/fallbacks */ });
  }

  function handleMutations(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (!node || node.nodeType !== 1) continue;
        if (node.hasAttribute && node.hasAttribute('data-ad-position')) processNode(node, []);
        else if (node.querySelector) processAll(node);
      }
    }
  }

  function init() {
    injectStyles();
    processAll(document);
    loadAds();
    if (window.MutationObserver) {
      new MutationObserver(handleMutations).observe(document.body, { childList: true, subtree: true });
    }
  }

  window.WFTAds = {
    positions: POSITIONS,
    refresh: function () { processAll(document); },
    // HTML for a slot that is injected into a grid string before the DOM exists.
    slotHtml: function (key) {
      return '<div class="wft-ad-slot wft-sponsor" data-ad-position="' + escapeHtml(key) + '"></div>';
    },
    // Insert a slot between the first and second match cards of a grid string.
    insertInFeed: function (gridHtml, key) {
      key = key || 'sponsored_match_card';
      var marker = '<div class="match-card fade-in"';
      var first = gridHtml.indexOf(marker);
      if (first < 0) return gridHtml;
      var second = gridHtml.indexOf(marker, first + marker.length);
      if (second < 0) return gridHtml;
      var at = second;
      while (at > 0 && (gridHtml[at - 1] === '\n' || gridHtml[at - 1] === ' ')) at--;
      return gridHtml.slice(0, at) + '\n\n' + window.WFTAds.slotHtml(key) + '\n\n  ' + gridHtml.slice(second);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
