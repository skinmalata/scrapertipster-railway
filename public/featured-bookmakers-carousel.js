(function () {
  'use strict';
  if (window.__WF_FEATURED_BOOKS) return;
  window.__WF_FEATURED_BOOKS = true;

  function init() {
    var section = document.getElementById('featured-books');
    var track = document.getElementById('fmTrack');
    var prev = document.getElementById('fmPrev');
    var next = document.getElementById('fmNext');
    if (!section || !track) return;

    var scrollJs = false;

    function cardWidth() {
      var card = track.querySelector('.featured-books-card');
      if (!card) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).gap) || 12;
      return card.getBoundingClientRect().width + gap;
    }

    function canScroll() {
      return track.scrollWidth > track.clientWidth + 8;
    }

    function updateArrows() {
      if (!prev || !next) return;
      var can = canScroll();
      prev.disabled = !can || track.scrollLeft <= 4;
      next.disabled = !can || track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
      prev.setAttribute('aria-hidden', can ? 'false' : 'true');
      next.setAttribute('aria-hidden', can ? 'false' : 'true');
    }

    function snapToIndex(i) {
      if (!canScroll()) return;
      var w = cardWidth();
      var maxIndex = Math.max(0, Math.ceil(track.scrollWidth / w) - 1);
      scrollJs = true;
      track.scrollTo({ left: Math.min(Math.max(0, i), maxIndex) * w, behavior: 'smooth' });
    }

    var page = 0;
    prev.addEventListener('click', function () {
      page = Math.max(0, page - 1);
      snapToIndex(page);
      restartAuto();
    });
    next.addEventListener('click', function () {
      page += 1;
      snapToIndex(page);
      restartAuto();
    });

    track.addEventListener('scroll', function () {
      scrollJs = false;
      var w = cardWidth();
      if (w > 0) page = Math.round(track.scrollLeft / w);
      updateArrows();
    }, { passive: true });

    var AUTOPLAY_MS = 4200;
    var timer = null;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function maxIndex() {
      return Math.max(0, Math.ceil(track.scrollWidth / cardWidth()) - 1);
    }

    function stopAuto() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function advanceAuto() {
      if (document.hidden) return;
      var max = maxIndex();
      if (max < 1) return;
      if (page >= max) {
        page = 0;
        scrollJs = true;
        track.scrollTo({ left: 0, behavior: 'auto' });
        updateArrows();
      } else {
        page += 1;
        snapToIndex(page);
      }
    }

    function startAuto() {
      if (reducedMotion || timer || !canScroll()) return;
      timer = setInterval(advanceAuto, AUTOPLAY_MS);
    }

    function restartAuto() {
      stopAuto();
      startAuto();
    }

    section.addEventListener('mouseenter', stopAuto);
    section.addEventListener('mouseleave', startAuto);
    section.addEventListener('touchstart', stopAuto, { passive: true });
    section.addEventListener('touchend', startAuto, { passive: true });
    section.addEventListener('focusin', stopAuto);
    section.addEventListener('focusout', startAuto);

    function onResize() {
      page = 0;
      updateArrows();
      restartAuto();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('load', function () {
      updateArrows();
      startAuto();
    });
    updateArrows();
    startAuto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();