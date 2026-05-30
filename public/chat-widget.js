(function () {
  var styles = document.createElement('style');
  styles.textContent =
    '.wf-chat *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}.wf-chat-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(255,0,0,.3);z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .2s}.wf-chat-bubble:hover{transform:scale(1.1)}.wf-chat-bubble svg{width:28px;height:28px}.wf-chat-panel{position:fixed;bottom:96px;right:24px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 140px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:999999;display:none;flex-direction:column;overflow:hidden;animation:wfSlideUp .3s ease}.wf-chat-panel.open{display:flex}.wf-chat-header{background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.wf-chat-header h3{margin:0;font-size:16px;font-weight:600;color:#fff}.wf-chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;line-height:1;opacity:.8}.wf-chat-close:hover{opacity:1}.wf-chat-messages{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.wf-chat-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}.wf-chat-msg.bot{background:#fff;color:#18181b;align-self:flex-start;border:1px solid #e5e5e5;border-bottom-left-radius:4px}.wf-chat-msg.user{background:#ff0000;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}.wf-chat-input-wrap{display:flex;padding:12px;border-top:1px solid #e5e5e5;background:#fff;flex-shrink:0;gap:8px}.wf-chat-input{flex:1;border:1px solid #d4d4d8;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;font-family:inherit}.wf-chat-input:focus{border-color:#ff0000}.wf-chat-send{background:#ff0000;color:#fff;border:none;border-radius:8px;width:42px;height:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;opacity:.7}.wf-chat-send.active{opacity:1}.wf-chat-send svg{width:18px;height:18px}.wf-chat-powered{text-align:center;font-size:11px;color:#a1a1aa;padding:6px;background:#fff;border-top:1px solid #f4f4f5;flex-shrink:0}.wf-chat-powered a{color:#ff0000;text-decoration:none}.wf-chat-typing{display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px;max-width:60px}.wf-chat-typing span{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:wfTyping 1.4s infinite}.wf-chat-typing span:nth-child(2){animation-delay:.2s}.wf-chat-typing span:nth-child(3){animation-delay:.4s}@keyframes wfSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes wfTyping{0%,60%,100%{opacity:.3}30%{opacity:1}}';
  document.head.appendChild(styles);

  var bubble = document.createElement('button');
  bubble.className = 'wf-chat-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'wf-chat-panel';
  panel.innerHTML =
    '<div class="wf-chat-header"><h3>WinFulltime Assistant</h3><button class="wf-chat-close" aria-label="Close chat">&times;</button></div><div class="wf-chat-messages"></div><div class="wf-chat-input-wrap"><input class="wf-chat-input" type="text" placeholder="Ask me anything..." maxlength="500"><button class="wf-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div><div class="wf-chat-powered">Powered by <a href="/">WinFulltime</a></div>';

  var messagesEl = panel.querySelector('.wf-chat-messages');
  var inputEl = panel.querySelector('.wf-chat-input');
  var sendBtn = panel.querySelector('.wf-chat-send');
  var closeBtn = panel.querySelector('.wf-chat-close');

  function addMessage(text, role) {
    var msg = document.createElement('div');
    msg.className = 'wf-chat-msg ' + role;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'wf-chat-typing';
    el.id = 'wf-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('wf-typing');
    if (el) el.remove();
  }

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.classList.remove('active');
    addMessage(text, 'user');

    showTyping();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideTyping();
        if (data.success) {
          addMessage(data.response, 'bot');
        } else {
          addMessage('Sorry, something went wrong. Please try again.', 'bot');
        }
      })
      .catch(function () {
        hideTyping();
        addMessage('Sorry, I couldn\'t reach the server. Please try again.', 'bot');
      });
  }

  function togglePanel(open) {
    if (open === undefined) {
      panel.classList.toggle('open');
    } else if (open) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }

    if (panel.classList.contains('open') && messagesEl.children.length === 0) {
      addMessage('Hi! I\'m the WinFulltime assistant. Ask me about our football predictions, betting markets, leagues we cover, or anything else about the site!', 'bot');
    }
  }

  bubble.addEventListener('click', function () { togglePanel(true); });
  closeBtn.addEventListener('click', function () { togglePanel(false); });
  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });
  inputEl.addEventListener('input', function () {
    sendBtn.classList.toggle('active', inputEl.value.trim().length > 0);
  });

  document.body.appendChild(bubble);
  document.body.appendChild(panel);
})();
