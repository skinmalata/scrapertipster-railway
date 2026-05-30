const knowledge = {
  business: {
    name: 'WinFulltime',
    tagline: 'Free AI Football Predictions',
    description: 'WinFulltime is a free football prediction website that provides AI-driven betting tips across major global football leagues. We combine cutting-edge analytics with comprehensive statistical analysis to deliver accurate predictions.',
    founded: '2026',
    email: 'mesigotochukwu@gmail.com',
    website: 'https://winfulltime.com',
    youtube: '@winfulltime',
    youtubeUrl: 'https://www.youtube.com/@winfulltime/videos'
  },
  features: {
    free: 'WinFulltime is completely free. No registration required. No hidden fees.',
    predictions: 'We provide daily football predictions including: 1X2 (match result), Over 1.5 Goals, Over 2.5 Goals, BTTS YES (Both Teams To Score), BTTS NO, Winning Streaks, Losing Streaks, Draw Streaks, Team to Score, Team to Score 2+, Corners, and Cards predictions.',
    leagues: 'We cover 50+ leagues worldwide including: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Eredivisie, Primeira Liga, Belgian Pro League, Brazilian Serie A, Argentine League, MLS, Liga MX, Saudi Pro League, and many more - covering over 750 teams.',
    sources: 'Our predictions are powered by data from trusted sources including Statarea, BetExplorer, and Apwin, combined with our own statistical analysis.',
    accuracy: 'Our predictions use probability thresholds to identify the strongest picks. Each prediction shows its confidence percentage so you can make informed decisions.'
  },
  howToUse: {
    steps: [
      'Visit the homepage at winfulltime.com',
      'Select a day using the day tabs (Today, Tomorrow, etc.)',
      'Choose your market category: 1X2, Over 1.5, Over 2.5, BTTS YES, BTTS NO',
      'Browse the predictions - each shows the match, prediction, and confidence probability',
      'Click on any match for detailed analysis including head-to-head stats and form guides'
    ],
    tips: 'All our predictions are for informational and educational purposes. Always gamble responsibly. You must be 18+ to use betting tips.'
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
  blog: {
    description: 'Our blog features 180+ articles on betting strategies, league guides, market explanations, and analysis. Topics include: value betting, bankroll management, Asian handicap, accumulator strategies, Kelly criterion, Poisson distribution, and much more.',
    url: 'https://winfulltime.com/blog/'
  },
  responsible: {
    message: 'WinFulltime promotes responsible gambling. All predictions are for informational purposes only. We recommend: setting betting limits, never chasing losses, treating betting as entertainment, and seeking help if gambling becomes a problem.',
    helplines: 'If you or someone you know has a gambling problem, help is available through organizations like BeGambleAware.org and Gambling Therapy.'
  },
  contact: {
    email: 'mesigotochukwu@gmail.com',
    website: 'https://winfulltime.com/contact.html',
    about: 'https://winfulltime.com/about.html',
    social: 'Follow WinFulltime on YouTube at @winfulltime for video content.'
  },
  pricing: 'WinFulltime is 100% free. All predictions, analysis, blog content, and features are accessible without any payment or registration.'
};

const faq = [
  { keywords: ['free', 'cost', 'price', 'pricing', 'pay', 'payment', 'subscription', 'vip'], response: knowledge.pricing },
  { keywords: ['contact', 'email', 'reach', 'message', 'support', 'help'], response: `You can reach us at ${knowledge.contact.email} or visit our contact page: ${knowledge.contact.website}` },
  { keywords: ['about', 'what is', 'who are', 'tell me about', 'company'], response: knowledge.business.description },
  { keywords: ['prediction', 'tip', 'pick', 'bet'], response: knowledge.features.predictions },
  { keywords: ['league', 'leagues', 'competition', 'tournament'], response: knowledge.features.leagues },
  { keywords: ['how', 'use', 'works', 'work', 'guide', 'start'], response: `Using WinFulltime is easy:\n${knowledge.howToUse.steps.map((s, i) => `${i+1}. ${s}`).join('\n')}` },
  { keywords: ['1x2', 'match result', 'home win', 'draw', 'away win'], response: knowledge.bettingMarkets['1x2'] },
  { keywords: ['over', 'under', 'goals', 'total goals', 'ou', 'over under'], response: knowledge.bettingMarkets['over/under'] },
  { keywords: ['btts', 'both teams', 'both teams to score', 'ots', 'one team'], response: knowledge.bettingMarkets['btts'] },
  { keywords: ['streak', 'winning', 'losing', 'draw streak', 'form'], response: knowledge.bettingMarkets['streaks'] },
  { keywords: ['corner', 'corners'], response: knowledge.bettingMarkets['corners'] },
  { keywords: ['card', 'cards', 'yellow', 'red'], response: knowledge.bettingMarkets['cards'] },
  { keywords: ['team to score', 'score 2', 'scoring'], response: knowledge.bettingMarkets['team to score'] },
  { keywords: ['blog', 'article', 'post', 'guide', 'strategy', 'educational'], response: knowledge.blog.description },
  { keywords: ['responsible', 'gamble', 'gambling', 'addict', 'problem', '18+'], response: knowledge.responsible.message },
  { keywords: ['league', 'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'champions league', 'eredivisie'], response: knowledge.features.leagues },
  { keywords: ['accuracy', 'accurate', 'reliable', 'confidence', 'probability', 'percentage'], response: knowledge.features.accuracy },
  { keywords: ['source', 'data', 'where', 'api', 'statarea', 'betexplorer', 'apwin'], response: knowledge.features.sources },
  { keywords: ['youtube', 'video', 'channel'], response: `Check out our YouTube channel ${knowledge.business.youtube} at ${knowledge.business.youtubeUrl} for video predictions and analysis.` },
  { keywords: ['register', 'sign up', 'signup', 'account', 'login', 'create'], response: 'No registration needed! WinFulltime is completely free and accessible to everyone without creating an account.' }
];

function findBestResponse(message) {
  const msg = message.toLowerCase().trim();

  if (msg.length < 3) {
    return 'Hi! I\'m the WinFulltime assistant. Ask me anything about our football predictions, how to use the site, our betting markets, or contact information.';
  }

  const matched = [];
  for (const item of faq) {
    let score = 0;
    for (const kw of item.keywords) {
      if (msg.includes(kw)) {
        score++;
      }
    }
    if (score > 0) {
      matched.push({ score, response: item.response });
    }
  }

  matched.sort((a, b) => b.score - a.score);

  if (matched.length > 0 && matched[0].score >= 1) {
    return matched[0].response;
  }

  return null;
}

async function getChatResponse(message) {
  const faqResponse = findBestResponse(message);
  if (faqResponse) {
    return { response: faqResponse, source: 'knowledge' };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'YOUR_NEW_API_KEY_HERE') {
    try {
      const axios = require('axios');
      const businessContext = `You are a helpful assistant for WinFulltime, a free football prediction website. 
Key info:
- Business: WinFulltime provides free AI-driven football predictions
- Website: https://winfulltime.com
- Contact: mesigotochukwu@gmail.com
- Features: Daily predictions for 1X2, Over/Under, BTTS, streaks, corners, cards
- Coverage: 50+ leagues, 750+ teams worldwide
- Pricing: Completely free, no registration needed
- Blog: 180+ articles on betting strategies and analysis
- YouTube: @winfulltime

Answer questions concisely and helpfully. Be friendly but professional. Always promote responsible gambling.`;

      const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        contents: [{
          parts: [{ text: `${businessContext}\n\nUser question: ${message}` }]
        }]
      }, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { response: text, source: 'gemini' };
      }
    } catch (e) {
      console.error('Gemini API error:', e.message);
    }
  }

  return {
    response: `I'm not sure about that. Try asking about:
• Free football predictions
• Betting markets (1X2, BTTS, Over/Under)
• How to use the site
• Leagues we cover
• Contact information
• Our blog and guides

Or visit ${knowledge.business.website} for more info.`,
    source: 'fallback'
  };
}

module.exports = { getChatResponse, knowledge };
