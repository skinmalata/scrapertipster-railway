// player-shots-tab.js - appends the Player Shots tab into prediction-page tab
// containers (#categoryLinks on prediction pages, #categoryTabs on
// home/best-picks), so the tab is present site-wide without hand-editing every
// static container. The Player Shots page itself (/player-shots.html) is free
// and reads the daily-updated static JSON (public/data/player-shots.json).
(function () {
  'use strict';
  function inject() {
    var containers = document.querySelectorAll('#categoryLinks, #categoryTabs');
    containers.forEach(function (container) {
      if (!container || container.querySelector('#tab-player-shots')) return;
      var path = window.location.pathname.replace(/\/+$/, '');
      var isActive = path === '/player-shots' || path === '/player-shots.html';
      var link = document.createElement('a');
      link.href = '/player-shots.html';
      link.id = 'tab-player-shots';
      link.className = 'tab-btn' + (isActive ? ' active' : '');
      link.textContent = 'Player Shots';
      link.setAttribute('style', 'background:linear-gradient(135deg,#ff9800,#ffb300);color:#fff');
      container.appendChild(link);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
