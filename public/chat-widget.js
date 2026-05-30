(function () {
  var styles = document.createElement('style');
  styles.textContent =
    '.wf-chat *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}.wf-chat-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(255,0,0,.3);z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .2s}.wf-chat-bubble:hover{transform:scale(1.1)}.wf-chat-bubble svg{width:28px;height:28px}.wf-chat-panel{position:fixed;bottom:96px;right:24px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 140px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:999999;display:none;flex-direction:column;overflow:hidden;animation:wfSlideUp .3s ease}.wf-chat-panel.open{display:flex}.wf-chat-header{background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.wf-chat-header h3{margin:0;font-size:16px;font-weight:600;color:#fff}.wf-chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;line-height:1;opacity:.8}.wf-chat-close:hover{opacity:1}.wf-chat-messages{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.wf-chat-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}.wf-chat-msg.bot{background:#fff;color:#18181b;align-self:flex-start;border:1px solid #e5e5e5;border-bottom-left-radius:4px}.wf-chat-msg.user{background:#ff0000;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}.wf-chat-input-wrap{display:flex;padding:12px;border-top:1px solid #e5e5e5;background:#fff;flex-shrink:0;gap:8px}.wf-chat-input{flex:1;border:1px solid #d4d4d8;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;font-family:inherit}.wf-chat-input:focus{border-color:#ff0000}.wf-chat-send{background:#ff0000;color:#fff;border:none;border-radius:8px;width:42px;height:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;opacity:.7}.wf-chat-send.active{opacity:1}.wf-chat-send svg{width:18px;height:18px}.wf-chat-powered{text-align:center;font-size:11px;color:#a1a1aa;padding:6px;background:#fff;border-top:1px solid #f4f4f5;flex-shrink:0}.wf-chat-powered a{color:#ff0000;text-decoration:none}.wf-chat-typing{display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px;max-width:60px}.wf-chat-typing span{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:wfTyping 1.4s infinite}.wf-chat-typing span:nth-child(2){animation-delay:.2s}.wf-chat-typing span:nth-child(3){animation-delay:.4s}@keyframes wfSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes wfTyping{0%,60%,100%{opacity:.3}30%{opacity:1}}';
  document.head.appendChild(styles);

  var knowledge = {
    name: 'WinFulltime',
    tagline: 'Free AI Football Predictions',
    description: 'WinFulltime is a free football prediction website that provides AI-driven betting tips across major global football leagues. We combine advanced analytics with comprehensive statistical analysis to deliver accurate predictions.',
    pricing: 'WinFulltime is 100% free. All predictions, analysis, blog content, and features are accessible without any payment or registration.',
    features: {
      predictions: 'We provide daily football predictions including: 1X2 (match result), Over 1.5 Goals, Over 2.5 Goals, BTTS YES (Both Teams To Score), BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Team to Score 2+, Corners, and Cards predictions.',
      leagues: 'We cover 50+ leagues worldwide including: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, and many more - covering over 750 teams.',
      sources: 'Our predictions are powered by data from trusted sources including Statarea, BetExplorer, and Apwin, combined with our own statistical analysis.',
      accuracy: 'Our predictions use probability thresholds to identify the strongest picks. Each prediction shows its confidence percentage so you can make informed decisions.'
    },
    bettingMarkets: {
      '1x2': '1X2 betting means predicting the match outcome: 1 = Home Win, X = Draw, 2 = Away Win. Our predictions show picks with 65%+ probability.',
      'over/under': 'Over/Under betting is predicting whether total goals will be over or under a certain number. We cover Over 1.5 (80%+ threshold) and Over 2.5 (60%+ threshold).',
      'btts': 'BTTS means Both Teams To Score. BTTS YES predicts both teams will score at least one goal. BTTS NO predicts one or both teams will not score (also called OTS - One Team to Score).',
      'streaks': 'We track team streaks including: Winning Streak (teams on consecutive wins), Losing Streak (teams on consecutive losses), and Draw Streak (teams on consecutive draws) from BetExplorer data.',
      'team to score': 'Team to Score predictions identify teams likely to find the net based on their scoring form and upcoming opposition.',
      'corners': 'Corner predictions focus on Over 9.5 corners markets, predicting matches likely to have 10+ total corners.',
      'cards': 'Card predictions focus on Over 4.5 cards markets.'
    },
    howToUse: 'Using WinFulltime is easy:\n1. Visit the homepage at winfulltime.com\n2. Select a day using the day tabs (Today, Tomorrow, etc.)\n3. Choose your market category: 1X2, Over 1.5, Over 2.5, BTTS YES, BTTS NO\n4. Browse the predictions - each shows the match, prediction, and confidence probability\n5. Click on any match for detailed analysis including head-to-head stats and form guides',
    blog: 'Our blog features 180+ articles on betting strategies, league guides, market explanations, and analysis. Topics include: value betting, bankroll management, Asian handicap, accumulator strategies, Kelly criterion, Poisson distribution, and much more. Visit https://winfulltime.com/blog/',
    responsible: 'WinFulltime promotes responsible gambling. All predictions are for informational purposes only. We recommend: setting betting limits, never chasing losses, treating betting as entertainment, and seeking help if gambling becomes a problem.',
    contact: 'Reach us at mesigotochukwu@gmail.com or visit https://winfulltime.com/contact.html'
  };

  var faq = [
    { keywords: ['free', 'cost', 'price', 'pricing', 'pay', 'payment', 'subscription', 'vip'], response: knowledge.pricing },
    { keywords: ['contact', 'email', 'reach', 'message', 'support', 'help'], response: knowledge.contact },
    { keywords: ['about', 'what is', 'who are', 'tell me about', 'company'], response: knowledge.description },
    { keywords: ['prediction', 'tip', 'pick', 'bet'], response: knowledge.features.predictions },
    { keywords: ['league', 'leagues', 'competition', 'tournament'], response: knowledge.features.leagues },
    { keywords: ['how', 'use', 'works', 'work', 'guide', 'start'], response: knowledge.howToUse },
    { keywords: ['1x2', 'match result', 'home win', 'draw', 'away win'], response: knowledge.bettingMarkets['1x2'] },
    { keywords: ['over', 'under', 'goals', 'total goals', 'ou', 'over under'], response: knowledge.bettingMarkets['over/under'] },
    { keywords: ['btts', 'both teams', 'both teams to score', 'ots', 'one team'], response: knowledge.bettingMarkets['btts'] },
    { keywords: ['streak', 'winning', 'losing', 'draw streak', 'form'], response: knowledge.bettingMarkets['streaks'] },
    { keywords: ['corner', 'corners'], response: knowledge.bettingMarkets['corners'] },
    { keywords: ['card', 'cards', 'yellow', 'red'], response: knowledge.bettingMarkets['cards'] },
    { keywords: ['team to score', 'score 2', 'scoring'], response: knowledge.bettingMarkets['team to score'] },
    { keywords: ['blog', 'article', 'post', 'guide', 'strategy', 'educational'], response: knowledge.blog },
    { keywords: ['responsible', 'gamble', 'gambling', 'addict', 'problem', '18+'], response: knowledge.responsible },
    { keywords: ['accuracy', 'accurate', 'reliable', 'confidence', 'probability', 'percentage'], response: knowledge.features.accuracy },
    { keywords: ['source', 'data', 'where', 'api', 'statarea', 'betexplorer', 'apwin'], response: knowledge.features.sources },
    { keywords: ['youtube', 'video', 'channel'], response: 'Check out our YouTube channel @winfulltime at https://www.youtube.com/@winfulltime/videos for video predictions and analysis.' },
    { keywords: ['register', 'sign up', 'signup', 'account', 'login', 'create'], response: 'No registration needed! WinFulltime is completely free and accessible to everyone without creating an account.' }
  ];

  function findBestResponse(message) {
    var msg = message.toLowerCase().trim();
    if (msg.length < 3) {
      return 'Hi! I\'m the WinFulltime assistant. Ask me about our football predictions, how to use the site, our betting markets, or contact information.';
    }
    var matched = [];
    for (var i = 0; i < faq.length; i++) {
      var score = 0;
      for (var j = 0; j < faq[i].keywords.length; j++) {
        if (msg.indexOf(faq[i].keywords[j]) !== -1) {
          score++;
        }
      }
      if (score > 0) {
        matched.push({ score: score, response: faq[i].response });
      }
    }
    matched.sort(function (a, b) { return b.score - a.score; });
    if (matched.length > 0 && matched[0].score >= 1) {
      return matched[0].response;
    }
    return null;
  }

  var bubble = document.createElement('button');
  bubble.className = 'wf-chat-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'wf-chat-panel';
  panel.innerHTML =
    '<div class="wf-chat-header"><h3>WinFulltime Assistant</h3><button class="wf-chat-close" aria-label="Close chat">&times;</button></div><div class="wf-chat-messages"></div><div class="wf-chat-input-wrap"><input class="wf-chat-input" type="text" placeholder="Ask me anything..." maxlength="500"><button class="wf-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div><div class="wf-chat-powered">Powered by <a href="https://winfulltime.com">WinFulltime</a></div>';

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

  function handleResponse(text) {
    hideTyping();
    var response = findBestResponse(text);
    if (response) {
      addMessage(response, 'bot');
    } else {
      addMessage('I\'m not sure about that. Try asking about:\n\u2022 Free football predictions\n\u2022 Betting markets (1X2, BTTS, Over/Under)\n\u2022 How to use the site\n\u2022 Leagues we cover\n\u2022 Contact information\n\u2022 Our blog and guides\n\nOr visit https://winfulltime.com for more info.', 'bot');
    }
  }

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.classList.remove('active');
    addMessage(text, 'user');
    showTyping();
    setTimeout(function () { handleResponse(text); }, 400);
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
