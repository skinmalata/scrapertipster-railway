// builder-tabs.js - appends the code-builder tabs into the prediction-page tab
// containers (#categoryLinks on prediction pages, #categoryTabs on
// home/best-picks), so all code builders are reachable from the same market
// menu as the prediction tabs without hand-editing every page.
(function () {
  'use strict';
  var TABS = [
    { id: 'tab-sportybuilder', href: '/ticket-builder.html', label: 'AI SportyBet Code Builder', paths: ['/ticket-builder.html', '/ticket-builder'] },
    { id: 'tab-betpawa-builder', href: '/betpawa-builder.html', label: 'AI betPawa Code Builder', paths: ['/betpawa-builder.html', '/betpawa-builder'] },
    { id: 'tab-1xbet-builder', href: '/1xbet-builder.html', label: 'AI 1xBet Code Builder', paths: ['/1xbet-builder.html', '/1xbet-builder'] }
  ];
  function inject() {
    var containers = document.querySelectorAll('#categoryLinks, #categoryTabs');
    var path = window.location.pathname.replace(/\/+$/, '');
    containers.forEach(function (container) {
      if (!container) return;
      TABS.forEach(function (tab) {
        if (container.querySelector('#' + tab.id)) return;
        var link = document.createElement('a');
        link.href = tab.href;
        link.id = tab.id;
        link.className = 'tab-btn' + (tab.paths.indexOf(path) !== -1 ? ' active' : '');
        link.textContent = tab.label;
        container.appendChild(link);
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
