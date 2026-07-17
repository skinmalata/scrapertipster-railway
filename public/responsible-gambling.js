(function() {
  // Responsible gambling disclaimer in footer
  function addDisclaimer() {
    var footer = document.querySelector('footer');
    if (!footer) return;
    var existing = footer.querySelector('.rg-disclaimer');
    if (existing) return;
    var disclaimer = document.createElement('div');
    disclaimer.className = 'rg-disclaimer';
    disclaimer.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);padding:16px;margin-top:16px;text-align:center;';
    disclaimer.innerHTML = '<p style="font-size:12px;color:#71717a;margin:0 0 6px;line-height:1.5;"><strong style="color:#a1a1aa;">18+ | Responsible Gambling</strong></p><p style="font-size:11px;color:#52525b;margin:0;line-height:1.5;max-width:600px;margin-left:auto;margin-right:auto;">WinFulltime provides free AI-generated football predictions for informational and entertainment purposes only. Predictions are not financial advice. Gambling involves risk &mdash; never bet more than you can afford to lose. If you or someone you know has a gambling problem, please call the National Council on Problem Gambling helpline: 1-800-522-4700. Be gamble aware: <a href="https://www.begambleaware.org" target="_blank" rel="noopener" style="color:#52525b;text-decoration:underline;">begambleaware.org</a></p>';
    footer.appendChild(disclaimer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDisclaimer);
  } else {
    addDisclaimer();
  }
})();
