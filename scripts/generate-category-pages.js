const fs = require('fs');
const path = require('path');

const SEO_CONTENT = {
  '1x2': `<section class="seo-content">
<h2>What Are 1X2 Predictions?</h2>
<p>1X2 predictions are the most fundamental football betting market. The name comes from the three possible outcomes of a match played in regulation time: <strong>1</strong> (home team wins), <strong>X</strong> (the match ends in a draw), and <strong>2</strong> (away team wins). This market covers the full-time result and does not include extra time or penalties.</p>
<p>On this page, WinFulltime publishes daily 1X2 predictions powered by an AI model that analyzes team form, head-to-head history, home and away performance, league position, and recent goal trends. Each prediction includes a probability percentage indicating the model's confidence in the outcome.</p>

<h2>How Our 1X2 Predictions Are Generated</h2>
<p>Our prediction model processes hundreds of data points for each fixture. The key inputs include:</p>
<ul>
<li><strong>Recent form</strong> &mdash; results from the last 5 to 10 matches</li>
<li><strong>Head-to-head records</strong> &mdash; historical results between the two teams</li>
<li><strong>Home/away splits</strong> &mdash; many teams perform significantly differently at home versus away</li>
<li><strong>League context</strong> &mdash; title races, relegation battles, and mid-table security all affect motivation</li>
<li><strong>Goal difference and scoring rate</strong> &mdash; teams scoring more tend to win more</li>
</ul>
<p>The model assigns a probability to each outcome (home win, draw, away win) and selects the outcome with the highest confidence as the prediction. Predictions with higher probability percentages tend to be safer picks, while lower percentages indicate higher risk but potentially higher reward.</p>

<h2>How to Use 1X2 Predictions</h2>
<p>1X2 predictions are the building blocks of most accumulator bets. You can use them individually as single bets or combine multiple 1X2 picks into an accumulator for higher returns. Tips for using this page effectively:</p>
<ul>
<li><strong>Check the probability</strong> &mdash; higher probability means a more likely outcome but shorter odds</li>
<li><strong>Compare across dates</strong> &mdash; use the Today, Tomorrow, and Yesterday tabs to find the best fixtures</li>
<li><strong>Cross-reference with other markets</strong> &mdash; if our <a href="/predictions/over-2-5">Over 2.5</a> model also favors a match, the home or away win becomes more likely</li>
<li><strong>Use the Ticket Builder</strong> &mdash; our <a href="/ticket-builder.html">Ticket Builder</a> tool generates optimized accumulator combinations from across all markets</li>
</ul>

<h2>Leagues and Coverage</h2>
<p>WinFulltime provides 1X2 predictions for over 50 leagues worldwide. Coverage includes top-tier competitions like the <strong>Premier League</strong>, <strong>La Liga</strong>, <strong>Serie A</strong>, <strong>Bundesliga</strong>, <strong>Ligue 1</strong>, <strong>Champions League</strong>, and <strong>Europa League</strong>. We also cover second divisions and regional leagues in South America, Africa, and Asia to give you the widest range of daily picks.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About 1X2 Predictions</h3>
<div class="seo-faq-item">
<h4>What does 1X2 stand for?</h4>
<p>1 = home team wins, X = draw, 2 = away team wins. It is the standard notation used by bookmakers worldwide for match result betting.</p>
</div>
<div class="seo-faq-item">
<h4>Do 1X2 predictions include extra time?</h4>
<p>No. 1X2 predictions cover the result after 90 minutes of regulation time including stoppage time. Extra time and penalties are not included.</p>
</div>
<div class="seo-faq-item">
<h4>How accurate are 1X2 predictions?</h4>
<p>Accuracy varies by league and fixture. No prediction system guarantees wins, but our model provides probability percentages so you can assess the risk of each pick. Combining multiple data sources improves long-term results.</p>
</div>
<div class="seo-faq-item">
<h4>Can I use 1X2 picks in accumulators?</h4>
<p>Yes. 1X2 picks are the most common legs in accumulator bets. Use our <a href="/ticket-builder.html">Ticket Builder</a> to automatically combine 1X2 picks with other markets for optimized tickets.</p>
</div>
</div>
</section>`,

  'over-1-5': `<section class="seo-content">
<h2>What Are Over 1.5 Goals Predictions?</h2>
<p>Over 1.5 goals predictions identify football matches where our model expects at least 2 goals to be scored in regulation time. This is one of the most popular and reliable betting markets because it does not depend on which team wins &mdash; you only need both teams combined to score 2 or more goals.</p>
<p>The Over 1.5 market is favored by both beginners and experienced bettors because of its high strike rate. Most professional football matches produce at least 2 goals, making this market less volatile than match result (1X2) bets. WinFulltime publishes daily Over 1.5 predictions with probability percentages so you can gauge confidence levels.</p>

<h2>How Our Over 1.5 Predictions Work</h2>
<p>Our AI model evaluates multiple factors to predict whether a match will produce 2 or more goals:</p>
<ul>
<li><strong>Average goals per game</strong> &mdash; league-wide and team-specific scoring averages</li>
<li><strong>Attack vs defense matchup</strong> &mdash; strong attacks against weak defenses produce more goals</li>
<li><strong>Both teams' scoring records</strong> &mdash; matches where both teams score frequently are ideal</li>
<li><strong>Historical over 1.5 rate</strong> &mdash; the percentage of past matches that went over 1.5 goals</li>
<li><strong>Home/away scoring patterns</strong> &mdash; home teams generally score more goals</li>
</ul>
<p>Predictions are updated daily and filtered to show only the highest-confidence picks. A probability of 80% or higher indicates a strong Over 1.5 candidate.</p>

<h2>How to Bet on Over 1.5 Goals</h2>
<p>The Over 1.5 market is straightforward: you win if the total goals scored by both teams is 2 or more. If the match ends 1-0, 0-0, or 0-1, the bet loses. Tips for using this market effectively:</p>
<ul>
<li><strong>Look for high-probability picks</strong> &mdash; our predictions include probability percentages; picks above 80% are the strongest</li>
<li><strong>Cross-reference with BTTS</strong> &mdash; if our <a href="/predictions/btts">BTTS Yes</a> model also favors the match, Over 1.5 is almost certain</li>
<li><strong>Avoid low-scoring leagues</strong> &mdash; some defensive leagues produce fewer goals overall</li>
<li><strong>Combine with other markets</strong> &mdash; Over 1.5 pairs well with <a href="/predictions/1x2">1X2 picks</a> in accumulators</li>
</ul>

<h2>Over 1.5 vs Over 2.5</h2>
<p>The main difference is the goal threshold. Over 1.5 requires 2+ goals, while <a href="/predictions/over-2-5">Over 2.5</a> requires 3+. Over 1.5 has a higher hit rate (more matches qualify) but shorter odds. Over 2.5 offers better odds but fewer winning bets. Many bettors use Over 1.5 as a foundation leg in accumulators because of its reliability.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About Over 1.5 Goals Predictions</h3>
<div class="seo-faq-item">
<h4>What does Over 1.5 mean in football betting?</h4>
<p>Over 1.5 means you are predicting that the total number of goals scored by both teams combined will be 2 or more. A result of 1-1, 2-0, 0-2, 2-1, or any higher score wins the bet.</p>
</div>
<div class="seo-faq-item">
<h4>How often do matches go over 1.5 goals?</h4>
<p>Globally, roughly 70-75% of professional football matches produce 2 or more goals. The exact rate varies by league, with the Eredivisie and Bundesliga tending higher and Ligue 1 and Serie A tending lower.</p>
</div>
<div class="seo-faq-item">
<h4>Is Over 1.5 a good accumulator leg?</h4>
<p>Yes. Over 1.5 is one of the most popular accumulator legs because of its high strike rate. It adds a safety buffer while still contributing to overall odds. Use our <a href="/ticket-builder.html">Ticket Builder</a> to combine Over 1.5 picks with other markets.</p>
</div>
<div class="seo-faq-item">
<h4>Do Over 1.5 predictions include own goals?</h4>
<p>Yes. Own goals count toward the total in all goal-based markets including Over 1.5.</p>
</div>
</div>
</section>`,

  'over-2-5': `<section class="seo-content">
<h2>What Are Over 2.5 Goals Predictions?</h2>
<p>Over 2.5 goals predictions identify football matches where our model expects 3 or more goals in regulation time. This is one of the most balanced football betting markets, offering a middle ground between the high strike rate of <a href="/predictions/over-1-5">Over 1.5</a> and the higher odds of Over 3.5. Each prediction on this page includes a probability score so you can assess the confidence behind each pick.</p>

<h2>How Our Over 2.5 Predictions Work</h2>
<p>Our prediction model identifies high-scoring fixtures by analyzing:</p>
<ul>
<li><strong>Attacking strength</strong> &mdash; how many goals each team scores per game on average</li>
<li><strong>Defensive vulnerability</strong> &mdash; how many goals each team concedes per game</li>
<li><strong>Head-to-head goal history</strong> &mdash; whether past meetings between the two teams tend to be high-scoring</li>
<li><strong>Recent form</strong> &mdash; teams on scoring runs are more likely to produce goals</li>
<li><strong>Match context</strong> &mdash; must-win games and open attacking styles increase goal probability</li>
</ul>
<p>Matches with probabilities above 70% are considered strong Over 2.5 candidates. The model refreshes predictions daily at 1:00 AM WAT with a secondary update at 6:00 AM WAT.</p>

<h2>How to Use Over 2.5 Predictions</h2>
<p>The Over 2.5 market requires 3 or more goals to win. Results like 1-1, 2-0, or 1-0 lose the bet. Here are tips for getting the most from this market:</p>
<ul>
<li><strong>Target probability above 70%</strong> &mdash; our probability percentages indicate model confidence</li>
<li><strong>Check both teams</strong> &mdash; matches where both teams have strong attacks and weak defenses are ideal</li>
<li><strong>Combine with BTTS</strong> &mdash; if both teams score and the match is open, Over 2.5 is likely</li>
<li><strong>Use in accumulators</strong> &mdash; Over 2.5 odds typically range from 1.70 to 2.10, making them good accumulator legs</li>
<li><strong>Build tickets with our tool</strong> &mdash; the <a href="/ticket-builder.html">Ticket Builder</a> automatically combines Over 2.5 with <a href="/predictions/1x2">1X2</a>, <a href="/predictions/btts">BTTS</a>, and other markets</li>
</ul>

<h2>Over 2.5 vs Other Goal Markets</h2>
<p><strong>Over 1.5</strong> has a higher hit rate but lower odds. <strong>Over 2.5</strong> is the sweet spot for most bettors. <strong>Over 3.5</strong> offers even higher odds but requires 4 goals, which happens less frequently. Your choice depends on your risk tolerance and accumulator strategy. Many experienced bettors mix Over 1.5 and Over 2.5 picks in the same ticket for balanced risk.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About Over 2.5 Goals Predictions</h3>
<div class="seo-faq-item">
<h4>What does Over 2.5 goals mean?</h4>
<p>Over 2.5 means the total goals scored by both teams must be 3 or more. Scores like 2-1, 3-0, 1-2, 2-2, or higher win the bet. Scores of 0-0, 1-0, 0-1, or 1-1 lose.</p>
</div>
<div class="seo-faq-item">
<h4>How often do football matches go over 2.5 goals?</h4>
<p>Approximately 50-55% of professional football matches produce 3 or more goals. The rate varies significantly by league and match context.</p>
</div>
<div class="seo-faq-item">
<h4>What leagues have the most Over 2.5 results?</h4>
<p>The Eredivisie (Netherlands), Bundesliga (Germany), and Swiss Super League consistently produce the highest Over 2.5 rates. The Premier League and La Liga also tend to have above-average goal totals.</p>
</div>
<div class="seo-faq-item">
<h4>Is Over 2.5 good for accumulators?</h4>
<p>Yes. Over 2.5 offers a good balance of odds and probability, making it a popular accumulator leg. Combined with <a href="/predictions/1x2">1X2 picks</a>, it creates well-rounded tickets.</p>
</div>
</div>
</section>`,

  'btts': `<section class="seo-content">
<h2>What Are BTTS Yes Predictions?</h2>
<p>BTTS (Both Teams To Score) Yes predictions identify matches where our model expects both teams to score at least one goal during regulation time. This market is one of the most popular in football betting because it removes the need to predict a winner &mdash; you simply need both teams to find the net.</p>
<p>BTTS Yes predictions are displayed on this page with probability percentages, match details, league information, and kick-off times. Each prediction is generated daily by our AI model after analyzing attacking output, defensive records, and historical BTTS rates for both teams.</p>

<h2>How Our BTTS Yes Predictions Work</h2>
<p>Our model evaluates both teams independently to determine the likelihood of each scoring. Key factors include:</p>
<ul>
<li><strong>Goals scored per game</strong> &mdash; teams that regularly score are strong BTTS candidates</li>
<li><strong>Goals conceded per game</strong> &mdash; teams that leak goals make BTTS more likely</li>
<li><strong>Home/away scoring trends</strong> &mdash; home teams score more often, but away scoring matters too</li>
<li><strong>Head-to-head BTTS history</strong> &mdash; whether past meetings between the teams produced goals from both sides</li>
<li><strong>Key player availability</strong> &mdash; injuries to top scorers or goalkeepers affect BTTS probability</li>
</ul>
<p>A match is a strong BTTS candidate when both teams have strong attacks and questionable defenses. One-sided matches (a dominant team vs a weak opponent) are less likely to produce BTTS because the weaker team may fail to score.</p>

<h2>How to Bet on BTTS Yes</h2>
<p>The BTTS Yes market wins if both teams score at least 1 goal each. A 1-1, 2-1, 1-2, 2-2, or any similar scoreline wins. A 1-0, 0-1, 0-0, or 2-0 result loses. Tips for using this market:</p>
<ul>
<li><strong>Target attacking matchups</strong> &mdash; look for fixtures where both teams have scored in most of their recent games</li>
<li><strong>Check the probability</strong> &mdash; our percentage scores indicate how likely both teams are to score</li>
<li><strong>Combine with Over 2.5</strong> &mdash; BTTS Yes and <a href="/predictions/over-2-5">Over 2.5 goals</a> often overlap and create strong accumulator legs</li>
<li><strong>Compare with BTTS No</strong> &mdash; check our <a href="/predictions/btts-no">BTTS No predictions</a> to see which matches are one-sided</li>
<li><strong>Use Ticket Builder</strong> &mdash; our <a href="/ticket-builder.html">Ticket Builder</a> tool combines BTTS with <a href="/predictions/1x2">1X2</a> and other markets for optimized accumulators</li>
</ul>

<h2>BTTS Yes vs BTTS No</h2>
<p><strong>BTTS Yes</strong> wins when both teams score. <strong>BTTS No</strong> wins when at least one team fails to score. They are complementary markets. Matches between two attacking teams favor BTTS Yes. Matches featuring a strong defense against a weak attack favor BTTS No. WinFulltime publishes both so you can compare and choose the best fit for each fixture.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About BTTS Yes Predictions</h3>
<div class="seo-faq-item">
<h4>What does BTTS stand for?</h4>
<p>BTTS stands for Both Teams To Score. A BTTS Yes bet wins if both teams score at least one goal during the 90 minutes of regulation time.</p>
</div>
<div class="seo-faq-item">
<h4>Do own goals count for BTTS?</h4>
<p>Yes. Any goal scored by either team, including own goals, counts toward the BTTS outcome.</p>
</div>
<div class="seo-faq-item">
<h4>How often does BTTS land?</h4>
<p>BTTS Yes occurs in roughly 50-55% of professional football matches globally. The rate is higher in attacking leagues like the Eredivisie and Bundesliga.</p>
</div>
<div class="seo-faq-item">
<h4>Is BTTS good for accumulators?</h4>
<p>Yes. BTTS picks typically offer odds between 1.70 and 2.00, making them solid accumulator legs. Combining BTTS with <a href="/predictions/over-2-5">Over 2.5</a> and <a href="/predictions/1x2">1X2</a> creates balanced tickets.</p>
</div>
</div>
</section>`,

  'btts-no': `<section class="seo-content">
<h2>What Are BTTS No Predictions?</h2>
<p>BTTS No (Both Teams To Score No) predictions identify matches where our model expects at least one team to fail to score. This market wins when the match ends with at least one clean sheet &mdash; meaning one or both teams do not register a goal. Common winning scorelines include 1-0, 0-1, 2-0, 0-2, 3-0, and 0-0.</p>
<p>BTTS No is a valuable market when a dominant defense faces a weak attack, or when a team is missing key forwards through injury or suspension. Our predictions include probability percentages to help you assess the risk behind each pick.</p>

<h2>How Our BTTS No Predictions Work</h2>
<p>Our model identifies fixtures where at least one team is unlikely to score. The key factors include:</p>
<ul>
<li><strong>Clean sheet records</strong> &mdash; teams with strong defensive records and frequent clean sheets are prime BTTS No candidates</li>
<li><strong>Attacking weakness</strong> &mdash; teams that struggle to score away from home or against top defenses</li>
<li><strong>Goalkeeper form</strong> &mdash; in-form goalkeepers increase clean sheet probability</li>
<li><strong>Tactical setup</strong> &mdash; teams that sit deep and counter-attack often keep clean sheets</li>
<li><strong>Head-to-head shutout history</strong> &mdash; whether past meetings frequently produced clean sheets</li>
</ul>
<p>A match between a strong defensive team and a weak attacking team is the classic BTTS No scenario. Derbies and low-scoring league matches also tend to produce more BTTS No outcomes.</p>

<h2>How to Bet on BTTS No</h2>
<p>BTTS No wins if at least one team does not score. A 1-0, 0-1, 2-0, 0-0, or 3-0 result wins. A 1-1, 2-1, or any result where both teams score loses. Tips for this market:</p>
<ul>
<li><strong>Look for defensive teams</strong> &mdash; teams with 10+ clean sheets in a season are strong BTTS No candidates</li>
<li><strong>Check away form</strong> &mdash; many teams struggle to score on the road, making BTTS No more likely</li>
<li><strong>Consider match context</strong> &mdash; must-not-lose games lead to defensive setups</li>
<li><strong>Cross-reference with 1X2</strong> &mdash; if our <a href="/predictions/1x2">1X2 model</a> predicts a low-scoring affair, BTTS No is more likely</li>
<li><strong>Use Ticket Builder</strong> &mdash; our <a href="/ticket-builder.html">Ticket Builder</a> lets you combine BTTS No with other markets for balanced accumulators</li>
</ul>

<h2>BTTS No vs Other Markets</h2>
<p>BTTS No often pairs well with <a href="/predictions/over-1-5">Under 2.5 goals</a> and <a href="/predictions/1x2">1X2 bets</a> where a clean sheet is expected. It is the inverse of our <a href="/predictions/btts">BTTS Yes predictions</a> &mdash; we publish both so you can match the right market to each fixture.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About BTTS No Predictions</h3>
<div class="seo-faq-item">
<h4>What does BTTS No mean?</h4>
<p>BTTS No means you are betting that at least one team will not score in the match. A 0-0 draw also wins a BTTS No bet.</p>
</div>
<div class="seo-faq-item">
<h4>Does extra time count?</h4>
<p>No. BTTS No applies to the 90-minute regulation result including stoppage time. Extra time and penalties are excluded.</p>
</div>
<div class="seo-faq-item">
<h4>When is BTTS No most likely?</h4>
<p>BTTS No is most likely when a strong defensive team hosts a weak attacking team, or in matches with low historical goal totals. Our predictions highlight the highest-confidence BTTS No fixtures daily.</p>
</div>
<div class="seo-faq-item">
<h4>How does BTTS No differ from Under 2.5?</h4>
<p>BTTS No only requires one team to fail to score (a 2-0 result wins). Under 2.5 requires fewer than 3 total goals (a 1-1 result wins). They overlap but are not the same market.</p>
</div>
</div>
</section>`,

  'unbeaten': `<section class="seo-content">
<h2>What Are Unbeaten Streak Predictions?</h2>
<p>The Unbeaten Streaks page on WinFulltime tracks football teams that have not lost a set number of consecutive matches. An unbeaten streak is one of the strongest indicators of form in football. When a team has gone 5, 10, or even 20 games without a defeat, it signals tactical consistency, squad depth, and psychological confidence. Our unbeaten streak predictions aggregate data from head-to-head records, recent results, and league standing momentum to surface the teams most likely to continue their run.</p>
<p>Unlike a single-match prediction, unbeaten streak data gives you a broader view of team trajectory. A team sitting mid-table might be on a 12-game unbeaten run, making them a strong pick for upcoming fixtures even if they are not title contenders. This page updates daily with fresh data across leagues worldwide.</p>

<h2>How to Read Unbeaten Streak Data</h2>
<p>Each match card on this page shows the fixture, kick-off time, league, and one or more streak badges. The streak badge displays the number of games the team has gone without a loss. For example, a badge reading <strong>"8 unbeaten"</strong> means the team has not lost in their last 8 matches. Some entries also show <strong>"home"</strong> or <strong>"away"</strong> to indicate the streak applies specifically to home or away fixtures only.</p>
<p>Use the <strong>Yesterday</strong>, <strong>Today</strong>, and <strong>Tomorrow</strong> tabs to navigate between dates. The data covers both completed results and upcoming fixtures, so you can see which teams are carrying momentum into their next match.</p>

<h2>Why Unbeaten Streaks Matter for Betting</h2>
<p>Unbeaten streaks are useful for identifying value bets that other punters might overlook. A team on a long unbeaten run is often priced shorter by bookmakers after a few wins, but mid-table teams with quiet unbeaten runs of 8 to 12 games frequently offer better odds. Key factors that sustain unbeaten runs include:</p>
<ul>
<li><strong>Defensive solidity</strong> &mdash; teams conceding fewer goals are harder to beat</li>
<li><strong>Home advantage</strong> &mdash; unbeaten home streaks are more common and more reliable</li>
<li><strong>Fixture difficulty</strong> &mdash; a run against weaker opponents is less predictive than one against top-half teams</li>
<li><strong>Squad fitness</strong> &mdash; injuries to key players can end a streak quickly</li>
</ul>
<p>For the best results, combine unbeaten streak data with our <a href="/predictions/1x2">1X2 predictions</a>, <a href="/predictions/over-1-5">Over 1.5 goals tips</a>, and <a href="/predictions/btts">BTTS predictions</a>. Use the <a href="/ticket-builder.html">Ticket Builder</a> to assemble informed accumulator tickets from multiple markets.</p>

<h2>Which Leagues Are Covered?</h2>
<p>WinFulltime tracks unbeaten streaks across dozens of leagues including the <strong>English Premier League</strong>, <strong>La Liga</strong>, <strong>Serie A</strong>, <strong>Bundesliga</strong>, <strong>Ligue 1</strong>, <strong>Eredivisie</strong>, <strong>Primeira Liga</strong>, and many more. We also cover lower divisions and emerging leagues to give you the widest possible coverage of unbeaten form data.</p>
<p>Data is refreshed every morning at approximately 4:00 AM WAT, with a secondary update at 6:00 AM WAT to capture late results and newly scheduled fixtures.</p>

<div class="seo-faq">
<h3>Frequently Asked Questions About Unbeaten Streak Predictions</h3>
<div class="seo-faq-item">
<h4>What counts as an unbeaten streak?</h4>
<p>An unbeaten streak is a sequence of consecutive matches in which a team has not lost. This includes wins and draws. A streak ends when the team suffers a defeat. We track streaks of 5 or more games across all competitions.</p>
</div>
<div class="seo-faq-item">
<h4>How is this different from a win streak?</h4>
<p>A win streak only counts consecutive victories, while an unbeaten streak includes draws. A team can be unbeaten in 10 games but have drawn 4 of them. Unbeaten streaks are a broader measure of consistency.</p>
</div>
<div class="seo-faq-item">
<h4>Can I combine unbeaten streaks with other markets?</h4>
<p>Yes. Unbeaten streak data works well alongside <a href="/predictions/1x2">1X2 tips</a> and <a href="/predictions/over-1-5">Over 1.5 goals</a> in accumulators. Teams on long unbeaten runs are statistically more likely to avoid defeat, making them strong double-chance or draw-no-bet picks.</p>
</div>
<div class="seo-faq-item">
<h4>When is the data updated?</h4>
<p>Unbeaten streak data updates daily. The primary scrape runs at 1:00 AM WAT and a secondary update at 6:00 AM WAT ensures late-appearing matches and results are captured.</p>
</div>
</div>
</section>`
};

const CATEGORIES = {
  '1x2': {
    dataKey: 'matches',
    title: '1X2 Football Predictions Today',
    description: 'Free AI-powered 1X2 football predictions for today. Expert home, draw, and away win tips across 50+ leagues worldwide.',
    keywords: '1X2 predictions, football predictions today, home win tips, draw predictions, away win tips, soccer betting tips',
    heading: '1X2 Predictions',
    label: '1X2'
  },
  'over-1-5': {
    dataKey: 'over15Matches',
    title: 'Over 1.5 Goals Predictions Today',
    description: 'Free Over 1.5 goals football predictions for today. Data-driven tips for matches likely to produce 2 or more goals.',
    keywords: 'over 1.5 predictions, over 1.5 goals tips, football goals betting, soccer over under tips',
    heading: 'Over 1.5 Goals',
    label: 'Over 1.5'
  },
  'over-2-5': {
    dataKey: 'over25Matches',
    title: 'Over 2.5 Goals Predictions Today',
    description: 'Free Over 2.5 goals football predictions for today. Expert tips for high-scoring matches across major leagues.',
    keywords: 'over 2.5 predictions, over 2.5 goals tips, high scoring football tips, soccer goals betting',
    heading: 'Over 2.5 Goals',
    label: 'Over 2.5'
  },
  'btts': {
    dataKey: 'bttsMatches',
    title: 'BTTS Yes Predictions Today',
    description: 'Free Both Teams to Score (BTTS) predictions for today. Tips for matches where both teams are expected to score.',
    keywords: 'BTTS predictions, both teams to score tips, BTTS yes predictions, soccer both teams to score',
    heading: 'BTTS Yes',
    label: 'BTTS Yes'
  },
  'btts-no': {
    dataKey: 'bttsNoMatches',
    title: 'BTTS No Predictions Today',
    description: 'Free Both Teams to Score No predictions for today. Tips for matches where at least one team will fail to score.',
    keywords: 'BTTS no predictions, both teams to score no, clean sheet tips, soccer shutout predictions',
    heading: 'BTTS No',
    label: 'BTTS No'
  },
  'unbeaten': {
    dataKey: null,
    title: 'Unbeaten Streak Predictions Today',
    description: 'Free unbeaten streak football predictions for today. Teams on long unbeaten runs and their upcoming fixtures.',
    keywords: 'unbeaten streak predictions, football unbeaten runs, teams on winning streak, unbeaten football tips',
    heading: 'Unbeaten Streaks',
    label: 'Unbeaten'
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generateCategoryPage(slug, catConfig) {
  const allSlugs = Object.keys(CATEGORIES);
  const categoryTabs = allSlugs.map(s => {
    const c = CATEGORIES[s];
    const active = s === slug ? ' active' : '';
    return `<a href="/predictions/${s}" id="tab-${s}" class="tab-btn${active}">${escapeHtml(c.label)}</a>`;
  }).join('\n            ');

  const isStreak = slug === 'draws-streak';
  const isUnbeaten = slug === 'unbeaten';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(catConfig.title)} | WinFulltime</title>
<meta name="description" content="${escapeHtml(catConfig.description)}">
<meta name="keywords" content="${escapeHtml(catConfig.keywords)}">
<meta property="og:title" content="${escapeHtml(catConfig.title)} | WinFulltime">
<meta property="og:url" content="https://winfulltime.com/predictions/${slug}">
<meta property="og:description" content="${escapeHtml(catConfig.description)}">
<meta property="og:image" content="https://winfulltime.com/winfulltimelogo.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(catConfig.title)} | WinFulltime">
<meta name="twitter:description" content="${escapeHtml(catConfig.description)}">
<meta name="twitter:image" content="https://winfulltime.com/winfulltimelogo.png">
<link rel="canonical" href="https://winfulltime.com/predictions/${slug}">
<link rel="icon" href="/winfulltimelogo.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/app.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${escapeHtml(catConfig.title)}",
  "description": "${escapeHtml(catConfig.description)}",
  "url": "https://winfulltime.com/predictions/${slug}",
  "publisher": {
    "@type": "Organization",
    "name": "WinFulltime",
    "logo": { "@type": "ImageObject", "url": "https://winfulltime.com/winfulltimelogo.png" }
  }
}
</script>
<style>
.date-tabs{display:flex;justify-content:center;gap:0;margin-bottom:24px;background:var(--bg-card);border-radius:12px;padding:4px;width:fit-content;margin-left:auto;margin-right:auto;border:1px solid var(--border)}
.date-tab{flex:1;padding:10px 24px;border:none;border-radius:8px;background:transparent;color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap;min-width:100px;text-align:center}
.date-tab:hover{color:var(--text-primary);background:var(--bg-card-hover)}
.date-tab.active{background:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:12px;color:var(--text-primary)}
.seo-content h3{font-size:18px;font-weight:700;margin-top:24px;margin-bottom:10px;color:var(--text-primary)}
.seo-content p{font-size:15px;line-height:1.7;color:var(--text-secondary);margin-bottom:16px}
.seo-content ul{margin:0 0 16px;padding-left:20px}
.seo-content li{font-size:15px;line-height:1.7;color:var(--text-secondary);margin-bottom:6px}
.seo-content a{color:var(--accent);text-decoration:none;font-weight:500}
.seo-content a:hover{text-decoration:underline}
.seo-faq{margin-top:32px}
.seo-faq h3{margin-bottom:12px}
.seo-faq-item{margin-bottom:16px}
.seo-faq-item h4{font-size:16px;font-weight:600;margin-bottom:6px;color:var(--text-primary)}
.seo-faq-item p{font-size:14px;line-height:1.7;color:var(--text-secondary);margin:0}
@media(max-width:640px){.seo-content h2{font-size:18px}.seo-content p,.seo-content li{font-size:14px}}
</style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6975707128100932" crossorigin="anonymous"></script>
</head>
<body>
<div>
<header>
<div class="header-content">
<div class="logo"><a href="/" class="logo"><img src="/winfulltimelogo.png" alt="WinFulltime" class="logo-icon" width="28" height="28">Win<span>Fulltime</span></a></div>
<nav>
<a href="/">Home</a>
<a href="/ticket-builder.html">Ticket Builder</a>
<a href="/blog/">Blog</a>
<a href="/contact.html">Contact</a>
</nav>
</div>
</header>
<main class="container">
<div class="hero">
<h1 id="pageHeading">${escapeHtml(catConfig.heading)}<br>Predictions For Today</h1>
<p class="hero-subtext" id="pageDescription">${escapeHtml(catConfig.description)}</p>
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
</div>

${SEO_CONTENT[slug] || ''}

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
</footer>
<script src="/chat-widget.js"></script>
<script>
(function(){const s=localStorage.getItem("wf-theme");const t=s||"dark";document.documentElement.setAttribute("data-theme",t==="dark"?"":"light");const b=document.getElementById("themeToggle");if(b)b.textContent=t==="dark"?"Light":"Dark";})();
document.addEventListener("DOMContentLoaded",function(){const b=document.getElementById("themeToggle");if(!b)return;b.addEventListener("click",function(){const h=document.documentElement;const l=h.getAttribute("data-theme")==="light";if(l){h.removeAttribute("data-theme");b.textContent="Light";localStorage.setItem("wf-theme","dark")}else{h.setAttribute("data-theme","light");b.textContent="Dark";localStorage.setItem("wf-theme","light")}});});
</script>
<script src="/responsible-gambling.js"></script>
<script>
(function() {
  var CATEGORY_SLUG = '${slug}';
  var CATEGORY_LABEL = '${escapeHtml(catConfig.heading)}';
  var DATA_KEY = ${catConfig.dataKey ? "'" + catConfig.dataKey + "'" : 'null'};
  var IS_STREAK = ${isStreak ? 'true' : 'false'};
  var IS_UNBEATEN = ${isUnbeaten ? 'true' : 'false'};
  var CATEGORY_HEADING = '${escapeHtml(catConfig.heading)}';

  var allData = null;
  var h2hData = null;
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
    document.getElementById('pageHeading').innerHTML = CATEGORY_HEADING + '<br>Predictions For ' + dayLabel;

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
      var matchStr = match.match || match.nextMatch || '';
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
        cardContent = '<div class="match-teams" style="justify-content:center;"><span class="team team-home" style="text-align:center;width:100%;">' + home + '</span></div>' +
          '<div class="match-footer"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;">' +
          '<span class="tip-badge">' + streakLabel + '</span>' +
          '<div class="probability">' + match.probability + '%</div></div></div>';
      } else {
        cardContent = '<div class="match-teams"><span class="team team-home">' + home + '</span>' +
          (hasScore ? '<span class="vs-score score-display">' + displayScore.home + ' - ' + displayScore.away + '</span>' : '<span class="vs-score">vs</span>') +
          '<span class="team team-away">' + away + '</span></div>' +
          '<div class="match-footer"><div style="text-align:center;display:flex;flex-direction:column;align-items:center;">' +
          '<span class="tip-badge">' + match.tip + '</span>' +
          '<div class="probability">' + match.probability + '%</div></div></div>';
      }

      return '<div class="match-card fade-in" style="animation-delay:' + (i * 50) + 'ms">' +
        '<div class="match-header"><span></span><span>' + (match.time || '') + '</span></div>' +
        cardContent + '</div>';
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
</body>
</html>`;
}

function generateAllPages(outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const [slug, config] of Object.entries(CATEGORIES)) {
    const html = generateCategoryPage(slug, config);
    fs.writeFileSync(path.join(outputDir, slug + '.html'), html);
    console.log('Generated: predictions/' + slug + '.html');
  }

  console.log('All category pages generated in ' + outputDir);
}

module.exports = { CATEGORIES, generateCategoryPage, generateAllPages };

if (require.main === module) {
  const outDir = path.join(__dirname, '..', 'public', 'predictions');
  generateAllPages(outDir);
}
