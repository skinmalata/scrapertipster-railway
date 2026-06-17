(function () {
  var styles = document.createElement('style');
  styles.textContent =
    '.wf-chat *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}.wf-chat-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(255,0,0,.3);z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .2s}.wf-chat-bubble:hover{transform:scale(1.1)}.wf-chat-bubble svg{width:28px;height:28px}.wf-chat-panel{position:fixed;bottom:96px;right:24px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 140px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:999999;display:none;flex-direction:column;overflow:hidden;animation:wfSlideUp .3s ease}.wf-chat-panel.open{display:flex}.wf-chat-header{background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.wf-chat-header h3{margin:0;font-size:16px;font-weight:600;color:#fff}.wf-chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;line-height:1;opacity:.8}.wf-chat-close:hover{opacity:1}.wf-chat-messages{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.wf-chat-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}.wf-chat-msg.bot{background:#fff;color:#18181b;align-self:flex-start;border:1px solid #e5e5e5;border-bottom-left-radius:4px}.wf-chat-msg.user{background:#ff0000;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}.wf-chat-email-gate{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;background:#f8fafc;text-align:center}.wf-chat-email-gate h3{font-size:16px;margin:0 0 8px;color:#18181b}.wf-chat-email-gate p{font-size:13px;color:#71717a;margin:0 0 20px;line-height:1.5}.wf-chat-email-input{width:100%;padding:10px 14px;border:1px solid #d4d4d8;border-radius:8px;font-size:14px;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px}.wf-chat-email-input:focus{border-color:#ff0000}.wf-chat-email-btn{width:100%;padding:10px;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}.wf-chat-email-btn:hover{opacity:.9}.wf-chat-email-error{font-size:12px;color:#ef4444;margin:6px 0 0;display:none}.wf-chat-email-skip{background:none;border:none;color:#a1a1aa;font-size:12px;cursor:pointer;margin-top:12px;text-decoration:underline;font-family:inherit}.wf-chat-email-skip:hover{color:#71717a}.wf-chat-input-wrap{display:flex;padding:12px;border-top:1px solid #e5e5e5;background:#fff;flex-shrink:0;gap:8px}.wf-chat-input{flex:1;border:1px solid #d4d4d8;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;font-family:inherit}.wf-chat-input:focus{border-color:#ff0000}.wf-chat-send{background:#ff0000;color:#fff;border:none;border-radius:8px;width:42px;height:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;opacity:.7}.wf-chat-send.active{opacity:1}.wf-chat-send svg{width:18px;height:18px}.wf-chat-powered{text-align:center;font-size:11px;color:#a1a1aa;padding:6px;background:#fff;border-top:1px solid #f4f4f5;flex-shrink:0}.wf-chat-powered a{color:#ff0000;text-decoration:none}.wf-chat-typing{display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px;max-width:60px}.wf-chat-typing span{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:wfTyping 1.4s infinite}.wf-chat-typing span:nth-child(2){animation-delay:.2s}.wf-chat-typing span:nth-child(3){animation-delay:.4s}@keyframes wfSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes wfTyping{0%,60%,100%{opacity:.3}30%{opacity:1}}';
  document.head.appendChild(styles);

  var EMAIL_KEY = 'wf_chat_email';
  var userEmail = localStorage.getItem(EMAIL_KEY) || '';
  var predData = null;
  var predLoading = false;

  var knowledge = {
    name: 'WinFulltime',
    tagline: 'Free AI Football Predictions',
    description: 'WinFulltime is a free football prediction website that provides AI-driven betting tips across major global football leagues. We combine advanced analytics with comprehensive statistical analysis to deliver accurate predictions.',
    pricing: 'WinFulltime is 100% free. All predictions, analysis, blog content, and features are accessible without any payment or registration.',
    features: {
      predictions: 'We provide daily football predictions including: 1X2 (match result), Over 1.5 Goals, Over 2.5 Goals, BTTS YES (Both Teams To Score), BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Team to Score 2+, Corners, and Cards predictions. Each prediction shows a confidence probability percentage.',
      leagues: 'We cover 50+ leagues worldwide including: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Conference League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, Turkish Super Lig, Championship, Scottish Premiership, Swiss Super League, Greek Super League, Croatian League, Czech League, Danish Superliga, and many more - covering over 750 teams.',
      sources: 'Our predictions are powered by data from trusted sources including Statarea, BetExplorer, and Apwin, combined with our own statistical analysis.',
      accuracy: 'Our predictions use probability thresholds to identify the strongest picks. Each prediction shows its confidence percentage so you can make informed decisions.',
      analysis: 'Our analysis page at /analysis.html provides detailed match breakdowns including: recent form guides (last 5 matches), head-to-head (H2H) statistics, team performance metrics, goal statistics, and AI-generated match summaries. Access it by clicking on any prediction on the homepage.',
      dayNavigation: 'You can browse predictions by day using the tabs at the top of the homepage: Today, Tomorrow, and more. The prediction data is updated daily with the latest football matches.'
    },
    bettingMarkets: {
      '1x2': '1X2 betting means predicting the match outcome: 1 = Home Win, X = Draw, 2 = Away Win. It is also called match result betting. Our predictions show picks with 65%+ probability.',
      'over/under': 'Over/Under betting is predicting whether total goals will be over or under a certain number. We cover Over 1.5 (80%+ threshold) and Over 2.5 (60%+ threshold). Over 0.5 is also available for goals markets.',
      'btts': 'BTTS means Both Teams To Score. BTTS YES predicts both teams will score at least one goal. BTTS NO predicts one or both teams will not score (also called OTS - One Team to Score or clean sheet).',
      'streaks': 'We track team streaks including: Winning Streak (teams on consecutive wins), Losing Streak (teams on consecutive losses), and Draw Streak (teams on consecutive draws) from BetExplorer data. These help identify teams in exceptional form.',
      'team to score': 'Team to Score predictions identify teams likely to find the net based on their scoring form and upcoming opposition. Team to Score 2+ predicts a team will score 2 or more goals.',
      'corners': 'Corner predictions focus on Over 9.5 corners markets, predicting matches likely to have 10+ total corners. Corner betting is popular for live betting.',
      'cards': 'Card predictions focus on Over 4.5 cards markets, predicting matches likely to have 5+ yellow/red cards. Often used for derby matches or rivalries.',
      'asian handicap': 'Asian Handicap eliminates the draw by giving one team a virtual advantage or disadvantage. Common lines: -0.5, 0, +0.5, -0.75, +0.75, -1, +1. Visit our blog for detailed Asian Handicap guides.',
      'correct score': 'Correct Score betting involves predicting the exact final score of a match. It offers high odds but is harder to predict. Our blog has a detailed correct score betting guide.',
      'double chance': 'Double Chance lets you cover two of three possible outcomes (1X, 12, X2), increasing your chance of winning but with lower odds.',
      'draw no bet': 'Draw No Bet (DNB) means if the match ends in a draw, your stake is returned. It removes the draw outcome from 1X2 betting.',
      'both teams to score and win': 'BTTS & Win combines BTTS YES with match result. For example, backing Team A to win and both teams to score.'
    },
    howToUse: 'Using WinFulltime is easy:\n1. Visit the homepage at winfulltime.com\n2. Select a day using the day tabs (Today, Tomorrow, etc.)\n3. Choose your market category: 1X2, Over 1.5, Over 2.5, BTTS YES, BTTS NO\n4. Browse the predictions - each shows the match, prediction, and confidence probability\n5. Click on any match for detailed analysis including head-to-head stats and form guides\n\nFor a full guide on all betting markets, visit /options.html. For match analysis, visit /analysis.html.',
    blog: 'Our blog features 180+ articles organized into categories:\n\u2022 Core Betting Strategies: bankroll management, Kelly criterion, value betting, arbitrage, hedging, matched betting, Martingale, Fibonacci\n\u2022 Betting Markets: Asian handicap, over/under, BTTS, correct score, corners, cards, first goalscorer, half-time/full-time, double chance, draw no bet\n\u2022 Analysis & Statistics: expected goals (xG), Poisson distribution, form analysis, head-to-head statistics\n\u2022 Payments & Banking: M-Pesa, bank transfers, Bet9ja vs SportyBet, cryptocurrency betting, best betting sites by country (Kenya, Nigeria, Ghana, Uganda, UK, USA)\n\u2022 Football Analysis: league guides (Premier League, La Liga, Bundesliga, Champions League), tactics, match previews\n\u2022 Guides & Education: beginner\'s guide, betting glossary, how to read odds, football statistics websites, betting dictionary\n\u2022 World Cup 2026: player profiles, team analysis, tournament previews\n\nVisit https://winfulltime.com/blog/ to explore all articles.',
    responsible: 'WinFulltime promotes responsible gambling. All predictions are for informational purposes only and do not guarantee results. We strongly recommend: setting strict betting limits, never chasing losses, treating betting as entertainment not income, avoiding alcohol while betting, and seeking professional help (e.g., GamCare, BeGambleAware) if gambling becomes a problem. Must be 18+ to use this site.',
    contact: 'Reach us at mesigotochukwu@gmail.com or visit https://winfulltime.com/contact.html. We typically respond within 24 hours.',
    affiliate: 'WinFulltime partners with reputable betting sites and provides reviews of betting platforms across Africa, Europe, and the USA. Our blog features reviews of the best betting sites in Kenya (Betika, SportyBet, Betway, 22Bet), Nigeria (Bet9ja, SportyBet, Betway, 1xBet), Ghana, Uganda, and the UK. Each review covers bonuses, payment methods, odds quality, and user experience.',
    analysis: 'The analysis page at /analysis.html offers detailed statistics for each match: team form (last 5 matches with W/D/L results), head-to-head history between the two teams, goal statistics (average goals scored/conceded), league position comparison, and an AI-generated written summary of the match. Perfect for making informed betting decisions.',
    options: 'The betting guide page at /options.html explains all football betting markets in detail with examples: 1X2, Double Chance, Draw No Bet, Over/Under, BTTS, Asian Handicap, Correct Score, Half-Time/Full-Time, First Goalscorer, Both Teams To Score & Win, Corners, Cards, and more. Each market includes a real betting example showing winning and losing scenarios.',
    predictions: 'Our prediction data includes these categories: 1X2 (match result), Over 1.5 Goals, Over 2.5 Goals, BTTS YES, BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Team to Score 2+, Over 9.5 Corners, and Over 4.5 Cards. Predictions are fetched daily from trusted data sources.',
    search: 'You can search for predictions by team name! Try asking "predictions for Arsenal" or "show me Liverpool matches". The assistant can also tell you how many matches are available for a given day.'
  };

  var faq = [
    { keywords: ['free', 'cost', 'price', 'pricing', 'pay', 'payment', 'subscription', 'vip', 'premium'], response: knowledge.pricing },
    { keywords: ['contact', 'email', 'reach', 'message', 'support', 'help', 'mesigo'], response: knowledge.contact },
    { keywords: ['about', 'what is', 'who are', 'tell me about', 'company', 'winfulltime', 'platform'], response: knowledge.description },
    { keywords: ['league', 'leagues', 'competition', 'tournament', 'premier league', 'la liga', 'serie a', 'bundesliga', 'champions league', 'eredivisie'], response: knowledge.features.leagues },
    { keywords: ['how', 'use', 'works', 'work', 'guide', 'start', 'beginner', 'tutorial'], response: knowledge.howToUse },
    { keywords: ['responsible', 'gamble', 'gambling', 'addict', 'problem', '18+', 'addiction', 'responsible gambling'], response: knowledge.responsible },
    { keywords: ['accuracy', 'accurate', 'reliable', 'confidence', 'probability', 'percentage', 'trust', 'legit'], response: knowledge.features.accuracy },
    { keywords: ['source', 'data', 'where', 'api', 'statarea', 'betexplorer', 'apwin', 'scraper'], response: knowledge.features.sources },
    { keywords: ['youtube', 'video', 'channel', 'watch', 'subscribe'], response: 'Check out our YouTube channel @winfulltime at https://www.youtube.com/@winfulltime/videos for video predictions, match analysis, and betting tips.' },
    { keywords: ['register', 'sign up', 'signup', 'account', 'login', 'create', 'sign in'], response: 'No registration needed! WinFulltime is completely free and accessible to everyone without creating an account.' },
    { keywords: ['analysis', 'match analysis', 'h2h', 'head to head', 'statistics', 'form guide', 'stats'], response: knowledge.analysis },
    { keywords: ['options', 'betting guide', 'markets', 'types of bets', 'betting types', 'explained'], response: knowledge.options },
    { keywords: ['affiliate', 'partner', 'sponsor', 'betting site', 'bookmaker', 'review'], response: knowledge.affiliate },
    { keywords: ['blog', 'article', 'guide', 'strategy', 'tips', 'educational', 'learn'], response: knowledge.blog },
    { keywords: ['prediction', 'predictions', 'tip', 'picks', 'forecast'], response: knowledge.predictions },
    { keywords: ['asian handicap', 'handicap', 'asian', 'ah'], response: knowledge.bettingMarkets['asian handicap'] },
    { keywords: ['correct score', 'exact score', 'score prediction'], response: knowledge.bettingMarkets['correct score'] },
    { keywords: ['double chance', '1x', '12', 'x2'], response: knowledge.bettingMarkets['double chance'] },
    { keywords: ['draw no bet', 'dnb'], response: knowledge.bettingMarkets['draw no bet'] },
    { keywords: ['bankroll', 'money management', 'stake', 'staking'], response: 'Bankroll management is crucial for long-term betting success. Key strategies include: the Kelly Criterion (bet a percentage of your bankroll based on perceived edge), flat betting (same stake every time), percentage betting (fixed % of bankroll), and the Fibonacci system. Our blog has detailed guides on bankroll management and the Kelly Criterion.' },
    { keywords: ['kelly', 'kelly criterion', 'kelly formula'], response: 'The Kelly Criterion is a money management formula that calculates the optimal stake size based on the probability of winning and the odds offered. Formula: f = (bp - q) / b, where f is the fraction of bankroll, b is the decimal odds minus 1, p is the probability of winning, and q is the probability of losing (1-p). Read our full guide at the blog.' },
    { keywords: ['value', 'value bet', 'value betting', 'overround'], response: 'Value betting means finding odds that are higher than the true probability of an outcome. If you calculate a team has a 50% chance of winning (implied odds of 2.0) but the bookmaker offers 2.2, that is value. Our predictions highlight high-probability picks to help you find value.' },
    { keywords: ['accumulator', 'acca', 'parlay', 'multi', 'multiple'], response: 'An accumulator (acca) combines multiple selections into one bet. All selections must win for the bet to payout. The total odds are multiplied together, offering higher potential returns but higher risk. Our blog has a guide on accumulator betting strategy.' },
    { keywords: ['arbitrage', 'arb', 'surebet', 'guaranteed'], response: 'Arbitrage betting (surebet) means placing bets on all possible outcomes across multiple bookmakers to guarantee a profit regardless of the result. It requires quick action and accounts on multiple betting sites. Read our arbitrage betting guide on the blog.' },
    { keywords: ['in play', 'inplay', 'live betting', 'cash out'], response: 'In-play or live betting allows you to place bets while a match is happening. Odds change dynamically based on match events. Cash-out lets you settle a bet early for a guaranteed return (or reduced loss). Our blog covers in-play betting strategies and cash-out features.' },
    { keywords: ['over', 'under', 'over under', 'total goals', 'ou', 'o2.5', 'u2.5', 'over 0.5'], response: knowledge.bettingMarkets['over/under'] },
    { keywords: ['btts', 'both team', 'both to score', 'ots', 'one team'], response: knowledge.bettingMarkets['btts'] },
    { keywords: ['corner', 'corners', 'corner kick'], response: knowledge.bettingMarkets['corners'] },
    { keywords: ['card', 'cards', 'yellow', 'red', 'booking'], response: knowledge.bettingMarkets['cards'] },
    { keywords: ['streak', 'winning', 'losing', 'draw streak', 'form', 'run'], response: knowledge.bettingMarkets['streaks'] },
    { keywords: ['xg', 'expected goals', 'expected', 'poisson'], response: 'Expected Goals (xG) measures the quality of chances created, assigning a probability value to each shot. It is a key advanced metric for predicting future performance. Poisson distribution is a statistical model used to predict football scores based on average goals scored/conceded. Our blog has detailed guides on xG and Poisson distribution.' },
    { keywords: ['mpesa', 'm-pesa', 'safaricom', 'kenya payment'], response: 'M-Pesa is the most popular mobile money service for betting deposits and withdrawals in Kenya. Most Kenyan betting sites support M-Pesa deposits and withdrawals. Our blog has a step-by-step guide on using M-Pesa for betting.' },
    { keywords: ['kenya', 'kenyan', 'betika', 'sportybet'], response: 'For Kenyan bettors, we recommend: Betika, SportyBet, Betway, 22Bet, and Mozzart Bet. Popular payment methods include M-Pesa and Airtel Money. Read our Kenya betting guide on the blog for detailed reviews and bonus offers.' },
    { keywords: ['nigeria', 'nigerian', 'bet9ja', 'betway nigeria'], response: 'For Nigerian bettors, top sites include Bet9ja, SportyBet, Betway Nigeria, 1xBet, and NairaBet. Payment methods include bank transfers, Quickteller, and Paga. Read our Nigeria betting guide on the blog.' },
    { keywords: ['ghana', 'ghanaian'], response: 'For Ghanaian bettors, popular sites include Betway Ghana, 1xBet, SportyBet Ghana, and Premier Bet. Payment methods include MTN Mobile Money and AirtelTigo Money.' },
    { keywords: ['first goal', 'first goalscorer', 'first scorer', 'anyscore'], response: 'First Goalscorer betting involves predicting which player will score the first goal of the match. Anytime Goalscorer means the player will score at any point. Our blog has a first goalscorer betting guide.' },
    { keywords: ['half time', 'ht', 'full time', 'ht/ft', 'half time full time'], response: 'Half-Time/Full-Time betting involves predicting both the result at half-time AND the result at full-time. Combos: HH, HD, HA, DH, DD, DA, AH, AD, AA. Higher odds but harder to predict.' },
    { keywords: ['strategy', 'strategies', 'betting strategy', 'system'], response: 'Our blog covers many betting strategies: value betting, the Kelly Criterion, arbitrage, matched betting, accumulator strategy, hedging, Asian handicap strategies, BTTS & Win, corner betting strategy, cards betting strategy, form analysis, home/away advantage, and more. Visit https://winfulltime.com/blog/ to explore.' },
    { keywords: ['day', 'today', 'tomorrow', 'yesterday', 'daily', 'schedule', 'update'], response: knowledge.features.dayNavigation },
    { keywords: ['search', 'find', 'team', 'specific', 'lookup'], response: knowledge.search },
    { keywords: ['news', 'newsletter', 'subscribe', 'email update', 'mail'], response: 'You can subscribe to our newsletter by entering your email in the chat widget. We send occasional updates with predictions and new blog content. Your email is stored securely and never shared with third parties.' }
  ];

  function getTodayStr(data) {
    if (data && data.date) return data.date;
    var d = new Date();
    var offset = 60 * 60;
    var local = new Date(d.getTime() + offset * 1000);
    return local.toISOString().split('T')[0];
  }

  function fetchPredictions(callback) {
    if (predData) { callback(predData); return; }
    if (predLoading) { setTimeout(function () { fetchPredictions(callback); }, 200); return; }
    predLoading = true;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/data/predictions.json', true);
    xhr.onload = function () {
      predLoading = false;
      if (xhr.status >= 200 && xhr.status < 400) {
        try { predData = JSON.parse(xhr.responseText); callback(predData); }
        catch (e) { callback(null); }
      } else { callback(null); }
    };
    xhr.onerror = function () { predLoading = false; callback(null); };
    xhr.send();
  }

  function tipLabel(m) {
    if (m.tip === '1') return 'Home Win';
    if (m.tip === 'X') return 'Draw';
    if (m.tip === '2') return 'Away Win';
    return m.tip;
  }

  function formatMatch(m) {
    return '\u2022 ' + m.match + ' \u2192 ' + tipLabel(m) + ' (' + m.probability + '%)';
  }

  function buildPredictionResponse(data, msg) {
    var today = getTodayStr(data);
    var targetDate = today;
    if (/tomorrow|next day/i.test(msg)) {
      var d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      targetDate = d.toISOString().split('T')[0];
    }
    if (/yesterday|previous day|last day/i.test(msg)) {
      var d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      targetDate = d.toISOString().split('T')[0];
    }
    var lines = [];
    var is1x2 = /1x2|1 x 2|match result|home win|away win/i.test(msg);
    var isOver25 = /over ?2\.5|over 2[.]5|o2[.]5/i.test(msg);
    var isOver15 = /over ?1\.5|over 1[.]5|o1[.]5/i.test(msg);
    var isOverGeneral = /over.*goal|under.*goal|total goal|over under|ou/i.test(msg);
    var isBtts = /btts|both team.*score/i.test(msg);
    var isBttsNo = /btts no|btts ?n|ots|one team.*score/i.test(msg);
    var isCorners = /corner/i.test(msg);
    var isCards = /card/i.test(msg);
    var isStreak = /streak|winning|losing|draw.*streak|form/i.test(msg);
    var isSpecific = is1x2 || isOver25 || isOver15 || isOverGeneral || isBtts || isBttsNo || isCorners || isCards || isStreak;
    var isGeneral = /prediction|tip|pick|bet|today|show|match/i.test(msg) && !isSpecific;
    var isAll = /all|summary|overview/i.test(msg);
    var isCount = /how many|count|total|number of/i.test(msg);
    var isTeamSearch = !isSpecific && !isCount && (/for |about |predictions? (for|on|about)|match/i.test(msg));

    var showAll = isAll || isGeneral || (!isSpecific && !isCount && !isTeamSearch && /prediction|tip|bet/i.test(msg));

    var categories = [
      { key: 'matches', label: '1X2', active: is1x2 || showAll },
      { key: 'over25Matches', label: 'Over 2.5', active: isOver25 || (isOverGeneral && !isOver15) || showAll },
      { key: 'over15Matches', label: 'Over 1.5', active: isOver15 || showAll },
      { key: 'bttsMatches', label: 'BTTS YES', active: isBtts || showAll },
      { key: 'bttsNoMatches', label: 'BTTS NO', active: isBttsNo || showAll },
      { key: 'winstreakMatches', label: 'Winning Streak', active: isStreak || showAll },
      { key: 'losestreakMatches', label: 'Losing Streak', active: isStreak || showAll },
      { key: 'drawstreakMatches', label: 'Draw Streak', active: isStreak || showAll },
      { key: 'cornersMatches', label: 'Corners', active: isCorners || showAll },
      { key: 'cardsMatches', label: 'Cards', active: isCards || showAll }
    ];

    if (isCount) {
      var parts = [];
      parts.push('Today\'s match count:');
      for (var ci = 0; ci < categories.length; ci++) {
        var arr = data[categories[ci].key] || [];
        var filtered = arr.filter(function (m) { return m.date === targetDate; });
        if (filtered.length > 0) {
          parts.push('\u2022 ' + categories[ci].label + ': ' + filtered.length);
        }
      }
      return parts.join('\n');
    }

    if (isTeamSearch) {
      var teamMatch = msg.replace(/.*predictions?\s+(for|on|about)\s+/i, '').replace(/.*show\s+/i, '').replace(/.*tell me\s+/i, '').replace(/.*match(es)?\s+/i, '').trim();
      teamMatch = teamMatch.replace(/^(about|for|on)\s+/i, '').trim();
      if (teamMatch.length > 1) {
        var teamLines = ['Matches matching "' + teamMatch + '":'];
        var found = false;
        for (var ci2 = 0; ci2 < categories.length; ci2++) {
          var arr2 = data[categories[ci2].key] || [];
          var filtered2 = arr2.filter(function (m) { return m.date === targetDate && m.match && m.match.toLowerCase().indexOf(teamMatch.toLowerCase()) !== -1; });
          if (filtered2.length > 0) {
            teamLines.push(categories[ci2].label + ':');
            for (var ti = 0; ti < Math.min(filtered2.length, 5); ti++) {
              teamLines.push(formatMatch(filtered2[ti]));
            }
            found = true;
          }
        }
        if (found) return teamLines.join('\n');
      }
    }

    // Show specific category or all
    var anyActive = false;
    for (var ci3 = 0; ci3 < categories.length; ci3++) {
      if (categories[ci3].active) anyActive = true;
    }

    if (!anyActive) {
      // Check if it's a general prediction query without a specific category
      if (/prediction|tip|bet|show|today|match/i.test(msg)) {
        return null; // will fall into "all predictions" via the catch-all below
      }
      return null;
    }

    for (var ci4 = 0; ci4 < categories.length; ci4++) {
      if (!categories[ci4].active) continue;
      var arr3 = data[categories[ci4].key] || [];
      var filtered3 = arr3.filter(function (m) { return m.date === targetDate; });
      if (filtered3.length === 0) continue;
      lines.push(categories[ci4].label + ' (' + filtered3.length + '):');
      var limit = Math.min(filtered3.length, categories[ci4].key === 'matches' ? 10 : 8);
      for (var mi = 0; mi < limit; mi++) {
        lines.push(formatMatch(filtered3[mi]));
      }
      if (filtered3.length > limit) {
        lines.push('  \u2022 ... and ' + (filtered3.length - limit) + ' more');
      }
    }

    if (lines.length === 0) {
      var dateLabel = targetDate === today ? 'Today' : targetDate;
      return 'No predictions available for ' + dateLabel + '. Check back later!';
    }

    var dateLabel = targetDate === today ? 'Today' : targetDate;
    lines.unshift(dateLabel + ' predictions:');
    return lines.join('\n');
  }

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

  function getPredictionResponse(message, callback) {
    fetchPredictions(function (data) {
      if (!data) {
        callback('Sorry, I couldn\'t load the prediction data. Please try refreshing the page.');
        return;
      }
      var response = buildPredictionResponse(data, message);
      if (response) {
        callback(response);
      } else {
        var faqAnswer = findBestResponse(message);
        if (faqAnswer) {
          callback(faqAnswer);
        } else {
          callback('I\'m not sure about that. Try asking about:\n\u2022 Today\'s 1X2 predictions\n\u2022 Over 2.5 tips\n\u2022 BTTS predictions\n\u2022 Predictions for a specific team\n\u2022 How many matches today\n\u2022 Free football predictions\n\u2022 Betting markets\n\u2022 How to use the site\n\u2022 Leagues we cover\n\u2022 Contact information\n\u2022 Our blog and guides\n\nOr visit https://winfulltime.com for more info.');
        }
      }
    });
  }

  var bubble = document.createElement('button');
  bubble.className = 'wf-chat-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'wf-chat-panel';
  panel.innerHTML =
    '<div class="wf-chat-header"><h3>WinFulltime Assistant</h3><button class="wf-chat-close" aria-label="Close chat">&times;</button></div><div class="wf-chat-messages"></div><div class="wf-chat-email-gate"><h3>Get Started</h3><p>Enter your email to unlock the assistant and get daily predictions, tips, and updates.</p><input class="wf-chat-email-input" type="email" placeholder="your@email.com"><button class="wf-chat-email-btn">Start Chatting</button><div class="wf-chat-email-error">Please enter a valid email address</div><button class="wf-chat-email-skip">Skip, I\'ll just browse</button></div><div class="wf-chat-input-wrap"><input class="wf-chat-input" type="text" placeholder="Ask me anything..." maxlength="500"><button class="wf-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div><div class="wf-chat-powered">Powered by <a href="https://winfulltime.com">WinFulltime</a></div>';

  var messagesEl = panel.querySelector('.wf-chat-messages');
  var inputEl = panel.querySelector('.wf-chat-input');
  var sendBtn = panel.querySelector('.wf-chat-send');
  var closeBtn = panel.querySelector('.wf-chat-close');
  var emailGate = panel.querySelector('.wf-chat-email-gate');
  var emailInput = panel.querySelector('.wf-chat-email-input');
  var emailBtn = panel.querySelector('.wf-chat-email-btn');
  var emailError = panel.querySelector('.wf-chat-email-error');
  var emailSkip = panel.querySelector('.wf-chat-email-skip');
  var chatWrap = panel.querySelector('.wf-chat-input-wrap');

  function saveEmail(email) {
    if (!email || email.indexOf('@') === -1) return;
    userEmail = email;
    try { localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/subscribe', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ email: email }));
  }

  function showChatView() {
    emailGate.style.display = 'none';
    chatWrap.style.display = 'flex';
    if (messagesEl.children.length === 0) {
      addMessage('Hi! I\'m the WinFulltime assistant. Ask me about today\'s predictions, 1X2 tips, BTTS picks, Over/Under goals, or anything else about the site!', 'bot');
    }
  }

  function showEmailGate() {
    emailGate.style.display = 'flex';
    chatWrap.style.display = 'none';
  }

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
    var isPredictionQuery = /prediction|tip|bet|1x2|1 x 2|over ?2\.5|over ?1\.5|btts|both team|corner|card|streak|winning|losing|draw.*streak|today.*match|match.*today|how many|count|show|predictions? (for|on|about)|league/i.test(text.toLowerCase());
    if (isPredictionQuery) {
      getPredictionResponse(text, function (response) {
        hideTyping();
        addMessage(response, 'bot');
      });
    } else {
      setTimeout(function () {
        hideTyping();
        var response = findBestResponse(text);
        if (response) {
          addMessage(response, 'bot');
        } else {
          addMessage('I\'m not sure about that. Try asking about:\n\u2022 Today\'s 1X2 predictions\n\u2022 Over 2.5 tips\n\u2022 BTTS predictions\n\u2022 Predictions for a specific team\n\u2022 How many matches today\n\u2022 Free football predictions\n\u2022 Betting markets\n\u2022 How to use the site\n\u2022 Leagues we cover\n\u2022 Contact information\n\u2022 Our blog and guides\n\nOr visit https://winfulltime.com for more info.', 'bot');
        }
      }, 400);
    }
  }

  function togglePanel(open) {
    if (open === undefined) {
      panel.classList.toggle('open');
    } else if (open) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
    if (panel.classList.contains('open')) {
      if (userEmail) {
        showChatView();
      } else {
        showEmailGate();
        emailInput.focus();
      }
    }
  }

  emailBtn.addEventListener('click', function () {
    var email = emailInput.value.trim();
    if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
      emailError.style.display = 'block';
      return;
    }
    emailError.style.display = 'none';
    saveEmail(email);
    showChatView();
  });

  emailInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') emailBtn.click();
  });

  emailSkip.addEventListener('click', function () {
    saveEmail('skipped@guest');
    showChatView();
  });

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

  var kofiScript = document.createElement('script');
  kofiScript.src = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
  kofiScript.onload = function () {
    kofiWidgetOverlay.draw('winfulltime', {
      'type': 'floating-chat',
      'floating-chat.donateButton.text': 'Tip Me',
      'floating-chat.donateButton.background-color': '#f45d22',
      'floating-chat.donateButton.text-color': '#fff'
    });
  };
  document.body.appendChild(kofiScript);
})();
