const knowledge = {
  business: {
    name: 'WinFulltime',
    tagline: 'AI Football Predictions',
    description: 'WinFulltime provides data-driven football predictions and expert betting analysis across 50+ global leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League and more) covering 750+ teams. It is a freemium platform: everyone can create a free account, and a Pro subscription unlocks every prediction category with full analysis.',
    founded: '2026',
    email: 'officialwinfulltime@gmail.com',
    website: 'https://winfulltime.com',
    youtube: '@winfulltime',
    youtubeUrl: 'https://www.youtube.com/@winfulltime/videos'
  },
  plans: {
    free: 'There is a Free plan ($0, forever). Free members get sample predictions from each category, live scores and basic in-play tips, plus daily match results and form stats. Create it free at /signup.html — no payment needed.',
    proMonthly: 'Pro Monthly is $20/month. It unlocks every prediction category (1X2, Over/Under, BTTS, Corners, Cards, streaks and more), daily Best Picks & H2H Picks, golden in-play tips and live opportunities, full win/loss/draw streak analysis, and priority support.',
    proYearly: 'Pro Yearly is $150/year (save 37%). It includes everything in Pro Monthly.',
    billing: 'Payments are processed securely through Whop. Subscriptions auto-renew unless cancelled. You can upgrade or downgrade at any time (changes apply from the next billing cycle). All plans come with a 7-day money-back guarantee. See /pricing.html.'
  },
  features: {
    free: 'WinFulltime has a Free plan ($0 forever) and paid Pro plans. Subscribe at /pricing.html and pay at /signup.html. After payment is confirmed your Pro access is activated automatically.',
    predictions: 'Daily predictions: 1X2 (match result), Over 1.5 Goals (80%+ threshold), Over 2.5 Goals (60%+ threshold), BTTS YES, BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Corners (Over 9.5), Cards (Over 4.5/8.5), and Unbeaten Teams. Most categories are fully unlocked on the Pro plan.',
    bestPicks: 'Daily Best Picks and H2H Picks are curated selections available to Pro members. H2H Picks are head-to-head based selections — see /author-picks.html and /best-picks.html.',
    inPlay: 'Live scores are available to everyone. Golden in-play tips and live opportunities are a Pro feature — see /predictions/in-play.',
    leagues: '50+ leagues: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, Turkish Super Lig, Championship, and 35+ more.',
    sources: 'Statistical analysis combining team form data, head-to-head records, and league-wide performance metrics.',
    accuracy: 'Each prediction shows a confidence percentage (e.g., 72%). Higher confidence typically means lower odds but more consistency.',
    ticketBuilder: 'Free accumulator ticket builder — completely free for every user, no sign-up or subscription. Set target odds, min/max leg odds, and markets to generate optimized multi-leg tickets with up to 30 legs and 500 combined odds. Visit /ticket-builder.html',
    converter: 'Free booking code converter for SportyBet, Bet9ja, MSport, Betway, Bangbet and BetKing. Paste a booking code to decode it, preview every selection, market and odds, and convert it into a fresh code for another site. Visit /converter.html',
    analysis: 'Match analysis pages include team form, last-10 stats, head-to-head records and a summary for every fixture — plus league and team pages. See /analysis.html.',
    blog: '350+ articles on betting strategies, market guides, league analysis, betting education, and betting site reviews.',
    app: 'WinFulltime is a PWA installable on mobile and desktop for a native-like experience with offline support.'
  },
  bettingMarkets: {
    '1x2': '1X2 betting: 1=Home Win, X=Draw, 2=Away Win. Picks shown with 65%+ probability.',
    'over/under': 'Over/Under betting on total goals. Over 1.5 (80%+ threshold) and Over 2.5 (60%+ threshold).',
    'btts': 'BTTS (Both Teams To Score). BTTS YES = both teams score. BTTS NO = one or neither score (also called OTS).',
    'corners': 'Corner predictions on Over 9.5 corners (10+ total).',
    'cards': 'Card predictions on Over 4.5 (top leagues) and Over 8.5 cards.',
    'unbeaten': 'Teams on winning/drawing streaks identified from head-to-head analysis.',
    'streaks': 'Winning, Losing and Draw streak predictions track teams on sustained runs of form.'
  },
  bookmakers: {
    featured: 'Featured bookmakers: 1xBet, 1win and Stake. Review and compare betting sites, welcome offers and payments for Nigeria, Kenya, Ghana and more at /options.html. Links on the site are affiliate links — WinFulltime may earn a commission if you sign up, at no extra cost to you. 18+.',
    review: 'In-depth, impartial bookmaker reviews are available on the blog, e.g. /blog/1xbet-review.html and the 1win reviews for Nigeria, Kenya and India.'
  },
  pages: {
    home: 'https://winfulltime.com',
    pricing: 'https://winfulltime.com/pricing.html',
    signup: 'https://winfulltime.com/signup.html',
    login: 'https://winfulltime.com/login.html',
    account: 'https://winfulltime.com/account.html',
    predictions: {
      '1x2': 'https://winfulltime.com/predictions/1x2.html',
      'over-2-5': 'https://winfulltime.com/predictions/over-2-5.html',
      'over-1-5': 'https://winfulltime.com/predictions/over-1-5.html',
      btts: 'https://winfulltime.com/predictions/btts.html',
      'btts-no': 'https://winfulltime.com/predictions/btts-no.html',
      corners: 'https://winfulltime.com/predictions/corners.html',
      cards: 'https://winfulltime.com/predictions/cards.html',
      unbeaten: 'https://winfulltime.com/predictions/unbeaten.html',
      'winning-streak': 'https://winfulltime.com/predictions/winning-streak.html',
      'losing-streak': 'https://winfulltime.com/predictions/losing-streak.html',
      'draw-streak': 'https://winfulltime.com/predictions/draw-streak.html'
    },
    ticketBuilder: 'https://winfulltime.com/ticket-builder.html',
    converter: 'https://winfulltime.com/converter.html',
    inPlay: 'https://winfulltime.com/predictions/in-play',
    bestPicks: 'https://winfulltime.com/best-picks.html',
    h2hPicks: 'https://winfulltime.com/author-picks.html',
    analysis: 'https://winfulltime.com/analysis.html',
    blog: 'https://winfulltime.com/blog/',
    about: 'https://winfulltime.com/about.html',
    contact: 'https://winfulltime.com/contact.html',
    options: 'https://winfulltime.com/options.html'
  }
};

const faq = [
  { keywords: ['free', 'cost', 'price', 'pricing', 'pay', 'payment', 'vip', 'plan', 'plans', 'how much', 'subscribe', 'billing', 'membership', 'pro monthly', 'pro yearly', 'pro'], response: `WinFulltime is freemium:\n\n- Free plan: $0 forever — sample predictions from each category, live scores and basic in-play tips, daily match results and form stats.\n- Pro Monthly: $20/month — every prediction category unlocked, daily Best Picks & H2H Picks, golden in-play tips and live opportunities, full streak analysis, priority support.\n- Pro Yearly: $150/year (save 37%).\n\nPayments go through Whop, subscriptions auto-renew unless cancelled, and all plans have a 7-day money-back guarantee.\n\n${knowledge.pages.pricing}` },
  { keywords: ['refund', 'money back', 'guarantee', 'cancel', 'unsubscribe', 'cancel subscription', 'switch plans', 'upgrade', 'downgrade', 'subscription', 'renew'], response: knowledge.plans.billing },
  { keywords: ['whop', 'checkout', 'payment method', 'payments', 'payment', 'payments work', 'how do payments', 'card payment', 'paystack', 'flutterwave'], response: 'Payments are processed securely through Whop. Subscriptions auto-renew unless cancelled, changes apply from the next billing cycle, and a 7-day money-back guarantee covers all plans. See /pricing.html for details.' },
  { keywords: ['contact', 'email', 'reach', 'message', 'support', 'help'], response: `Contact: ${knowledge.business.email} or visit ${knowledge.pages.contact}` },
  { keywords: ['what is winfulltime', 'who are', 'tell me about', 'company', 'about us', 'organization', 'who is'], response: knowledge.business.description },
  { keywords: ['prediction', 'tip', 'pick', 'bet', 'picks'], response: knowledge.features.predictions },
  { keywords: ['league', 'leagues', 'competition', 'tournament'], response: knowledge.features.leagues },
  { keywords: ['how', 'use', 'works', 'work', 'guide', 'start', 'get started'], response: `To use WinFulltime:\n1. Visit ${knowledge.pages.home}\n2. Create a free account at ${knowledge.pages.signup} (or browse the Free plan)\n3. Select a day tab (Today, Tomorrow)\n4. Choose a market category\n5. Browse predictions with confidence percentages\n6. Upgrade to Pro at ${knowledge.pages.pricing} to unlock every category\n7. Try the free Ticket Builder for accumulators\n8. Use the free booking code converter at ${knowledge.pages.converter}` },
  { keywords: ['1x2', '1 x 2', 'match result', 'home win', 'draw', 'away win', 'win draw win'], response: knowledge.bettingMarkets['1x2'] },
  { keywords: ['over', 'under', 'goals', 'total goals', 'over under'], response: knowledge.bettingMarkets['over/under'] },
  { keywords: ['btts', 'both teams', 'both teams to score', 'ots', 'one team'], response: knowledge.bettingMarkets['btts'] },
  { keywords: ['corner', 'corners'], response: knowledge.bettingMarkets['corners'] },
  { keywords: ['card', 'cards', 'yellow', 'red', 'booking point'], response: knowledge.bettingMarkets['cards'] },
  { keywords: ['streak', 'winning', 'losing', 'draw streak', 'form', 'unbeaten'], response: knowledge.bettingMarkets['unbeaten'] + ' ' + knowledge.bettingMarkets['streaks'] },
  { keywords: ['ticket', 'builder', 'acca', 'accumulator', 'multi', 'parlay', 'generate', 'build', 'combined odds', 'leg'], response: knowledge.features.ticketBuilder },
  { keywords: ['converter', 'booking code', 'decode', 'transfer code', 'code convert', 'sportybet code', 'bet9ja code', 'msport', 'betking', 'bangbet', 'betway code'], response: knowledge.features.converter },
  { keywords: ['best picks', 'h2h', 'head to head', 'author picks', '2 odds', 'two odds of the day'], response: 'H2H (head-to-head) picks are selections based on direct match history between two teams. Daily Best Picks and H2H Picks are curated selections available to Pro members — see /author-picks.html and /best-picks.html.' },
  { keywords: ['in play', 'in-play', 'inplay', 'live', 'golden', 'watch', 'live scores', 'live betting', 'live odds'], response: knowledge.features.inPlay },
  { keywords: ['analysis', 'stats', 'statistics', 'form', 'h2h', 'teams', 'team form', 'predictions analysis', 'match analysis'], response: knowledge.features.analysis },
  { keywords: ['blog', 'article', 'post', 'guide', 'strategy', 'educational', 'read'], response: knowledge.features.blog + '\n' + knowledge.pages.blog },
  { keywords: ['app', 'install', 'pwa', 'mobile', 'home screen', 'offline'], response: knowledge.features.app },
  { keywords: ['responsible', 'gamble', 'gambling', 'addict', 'problem', 'limits', '18 only', 'over 18'], response: 'WinFulltime promotes responsible gambling. All predictions are for informational purposes. Set limits, never chase losses, and seek help at BeGambleAware.org if needed. You must be 18+ to bet.' },
  { keywords: ['youtube', 'video', 'channel', 'subscribe'], response: `YouTube: ${knowledge.business.youtube} at ${knowledge.business.youtubeUrl}` },
  { keywords: ['register', 'sign up', 'signup', 'account', 'create', 'sign in', 'login', 'password', 'forgot'], response: 'Creating an account is free at /signup.html — no payment needed. Login at /login.html (or reset your password if you forgot it). Free accounts get the Free plan by default; upgrade to Pro at any time from /pricing.html or your account page.' },
  { keywords: ['accuracy', 'accurate', 'reliable', 'confidence', 'probability', 'percentage'], response: knowledge.features.accuracy },
  { keywords: ['source', 'data', 'where', 'api', 'method', 'statistical', 'analysis', 'algorithm'], response: knowledge.features.sources },
  { keywords: ['features', 'offer', 'provide', 'services', 'what can'], response: `WinFulltime offers:\n- Daily predictions (1X2, Over/Under, BTTS, Corners, Cards, streaks) with confidence scores\n- Match, team and head-to-head analysis\n- A free Ticket Builder (up to 30 legs / 500 combined odds)\n- A free booking code converter (SportyBet, Bet9ja, MSport, Betway, Bangbet, BetKing)\n- Daily Best Picks & H2H Picks (Pro)\n- Golden in-play tips and live opportunities (Pro)\n- 350+ educational blog articles\n- Betting site comparisons and reviews\n- A PWA app installable on mobile and desktop` },
  { keywords: ['bet9ja', 'sportybet', '1xbet', 'betking', 'betway', 'melbet', '22bet', 'bet365', 'bangbet'], response: `${knowledge.bookmakers.featured}\n\nRead in-depth reviews on the blog, e.g. /blog/1xbet-review.html, /blog/1win-review-nigeria.html and /blog/best-betting-sites-nigeria.html.` },
  { keywords: ['bookmaker', 'bookmakers', 'betting sites', 'compare', 'affiliate', 'featured', 'options', '1win', 'stake', '1x bet'], response: knowledge.bookmakers.featured },
  { keywords: ['what is', 'meaning', 'explain', 'define', 'definition', 'term', 'glossary'], response: 'I can explain betting terms like Asian Handicap, Expected Goals (xG), Kelly Criterion, Poisson Distribution, Value Betting, double chance, booking codes and more. Ask me about any specific term!', explainer: true },
  { keywords: ['premier league', 'epl', 'english'], response: 'Premier League predictions are available daily. Visit the homepage and filter by league, or read the guide at /blog/premier-league-betting-guide.html.' },
  { keywords: ['champions league', 'ucl', 'european cup'], response: 'Champions League predictions are available on matchdays. Visit the homepage and filter by league, or read the guide at /blog/champions-league-betting-guide.html.' },
  { keywords: ['page', 'pages', 'site map', 'sections', 'navigation', 'where'], response: `WinFulltime main pages:\n- Home: /\n- Predictions: 1X2, Over 2.5, Over 1.5, BTTS, BTTS NO, Corners, Cards, Unbeaten, Winning/Losing/Draw Streaks (/predictions/*)\n- In-Play: ${knowledge.pages.inPlay}\n- Ticket Builder: ${knowledge.pages.ticketBuilder}\n- Code Converter: ${knowledge.pages.converter}\n- Best Picks: ${knowledge.pages.bestPicks}\n- H2H Picks: ${knowledge.pages.h2hPicks}\n- Analysis: ${knowledge.pages.analysis}\n- Pricing: ${knowledge.pages.pricing}\n- Blog: ${knowledge.pages.blog}\n- Betting Sites: ${knowledge.pages.options}\n- About / Contact / Privacy / Terms` }
];

function escapeRegex(str) {
  return str.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function findBestResponse(message) {
  const msg = String(message || '').toLowerCase().trim();

  const greeting = /^(hi|hi there|hello|hey|howdy|good morning|good afternoon|good evening|yo|greetings)[\s!.,]*$/.test(msg);
  if (greeting) {
    return `Hi! I'm the WinFulltime assistant. Ask me about today's predictions, plans and pricing, the free Ticket Builder, the booking code converter, leagues and markets, in-play tips, betting sites we review, or any betting term.` +
      ` You can also visit ${knowledge.business.website}.`;
  }

  if (msg.length < 3) return null;

  const tokens = msg.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 1; });
  const matches = [];

  for (let i = 0; i < faq.length; i++) {
    const item = faq[i];
    if (item.explainer) continue;
    let score = 0;
    let hits = 0;

    for (const raw of item.keywords) {
      const kw = String(raw).toLowerCase().trim();
      if (!kw) continue;
      let add = 0;

      if (kw.indexOf(' ') !== -1) {
        if (msg.includes(kw)) add = kw.length + 4;
      } else if (/[^a-z0-9]/.test(kw)) {
        if (msg.includes(kw)) add = kw.length + 2;
      } else if (kw.length <= 2) {
        if (tokens.includes(kw)) add = 4;
      } else {
        const re = new RegExp('\\b' + escapeRegex(kw) + '\\b', 'i');
        if (re.test(msg)) add = kw.length + 2;
      }

      if (add > 0) {
        score += add;
        hits++;
      }
    }

    if (hits > 0) matches.push({ score: score, hits: hits, order: i, response: item.response });
  }

  matches.sort(function (a, b) {
    return (b.score - a.score) || (b.hits - a.hits) || (a.order - b.order);
  });

  if (matches.length > 0 && matches[0].score >= 1) return matches[0].response;

  const explainer = faq.find(function (item) { return item.explainer; });
  if (explainer && /^(what is|whats|what are|what does|what do|explain|define|meaning of|what do you mean)[\w\s]*\?*$/.test(msg)) {
    return explainer.response;
  }

  return null;
}

async function getChatResponse(message) {
  const faqResponse = findBestResponse(message);
  if (faqResponse) return { response: faqResponse, source: 'knowledge' };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'YOUR_NEW_API_KEY_HERE') {
    try {
      const axios = require('axios');
      const context = `You are the WinFulltime assistant for winfulltime.com, a football predictions and betting-analysis website.

SITE OVERVIEW:
- Name: WinFulltime (https://winfulltime.com)
- Data-driven football predictions and expert analysis across 50+ leagues and 750+ teams
- Freemium model: free account + optional Pro subscription
- Contact: officialwinfulltime@gmail.com
- YouTube: @winfulltime

PLANS:
- Free: $0 forever — sample predictions per category, live scores and basic in-play tips, daily match results and form stats
- Pro Monthly: $20/month — every prediction category unlocked, daily Best Picks & H2H Picks, golden in-play tips and live opportunities, full win/loss/draw streak analysis, priority support
- Pro Yearly: $150/year (save 37%)
- Payments via Whop, auto-renew unless cancelled, upgrade/downgrade anytime, 7-day money-back guarantee. See /pricing.html

PREDICTION MARKETS:
- 1X2 (match winner), Over 2.5 Goals, Over 1.5 Goals
- BTTS YES, BTTS NO (Both Teams To Score / One Team To Score)
- Corners (Over 9.5), Cards (Over 4.5 / 8.5)
- Winning / Losing / Draw streak predictions, Unbeaten Teams

FREE TOOLS:
- Accumulator Ticket Builder: completely free, no sign-up, up to 30 legs and 500 combined odds (/ticket-builder.html)
- Booking code converter for SportyBet, Bet9ja, MSport, Betway, Bangbet and BetKing (/converter.html)

FEATURES:
- 50+ leagues, 750+ teams worldwide
- Daily Best Picks & H2H Picks (Pro), golden in-play tips (Pro), live scores (free)
- Match, team and head-to-head analysis
- 350+ educational blog articles
- PWA installable as mobile app
- Betting site comparisons and reviews (1xBet, 1win, Stake and more) at /options.html
- Affiliate disclosure applies: links to bookmakers are affiliate links

KEY PAGES:
- Home: https://winfulltime.com
- Pricing: /pricing.html, Signup: /signup.html, Login: /login.html
- Predictions: /predictions/1x2.html, /predictions/over-2-5.html, etc.
- Ticket Builder: /ticket-builder.html
- Code Converter: /converter.html
- In-Play: /predictions/in-play
- Blog: /blog/ | Analysis: /analysis.html | Betting Sites: /options.html

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
    response: `I'm not sure about that. Try asking about:\n- Today's predictions (1X2, Over 2.5, BTTS, Corners, Cards)\n- Plans and pricing (Free vs Pro)\n- The free Ticket Builder or booking code converter\n- Leagues and markets you can follow\n- In-play tips, Best Picks or H2H Picks\n- Betting sites we review\n- The blog or betting terms\n\nOr visit ${knowledge.business.website} for more info.`,
    source: 'fallback'
  };
}

module.exports = { getChatResponse, knowledge };