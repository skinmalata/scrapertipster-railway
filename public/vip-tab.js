// vip-tab.js - appends the VIP tab into prediction-page tab containers
// (#categoryLinks on prediction pages, #categoryTabs on home/best-picks), so
// the tab is present site-wide without hand-editing every static container.
// The VIP page itself (/vip.html) is gated to Pro members server-side.
(function () {
  'use strict';
  function inject() {
    var containers = document.querySelectorAll('#categoryLinks, #categoryTabs');
    containers.forEach(function (container) {
      if (!container || container.querySelector('#tab-vip')) return;
      var isActive = window.location.pathname === '/vip' || window.location.pathname === '/vip.html';
      var link = document.createElement('a');
      link.href = '/vip.html';
      link.id = 'tab-vip';
      link.className = 'tab-btn' + (isActive ? ' active' : '');
      link.textContent = 'VIP';
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