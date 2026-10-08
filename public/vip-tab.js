// vip-tab.js - appends the Team To Score tab into prediction-page tab
// containers (#categoryLinks on prediction pages, #categoryTabs on
// home/best-picks), so the tab is present site-wide without hand-editing every
// static container. The Team To Score page itself (/vip.html) gated: free users
// get a 3-pick preview, Pro members get the full list (server-side).
(function () {
  'use strict';
  function inject() {
    var containers = document.querySelectorAll('#categoryLinks, #categoryTabs');
    containers.forEach(function (container) {
      if (!container || container.querySelector('#tab-vip')) return;
      // Normalise the path so /vip, /vip.html, /vip/ and /vip.html/ all mark
      // the tab active, without matching unrelated routes like /vip-archive.
      var path = window.location.pathname.replace(/\/+$/, '');
      var isActive = path === '/vip' || path === '/vip.html';
      var link = document.createElement('a');
      link.href = '/vip.html';
      link.id = 'tab-vip';
      link.className = 'tab-btn' + (isActive ? ' active' : '');
      link.textContent = 'Team To Score';
      link.setAttribute('style', 'background:linear-gradient(135deg,#ff2448,#ff7e7e);color:#fff');
      container.appendChild(link);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();