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

  var API = (window.WFT_API || 'https://winfulltime-api.onrender.com') + '/api';
  var ADVERTISE_URL = '/advertise.html';

  var POSITIONS = {
    global_leaderboard: { label: 'Global Leaderboard', w: 728, h: 90 },
    end_of_content: { label: 'End of Content Leaderboard', w: 728, h: 90 },
    global_rectangle: { label: 'Global Rectangle', w: 300, h: 250 },
    global_skyscraper: { label: 'Global Skyscraper', w: 160, h: 600 },
    sticky_banner: { label: 'Sticky Banner' },
    in_content: { label: 'In-Content', w: 728, h: 90 },
    homepage_featured: { label: 'Homepage Featured', w: 728, h: 90 },
    carousel_slot: { label: 'Homepage Carousel Slot', w: null, h: null },
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
      '.wft-ad-slot[data-wft-prebid="bitmedia"]{grid-column:1/-1;display:flex;align-items:center;justify-content:center;min-height:100px;overflow:hidden;}',
      '@media (min-width:640px){.matches-grid > .wft-ad-slot[data-wft-prebid="bitmedia"]{grid-column:auto;}}',
      '.wft-ad-slot[data-wft-prebid="bitmedia"] iframe{display:block;max-width:100%;border:0;}',
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
      '.wft-ad-slot[data-ad-ratio] .wft-ad-ph{aspect-ratio:var(--wft-ad-ratio);min-height:0;box-sizing:border-box;}',
      '.wft-ad-slot[data-ad-ratio] .wft-ad-fill{aspect-ratio:var(--wft-ad-ratio);}',
      '.wft-ad-slot[data-ad-ratio] .wft-ad-img{height:100%;object-fit:contain;}',
      '.wft-ad-text{display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:12px;',
      ' background:linear-gradient(135deg,rgba(37,46,64,0.9),rgba(21,26,44,0.9));border:1px solid rgba(255,255,255,0.10);}',
      '.wft-ad-brand{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#7ea2ff;}',
      '.wft-ad-headline{font-size:16px;font-weight:800;color:#fff;}',
      '.wft-ad-body{font-size:13px;color:#cbd5e1;line-height:1.5;}',
      '.wft-ad-cta{align-self:flex-start;margin-top:6px;font-size:12px;font-weight:700;color:#fff;',
      ' background:linear-gradient(135deg,#ff2448,#d41a38);padding:8px 16px;border-radius:8px;}',
      '.wft-ad-slot[data-ad-position="sticky_banner"]{display:none!important;position:fixed;left:0;right:0;bottom:0;z-index:99990;width:100%;max-width:none;margin:0;padding:6px 48px 6px 6px;min-height:50px;max-height:96px;box-sizing:border-box;overflow:hidden;align-items:center;justify-content:center;background:rgba(12,16,27,.96);border-top:1px solid rgba(255,255,255,.14);}',
      '.wft-ad-slot[data-ad-position="sticky_banner"].wft-sticky-visible{display:flex!important;}',
      '.wft-ad-slot[data-ad-position="sticky_banner"] .wft-sticky-close{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;padding:0;border:1px solid rgba(255,255,255,.55);border-radius:50%;background:#111827;color:#fff;font:22px/1 system-ui,sans-serif;cursor:pointer;z-index:2;}',
      '@media (max-width:768px){.wft-ad-ph{min-height:90px;}.wft-ad-slot{padding:0 8px;}.wft-ad-slot[data-ad-position="sticky_banner"]{max-height:12vh;padding:4px 44px 4px 4px;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function placeholderHTML(key) {
    var p = POSITIONS[key] || {};
    var dim = (p.w && p.h) ? ' &middot; ' + p.w + '&times;' + p.h : '';
    var min = p.h ? Math.min(p.h, 260) : 120;
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
      var dim = (ad.width && ad.height) ? ' width="' + ad.width + '" height="' + ad.height + '"' : '';
      inner = '<img class="wft-ad-img" src="' + escapeHtml(ad.imageUrl) + '" alt="' + title + '"' + dim +
        ' loading="lazy" decoding="async">';
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

  function loadBitmediaUnit(unit, unitId) {
    if (!unit || unit.getAttribute('data-wft-bitmedia-loaded') === 'true') return;
    unit.setAttribute('data-wft-bitmedia-loaded', 'true');
    var hosts = ['cdn.bmcdn6.com'];
    function loadHost(index) {
      if (index >= hosts.length) return;
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://' + hosts[index] + '/js/' + unitId + '.js?v=' + new Date().getTime();
      script.onerror = function() {
        script.remove();
        loadHost(index + 1);
      };
      var first = document.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(script, first);
      else document.head.appendChild(script);
    }
    loadHost(0);
  }

  function scheduleEndOfContentFallback(slot, unit) {
    if (!slot || !unit || slot.getAttribute('data-wft-endfill-watch') === 'true') return;
    slot.setAttribute('data-wft-endfill-watch', 'true');
    window.setTimeout(function () {
      if (!document.documentElement.contains(slot) || slot.getAttribute('data-wft-endfill-done') === 'true') return;
      var creatives = slot.querySelectorAll('iframe, img, video, object, embed');
      for (var i = 0; i < creatives.length; i++) {
        var rect = creatives[i].getBoundingClientRect();
        if (rect.width > 2 && rect.height > 2) return;
      }

      // If Bitmedia has not rendered a creative, let the site ad pool fill the
      // same reserved slot. That keeps the end-of-content placement visible.
      slot.setAttribute('data-wft-endfill-done', 'true');
      if (unit.parentNode) unit.parentNode.removeChild(unit);
      var impressions = [];
      processNode(slot, impressions);
      trackImpressions(impressions);
    }, 8000);
  }

  function activateStickyBitmediaCode(el) {
    var inert = el.querySelector('script[data-wft-bitmedia-sticky]');
    if (!inert || inert.getAttribute('data-wft-activated') === 'true') return;
    var active = document.createElement('script');
    active.type = 'text/javascript';
    active.setAttribute('data-wft-activated', 'true');
    active.textContent = inert.textContent;
    inert.parentNode.replaceChild(active, inert);
  }

  function prepareStickyBitmedia(el, unit) {
    if (!el || !unit || el.getAttribute('data-wft-sticky-ready') === 'true') return;
    el.setAttribute('data-wft-sticky-ready', 'true');
    var dismissed = false;
    try { dismissed = window.sessionStorage.getItem('wft-bitmedia-sticky-dismissed') === '1'; } catch (e) {}
    if (dismissed) return;

    var close = el.querySelector('.wft-sticky-close');
    if (close) close.addEventListener('click', function() {
      dismissed = true;
      el.hidden = true;
      el.classList.remove('wft-sticky-visible');
      try { window.sessionStorage.setItem('wft-bitmedia-sticky-dismissed', '1'); } catch (e) {}
    });

    function showAfterScroll() {
      if (dismissed || window.scrollY < 400) return;
      window.removeEventListener('scroll', showAfterScroll);
      el.hidden = false;
      el.classList.add('wft-sticky-visible');
      activateStickyBitmediaCode(el);
    }
    window.addEventListener('scroll', showAfterScroll, { passive: true });
    showAfterScroll();
  }

  function processNode(el, impressions) {
    var key = el.getAttribute('data-ad-position');
    if (!key) return;
    el.classList.add('wft-ad-slot');

    var pos = POSITIONS[key] || {};
    if (pos.w && pos.h) {
      el.setAttribute('data-ad-ratio', '');
      el.style.setProperty('--wft-ad-ratio', pos.w + '/' + pos.h);
    }

    // The Bitmedia Prebid runtime owns this slot and handles its no-bid
    // fallback. Do not also render a direct tag or house-ad creative here.
    if (el.getAttribute('data-wft-prebid') === 'bitmedia') return;

    var bitmediaId = key === 'global_leaderboard' ? '6ae882436485fffa717939a1' :
      (key === 'sponsored_match_card' ? '6ae8887bf30577b049694c23' :
      (key === 'sticky_banner' ? '6ae8959ff30577b0496d401f' : ''));
    if (bitmediaId) {
      var units = el.getElementsByTagName('ins');
      for (var unitIndex = 0; unitIndex < units.length; unitIndex++) {
        if (units[unitIndex].className === bitmediaId) {
          if (key === 'sticky_banner') prepareStickyBitmedia(el, units[unitIndex]);
          else {
            loadBitmediaUnit(units[unitIndex], bitmediaId);
            if (key === 'end_of_content') scheduleEndOfContentFallback(el, units[unitIndex]);
          }
          return;
        }
      }
    }

    var list = cached && cached[key];
    if (list && list.length) {
      var ad = pickCreative(key, list);
      el.innerHTML = creativeHTML(ad);
      if (impressions && ad && ad.id) impressions.push(ad.id);
      return;
    }

    // No creative: draw the placeholder only when the slot is empty so any
    // baked third-party unit stays visible.
    if (!el.innerHTML.trim()) el.innerHTML = placeholderHTML(key);
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
