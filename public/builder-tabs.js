// builder-tabs.js - appends the SportyBuilder and betPawa Builder tabs into the
// prediction-page tab containers (#categoryLinks on prediction pages,
// #categoryTabs on home/best-picks), so both code builders are reachable from
// the same market menu as the prediction tabs without hand-editing every page.
(function () {
  'use strict';
  var TABS = [
    { id: 'tab-sportybuilder', href: '/ticket-builder.html', label: 'SportyBuilder', paths: ['/ticket-builder.html', '/ticket-builder'] },
    { id: 'tab-betpawa-builder', href: '/betpawa-builder.html', label: 'betPawa Builder', paths: ['/betpawa-builder.html', '/betpawa-builder'] }
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
