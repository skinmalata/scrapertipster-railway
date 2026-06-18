(function () {
  var btn = document.createElement('button');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 5 2 8L12 17l-5.5 5 2-8L3 9h7z"/></svg><span style="margin-left:8px;font-size:15px;font-weight:600">Tip Me</span>';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;align-items:center;padding:14px 22px;background:#f45d22;color:#fff;border:none;border-radius:50px;cursor:pointer;box-shadow:0 4px 20px rgba(244,93,34,.35);z-index:999999;font-family:system-ui,-apple-system,sans-serif;font-size:15px;transition:transform .2s ease,box-shadow .2s ease';
  btn.onmouseover = function () { btn.style.transform = 'scale(1.08)'; btn.style.boxShadow = '0 6px 28px rgba(244,93,34,.45)'; };
  btn.onmouseout = function () { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 4px 20px rgba(244,93,34,.35)'; };

  var overlay = document.createElement('div');
  overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:1000000;justify-content:center;align-items:center;padding:12px';

  var modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:16px;width:100%;max-width:700px;height:min(85vh,750px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.25);animation:wfFadeIn .25s ease';

  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#f45d22;color:#fff;flex-shrink:0';
  hdr.innerHTML = '<span style="font-size:16px;font-weight:600">Support WinFulltime</span><button style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0;line-height:1">&times;</button>';

  var iframe = document.createElement('iframe');
  iframe.src = 'https://ko-fi.com/winfulltime/?hidefeed=true&widget=true&embed=true';
  iframe.style.cssText = 'width:100%;height:100%;border:none;flex:1;min-height:400px';
  iframe.setAttribute('allowpayment', 'true');

  hdr.querySelector('button').onclick = function () { overlay.style.display = 'none'; };
  overlay.onclick = function (e) { if (e.target === overlay) overlay.style.display = 'none'; };
  btn.onclick = function () { overlay.style.display = 'flex'; };

  modal.appendChild(hdr);
  modal.appendChild(iframe);
  overlay.appendChild(modal);

  var style = document.createElement('style');
  style.textContent = '@keyframes wfFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}@media(max-width:480px){#wf-overlay{padding:0}#wf-modal{border-radius:12px;height:100vh;max-height:100vh;max-width:100%}#wf-modal-header{padding:14px 16px}}';
  overlay.id = 'wf-overlay';
  modal.id = 'wf-modal';
  hdr.id = 'wf-modal-header';

  document.body.appendChild(btn);
  document.body.appendChild(overlay);
})();
