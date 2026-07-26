const fs = require('fs');
const path = require('path');

const newSlugs = [
  'european-handicap-betting-explained',
  'first-half-vs-second-half-goals-football-betting-guide',
  'football-betting-on-relegation-six-pointer-matches',
  'football-betting-on-stoppage-time-goals-patterns-and-value',
  'football-betting-on-using-progressive-passes-data',
  'football-expected-assists-xa-explained',
  'how-bookmakers-make-money-from-football-odds',
  'how-football-odds-are-calculated',
  'how-international-duty-affects-football-team-performance',
  'how-momentum-affects-live-football-betting',
  'how-pitch-size-affects-football-match-statistics',
  'how-red-cards-change-football-match-probabilities',
  'how-squad-depth-affects-late-season-football-betting',
  'how-to-analyse-counter-attacking-teams-for-football-betting',
  'how-to-analyse-defensive-line-height-for-football-betting',
  'how-to-analyse-defensive-pressing-in-football-for-betting',
  'how-to-analyse-football-goals-trends',
  'how-to-analyse-press-resistance-in-football-for-betting',
  'how-to-analyse-shot-location-heat-maps-for-football-betting',
  'how-to-analyse-youth-academy-graduates-in-football-form-analysis',
  'how-to-bet-on-football-promotion-races',
  'how-to-bet-on-football-using-expected-threat-xt',
  'how-to-bet-on-football-using-high-turnover-sequences',
  'how-to-predict-over-2-5-goals-in-football',
  'how-to-predict-under-2-5-goals-in-football',
  'how-to-read-a-football-league-table-for-betting',
  'how-to-read-live-football-statistics-before-betting',
  'how-to-use-box-entry-statistics-for-football-predictions',
  'how-to-use-cross-conversion-rates-for-football-predictions',
  'how-to-use-dangerous-attack-statistics-for-live-betting',
  'how-to-use-deep-completions-data-for-football-betting',
  'how-to-use-passing-network-analysis-for-football-betting',
  'how-travel-distance-affects-football-match-results',
  'how-var-changes-football-betting-markets',
  'the-impact-of-midweek-european-fixtures-on-weekend-league-betting',
  'the-impact-of-travel-fatigue-on-african-football-betting',
  'the-psychology-of-half-time-leads-in-football-betting',
  'the-role-of-club-culture-in-football-prediction-models',
  'what-is-a-football-banker-bet',
  'what-is-a-football-nap-bet',
  'what-is-return-on-investment-roi-in-betting',
  'why-chasing-losses-is-dangerous-in-football-betting',
  'why-football-odds-change-before-a-match',
  'why-no-football-prediction-is-guaranteed'
];

const missingCSS = `
  footer { background: var(--bg-secondary); border-top: 1px solid var(--border); padding: 40px 16px 32px; text-align: center; margin-top: 60px; }
  .footer-links { display: flex; justify-content: center; gap: 28px; margin-bottom: 20px; flex-wrap: wrap; }
  .footer-links a { color: var(--text-muted); text-decoration: none; font-weight: 500; font-size: 14px; }
  .footer-links a:hover { color: var(--accent); }
  .footer-copyright { color: var(--text-muted); font-size: 13px; }
  nav { display: flex; gap: 24px; }
  nav a { color: var(--text-muted); text-decoration: none; font-weight: 500; font-size: 14px; transition: color 0.2s; }
  nav a:hover { color: var(--text-primary); }
  img { max-width: 100%; height: auto; border-radius: 8px; margin: 20px 0; }
  @media (max-width: 640px) {
    .header-content { position: relative; }
    .hamburger { display: block; }
    nav { display: none !important; position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-primary, #181e30); border-bottom: 1px solid var(--border, rgba(255,255,255,0.06)); flex-direction: column; padding: 16px; gap: 12px; z-index: 1000; }
    nav.open { display: flex !important; }
    h1 { font-size: 2.2rem; }
    h2 { font-size: 1.7rem; }
    .container { padding: 0 16px; }
    nav { gap: 12px; }
    nav a { font-size: 13px; }
  }
  .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; z-index: 1001; }
  .hamburger span { display: block; width: 22px; height: 2px; background: var(--text-primary, #e8edf5); margin: 5px 0; transition: all 0.3s; border-radius: 2px; }
  .hamburger.active span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
  .hamburger.active span:nth-child(2) { opacity: 0; }
  .hamburger.active span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
`;

let fixed = 0;
let skipped = 0;

for (const slug of newSlugs) {
  const file = path.join('public', 'blog', slug + '.html');
  let content = fs.readFileSync(file, 'utf8');

  if (content.includes('nav { display: flex')) {
    skipped++;
    continue;
  }

  content = content.replace('</style>', missingCSS + '\n </style>');
  fs.writeFileSync(file, content, 'utf8');
  fixed++;
}

console.log('Fixed: ' + fixed + ', Skipped: ' + skipped);
