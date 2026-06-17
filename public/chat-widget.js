(function () {
  var s = document.createElement('script');
  s.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
  s.onload = function () {
    kofiWidgetOverlay.draw('winfulltime', {
      'type': 'floating-chat',
      'floating-chat.donateButton.text': 'Tip Me',
      'floating-chat.donateButton.background-color': '#f45d22',
      'floating-chat.donateButton.text-color': '#fff'
    });
  };
  document.body.appendChild(s);
})();
