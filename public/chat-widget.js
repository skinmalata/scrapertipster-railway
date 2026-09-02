(function(){
var S=document.createElement('style');
S.textContent='.wf-chat *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}.wf-chat-bubble{position:fixed;bottom:calc(24px + env(safe-area-inset-bottom,0px));right:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(255,0,0,.3);z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .2s}.wf-chat-bubble:hover{transform:scale(1.1)}.wf-chat-bubble svg{width:28px;height:28px}.wf-chat-panel{position:fixed;bottom:calc(96px + env(safe-area-inset-bottom,0px));right:24px;width:360px;max-width:calc(100vw - 48px);height:520px;max-height:calc(100vh - 140px);background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:999999;display:none;flex-direction:column;overflow:hidden;animation:wfSlideUp .3s ease}.wf-chat-panel.open{display:flex}.wf-chat-header{background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.wf-chat-header h3{margin:0;font-size:16px;font-weight:600;color:#fff}.wf-chat-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0;line-height:1;opacity:.8}.wf-chat-close:hover{opacity:1}.wf-chat-messages{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.wf-chat-msg{max-width:92%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;word-wrap:break-word;white-space:pre-wrap}.wf-chat-msg.bot{background:#fff;color:#18181b;align-self:flex-start;border:1px solid #e5e5e5;border-bottom-left-radius:4px}.wf-chat-msg.user{background:#ff0000;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}.wf-chat-msg.bot a{color:#ff2448;font-weight:500;text-decoration:none}.wf-chat-msg.bot a:hover{text-decoration:underline}.wf-chat-msg.bot strong{color:#18181b}.wf-chat-msg .chat-mb{display:inline-block;background:rgba(255,36,72,.1);color:#ff2448;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;margin:2px 4px 2px 0;cursor:pointer}.wf-chat-msg .chat-mb:hover{background:rgba(255,36,72,.2)}.wf-chat-email-gate{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;background:#f8fafc;text-align:center}.wf-chat-email-gate h3{font-size:16px;margin:0 0 8px;color:#18181b}.wf-chat-email-gate p{font-size:13px;color:#71717a;margin:0 0 20px;line-height:1.5}.wf-chat-email-input{width:100%;padding:10px 14px;border:1px solid #d4d4d8;border-radius:8px;font-size:14px;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px}.wf-chat-email-input:focus{border-color:#ff0000}.wf-chat-email-btn{width:100%;padding:10px;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}.wf-chat-email-btn:hover{opacity:.9}.wf-chat-email-error{font-size:12px;color:#ef4444;margin:6px 0 0;display:none}.wf-chat-email-skip{background:none;border:none;color:#a1a1aa;font-size:12px;cursor:pointer;margin-top:12px;text-decoration:underline;font-family:inherit}.wf-chat-email-skip:hover{color:#71717a}.wf-chat-input-wrap{display:none;padding:12px;border-top:1px solid #e5e5e5;background:#fff;flex-shrink:0;gap:8px}.wf-chat-input{flex:1;border:1px solid #d4d4d8;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;font-family:inherit}.wf-chat-input:focus{border-color:#ff0000}.wf-chat-send{background:#ff0000;color:#fff;border:none;border-radius:8px;width:42px;height:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;opacity:.7}.wf-chat-send.active{opacity:1}.wf-chat-send svg{width:18px;height:18px}.wf-chat-powered{text-align:center;font-size:11px;color:#a1a1aa;padding:6px;background:#fff;border-top:1px solid #f4f4f5;flex-shrink:0}.wf-chat-powered a{color:#ff0000;text-decoration:none}.wf-chat-typing{display:flex;gap:4px;padding:10px 14px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px;max-width:60px}.wf-chat-typing span{width:6px;height:6px;border-radius:50%;background:#a1a1aa;animation:wfTyping 1.4s infinite}.wf-chat-typing span:nth-child(2){animation-delay:.2s}.wf-chat-typing span:nth-child(3){animation-delay:.4s}.wf-chat-ticket{background:linear-gradient(135deg,#f0f4ff,#fff);border:1px solid #e0e7ff;border-radius:10px;padding:12px;margin:8px 0}.wf-chat-ticket h4{font-size:13px;margin:0 0 6px;color:#18181b}.wf-chat-ticket table{width:100%;border-collapse:collapse;font-size:12px}.wf-chat-ticket td{padding:3px 4px;border-bottom:1px solid #eee}.wf-chat-ticket .tab{font-weight:600;color:#ff2448}.wf-chat-ticket .tod{font-weight:700;color:#18181b;font-size:13px;text-align:right}.wf-chat-tlink{display:inline-block;padding:6px 14px;background:linear-gradient(135deg,#ff2448,#d41a38);color:#fff!important;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;margin:4px 0}@keyframes wfSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes wfTyping{0%,60%,100%{opacity:.3}30%{opacity:1}}';
document.head.appendChild(S);

var userEmail=localStorage.getItem('wf_chat_email')||'',predData=null,predLoading=false;

var SITE={
  name:'WinFulltime',
  url:'https://winfulltime.com',
  tagline:'Free AI Football Predictions',
  email:'officialwinfulltime@gmail.com',
  desc:'WinFulltime is a free football prediction website providing AI-driven betting tips across 50+ global leagues. No registration required.',
  pages:{
    home:{url:'/',title:'Home - Daily Predictions'},
    '1x2':{url:'/predictions/1x2',title:'1X2 Predictions'},
    'over-2-5':{url:'/predictions/over-2-5',title:'Over 2.5 Goals'},
    'over-1-5':{url:'/predictions/over-1-5',title:'Over 1.5 Goals'},
    btts:{url:'/predictions/btts',title:'BTTS Yes'},
    'btts-no':{url:'/predictions/btts-no',title:'BTTS No'},
    corners:{url:'/predictions/corners',title:'Corners Predictions'},
    cards:{url:'/predictions/cards',title:'Cards Predictions'},
    unbeaten:{url:'/predictions/unbeaten',title:'Unbeaten Teams'},
    'winning-streak':{url:'/predictions/winning-streak',title:'Winning Streaks'},
    'losing-streak':{url:'/predictions/losing-streak',title:'Losing Streaks'},
    'draws-streak':{url:'/predictions/draws-streak',title:'Draw Streaks'},
    'ticket-builder':{url:'/ticket-builder.html',title:'Free Ticket Builder'},
    blog:{url:'/blog/',title:'Betting Blog'},
    about:{url:'/about.html',title:'About Us'},
    contact:{url:'/contact.html',title:'Contact'},
    options:{url:'/options.html',title:'Betting Sites'},
    analysis:{url:'/analysis.html',title:'Analysis'},
    privacy:{url:'/privacy.html',title:'Privacy Policy'},
    terms:{url:'/terms.html',title:'Terms & Conditions'},
    app:{url:'/app.html',title:'PWA App Dashboard'}
  },
  features:[
    'Daily 1X2 (match winner) predictions with confidence percentages',
    'Over 2.5 & Over 1.5 goals predictions',
    'BTTS YES & BTTS NO (Both Teams To Score)',
    'Corners and Cards predictions',
    'Unbeaten team streaks (winning/drawing streaks)',
    'Free Accumulator/Ticket Builder with AI optimization',
    '180+ educational blog articles on betting strategy',
    '50+ leagues, 750+ teams worldwide',
    'PWA - installable as a mobile app'
  ],
  markets:{
    '1x2':'Predict match outcome: 1=Home Win, X=Draw, 2=Away Win. Confident picks shown with 65%+ probability.',
    'over 2.5':'Predict 3+ total goals. Typical threshold: 60%+ probability.',
    'over 1.5':'Predict 2+ total goals. High consistency, 80%+ probability threshold.',
    btts:'Both Teams To Score - predicts both teams will score at least one goal.',
    'btts no':'Both Teams To Score NO - predicts one or both teams won\'t score (also called OTS).',
    corners:'Over 9.5 corners - matches likely to see 10+ total corners.',
    cards:'Over 4.5 / Over 8.5 cards - fixtures with high booking rates.',
    unbeaten:'Teams on winning/drawing streaks from head-to-head analysis.'
  },
  leagues:'Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, Turkish Super Lig, Championship, and 35+ more.',
  ticketBuilder:{
    desc:'Build optimized accumulator tickets from daily predictions. Set target odds, min/max leg odds, select markets, and get the best combinations.',
    howto:'Go to https://winfulltime.com/ticket-builder.html, set your target odds (default 20), adjust filters, and click Generate Tickets. The AI finds optimal leg combinations to reach your target.',
    tip:'For best results, use target odds between 10-50, min leg odds 1.20, and max leg odds 3.00. Enable "Today only" for current matches.'
  }
};

var BLOG_CATEGORIES={
  'Betting Strategies':['accumulator-betting-strategy','value-betting-explained','value-betting-strategy','bankroll-management-guide','kelly-criterion-explained','flat-betting-vs-variable-staking','fibonacci-betting-system','martingale-betting-strategy','matched-betting-football-guide','hedge-betting-explained','contrarian-betting','motivation-theory-betting','arbitrage-betting-soccer','football-betting-strategies','btts-and-win-strategy','draw-no-bet-strategy','double-chance-betting','derby-betting-strategy','betting-portfolio-multi-league','betting-community-vs-solo','free-vs-paid-tipsters','betting-exchanges-vs-bookmakers','statistical-modeling-football-predictions','poisson-distribution-football-predictions','betting-on-draws','betting-on-international-tournaments','betting-on-african-football-leagues','european-vs-african-football-betting','correct-score-betting','clean-sheet-betting','first-half-goals-betting','multi-goals-betting','multi-outcome-betting','goal-scorer-markets','first-goalscorer-betting','half-time-full-time-betting','scorecast-betting','next-goal-betting','time-based-goal-betting','odds-even-goals-betting','winning-margin-betting','to-qualify-betting','time-based-betting','penalty-betting-strategy','set-piece-analysis-betting','shot-on-target-betting','possession-betting','fouls-betting','offsides-betting','throw-ins-betting','booking-code-betting'],
  'Market Guides':['1x2-betting-guide','btts-betting-guide','what-is-over-under-betting','over-under-35-goals','asian-handicap-betting-guide','asian-handicap-plus-15','asian-handicap-minus-075','corner-betting-strategy','corner-kick-betting-markets','cards-betting-strategy','score-both-halves','first-half-goals-betting','goal-scorer-markets','first-goalscorer-betting','half-time-full-time-betting','correct-score-betting','inplay-betting-strategies','in-play-betting-strategy','next-goal-betting','time-based-betting','time-based-goal-betting','clean-sheet-betting','draw-no-bet-strategy','double-chance-betting','booking-code-betting','expected-goals-xg-betting','expected-goals-xg-betting-strategy'],
  'League Guides':['premier-league-betting-guide','la-liga-betting-guide','bundesliga-betting-guide','serie-a-betting-guide','champions-league-betting-guide','best-football-leagues-to-bet-on','form-analysis-guide','head-to-head-betting-strategy','fixture-congestion-fatigue-betting','home-away-form-betting'],
  'Analysis & Statistics':['assistant-referee-flag-changed-game-more-than-var','title-races-won-best-defense','football-analytics-misses-most-important-factor','one-football-rule-would-change-everything','premier-league-title-prediction-2026-who-will-win','research-football-match-30-minutes','40-dual-nationality-players-2026-world-cup','aberdeen-bayern-munich-2008','after-drogba-how-ivory-coast-rebuilt-identity','ali-dia-vanished','club-never-signs-players-older-than-23','club-never-won-away-game-ten-years','club-signs-only-left-footed-players','cristiano-ronaldo-41-sixth-world-cup','defender-never-lost-tackle-entire-season','dublin-banker-world-cup-linkedin','erling-haaland-world-cup-dream','every-record-broken-2026-world-cup','ferenc-puskas-seniors-debut','four-father-son-players-2026-world-cup','gainsborough-trinity-never-relegated','ghanaian-defender-refugee-camp-bundesliga','goalkeeper-scored-more-goals-than-strikers','hossam-ashour-most-decorated','how-cape-verde-built-a-world-cup-squad-without-a-domestic-league','iranian-striker-banned-from-own-country','klose-honest-handball','kobbie-mainoo-england-midfield-maestro','makana-fa-prison-football','most-one-footed-player-right-only','most-superstitious-football-club-pre-match-meal','national-team-never-won-away-match-15-years','national-team-refuses-foreign-born-players','nicolas-jacksons-double-golden-boot','nils-petersen-super-sub','reece-wabara-retired-millionaire','saudi-arabian-teenager-nutmegged-world-cup-squad','senegal-2002-world-cup-legends-inspired-generation','six-nations-2026-world-cup-entire-squad-plays-abroad','smallest-club-ever-qualify-european-competition','smallest-nation-to-qualify-for-world-cup','south-korea-military-service-law-football-generation','teenager-turned-down-barcelona-never-regretted','ten-refugee-background-players-2026-world-cup','uruguay-football-culture-secret','why-south-american-players-thrive-europe-asian-struggle'],
  'Betting Sites & Payments':['best-betting-sites','best-betting-sites-nigeria','best-betting-sites-kenya','best-betting-sites-ghana','best-betting-sites-uganda','best-betting-sites-uk','best-betting-sites-usa','best-betting-sites-mpesa-kenya','best-accumulator-betting-sites','bet9ja-vs-sportybet','best-enhanced-odds-betting-sites','new-betting-sites-2026-africa','best-betting-apps-africa','best-payment-methods-kenya-nigeria','deposits-withdrawals-m-pesa','nigerian-bank-transfers-betting','currency-conversion-fees-betting','cryptocurrency-betting-africa','betting-sites-fast-payouts','betting-site-verification-kyc','live-streaming-betting','mobile-vs-desktop-betting'],
  'Guides & Education':['beginners-guide-football-betting','how-to-read-football-betting-odds','betting-dictionary','betting-terms-glossary','decimal-vs-fractional-odds','form-analysis-guide','head-to-head-statistics','expected-goals-xg-betting','expected-goals-xg-betting-strategy','using-statistics-for-betting','football-statistics-websites','football-tactics-betting','analyze-football-match-betting','statistical-modeling-football-predictions','excel-betting-tracker','cash-out-feature','responsible-gambling-guide','signs-problem-gambling','setting-betting-limits','avoid-betting-site-scams','injury-news-betting','injury-news-betting-strategy','referee-statistics-betting','weather-impact-football-betting','value-betting-explained','best-football-prediction-apps','value-betting-strategy']
};

var blogIndex=[];for(var c in BLOG_CATEGORIES){for(var i=0;i<BLOG_CATEGORIES[c].length;i++){blogIndex.push({slug:BLOG_CATEGORIES[c][i],category:c})}}

function urlOf(slug){return slug?SITE.url+'/blog/'+slug+'.html':''}
function titleOf(slug){if(!slug)return '';var t=slug.replace(/-/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase()});return t}

var FAQ=[
{k:['free','cost','price','pricing','pay','payment','subscription','vip'],r:'WinFulltime is 100% free. No registration required. All predictions, analysis, blog content, ticket builder, and features are accessible without any payment.'},
{k:['contact','email','reach','message','support'],r:'Contact us at '+SITE.email+' or visit '+SITE.url+'/contact.html'},
{k:['about','what is','who are','tell me about','company'],r:SITE.desc},
{k:['how','use','works','work','guide','start'],r:'Using WinFulltime:\n1. Visit '+SITE.url+'\n2. Pick a day using the tabs (Today, Tomorrow)\n3. Choose a market: 1X2, Over 2.5, BTTS, etc.\n4. Browse predictions with confidence percentages\n5. Click any match for detailed analysis\n6. Try the Free Ticket Builder to build accumulators'},
{k:['leagues','competition','tournament'],r:'We cover 50+ leagues: '+SITE.leagues},
{k:['prediction','tip','pick','bet'],r:'We provide: 1X2, Over 2.5, Over 1.5, BTTS YES, BTTS NO, Corners, Cards, Unbeaten Teams, and Winning/Losing Streak predictions. All with confidence percentages. Daily updates for 50+ leagues.'},
  {k:['1x2','1 x 2','match result','home win','away win','draw'],r:'1X2 betting: 1=Home Win, X=Draw, 2=Away Win. Our picks show 65%+ probability. Visit '+SITE.url+'/predictions/1x2 for today\'s predictions.'},
{k:['over','under','goals','total goals','ou','over under'],r:'Over/Under betting predicts if total goals exceed a threshold. We offer Over 1.5 (80%+ confidence) and Over 2.5 (60%+). Visit our predictions page for today\'s picks.'},
{k:['btts','both teams','both teams to score','ots','one team'],r:'BTTS = Both Teams To Score. BTTS YES predicts both score; BTTS NO predicts one or neither scores. Popular for attacking vs defensive matchups.'},
  {k:['corners','corner'],r:'Corner predictions focus on Over 9.5 corners (10+ total). We analyze team corner stats and historical data. Visit '+SITE.url+'/predictions/corners'},
  {k:['cards','card','yellow','red','booking'],r:'Card predictions highlight matches with high booking rates. Markets: Over 4.5 (top leagues) and Over 8.5 cards. Visit '+SITE.url+'/predictions/cards'},
  {k:['streak','winning','losing','draw streak','unbeaten','form'],r:'We track teams on winning/drawing/unbeaten streaks. Great for momentum-based betting. Browse '+SITE.url+'/predictions/winning-streak, '+SITE.url+'/predictions/losing-streak, '+SITE.url+'/predictions/draws-streak and '+SITE.url+'/predictions/unbeaten.'},
{k:['accuracy','accurate','reliable','confidence','probability','percentage'],r:'Each prediction shows a confidence percentage (e.g., 72%). This represents the statistical probability based on team form, H2H data, and league-wide metrics. Higher = more confident but typically lower odds.'},
{k:['source','data','where','api','method','how'],r:'Our predictions combine statistical analysis with data from trusted sources. Each match factors in team form, head-to-head records, league performance metrics, and historical patterns.'},
{k:['blog','article','post','guide','strategy','educational','read'],r:'Our blog features 180+ articles on betting strategies, market guides, league analysis, and betting education. Browse all categories at '+SITE.url+'/blog/'},
{k:['responsible','gamble','gambling','addict','problem','18+'],r:'WinFulltime promotes responsible gambling. All predictions are informational. We recommend: set limits, never chase losses, treat betting as entertainment. If gambling becomes a problem, seek help at BeGambleAware.org.'},
{k:['youtube','video','channel','subscribe'],r:'Check out our YouTube channel @winfulltime for video predictions, analysis, and betting tips: https://www.youtube.com/@winfulltime/videos'},
{k:['register','sign up','signup','account','login','create','password'],r:'No registration needed! WinFulltime is completely free and accessible to everyone without creating an account.'},
{k:['ticket','builder','acca','accumulator','multi','parlay','generate'],r:SITE.ticketBuilder.desc+'\n\nHow to use: '+SITE.ticketBuilder.howto+'\n\nTip: '+SITE.ticketBuilder.tip},
{k:['app','install','pwa','mobile','home screen'],r:'Install WinFulltime as a mobile app! Open on Chrome/Edge/Samsung Internet and tap "Add to Home Screen" or "Install" when prompted. Our PWA works offline for previously viewed content.'},
{k:['analysis','analytics','stats','statistics','form','h2h'],r:'Visit our Analysis page for detailed football statistics: '+SITE.url+'/analysis.html'},
{k:['league','premier league','epl','la liga','serie a','bundesliga','ligue 1','champions league'],r:'We cover Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, and 40+ more leagues worldwide.'},
{k:['features','what do','offer','provide','services'],r:'WinFulltime features:\n'+SITE.features.map(function(f,i){return (i+1)+'. '+f}).join('\n')},
{k:['blog','betting','tips','strategies','guides','education'],r:'Explore our blog categories:\n\u2022 Betting Strategies (40+ articles on value betting, bankroll, accumulators)\n\u2022 Market Guides (BTTS, Over/Under, Asian Handicap, Cards, Corners)\n\u2022 League Guides (Premier League, La Liga, Serie A, Champions League)\n\u2022 Analysis & Statistics (football stories, data analysis)\n\u2022 Betting Sites & Payments (reviews, deposits, withdrawals)\n\u2022 Guides & Education (basics, odds, dictionary)\n\nBrowse all: '+SITE.url+'/blog/'},
  {k:['page','site','website','pages','sitemap'],r:'WinFulltime pages:\n\u2022 Home - '+SITE.url+'\n\u2022 1X2 Predictions - '+SITE.url+'/predictions/1x2\n\u2022 Over 2.5 - '+SITE.url+'/predictions/over-2-5\n\u2022 Over 1.5 - '+SITE.url+'/predictions/over-1-5\n\u2022 BTTS Yes - '+SITE.url+'/predictions/btts\n\u2022 BTTS No - '+SITE.url+'/predictions/btts-no\n\u2022 Corners - '+SITE.url+'/predictions/corners\n\u2022 Cards - '+SITE.url+'/predictions/cards\n\u2022 Unbeaten - '+SITE.url+'/predictions/unbeaten\n\u2022 Ticket Builder - '+SITE.url+'/ticket-builder.html\n\u2022 Blog - '+SITE.url+'/blog/\n\u2022 About - '+SITE.url+'/about.html\n\u2022 Contact - '+SITE.url+'/contact.html'},
{k:['bet9ja','sportybet','1xbet','betking','betway','melbet','22bet'],r:'We\'ve reviewed major betting sites:\n\u2022 Bet9ja vs SportyBet: '+SITE.url+'/blog/bet9ja-vs-sportybet.html\n\u2022 1xBet reviews across Africa: '+SITE.url+'/blog/1xbet-review.html\n\u2022 Best betting sites Nigeria: '+SITE.url+'/blog/best-betting-sites-nigeria.html\n\u2022 Best betting sites Kenya: '+SITE.url+'/blog/best-betting-sites-kenya.html\n\u2022 Best betting sites Ghana: '+SITE.url+'/blog/best-betting-sites-ghana.html'},
{k:['what is','meaning','explain','define','definition','term'],r:'I can explain any betting term! Try asking about:\n\u2022 What is Asian Handicap?\n\u2022 What does BTTS mean?\n\u2022 What is Expected Goals (xG)?\n\u2022 What is the Kelly Criterion?\n\u2022 What is value betting?\n\u2022 What is Poisson distribution?\n\u2022 What is cash out?\n\u2022 What is a booking code?'},
{k:['podcast','radio','audio','listen'],r:'We don\'t have a podcast yet, but you can check out our YouTube channel for video content: https://www.youtube.com/@winfulltime/videos'},
{k:['tipster','expert','professional','advice','recommend'],r:'Our predictions are data-driven, not from human tipsters. We analyze team form, H2H records, and league metrics to generate probability-based picks. Always combine with your own research and practice responsible gambling.'},
{k:['privacy','policy','data','information','collect','cookie'],r:'Our privacy policy explains how we handle your data: '+SITE.url+'/privacy.html'},
{k:['terms','conditions','legal'],r:'View our Terms & Conditions: '+SITE.url+'/terms.html'},
{k:['pwa','app','install','offline'],r:'WinFulltime is a Progressive Web App (PWA). You can install it on your phone or desktop for a native-like experience, including offline access to previously viewed pages. Open in Chrome/Edge and look for the install icon in the address bar.'}
];

function getTodayStr(d){if(d&&d.date)return d.date;var n=new Date;var o=60*60;var l=new Date(n.getTime()+o*1e3);return l.toISOString().split('T')[0]}
function fetchPredictions(cb){if(predData){cb(predData);return}if(predLoading){setTimeout(function(){fetchPredictions(cb)},200);return}predLoading=true;var x=new XMLHttpRequest;x.open('GET','/data/predictions.json',true);x.onload=function(){predLoading=false;if(x.status>=200&&x.status<400){try{predData=JSON.parse(x.responseText);cb(predData)}catch(e){cb(null)}}else{cb(null)}};x.onerror=function(){predLoading=false;cb(null)};x.send()}
function tL(m){if(m.tip==='1')return'Home Win';if(m.tip==='X')return'Draw';if(m.tip==='2')return'Away Win';if(m.tip==='1X')return'Double Chance 1X';if(m.tip==='X2')return'Double Chance X2';return m.tip}
function fM(m){return'\u2022 '+m.match+' \u2192 '+tL(m)+' ('+m.probability+'%)'}
function matchScore(m){return{match:m.match,tip:tL(m),odds:parseFloat(((100/m.probability)/1.05).toFixed(2)),prob:m.probability,date:m.date,league:m.league||'',time:m.time||''}}

function buildInChatTickets(data,msg){
  var today=getTodayStr(data);
  var target=20;var mmin=1.20;var mmax=3.00;
  var tm=/target[=: ]+(\d+\.?\d*)/i.exec(msg);if(tm&&tm[1])target=parseFloat(tm[1]);
  var mn=/min[=: ]+(\d+\.?\d*)/i.exec(msg);if(mn&&mn[1])mmin=parseFloat(mn[1]);
  var mx=/max[=: ]+(\d+\.?\d*)/i.exec(msg);if(mx&&mx[1])mmax=parseFloat(mx[1]);
  if(target<2)target=2;if(target>500)target=500;

  var picks=[],seen=new Set;
  var cats={matches:'1X2',over25Matches:'Over 2.5',over15Matches:'Over 1.5',bttsMatches:'BTTS YES',bttsNoMatches:'BTTS NO'};
  for(var k in cats){var arr=data[k]||[];for(var i=0;i<arr.length;i++){
    var m=arr[i];if(!m.match||!m.tip||!m.probability||m.date!==today)continue;
    var s=matchScore(m);if(s.odds<mmin||s.odds>mmax||s.prob<40)continue;
    var key=m.match+'|'+m.tip;if(seen.has(key))continue;seen.add(key);
    s.category=cats[k];picks.push(s);
  }}

  picks.sort(function(a,b){return a.odds-b.odds});
  function backtrack(start,curr,prod,used){
    var results=[];var maxLegs=8;var iter=0;var MAX_ITER=30000;
    function search(s,c,p,u){if(iter++>MAX_ITER)return;if(c.length>=2){results.push({legs:c.slice(),total:p,diff:Math.abs(p-target)})}if(c.length>=maxLegs)return;for(var i=s;i<picks.length;i++){
      var pi=picks[i];var np=p*pi.odds;if(np>target*1.3)break;if(u.has(pi.match))continue;
      u.add(pi.match);c.push(pi);search(i+1,c,np,u);c.pop();u.delete(pi.match);
    }}
    search(start,curr,prod,used);return results;
  }
  var candidates=backtrack(0,[],1,new Set);
  if(candidates.length===0){return null}
  candidates.sort(function(a,b){return a.diff-b.diff});
  var selected=[];var usedPairs=new Set;var maxTickets=3;
  for(var i=0;i<candidates.length&&selected.length<maxTickets;i++){
    var t=candidates[i];var ok=true;var pairs=t.legs.map(function(l){return l.match+'|'+l.tip});
    for(var pi=0;pi<pairs.length;pi++){var ck=0;for(var pj=0;pj<pairs.length;pj++){if(pairs[pi]===pairs[pj])ck++}if(ck>1){ok=false;break}}
    if(ok){selected.push(t);pairs.forEach(function(p){usedPairs.add(p)})}
  }
  if(selected.length===0){selected=[candidates[0]]}

  var out='<div class="wf-chat-ticket"><h4>Top Accumulator Tickets</h4>';
  for(var ti=0;ti<selected.length;ti++){
    var tkt=selected[ti];out+='<table>';
    for(var li=0;li<tkt.legs.length;li++){
      var l=tkt.legs[li];out+='<tr><td>'+(li+1)+'.</td><td>'+l.match+'</td><td class="tab">'+l.tip+'</td><td>'+l.odds+'</td></tr>';
    }
    out+='<tr><td colspan="4" class="tod">Total: '+tkt.total.toFixed(2)+' ('+tkt.legs.length+' legs)</td></tr></table>';
    if(ti<selected.length-1)out+='<hr style="border:none;border-top:1px solid #eee;margin:4px 0">';
  }
  out+='<a href="'+SITE.url+'/ticket-builder.html" class="chat-mb" target="_blank">Open Full Ticket Builder \u2192</a></div>';
  return out;
}

function getPredictionResponse(msg,cb){
  fetchPredictions(function(data){
    if(!data){cb('Sorry, I couldn\'t load prediction data. Try refreshing the page.');return}
    var isTicket=/ticket|builder|acca|accumulator|multi|parlay|generate|build|combine|target.*odd|odd.*target/i.test(msg);
    if(isTicket&&(/\bticket\b|\bacca\b|\baccumulator\b|\bgenerate\b|\bbuild\b|\bcombine\b/i.test(msg))){
      var tkt=buildInChatTickets(data,msg);
      if(tkt){cb(tkt);return}
    }
    var today=getTodayStr(data);
    var targetDate=today;
    if(/tomorrow|next day/i.test(msg)){var d=new Date(today+'T12:00:00');d.setDate(d.getDate()+1);targetDate=d.toISOString().split('T')[0]}
    if(/yesterday|previous day|last day/i.test(msg)){var d=new Date(today+'T12:00:00');d.setDate(d.getDate()-1);targetDate=d.toISOString().split('T')[0]}

    if(/blog|article|post|guide|strategy|education|how to|what is|meaning|explain|define/i.test(msg)&&!/prediction|tip|bet|match|today/i.test(msg)){
      var hints=[];
      for(var ci in BLOG_CATEGORIES){
        var matches=0;var exSlugs=[];
        for(var bi=0;bi<BLOG_CATEGORIES[ci].length;bi++){
          var s=BLOG_CATEGORIES[ci][bi];
          var pt=s.replace(/-/g,' ');
          if(msg.toLowerCase().indexOf(pt)!==-1||msg.toLowerCase().indexOf(s)!==-1){
            matches++;exSlugs.push(s);
          }
        }
        if(matches>0){
          hints.push(ci+':');
          for(var ei=0;ei<Math.min(exSlugs.length,3);ei++){
            hints.push('  \u2022 '+titleOf(exSlugs[ei])+' - '+urlOf(exSlugs[ei]));
          }
          if(matches>3)hints.push('  \u2022 ... and '+(matches-3)+' more');
        }
      }
      if(hints.length>0){cb(hints.join('\n'));return}
    }
    var is1x2=/1x2|1 x 2|match result|home win|away win/i.test(msg);
    var isOver25=/over ?2\.5|over 2[.]5|o2[.]5/i.test(msg);
    var isOver15=/over ?1\.5|over 1[.]5|o1[.]5/i.test(msg);
    var isOverGeneral=/over.*goal|under.*goal|total goal|over under|ou/i.test(msg);
    var isBtts=/btts|both team.*score/i.test(msg);
    var isBttsNo=/btts no|btts ?n|ots|one team.*score/i.test(msg);
    var isCorners=/corner/i.test(msg);
    var isCards=/card/i.test(msg);
    var isStreak=/streak|winning|losing|draw.*streak|form|unbeaten/i.test(msg);
    var isSpecific=is1x2||isOver25||isOver15||isOverGeneral||isBtts||isBttsNo||isCorners||isCards||isStreak;
    var isGeneral=/prediction|tip|pick|bet|today|show|match/i.test(msg)&&!isSpecific;
    var isAll=/all|summary|overview|everything/i.test(msg);
    var isCount=/how many|count|total|number of/i.test(msg);
    var isTeamSearch=!isSpecific&&!isCount&&(/for |about |predictions? (for|on|about)|match/i.test(msg));
    var showAll=isAll||isGeneral||(!isSpecific&&!isCount&&!isTeamSearch&&/prediction|tip|bet/i.test(msg));
    var categories=[
      {key:'matches',label:'1X2',active:is1x2||showAll},
      {key:'over25Matches',label:'Over 2.5',active:isOver25||(isOverGeneral&&!isOver15)||showAll},
      {key:'over15Matches',label:'Over 1.5',active:isOver15||showAll},
      {key:'bttsMatches',label:'BTTS YES',active:isBtts||showAll},
      {key:'bttsNoMatches',label:'BTTS NO',active:isBttsNo||showAll},
      {key:'winstreakMatches',label:'Winning Streak',active:isStreak||showAll},
      {key:'losestreakMatches',label:'Losing Streak',active:isStreak||showAll},
      {key:'drawstreakMatches',label:'Draw Streak',active:isStreak||showAll},
      {key:'cornersMatches',label:'Corners',active:isCorners||showAll},
      {key:'cardsMatches',label:'Cards',active:isCards||showAll}
    ];

    if(isCount){
      var parts=['Today\'s match count:'];
      for(var ci=0;ci<categories.length;ci++){var a=data[categories[ci].key]||[],f=a.filter(function(m){return m.date===targetDate});if(f.length>0)parts.push('\u2022 '+categories[ci].label+': '+f.length)}
      cb(parts.join('\n'));return
    }

    if(isTeamSearch){
      var team=msg.replace(/.*predictions?\s+(for|on|about)\s+/i,'').replace(/.*show\s+/i,'').replace(/.*tell me\s+/i,'').replace(/.*match(es)?\s+/i,'').trim();
      team=team.replace(/^(about|for|on)\s+/i,'').trim();
      if(team.length>1){
        var tLines=['Matches matching "'+team+'":'];var found=false;
        for(var ci=0;ci<categories.length;ci++){var a=data[categories[ci].key]||[],f=a.filter(function(m){return m.date===targetDate&&m.match&&m.match.toLowerCase().indexOf(team.toLowerCase())!==-1});if(f.length>0){tLines.push(categories[ci].label+':');for(var ti=0;ti<Math.min(f.length,5);ti++)tLines.push(fM(f[ti]));found=true}}
        if(found){cb(tLines.join('\n'));return}
      }
    }

    var lines=[];
    for(var ci=0;ci<categories.length;ci++){if(!categories[ci].active)continue;var a=data[categories[ci].key]||[],f=a.filter(function(m){return m.date===targetDate});if(f.length===0)continue;lines.push(categories[ci].label+' ('+f.length+'):');var limit=Math.min(f.length,categories[ci].key==='matches'?10:8);for(var mi=0;mi<limit;mi++)lines.push(fM(f[mi]));if(f.length>limit)lines.push('  \u2022 ... and '+(f.length-limit)+' more')}
    if(lines.length===0){var dl=targetDate===today?'Today':targetDate;cb('No predictions available for '+dl+'. Check back later!');return}
    var dl=targetDate===today?'Today':targetDate;lines.unshift(dl+' predictions:');cb(lines.join('\n'));
  })
}

function findBest(msg){
  var m=msg.toLowerCase().trim();
  if(m.length<3)return 'Hi! I\'m the WinFulltime assistant. I know everything about our predictions, ticket builder, blog, betting markets, and more. Ask me anything!';
  var matched=[];
  for(var i=0;i<FAQ.length;i++){var score=0;for(var j=0;j<FAQ[i].k.length;j++){if(m.indexOf(FAQ[i].k[j])!==-1)score++}if(score>0)matched.push({score:score,response:FAQ[i].r})}
  matched.sort(function(a,b){return b.score-a.score});
  if(matched.length>0&&matched[0].score>=1)return matched[0].response;
  return null;
}

var bubble=document.createElement('button');
bubble.className='wf-chat-bubble';
bubble.setAttribute('aria-label','Open chat');
bubble.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

var panel=document.createElement('div');
panel.className='wf-chat-panel';
panel.innerHTML='<div class="wf-chat-header"><h3>WinFulltime Assistant</h3><button class="wf-chat-close" aria-label="Close chat">&times;</button></div><div class="wf-chat-messages"></div><div class="wf-chat-email-gate"><h3>Get Started</h3><p>Enter your email to unlock the assistant and get daily predictions, tips, and updates.</p><input class="wf-chat-email-input" type="email" placeholder="your@email.com"><button class="wf-chat-email-btn">Start Chatting</button><div class="wf-chat-email-error">Please enter a valid email address</div><button class="wf-chat-email-skip">Skip, I\'ll just browse</button></div><div class="wf-chat-input-wrap"><input class="wf-chat-input" type="text" placeholder="Ask me anything..." maxlength="500"><button class="wf-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div><div class="wf-chat-powered">Powered by <a href="https://winfulltime.com">WinFulltime</a></div>';

var messagesEl=panel.querySelector('.wf-chat-messages');
var inputEl=panel.querySelector('.wf-chat-input');
var sendBtn=panel.querySelector('.wf-chat-send');
var closeBtn=panel.querySelector('.wf-chat-close');
var emailGate=panel.querySelector('.wf-chat-email-gate');
var emailInput=panel.querySelector('.wf-chat-email-input');
var emailBtn=panel.querySelector('.wf-chat-email-btn');
var emailError=panel.querySelector('.wf-chat-email-error');
var emailSkip=panel.querySelector('.wf-chat-email-skip');
var chatWrap=panel.querySelector('.wf-chat-input-wrap');

function saveEmail(e){if(!e||e.indexOf('@')===-1)return;userEmail=e;try{localStorage.setItem('wf_chat_email',e)}catch(ex){}}
function showChatView(){emailGate.style.display='none';chatWrap.style.display='flex';if(messagesEl.children.length===0){addMessage('Hi! I\'m the WinFulltime assistant. I know everything about WinFulltime - predictions, ticket builder, blog, betting markets, and more. Try asking:\n\n\u2022 Show me today\'s predictions\n\u2022 Build me an accumulator with target 20 odds\n\u2022 What leagues do you cover?\n\u2022 How does the ticket builder work?\n\u2022 Explain BTTS betting\n\u2022 Best betting sites in Nigeria','bot')}}
function showEmailGate(){emailGate.style.display='flex';chatWrap.style.display='none'}
function addMessage(text,role){
  var msg=document.createElement('div');msg.className='wf-chat-msg '+role;
  if(role==='bot'&&text.indexOf('<div')!==-1){msg.innerHTML=text}else{msg.textContent=text}
  messagesEl.appendChild(msg);messagesEl.scrollTop=messagesEl.scrollHeight
}
function showTyping(){var el=document.createElement('div');el.className='wf-chat-typing';el.id='wf-typing';el.innerHTML='<span></span><span></span><span></span>';messagesEl.appendChild(el);messagesEl.scrollTop=messagesEl.scrollHeight}
function hideTyping(){var el=document.getElementById('wf-typing');if(el)el.remove()}
function sendMessage(){
  var text=inputEl.value.trim();if(!text)return;
  inputEl.value='';sendBtn.classList.remove('active');addMessage(text,'user');showTyping();
  var isPrediction=/prediction|tip|bet|1x2|1 x 2|over ?2\.5|over ?1\.5|btts|both team|corner|card|streak|winning|losing|draw.*streak|today.*match|match.*today|how many|count|show|predictions? |league/i.test(text.toLowerCase());
  var isTicket=/ticket|builder|acca|accumulator|multi|parlay|generate|build/i.test(text.toLowerCase());
  if(isPrediction||isTicket){
    getPredictionResponse(text,function(r){hideTyping();addMessage(r,'bot')});
  }else{
    setTimeout(function(){
      hideTyping();var r=findBest(text);
      if(r){addMessage(r,'bot')}else{
        addMessage('I\'m not sure about that. Try asking about:\n\u2022 Today\'s 1X2 predictions\n\u2022 Build me an accumulator\n\u2022 TTicket Builder\n\u2022 What leagues do you cover?\n\u2022 Explain BTTS\n\u2022 Best betting sites in Kenya\n\u2022 How does the ticket builder work?\n\u2022 Blog articles about value betting\n\u2022 What is Asian Handicap?\n\nOr browse '+SITE.url+' for more info.','bot')
      }
    },400)
  }
}

function togglePanel(open){
  if(open===undefined){panel.classList.toggle('open')}else if(open){panel.classList.add('open')}else{panel.classList.remove('open')}
  if(panel.classList.contains('open')){if(userEmail){showChatView()}else{showEmailGate();emailInput.focus()}}
}

emailBtn.addEventListener('click',function(){var e=emailInput.value.trim();if(!e||e.indexOf('@')===-1||e.indexOf('.')===-1){emailError.style.display='block';return}emailError.style.display='none';saveEmail(e);showChatView()});
emailInput.addEventListener('keydown',function(e){if(e.key==='Enter')emailBtn.click()});
emailSkip.addEventListener('click',function(){saveEmail('skipped@guest');showChatView()});
bubble.addEventListener('click',function(){togglePanel(true)});
closeBtn.addEventListener('click',function(){togglePanel(false)});
sendBtn.addEventListener('click',sendMessage);
inputEl.addEventListener('keydown',function(e){if(e.key==='Enter')sendMessage()});
inputEl.addEventListener('input',function(){sendBtn.classList.toggle('active',inputEl.value.trim().length>0)});
document.body.appendChild(bubble);
document.body.appendChild(panel);
})();
