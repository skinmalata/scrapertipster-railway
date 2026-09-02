const fs = require('fs');
const path = require('path');
const { buildLeagueLabelBySlug, readableLeagueLabel, formatDateChips } = require('./league-labels');
const { CHIPS_CSS, chipsSection, faqBlock, renderHead, collectionPageSchema, generateFaqSchema } = require('./lib/seo-blocks');

const AFFILIATE_URL = 'https://one-vv6198.com/betting?open=register&p=f61e';

const FAQ_SCHEMA = {
  '1x2': [
    { q: 'What does 1X2 mean in football betting?', a: '1X2 is the standard match result market. 1 means the home team wins, X means the match ends in a draw, and 2 means the away team wins. It covers the three possible outcomes after 90 minutes of regulation time including stoppage time.' },
    { q: 'How accurate are WinFulltime 1X2 predictions?', a: 'Our statistical model analyzes team form, head-to-head records, home/away performance, and league context to assign a probability percentage to each outcome. No system guarantees wins, but probability scores help you assess risk. Higher percentages indicate stronger confidence picks.' },
    { q: 'Do 1X2 predictions include extra time?', a: 'No. All 1X2 predictions cover only the 90-minute regulation result plus stoppage time. Extra time and penalty shootouts are excluded from this market.' },
    { q: 'How often are 1X2 predictions updated?', a: 'Predictions are refreshed daily. The primary update runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT captures late-appearing fixtures across 50+ leagues worldwide.' },
    { q: 'Can I use 1X2 picks in accumulators?', a: 'Yes. 1X2 picks are the most common accumulator legs. Use our Ticket Builder to automatically combine 1X2 picks with Over 2.5, BTTS, and other markets for optimized tickets.' },
    { q: 'Which leagues do 1X2 predictions cover?', a: 'WinFulltime covers 50+ leagues including the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, and second divisions across South America, Africa, and Asia.' }
  ],
  'over-1-5': [
    { q: 'What does Over 1.5 goals mean?', a: 'Over 1.5 means you predict the total goals scored by both teams combined will be 2 or more. Scores of 1-1, 2-0, 0-2, 2-1, or higher win the bet. Scores of 0-0, 1-0, or 0-1 lose.' },
    { q: 'How often do matches go over 1.5 goals?', a: 'Globally, roughly 70-75% of professional football matches produce 2 or more goals. The rate varies by league — the Eredivisie and Bundesliga tend higher, while Ligue 1 and Serie A tend lower.' },
    { q: 'Is Over 1.5 a good accumulator leg?', a: 'Yes. Over 1.5 is one of the most popular accumulator legs due to its high strike rate. It adds a safety buffer while contributing to overall odds. Use our Ticket Builder to combine Over 1.5 picks with other markets.' },
    { q: 'How do Over 1.5 predictions differ from Over 2.5?', a: 'Over 1.5 requires 2+ goals while Over 2.5 requires 3+. Over 1.5 has a higher hit rate but shorter odds. Many bettors use Over 1.5 as a foundation leg in accumulators because of its reliability.' },
    { q: 'Do Over 1.5 predictions include own goals?', a: 'Yes. Own goals count toward the total in all goal-based markets including Over 1.5. Any goal scored by either team counts.' },
    { q: 'How are Over 1.5 predictions generated?', a: 'Our statistical model evaluates average goals per game, attack vs defense matchups, both teams\' scoring records, historical over 1.5 rates, and home/away scoring patterns. Picks with 80%+ probability are the strongest.' }
  ],
  'over-2-5': [
    { q: 'What does Over 2.5 goals mean?', a: 'Over 2.5 means the total goals scored by both teams must be 3 or more. Scores like 2-1, 3-0, 1-2, 2-2, or higher win. Scores of 0-0, 1-0, 0-1, or 1-1 lose.' },
    { q: 'How often do matches go over 2.5 goals?', a: 'Approximately 50-55% of professional football matches produce 3 or more goals. The rate varies significantly by league — the Eredivisie and Bundesliga consistently produce the highest Over 2.5 rates.' },
    { q: 'Is Over 2.5 the best goal market for accumulators?', a: 'Over 2.5 is the sweet spot for most bettors — it offers a good balance of odds (typically 1.70-2.10) and probability. Combined with 1X2 picks, it creates well-rounded accumulator tickets.' },
    { q: 'How do Over 2.5 predictions work?', a: 'Our model analyzes attacking strength, defensive vulnerability, head-to-head goal history, recent scoring form, and match context. Matches with probabilities above 70% are flagged as strong Over 2.5 candidates.' },
    { q: 'Which leagues produce the most Over 2.5 results?', a: 'The Eredivisie (Netherlands), Bundesliga (Germany), and Swiss Super League consistently produce the highest Over 2.5 rates. The Premier League and La Liga also tend to have above-average goal totals.' },
    { q: 'When are Over 2.5 predictions updated?', a: 'Predictions refresh daily at 1:00 AM WAT with a secondary update at 6:00 AM WAT to catch late-appearing fixtures. Coverage spans 50+ leagues worldwide.' }
  ],
  'btts': [
    { q: 'What does BTTS mean in football betting?', a: 'BTTS stands for Both Teams To Score. A BTTS Yes bet wins if both teams score at least one goal during the 90 minutes of regulation time. It does not matter which team wins or loses.' },
    { q: 'How often does BTTS land?', a: 'BTTS Yes occurs in roughly 50-55% of professional football matches globally. The rate is higher in attacking leagues like the Eredivisie and Bundesliga where teams play more open football.' },
    { q: 'Do own goals count for BTTS?', a: 'Yes. Any goal scored by either team, including own goals, counts toward the BTTS outcome. If both teams have at least one goal on the scoreboard, BTTS Yes wins.' },
    { q: 'What makes a good BTTS match?', a: 'Strong BTTS candidates feature two teams with good attacking records and questionable defenses. Matches between mid-table teams with leaky backlines are ideal. One-sided mismatches are less likely to produce BTTS.' },
    { q: 'Is BTTS good for accumulators?', a: 'Yes. BTTS picks typically offer odds between 1.70 and 2.00, making them solid accumulator legs. Combining BTTS with Over 2.5 and 1X2 creates balanced tickets with good returns.' },
    { q: 'What is the difference between BTTS Yes and BTTS No?', a: 'BTTS Yes wins when both teams score. BTTS No wins when at least one team fails to score. They are complementary markets — we publish both so you can match the right pick to each fixture.' }
  ],
  'btts-no': [
    { q: 'What does BTTS No mean?', a: 'BTTS No means you are betting that at least one team will not score in the match. Winning scorelines include 1-0, 0-1, 2-0, 0-2, 3-0, and 0-0. Any result where both teams score loses.' },
    { q: 'When is BTTS No most likely?', a: 'BTTS No is most likely when a strong defensive team hosts a weak attacking team, or in matches with low historical goal totals. Our predictions highlight the highest-confidence BTTS No fixtures daily.' },
    { q: 'Does a 0-0 draw win BTTS No?', a: 'Yes. A 0-0 result means neither team scored, which satisfies the BTTS No condition. Any clean sheet — whether 0-0, 1-0, or 2-0 — wins a BTTS No bet.' },
    { q: 'How does BTTS No differ from Under 2.5?', a: 'BTTS No only requires one team to fail to score (a 2-0 wins). Under 2.5 requires fewer than 3 total goals (a 1-1 wins). They overlap but are not the same market.' },
    { q: 'What teams are good BTTS No candidates?', a: 'Teams with 10+ clean sheets in a season, strong goalkeepers, and defensive tactical setups are prime BTTS No picks. Teams that struggle to score away from home also increase BTTS No probability.' },
    { q: 'Can I combine BTTS No with other markets?', a: 'Yes. BTTS No pairs well with Under 2.5 goals and 1X2 bets where a clean sheet is expected. Use our Ticket Builder to combine BTTS No with other markets for balanced accumulators.' }
  ],
  'unbeaten': [
    { q: 'What counts as an unbeaten streak?', a: 'An unbeaten streak is a sequence of consecutive matches in which a team has not lost. This includes wins and draws. A streak ends when the team suffers a defeat. We track streaks of 5 or more games across all competitions.' },
    { q: 'How is an unbeaten streak different from a win streak?', a: 'A win streak only counts consecutive victories, while an unbeaten streak includes draws. A team can be unbeaten in 10 games but have drawn 4 of them. Unbeaten streaks are a broader measure of consistency.' },
    { q: 'Why do unbeaten streaks matter for betting?', a: 'Teams on long unbeaten runs signal tactical consistency and psychological confidence. Mid-table teams with quiet 8-12 game unbeaten runs often offer value odds. Unbeaten streaks help identify form that bookmakers may undervalue.' },
    { q: 'Can I combine unbeaten streaks with other markets?', a: 'Yes. Unbeaten streak data works well alongside 1X2 tips and Over 1.5 goals in accumulators. Teams on long unbeaten runs are statistically more likely to avoid defeat, making them strong double-chance or draw-no-bet picks.' },
    { q: 'How do I read the unbeaten streak badges?', a: 'Each match card shows the fixture, kick-off time, league, and streak badges. A badge reading "8 unbeaten" means the team has not lost in their last 8 matches. Some entries show "home" or "away" to indicate the streak applies to specific venues only.' },
    { q: 'When is unbeaten streak data updated?', a: 'Data updates daily. The primary update runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT ensures late results and newly scheduled fixtures are captured across dozens of leagues worldwide.' }
  ],
  'corners': [
    { q: 'What do corner predictions cover?', a: 'Our corner predictions identify matches likely to have a high number of corners. We track Over 8.5 and Over 9.5 corner markets, using historical corner data to find matches with the strongest corner trends.' },
    { q: 'How are corner predictions calculated?', a: 'Each prediction is based on historical corner statistics. We only show matches where the hit rate exceeds 80%, meaning the Over 8.5 or Over 9.5 corners market has landed in 4 out of the last 5 similar fixtures. Hit rate, odds, and league are shown for each pick.' },
    { q: 'What does "hit rate" mean for corners?', a: 'Hit rate is the percentage of recent matches in which the corners market landed. A 100% hit rate means the Over 8.5 or Over 9.5 corners line has been exceeded in every recent match for that fixture or league. We only display picks above 80%.' },
    { q: 'Which leagues have the most corners?', a: 'Leagues like the Eredivisie, Allsvenskan, Eliteserien, and Serie B tend to produce higher corner counts due to their attacking styles. Our predictions span 50+ leagues and highlight the highest corner-producing fixtures daily.' },
    { q: 'Can I use corner picks in accumulators?', a: 'Yes. Corner picks with high hit rates make solid accumulator legs. Combine corners with 1X2, Over 2.5, or BTTS picks using our Ticket Builder for diversified accumulator tickets.' },
    { q: 'When are corner predictions updated?', a: 'Corner predictions update daily alongside all other markets. The primary refresh runs at 1:00 AM WAT with a secondary update at 6:00 AM WAT to capture fixtures that appear closer to matchday.' }
  ],
  'cards': [
    { q: 'What do cards predictions cover?', a: 'Our cards predictions identify matches likely to produce a high number of yellow cards. We analyze team discipline records, historical booking trends, and referee tendencies to highlight fixtures with the strongest card-count patterns.' },
    { q: 'How are cards predictions calculated?', a: 'Each prediction is based on recent booking data. We track how often a team or match has gone over specific card thresholds (Over 8.5, Over 9.5 cards) and only show fixtures where the historical pattern is consistent.' },
    { q: 'What does "Over 9.5 cards" mean?', a: 'Over 9.5 cards means the total yellow and red cards shown by the referee in a match should be 10 or more. If the match finishes with 10, 11, or 12 cards, the Over 9.5 prediction wins.' },
    { q: 'Which factors influence card predictions?', a: 'Key factors include a team average cards per game, derby or rivalry intensity, referee strictness, league discipline norms, and tactical style. Teams that press aggressively or play physically tend to accumulate more bookings.' },
    { q: 'Can I combine cards picks with other markets?', a: 'Yes. Cards picks pair well with 1X2 and Under 2.5 goals in accumulators. Physical, low-scoring matches often produce both fewer goals and more cards, making them natural combination candidates.' },
    { q: 'When are cards predictions updated?', a: 'Cards predictions update daily alongside all other markets. The primary refresh runs at 1:00 AM WAT with a secondary update at 6:00 AM WAT to capture late-appearing fixtures with strong booking trends.' }
  ],
  'winning-streak': [
    { q: 'What is a winning streak in football betting?', a: 'A winning streak is a sequence of consecutive matches in which a team has won every game without a draw or defeat. WinFulltime tracks streaks of 5 or more consecutive victories and pairs them with each team\'s next fixture.' },
    { q: 'How do winning streak predictions help me bet?', a: 'Teams on long winning runs combine confidence, momentum, and proven form, which bookmakers often underprice. Our streak pages surface those teams and their next match so you can judge whether the streak is likely to continue.' },
    { q: 'What does "Back To Back Wins" mean?', a: 'It is the number of consecutive matches a team has won in a row. A badge reading "Back To Back Wins: 11" means the team has won 11 straight matches entering the highlighted fixture.' },
    { q: 'When is winning streak data updated?', a: 'Streak data updates daily. The primary refresh runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT captures the latest results and newly scheduled fixtures across dozens of leagues.' }
  ],
  'losing-streak': [
    { q: 'What is a losing streak?', a: 'A losing streak is a sequence of consecutive matches in which a team has lost every game. We highlight teams on long losing runs along with their next fixture, which is useful for identifying vulnerable sides.' },
    { q: 'Why track losing streaks for betting?', a: 'Teams in poor form often present both a liability and an opportunity. Backing against a team on a long losing run — or fading their win price — is a common strategy, and our data makes those fixtures easy to find.' },
    { q: 'What does "Back To Back Losses" mean?', a: 'It is the number of consecutive defeats a team has suffered. A badge reading "Back To Back Losses: 22" means the team has lost 22 straight matches entering the highlighted fixture.' },
    { q: 'When is losing streak data updated?', a: 'Streak data updates daily. The primary refresh runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT ensures the latest results are reflected across all covered leagues.' }
  ],
  'draws-streak': [
    { q: 'What is a draws streak?', a: 'A draws streak is a sequence of consecutive matches in which a team has drawn every game. WinFulltime tracks teams stuck in long draw runs and pairs them with their next fixture.' },
    { q: 'Why do draw streaks matter for betting?', a: 'Teams repeatedly sharing points are prime candidates for the draw market and double-chance X picks. Identifying a side that keeps drawing helps you target the X outcome in fixtures bookmakers may price too optimistically.' },
    { q: 'What does "Back To Back Draws" mean?', a: 'It is the number of consecutive drawn matches a team has recorded. A badge reading "Back To Back Draws: 5" means the team has drawn 5 straight matches entering the highlighted fixture.' },
    { q: 'When is draws streak data updated?', a: 'Streak data updates daily. The primary refresh runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT keeps the draw-streak pages current with the latest results.' }
  ]
};

function generateFaqHtml(slug) {
  const faqs = FAQ_SCHEMA[slug];
  if (!faqs || faqs.length === 0) return '';
  return `<section class="seo-content">
${faqBlock({ heading: 'About These Predictions', faqs })}
</section>`;
}

function todayStr() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  return new Date(
    parseInt(parts.find(p => p.type === 'year').value),
    parseInt(parts.find(p => p.type === 'month').value) - 1,
    parseInt(parts.find(p => p.type === 'day').value)
  ).toISOString().slice(0, 10);
}

function generateNoscriptFallback(slug, catConfig) {
  const dataFile = path.join(__dirname, '..', 'public', 'data', 'predictions.json');
  let rows = '';
  if (fs.existsSync(dataFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const key = catConfig.dataKey;
      const matches = (key && data[key]) ? data[key] : [];
      const today = todayStr();
      const todays = matches
        .filter(m => m.date === today)
        .slice(0, 25);
      if (todays.length > 0) {
        rows = todays.map(m => {
          const label = m.tip || (m.streaks && m.streaks.length ? m.streaks[0].count + ' unbeaten' : '');
          return `<tr><td>${escapeHtml(m.league || '')}</td><td>${escapeHtml(m.match || '')}</td><td>${escapeHtml(m.time || '')}</td><td>${escapeHtml(String(label || ''))}</td>${catConfig.dataKey === 'bttsNoMatches' || !m.probability ? '' : `<td>${escapeHtml(String(m.probability || ''))}%</td>`}</tr>`;
        }).join('');
      }
    } catch (e) {
      console.error('[category-pages] Failed to bake noscript fallback for ' + slug + ':', e.message);
    }
  }

  if (!rows) {
    return `<noscript>
  <div class="noscript-content" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px;margin:20px 0;line-height:1.7;color:rgba(232,237,245,.9);">
    <h2 style="margin-top:0;font-size:20px;color:#fff;">${escapeHtml(catConfig.label)} Predictions</h2>
    <p>WinFulltime publishes ${escapeHtml(catConfig.label)} predictions every day. Browse today's picks for this market, explore other <a href="/predictions/1x2">betting markets</a> such as <a href="/predictions/over-1-5">Over 1.5</a>, <a href="/predictions/over-2-5">Over 2.5</a> and <a href="/predictions/btts">BTTS</a>, or jump to a specific <a href="/predictions/league/premier-league/">league</a>.</p>
    <p>Predictions are derived from statistical analysis of form, head-to-head records and league trends. Football predictions can lose &mdash; bet responsibly.</p>
  </div>
</noscript>`;
  }

  return `<noscript>
  <div class="noscript-content" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px;margin:20px 0;line-height:1.7;color:rgba(232,237,245,.9);">
    <h2 style="margin-top:0;font-size:20px;color:#fff;">${escapeHtml(catConfig.heading)} Predictions Today</h2>
    <p>Free ${escapeHtml(catConfig.heading)} picks for today's football matches.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="text-align:left;color:rgba(232,237,245,.55);">
        <th style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);">League</th>
        <th style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);">Match</th>
        <th style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);">Kick-off</th>
        <th style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);">Tip</th>
        ${catConfig.dataKey === 'bttsNoMatches' ? '' : '<th style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);">Confidence</th>'}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;font-size:13px;">Views are updated when JavaScript is enabled. Football predictions can lose &mdash; bet responsibly.</p>
  </div>
</noscript>`;
}

const CATEGORIES = {
  '1x2': {
    dataKey: 'matches',
    title: '1X2 Football Predictions Today',
    description: 'Free statistical 1X2 football predictions for today. Expert home, draw, and away win tips across 50+ leagues worldwide.',
    keywords: '1X2 predictions, football predictions today, home win tips, draw predictions, away win tips, soccer betting tips',
    heading: '1X2 Predictions',
    label: '1X2',
    linkAnalysis: true
  },
  'over-1-5': {
    dataKey: 'over15Matches',
    title: 'Over 1.5 Goals Predictions Today',
    description: 'Free Over 1.5 goals football predictions for today. Data-driven tips for matches likely to produce 2 or more goals.',
    keywords: 'over 1.5 predictions, over 1.5 goals tips, football goals betting, soccer over under tips',
    heading: 'Over 1.5 Goals',
    label: 'Over 1.5',
    linkAnalysis: true
  },
  'over-2-5': {
    dataKey: 'over25Matches',
    title: 'Over 2.5 Goals Predictions Today',
    description: 'Free Over 2.5 goals football predictions for today. Expert tips for high-scoring matches across major leagues.',
    keywords: 'over 2.5 predictions, over 2.5 goals tips, high scoring football tips, soccer goals betting',
    heading: 'Over 2.5 Goals',
    label: 'Over 2.5',
    linkAnalysis: true
  },
  'btts': {
    dataKey: 'bttsMatches',
    title: 'BTTS Yes Predictions Today',
    description: 'Free Both Teams to Score (BTTS) predictions for today. Tips for matches where both teams are expected to score.',
    keywords: 'BTTS predictions, both teams to score tips, BTTS yes predictions, soccer both teams to score',
    heading: 'BTTS Yes',
    label: 'BTTS Yes',
    linkAnalysis: true
  },
  'btts-no': {
    dataKey: 'bttsNoMatches',
    title: 'BTTS No Predictions Today',
    description: 'Free Both Teams to Score No predictions for today. Tips for matches where at least one team will fail to score.',
    keywords: 'BTTS no predictions, both teams to score no, clean sheet tips, soccer shutout predictions',
    heading: 'BTTS No',
    label: 'BTTS No',
    linkAnalysis: true
  },
  'unbeaten': {
    dataKey: null,
    title: 'Unbeaten Streak Predictions Today',
    description: 'Free unbeaten streak football predictions for today. Teams on long unbeaten runs and their upcoming fixtures.',
    keywords: 'unbeaten streak predictions, football unbeaten runs, teams on winning streak, unbeaten football tips',
    heading: 'Unbeaten Streaks',
    label: 'Unbeaten'
  },
  'corners': {
    dataKey: 'cornersMatches',
    title: 'Corner Kick Predictions Today',
    description: 'Free corner kick predictions for today. Over 8.5 and Over 9.5 corners tips with 80%+ hit rates.',
    keywords: 'corner predictions, corner kick betting, over 8.5 corners tips, over 9.5 corners, football corner tips',
    heading: 'Corner Predictions',
    label: 'Corners',
    linkAnalysis: true
  },
  'cards': {
    dataKey: 'cardsMatches',
    title: 'Cards & Bookings Predictions Today',
    description: 'Free yellow cards and bookings predictions for today. Tips for matches likely to produce high card counts based on team discipline trends.',
    keywords: 'cards predictions, yellow cards tips, bookings predictions, football card betting, over cards tips',
    heading: 'Cards Predictions',
    label: 'Cards',
    linkAnalysis: true
  },
  'winning-streak': {
    dataKey: 'winstreakMatches',
    title: 'Winning Streak Predictions Today',
    description: 'Teams on long winning runs and their next fixture. Free winning streak football predictions updated daily across 50+ leagues.',
    keywords: 'winning streak predictions, teams on winning streak, football winning runs, back to back wins tips',
    heading: 'Winning Streaks',
    label: 'Win Streak',
    linkAnalysis: true
  },
  'losing-streak': {
    dataKey: 'losestreakMatches',
    title: 'Losing Streak Predictions Today',
    description: 'Teams on long losing runs and their next fixture. Free losing streak football predictions to identify vulnerable sides, updated daily.',
    keywords: 'losing streak predictions, teams on losing streak, football losing runs, back to back losses tips',
    heading: 'Losing Streaks',
    label: 'Loss Streak',
    linkAnalysis: true
  },
  'draws-streak': {
    dataKey: 'drawstreakMatches',
    title: 'Draws Streak Predictions Today',
    description: 'Teams stuck in long draw runs and their next fixture. Free draws streak football predictions for the draw market, updated daily.',
    keywords: 'draws streak predictions, football draw runs, back to back draws tips, draw market predictions',
    heading: 'Draw Streaks',
    label: 'Draw Streak',
    linkAnalysis: true
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const EXTRA_TABS = [
  { id: 'author-picks', href: '/author-picks.html', label: 'H2H Picks' }
];

function generateCategoryPage(slug, catConfig, ctx) {
  const allSlugs = Object.keys(CATEGORIES);
  const baseTabs = allSlugs.map(s => {
    const c = CATEGORIES[s];
    const active = s === slug ? ' active' : '';
    return `<a href="/predictions/${s}" id="tab-${s}" class="tab-btn${active}">${escapeHtml(c.label)}</a>`;
  });
  const extraTabsHtml = EXTRA_TABS.map(t =>
    `<a href="${t.href}" id="tab-${t.id}" class="tab-btn">${escapeHtml(t.label)}</a>`
  );
  const insertIdx = allSlugs.indexOf('over-2-5') + 1;
  baseTabs.splice(insertIdx, 0, ...extraTabsHtml);
  const categoryTabs = baseTabs.join('\n            ');

  const isStreak = slug === 'winning-streak' || slug === 'losing-streak' || slug === 'draws-streak';
  const isUnbeaten = slug === 'unbeaten';

  const leagueLabelBySlug = ctx && ctx.leagueLabelBySlug;
  const leagueLinks = (ctx && ctx.leagueSlugs && ctx.leagueSlugs.length)
    ? ctx.leagueSlugs.map(ls => `<a href="/predictions/league/${ls}/" class="chip-link">${escapeHtml(readableLeagueLabel(ls, leagueLabelBySlug))}</a>`).join('\n          ')
    : '';
  const leagueLinksHtml = chipsSection({
    heading: 'Browse Leagues',
    intro: 'Jump straight to today\'s predictions for any league, or scroll through every market on this page.',
    chips: leagueLinks
  });

  const dateLinks = (ctx && ctx.dateSlugs && ctx.dateSlugs.length)
    ? formatDateChips(ctx.dateSlugs, 14).join('\n          ')
    : '';
  const dateLinksHtml = chipsSection({
    heading: 'Track Record Archive',
    intro: 'Browse verified prediction outcomes and hit rates from previous matchdays.',
    chips: dateLinks
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead({ title: `${escapeHtml(catConfig.title)} | WinFulltime`, description: catConfig.description, keywords: catConfig.keywords, canonicalUrl: `https://winfulltime.com/predictions/${slug}` })}
<script type="application/ld+json">
${collectionPageSchema({ name: catConfig.title, description: catConfig.description, url: `https://winfulltime.com/predictions/${slug}` })}
</script>
<script type="application/ld+json">
${generateFaqSchema(FAQ_SCHEMA[slug])}
</script>
<script async src="https://news.google.com/swg/js/v1/publisher.js"></script>
<style>
.date-tabs{display:flex;justify-content:center;gap:0;margin-bottom:24px;background:var(--bg-card);border-radius:12px;padding:4px;width:fit-content;max-width:100%;margin-left:auto;margin-right:auto;border:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch}
.date-tab{flex:1;padding:10px 20px;border:none;border-radius:8px;background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap;min-width:90px;min-height:44px;text-align:center}
.date-tab:hover{color:var(--text-primary);background:var(--bg-card-hover)}
.date-tab.active{background:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:16px;color:var(--text-primary)}
.faq-list{display:flex;flex-direction:column;gap:8px}
.faq-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:border-color 0.2s}
.faq-item:hover{border-color:var(--border-hover)}
.faq-item[open]{border-color:rgba(255,36,72,0.3)}
.faq-item summary{padding:16px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;user-select:none}
.faq-item summary::-webkit-details-marker{display:none}
.faq-item summary::after{content:'+';font-size:20px;font-weight:700;color:var(--accent);transition:transform 0.2s;flex-shrink:0}
.faq-item[open] summary::after{content:'\\2212'}
.faq-item p{padding:0 20px 16px;font-size:14px;line-height:1.7;color:var(--text-secondary);margin:0}
@media(max-width:640px){.seo-content h2{font-size:18px}.faq-item summary{padding:14px 16px;font-size:14px}.faq-item p{padding:0 16px 14px;font-size:13px}.date-tab{padding:8px 14px;font-size:13px;min-width:80px}.match-reason{font-size:12px;max-width:100%;word-break:break-word;margin-top:6px}}
.match-reason{font-size:13px;color:#fff;margin-top:8px;line-height:1.5;text-align:center;max-width:100%;opacity:0.85}
${CHIPS_CSS}
</style>
</head>
<body>
<div>
<header>
<div class="header-content">
<div class="logo"><a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a></div>
<button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
<nav id="nav">
<a href="/">Home</a>
<a href="/ticket-builder.html">Ticket Builder</a>
<a href="/blog/">Blog</a>
<a href="/contact.html">Contact</a>
</nav>
</div>
</header>
<main class="container">
<div class="hero">
<h1 id="pageHeading">${escapeHtml(catConfig.heading)}<br>${isStreak ? 'Teams &amp; Their Next Fixtures' : 'Predictions For Today'}</h1>
<p class="hero-date" id="currentDate"></p>
</div>

<div class="date-tabs" id="dateTabs">
  <button class="date-tab" data-date="yesterday" onclick="switchDate('yesterday')">Yesterday</button>
  <button class="date-tab active" data-date="today" onclick="switchDate('today')">Today</button>
  <button class="date-tab" data-date="tomorrow" onclick="switchDate('tomorrow')">Tomorrow</button>
</div>

<div class="tabs-container" id="categoryLinks">
  ${categoryTabs}
</div>

<div class="stats-bar">
<div class="stat-item">
<div class="stat-value" id="totalMatches">0</div>
<div class="stat-label">Matches</div>
</div>
</div>

<div id="content">
<div class="loading">
<div class="progress-bar-container">
<div class="progress-bar"></div>
</div>
<span class="loading-text">Loading predictions...</span>
</div>
${generateNoscriptFallback(slug, catConfig)}
</div>

<div class="featured-cta">
<div class="label">Featured Tool</div>
<h3>Build Winning Accumulator Tickets</h3>
<p>Generate optimized accumulator combinations from today's data-driven predictions. Set your target odds and get instant ticket suggestions.</p>
<a href="/ticket-builder.html">Free Ticket Builder &rarr;</a>
</div>

${leagueLinksHtml}

${dateLinksHtml}

${generateFaqHtml(slug)}

</main>
</div>
<footer>
<div class="footer-content">
<div style="text-align:center;margin-bottom:24px;">
<p style="margin:0 0 12px;font-size:14px;color:var(--text-muted);">Support WinFulltime &mdash; your donations keep all predictions free.</p>
<a href="https://ko-fi.com/winfulltime" target="_blank" rel="noopener nofollow" style="display:inline-block;background:var(--accent-gradient);color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Donate on Ko-fi</a>
</div>
<div class="footer-links">
<a href="/">Home</a>
<a href="/ticket-builder.html">Ticket Builder</a>
<a href="/blog/">Blog</a>
<a href="/advertise.html">Advertise</a>
<a href="/contact.html">Contact</a>
<a href="/terms.html">Terms</a>
<a href="/privacy.html">Privacy</a>
<a href="/sitemap.xml">Sitemap</a>
</div>
<p class="footer-copyright">&copy; 2026 WinFulltime. All rights reserved.</p>
</div>
<div style="text-align:center;padding:12px 0;"><button id="themeToggle" class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">Light</button></div>
<div style="text-align:center;padding:0 0 8px;"><div google-add-preferred-source-btn data-theme="dark"></div></div>
</footer>
<script src="/chat-widget.js"></script>
<script>
(function(){const s=localStorage.getItem("wf-theme");const t=s||"dark";document.documentElement.setAttribute("data-theme",t==="dark"?"":"light");const b=document.getElementById("themeToggle");if(b)b.textContent=t==="dark"?"Light":"Dark";})();
document.addEventListener("DOMContentLoaded",function(){const b=document.getElementById("themeToggle");if(!b)return;b.addEventListener("click",function(){const h=document.documentElement;const l=h.getAttribute("data-theme")==="light";if(l){h.removeAttribute("data-theme");b.textContent="Light";localStorage.setItem("wf-theme","dark")}else{h.setAttribute("data-theme","light");b.textContent="Dark";localStorage.setItem("wf-theme","light")}});});
</script>
<script>
document.getElementById('hamburger')?.addEventListener('click', function() { this.classList.toggle('active'); document.getElementById('nav')?.classList.toggle('open'); });
</script>
<script src="/responsible-gambling.js"></script>
<script src="/analysis-maps.js"></script>
<script>
(function() {
  var CATEGORY_SLUG = '${slug}';
  var CATEGORY_LABEL = '${escapeHtml(catConfig.heading)}';
  var DATA_KEY = ${catConfig.dataKey ? "'" + catConfig.dataKey + "'" : 'null'};
  var IS_STREAK = ${isStreak ? 'true' : 'false'};
  var IS_UNBEATEN = ${isUnbeaten ? 'true' : 'false'};
  var LINK_ANALYSIS = ${catConfig.linkAnalysis ? 'true' : 'false'};
  var CATEGORY_HEADING = '${escapeHtml(catConfig.heading)}';
  var AFFILIATE_URL = '${AFFILIATE_URL}';

  var allData = null;
  var h2hData = null;
  var analysisLinks = {};
  var currentDate = 'today';

  function getServerDate() {
    var now = new Date();
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    return new Date(
      parseInt(parts.find(function(p){return p.type==='year'}).value),
      parseInt(parts.find(function(p){return p.type==='month'}).value) - 1,
      parseInt(parts.find(function(p){return p.type==='day'}).value)
    );
  }

  function dateToString(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function formatDateLong(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function formatDateShort(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  function escAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getSelectedDateStr() {
    var today = getServerDate();
    if (currentDate === 'yesterday') {
      var d = new Date(today); d.setDate(d.getDate() - 1);
      return dateToString(d);
    } else if (currentDate === 'tomorrow') {
      var d = new Date(today); d.setDate(d.getDate() + 1);
      return dateToString(d);
    }
    return dateToString(today);
  }

  function updateDateDisplay() {
    var dateStr = getSelectedDateStr();
    var dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) dateDisplay.textContent = formatDateLong(dateStr);

    var dayLabel = currentDate === 'today' ? 'Today' : currentDate === 'yesterday' ? 'Yesterday' : 'Tomorrow';
    var subtitle = IS_STREAK ? 'Teams &amp; Their Next Fixtures' : ('Predictions For ' + dayLabel);
    document.getElementById('pageHeading').innerHTML = CATEGORY_HEADING + '<br>' + subtitle;

    var tabs = document.querySelectorAll('.date-tab');
    tabs.forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-date') === currentDate);
    });

    var newUrl = '/predictions/' + CATEGORY_SLUG;
    if (currentDate !== 'today') newUrl += '?date=' + currentDate;
    history.replaceState(null, '', newUrl);

    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = 'https://winfulltime.com' + newUrl;
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.content = 'https://winfulltime.com' + newUrl;
  }

  function renderUnbeaten(matches) {
    var content = document.getElementById('content');
    if (matches.length === 0) {
      content.innerHTML = '<div class="no-matches"><p>No unbeaten streak data for this date.</p></div>';
      document.getElementById('totalMatches').textContent = '0';
      return;
    }
    document.getElementById('totalMatches').textContent = matches.length;
    var html = matches.map(function(match, i) {
      var streaksHtml = (match.streaks || []).map(function(s) {
        var loc = s.location ? ' ' + s.location : '';
        return '<div class="streak-row"><span class="streak-team">' + s.team + '</span><span class="streak-badge">' + s.count + ' unbeaten' + loc + '</span></div>';
      }).join('');
      return '<div class="match-card fade-in" style="animation-delay:' + (i * 50) + 'ms">' +
        '<div class="match-header"><span>' + (match.league || '') + '</span><span>' + (match.time || '') + '</span></div>' +
        '<div class="match-teams" style="justify-content:center;"><span class="team team-home" style="text-align:center;width:100%;">' + (match.match || '') + '</span></div>' +
        '<div class="match-footer" style="flex-direction:column;gap:6px;">' + streaksHtml + '</div></div>';
    }).join('');
    content.innerHTML = '<div class="matches-grid">' + html + '</div>';
  }

  function renderMatches(matches) {
    var content = document.getElementById('content');
    var selectedDateStr = getSelectedDateStr();
    var filtered;

    if (IS_STREAK) {
      filtered = matches.filter(function(m) { return m.date === selectedDateStr || m.nextMatchDate === selectedDateStr; });
    } else {
      filtered = matches.filter(function(m) { return m.date === selectedDateStr; });
    }

    if (filtered.length === 0) {
      var dayLabel = currentDate === 'today' ? 'today' : currentDate;
      content.innerHTML = '<div class="no-matches"><p>No predictions for ' + dayLabel + ' in this market.</p><p style="margin-top:12px;font-size:14px;color:var(--text-muted);">Predictions update daily. Check back soon or explore other markets below.</p></div>';
      document.getElementById('totalMatches').textContent = '0';
      return;
    }

    document.getElementById('totalMatches').textContent = filtered.length;
    var html = filtered.map(function(match, i) {
      var matchStr = (IS_STREAK ? (match.nextMatch || match.match) : (match.match || match.nextMatch)) || '';
      var teams = matchStr.indexOf(' - ') !== -1 ? matchStr.split(' - ') : matchStr.split(' vs ');
      var home = (teams[0] || '').trim();
      var away = (teams[1] || '').trim();
      var hasScore = (match.score && match.score.home != null && match.score.away != null) ||
                     (match.result && match.result.home != null && match.result.away != null);
      var displayScore = match.result || match.score;

      var streakLabel = match.tip;
      if (IS_STREAK) {
        if (CATEGORY_SLUG === 'draws-streak') streakLabel = 'Draws Streak: ' + (match.streak || '');
      }

      var cardContent;
      if (IS_STREAK) {
        var streakTeam = (match.match || '').trim();
        var homeLower = home.toLowerCase();
        var awayLower = away.toLowerCase();
        var teamLower = streakTeam.toLowerCase();
        var isStreakHome;
        if (homeLower === teamLower || awayLower === teamLower) {
          isStreakHome = homeLower === teamLower;
        } else {
          var firstWord = teamLower.split(' ')[0];
          isStreakHome = homeLower.indexOf(firstWord) !== -1 && awayLower.indexOf(firstWord) === -1;
        }
        var streakCount = match.streak || '';
        var streakWord = CATEGORY_SLUG === 'winning-streak' ? 'Wins' : CATEGORY_SLUG === 'losing-streak' ? 'Losses' : 'Draws';
        var streakTag = '<span style="display:block;font-size:10px;color:#facc15;letter-spacing:0.4px;text-transform:uppercase;margin-top:4px;">' + streakCount + ' ' + streakWord + '</span>';
        cardContent = '<div class="match-teams">' +
          '<span class="team team-home">' + home + (isStreakHome ? streakTag : '') + '</span>' +
          '<span class="vs-score">vs</span>' +
          '<span class="team team-away">' + away + (!isStreakHome ? streakTag : '') + '</span>' +
          '</div>' +
          '<div class="match-footer"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;">' +
          '<span class="tip-badge">' + streakLabel + '</span>' +
          '<div class="probability">' + match.probability + '%</div></div></div>';
      } else {
        var reasonHtml = match.description ? '<div class="match-reason">' + match.description + '</div>' : '';
        cardContent = '<div class="match-teams"><span class="team team-home">' + home + '</span>' +
          (hasScore ? '<span class="vs-score score-display">' + displayScore.home + ' - ' + displayScore.away + '</span>' : '<span class="vs-score">vs</span>') +
          '<span class="team team-away">' + away + '</span></div>' +
          '<div class="match-footer"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;">' +
          '<span class="tip-badge">' + match.tip + '</span>' +
          ((CATEGORY_SLUG === 'btts-no' || CATEGORY_SLUG === 'corners') ? '' : '<div class="probability">' + match.probability + '%</div>') +
          reasonHtml + '</div></div>';
      }

      var ctaHtml = '';
      if (!IS_STREAK && home && away) {
        ctaHtml = '<div style="text-align:center;">' +
          '<a href="' + AFFILIATE_URL + '" target="_blank" rel="noopener nofollow sponsored" class="wft-1xbet-cta" data-home="' + escAttr(home) + '" data-away="' + escAttr(away) + '" data-tip="' + escAttr(match.tip || '') + '" style="display:inline-block;text-align:center;background:rgba(255,36,72,0.10);color:#fff;padding:4px 12px;border-radius:6px;text-decoration:none;font-weight:600;font-size:12px;margin-top:8px;border:1px solid rgba(255,36,72,0.25);">Bet on 1win<span class="wft-1xbet-odds" style="opacity:0.85;font-weight:600;"></span> &rarr;</a>' +
          '</div>';
      }

      var cardHtml = '<div class="match-card fade-in" style="animation-delay:' + (i * 50) + 'ms"' +
        (home ? ' data-home="' + escAttr(home) + '"' : '') +
        (away ? ' data-away="' + escAttr(away) + '"' : '') +
        (!IS_STREAK && match.tip ? ' data-tip="' + escAttr(match.tip) + '"' : '') +
        '>' +
        '<div class="match-header"><span>' + (match.league || '') + '</span><span>' + (IS_STREAK ? (match.nextMatchDate ? formatDateShort(match.nextMatchDate) : (match.time || '')) : (match.time || '')) + '</span></div>' +
        cardContent + ctaHtml + '</div>';

      if (LINK_ANALYSIS && home && away) {
        var analysisHref = (typeof window.resolveAnalysisLink === 'function')
          ? window.resolveAnalysisLink(home, away, match)
          : (analysisLinks[(home + '|' + away).toLowerCase()] || '');
        if (analysisHref) {
          return '<a href="' + analysisHref + '" class="match-card-link" style="display:block;text-decoration:none;color:inherit;">' + cardHtml + '</a>';
        }
      }

      return cardHtml;
    }).join('');

    content.innerHTML = '<div class="matches-grid">' + html + '</div>';
  }

  function renderCurrentView() {
    updateDateDisplay();
    if (IS_UNBEATEN) {
      var dates = h2hData ? (h2hData.dates || {}) : {};
      var dateStr = getSelectedDateStr();
      renderUnbeaten(dates[dateStr] || []);
    } else if (DATA_KEY && allData && allData[DATA_KEY]) {
      renderMatches(allData[DATA_KEY]);
    } else {
      document.getElementById('content').innerHTML = '<div class="no-matches"><p>No data available for this market.</p></div>';
    }
  }

  window.switchDate = function(date) {
    currentDate = date;
    renderCurrentView();
  };

  function initFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var dateParam = params.get('date');
    if (dateParam === 'yesterday' || dateParam === 'tomorrow') {
      currentDate = dateParam;
    }
  }

  async function loadData() {
    try {
      var res = await fetch('/data/predictions.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      allData = await res.json();

      if (LINK_ANALYSIS) {
        try {
          if (typeof window.ensureAnalysisMaps === 'function') {
            await window.ensureAnalysisMaps();
            analysisLinks = (typeof window.getAnalysisRaw === 'function') ? window.getAnalysisRaw() : {};
          } else {
            var linksRes = await fetch('/data/analysis-links.json');
            if (linksRes.ok) analysisLinks = await linksRes.json() || {};
          }
        } catch (e) {}
      }

      if (IS_UNBEATEN) {
        var h2hRes = await fetch('/data/h2h-unbeaten.json');
        if (h2hRes.ok) {
          h2hData = await h2hRes.json();
        }
      }

      initFromUrl();
      renderCurrentView();
    } catch (e) {
      console.error('Load error:', e);
      document.getElementById('content').innerHTML = '<div class="no-matches"><p>Predictions currently unavailable. Check back soon.</p></div>';
    }
  }

  loadData();
})();
</script>
<script src="/pwa.js"></script>
<script src="/1xbet-odds-widget.js" defer></script>
</body>
</html>`;
}

function listDirSlugs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(entry => {
    try {
      return fs.statSync(path.join(dir, entry)).isDirectory();
    } catch (e) {
      return false;
    }
  }).sort();
}

function generateAllPages(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const leagueSlugs = listDirSlugs(path.join(outputDir, 'league'));
  const dateSlugs = listDirSlugs(path.join(outputDir, 'date'));
  const ctx = { leagueSlugs, dateSlugs, leagueLabelBySlug: buildLeagueLabelBySlug() };

  for (const [slug, config] of Object.entries(CATEGORIES)) {
    const html = generateCategoryPage(slug, config, ctx);
    fs.writeFileSync(path.join(outputDir, slug + '.html'), html);
    console.log('Generated: predictions/' + slug + '.html');
  }

  console.log('All category pages generated in ' + outputDir);

  try { require('./update-sitemap').main(); } catch (e) { console.error('[category-pages] Sitemap refresh failed:', e.message); }
}

module.exports = { CATEGORIES, generateCategoryPage, generateAllPages };

if (require.main === module) {
  const outDir = path.join(__dirname, '..', 'public', 'predictions');
  generateAllPages(outDir);
}
