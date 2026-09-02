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
    });
    next.addEventListener('click', function () {
      page += 1;
      snapToIndex(page);
    });

    track.addEventListener('scroll', function () {
      scrollJs = false;
      updateArrows();
    }, { passive: true });

    function onResize() {
      page = 0;
      updateArrows();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('load', updateArrows);
    updateArrows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();