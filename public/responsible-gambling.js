(function() {
  // Age gate
  if (!sessionStorage.getItem('wf-age-verified')) {
    var overlay = document.createElement('div');
    overlay.id = 'age-gate';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-family:Inter,system-ui,sans-serif;';
    overlay.innerHTML = '<div style="max-width:420px;padding:40px 30px;"><div style="font-size:48px;font-weight:800;margin-bottom:8px;">18+</div><p style="font-size:18px;font-weight:600;margin:0 0 12px;">Are you 18 years or older?</p><p style="font-size:14px;color:#a1a1aa;margin:0 0 28px;">This site contains content related to sports betting. You must be of legal age in your jurisdiction to access this site.</p><div style="display:flex;gap:12px;justify-content:center;"><button id="age-yes" style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">Yes, I am 18+</button><button id="age-no" style="background:#27272a;color:#a1a1aa;border:1px solid #3f3f46;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">No</button></div><p style="font-size:12px;color:#52525b;margin:20px 0 0;">Gambling can be addictive. Please play responsibly.</p></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.getElementById('age-yes').onclick = function() {
      sessionStorage.setItem('wf-age-verified', '1');
      overlay.remove();
      document.body.style.overflow = '';
    };
    document.getElementById('age-no').onclick = function() {
      window.location.href = 'https://www.google.com';
    };
  }

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
