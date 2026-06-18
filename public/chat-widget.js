(function () {
  var a = document.createElement('a');
  a.href = 'https://ko-fi.com/winfulltime';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', 'Support me on Ko-fi');
  a.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 5 2 8L12 17l-5.5 5 2-8L3 9h7z"/></svg><span style="margin-left:8px;font-size:15px;font-weight:600">Tip Me</span>';
  a.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;align-items:center;padding:14px 22px;background:#f45d22;color:#fff;border-radius:50px;text-decoration:none;box-shadow:0 4px 20px rgba(244,93,34,.35);z-index:999999;font-family:system-ui,-apple-system,sans-serif;transition:transform .2s ease,box-shadow .2s ease';
  a.onmouseover = function () { a.style.transform = 'scale(1.08)'; a.style.boxShadow = '0 6px 28px rgba(244,93,34,.45)'; };
  a.onmouseout = function () { a.style.transform = 'scale(1)'; a.style.boxShadow = '0 4px 20px rgba(244,93,34,.35)'; };
  document.body.appendChild(a);
})();
