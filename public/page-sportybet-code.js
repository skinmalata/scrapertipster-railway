(function () {
  var holders = document.querySelectorAll('[data-page-sportybet-code]');
  if (!holders.length) return;

  var css = [
    '.wft-page-code-card{position:relative;margin:30px auto 8px;max-width:900px;padding:20px;border:1px solid rgba(255,36,72,.28);border-radius:16px;background:linear-gradient(135deg,rgba(255,36,72,.1),rgba(15,23,42,.42));box-shadow:0 12px 32px rgba(0,0,0,.16);font-family:inherit;color:var(--text,#e5e7eb)}',
    '.wft-page-code-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}',
    '.wft-page-code-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ff647d;margin-bottom:4px}',
    '.wft-page-code-title{margin:0;font-size:20px;line-height:1.25;font-weight:800}',
    '.wft-page-code-body{min-height:54px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.wft-page-code-code{font-size:24px;font-weight:900;letter-spacing:.04em;color:#fff;user-select:all}',
    '.wft-page-code-copy{border:1px solid rgba(255,255,255,.24);border-radius:8px;background:rgba(255,255,255,.08);color:inherit;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}',
    '.wft-page-code-stat{font-size:13px;color:var(--text-muted,#94a3b8)}',
    '.wft-page-code-stat strong{color:inherit}',
    '.wft-page-code-note{margin-top:10px;font-size:12px;line-height:1.5;color:var(--text-muted,#94a3b8)}',
    '.wft-page-code-error{padding:12px 14px;border:1px solid rgba(248,113,113,.3);border-radius:10px;background:rgba(248,113,113,.1);color:#fca5a5;font-size:13px}',
    '.wft-page-code-skipped{margin-top:8px;font-size:12px;color:var(--text-muted,#94a3b8)}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  Array.prototype.forEach.call(holders, function (holder) {
    var copy = holder.querySelector('[data-wft-code-copy]');
    if (!copy) return;
    copy.addEventListener('click', function () {
      var el = holder.querySelector('[data-wft-code-value]');
      if (!el) return;
      var code = el.textContent.trim();
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(code).then(function () {
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy code'; }, 1800);
      }).catch(function () {});
    });
  });
})();
