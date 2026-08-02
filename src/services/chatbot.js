const knowledge = {
  business: {
    name: 'WinFulltime',
    tagline: 'AI Football Predictions',
    description: 'WinFulltime provides AI-driven betting tips across 50+ global leagues including Premier League, La Liga, Serie A, Bundesliga, Ligue 1, and Champions League. Membership requires a paid plan — accounts are created only after payment is confirmed. Covers 750+ teams worldwide.',
    founded: '2026',
    email: 'officialwinfulltime@gmail.com',
    website: 'https://winfulltime.com',
    youtube: '@winfulltime',
    youtubeUrl: 'https://www.youtube.com/@winfulltime/videos'
  },
  features: {
    free: 'WinFulltime is a paid membership. Sign up by choosing a plan and paying at /signup.html. Your account is created after payment is confirmed.',
    predictions: 'Daily predictions: 1X2 (match result), Over 1.5 Goals (80%+ threshold), Over 2.5 Goals (60%+ threshold), BTTS YES, BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Corners (Over 9.5), Cards (Over 4.5/8.5), and Unbeaten Teams.',
    leagues: '50+ leagues: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, Turkish Super Lig, Championship, and 35+ more.',
    sources: 'Statistical analysis combining team form data, head-to-head records, and league-wide performance metrics.',
    accuracy: 'Each prediction shows a confidence percentage (e.g., 72%). Higher confidence typically means lower odds but more consistency.',
    ticketBuilder: 'Free accumulator ticket builder. Set target odds, choose min/max leg odds, select markets, and generate optimized multi-leg tickets. Visit /ticket-builder.html',
    blog: '180+ articles on betting strategies, market guides, league analysis, betting education, and site reviews.',
    app: 'WinFulltime is a PWA installable on mobile and desktop for a native-like experience with offline support.'
  },
  bettingMarkets: {
    '1x2': '1X2 betting: 1=Home Win, X=Draw, 2=Away Win. Picks shown with 65%+ probability.',
    'over/under': 'Over/Under betting on total goals. Over 1.5 (80%+ threshold) and Over 2.5 (60%+ threshold).',
    'btts': 'BTTS (Both Teams To Score). BTTS YES = both teams score. BTTS NO = one or neither score.',
    'corners': 'Corner predictions on Over 9.5 corners (10+ total).',
    'cards': 'Card predictions on Over 4.5 (top leagues) and Over 8.5 cards.',
    'unbeaten': 'Teams on winning/drawing streaks identified from head-to-head analysis.'
  },
  pages: {
    home: 'https://winfulltime.com',
    predictions: {
      '1x2': 'https://winfulltime.com/predictions/1x2.html',
      'over-2-5': 'https://winfulltime.com/predictions/over-2-5.html',
      'over-1-5': 'https://winfulltime.com/predictions/over-1-5.html',
      btts: 'https://winfulltime.com/predictions/btts.html',
      'btts-no': 'https://winfulltime.com/predictions/btts-no.html',
      corners: 'https://winfulltime.com/predictions/corners.html',
      cards: 'https://winfulltime.com/predictions/cards.html',
      unbeaten: 'https://winfulltime.com/predictions/unbeaten.html'
    },
    ticketBuilder: 'https://winfulltime.com/ticket-builder.html',
    blog: 'https://winfulltime.com/blog/',
    about: 'https://winfulltime.com/about.html',
    contact: 'https://winfulltime.com/contact.html',
    options: 'https://winfulltime.com/options.html'
  }
};

const faq = [
  { keywords: ['free', 'cost', 'price', 'pricing', 'pay', 'payment', 'subscription', 'vip'], response: knowledge.features.free },
  { keywords: ['contact', 'email', 'reach', 'message', 'support', 'help'], response: `Contact: ${knowledge.business.email} or visit ${knowledge.pages.contact}` },
  { keywords: ['about', 'what is', 'who are', 'tell me about', 'company'], response: knowledge.business.description },
  { keywords: ['prediction', 'tip', 'pick', 'bet'], response: knowledge.features.predictions },
  { keywords: ['league', 'leagues', 'competition', 'tournament', 'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1'], response: knowledge.features.leagues },
  { keywords: ['how', 'use', 'works', 'work', 'guide', 'start'], response: `To use WinFulltime:\n1. Visit ${knowledge.pages.home}\n2. Select a day tab (Today, Tomorrow)\n3. Choose a market category\n4. Browse predictions with confidence percentages\n5. Click any match for detailed analysis\n6. Try the Free Ticket Builder for accumulators` },
  { keywords: ['1x2', 'match result', 'home win', 'draw', 'away win'], response: knowledge.bettingMarkets['1x2'] },
  { keywords: ['over', 'under', 'goals', 'total goals', 'ou', 'over under'], response: knowledge.bettingMarkets['over/under'] },
  { keywords: ['btts', 'both teams', 'both teams to score', 'ots', 'one team'], response: knowledge.bettingMarkets['btts'] },
  { keywords: ['corner', 'corners'], response: knowledge.bettingMarkets['corners'] },
  { keywords: ['card', 'cards', 'yellow', 'red', 'booking'], response: knowledge.bettingMarkets['cards'] },
  { keywords: ['streak', 'winning', 'losing', 'draw streak', 'form', 'unbeaten'], response: knowledge.bettingMarkets['unbeaten'] },
  { keywords: ['ticket', 'builder', 'acca', 'accumulator', 'multi', 'parlay', 'generate', 'build'], response: knowledge.features.ticketBuilder },
  { keywords: ['blog', 'article', 'post', 'guide', 'strategy', 'educational', 'read'], response: knowledge.features.blog + '\n' + knowledge.pages.blog },
  { keywords: ['app', 'install', 'pwa', 'mobile', 'home screen', 'offline'], response: knowledge.features.app },
  { keywords: ['responsible', 'gamble', 'gambling', 'addict', 'problem', '18+'], response: 'WinFulltime promotes responsible gambling. All predictions are for informational purposes. Set limits, never chase losses, seek help at BeGambleAware.org if needed.' },
  { keywords: ['youtube', 'video', 'channel', 'subscribe'], response: `YouTube: ${knowledge.business.youtube} at ${knowledge.business.youtubeUrl}` },
  { keywords: ['register', 'sign up', 'signup', 'account', 'login', 'create', 'password'], response: 'WinFulltime is a paid membership. Create your account by choosing a plan and paying at /signup.html — your account is activated once payment is confirmed.' },
  { keywords: ['accuracy', 'accurate', 'reliable', 'confidence', 'probability', 'percentage'], response: knowledge.features.accuracy },
  { keywords: ['source', 'data', 'where', 'api', 'method', 'statistical', 'analysis'], response: knowledge.features.sources },
  { keywords: ['features', 'what do', 'offer', 'provide', 'services'], response: knowledge.features.predictions },
  { keywords: ['bet9ja', 'sportybet', '1xbet', 'betking', 'betway', 'melbet', '22bet'], response: `Visit ${knowledge.pages.options} for betting site comparisons and reviews across Africa.` },
  { keywords: ['what is', 'meaning', 'explain', 'define', 'definition', 'term'], response: 'I can explain betting terms like Asian Handicap, Expected Goals (xG), Kelly Criterion, Poisson Distribution, Value Betting, and more. Ask me about any specific term!' },
  { keywords: ['premier league', 'epl', 'english'], response: 'Premier League predictions available daily. Visit the homepage and filter by league. Also see our Premier League betting guide: /blog/premier-league-betting-guide.html' },
  { keywords: ['champions league', 'ucl', 'european cup'], response: 'Champions League predictions available on matchdays. Visit homepage and check the Champions League betting guide.' },
  { keywords: ['page', 'pages', 'site map', 'sections'], response: `WinFulltime has: Home (/), 1X2 (/predictions/1x2.html), Over 2.5 (/predictions/over-2-5.html), Over 1.5 (/predictions/over-1-5.html), BTTS (/predictions/btts.html), Corners (/predictions/corners.html), Cards (/predictions/cards.html), Unbeaten (/predictions/unbeaten.html), Ticket Builder (/ticket-builder.html), Blog (/blog/), About (/about.html), Contact (/contact.html), Betting Sites (/options.html)` }
];

function findBestResponse(message) {
  const msg = message.toLowerCase().trim();
  if (msg.length < 3) {
    return null;
  }
  const matched = [];
  for (const item of faq) {
    let score = 0;
    for (const kw of item.keywords) {
      if (msg.includes(kw)) score++;
    }
    if (score > 0) matched.push({ score, response: item.response });
  }
  matched.sort((a, b) => b.score - a.score);
  if (matched.length > 0 && matched[0].score >= 1) return matched[0].response;
  return null;
}

async function getChatResponse(message) {
  const faqResponse = findBestResponse(message);
  if (faqResponse) return { response: faqResponse, source: 'knowledge' };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'YOUR_NEW_API_KEY_HERE') {
    try {
      const axios = require('axios');
      const context = `You are the WinFulltime assistant for winfulltime.com, a free football prediction website.

SITE OVERVIEW:
- Name: WinFulltime (https://winfulltime.com)
- Free AI-powered football predictions, no registration needed
  - Contact: officialwinfulltime@gmail.com
- YouTube: @winfulltime

PREDICTION MARKETS:
- 1X2 (match winner), Over 2.5 Goals, Over 1.5 Goals
- BTTS YES, BTTS NO (Both Teams To Score / One Team To Score)
- Corners (Over 9.5), Cards (Over 4.5 / 8.5)
- Unbeaten Teams (winning/drawing streaks)

FEATURES:
- 50+ leagues, 750+ teams worldwide
- Free Accumulator Ticket Builder (target odds, leg filters, auto-generation)
- 180+ educational blog articles
- PWA installable as mobile app
- Daily predictions updated automatically

BLOG CATEGORIES:
- Betting Strategies (40+ articles: value betting, Kelly criterion, accumulators, bankroll)
- Market Guides (BTTS, Over/Under, Asian Handicap, Cards, Corners)
- League Guides (Premier League, La Liga, Serie A, Bundesliga)
- Analysis & Statistics (World Cup analysis, football stories, data)
- Betting Sites & Payments (reviews, deposit methods, Africa-focused)
- Guides & Education (beginners, glossary, odds explained)

KEY PAGES:
- Home: https://winfulltime.com
- Predictions: /predictions/1x2.html, /predictions/over-2-5.html, etc.
- Ticket Builder: /ticket-builder.html
- Blog: /blog/
- About: /about.html
- Betting Sites: /options.html

Answer concisely and helpfully. Give specific links to pages when relevant. Always promote responsible gambling. Be friendly and professional. Respond in the same language as the user's question.`;

      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        contents: [{ parts: [{ text: `${context}\n\nUser question: ${message}` }] }]
      }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { response: text, source: 'gemini' };
    } catch (e) {
      console.error('Gemini API error:', e.message);
    }
  }

  return {
    response: `I'm not sure about that. Try asking about predictions, the ticket builder, betting markets, leagues, or our blog. Visit ${knowledge.business.website} for more info.`,
    source: 'fallback'
  };
}

module.exports = { getChatResponse, knowledge };
