'use strict';

const fs = require('fs');
const path = require('path');

const PREDICTIONS_FILE = path.join(__dirname, '..', 'predictions-cache.json');
const H2H_CACHE_FILE = path.join(__dirname, '..', 'h2h-unbeaten-cache.json');
const RESULTS_FILE = path.join(__dirname, '..', 'results-cache.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'teams');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyTeam(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateTeamFaqSchema(teamName) {
  const faqs = [
    {
      q: `How accurate are WinFulltime ${teamName} predictions?`,
      a: `Our AI model calculates probabilities for ${teamName} by evaluating recent team form, goal scoring rates, defensive efficiency, head-to-head records, and home/away splits.`
    },
    {
      q: `Where can I find upcoming match predictions for ${teamName}?`,
      a: `All upcoming ${teamName} fixtures, odds analysis, and 1X2, Over 2.5, BTTS, and corner predictions are updated daily on WinFulltime.`
    },
    {
      q: `Does ${teamName} perform better at home or away?`,
      a: `Our team hub tracks home vs. away form splits, scoring metrics, and clean sheet rates for ${teamName} across all competitive fixtures.`
    }
  ];

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  }, null, 2);
}

function generateTeamPage(teamName, teamSlug, teamData) {
  const canonicalUrl = `https://winfulltime.com/teams/${teamSlug}/`;
  const metaTitle = `${teamName} Betting Tips, Stats & Predictions | WinFulltime`;
  const metaDesc = `Comprehensive betting statistics, recent form, head-to-head records, and upcoming match predictions for ${teamName}. Free data-driven football tips.`;

  const upcomingCardsHtml = (teamData.upcoming || []).map(m => `
    <div class="match-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">⏱ ${escapeHtml(m.time || 'TBD')} | ${escapeHtml(m.league || 'Football')}</div>
      <div style="font-weight:700;font-size:16px;">${escapeHtml(m.home)} vs ${escapeHtml(m.away)}</div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="background:rgba(255,36,72,0.15);color:var(--accent);padding:4px 10px;border-radius:6px;font-weight:700;font-size:13px;">Tip: ${escapeHtml(m.tip || '1X2')}</span>
        <a href="/analysis/${m.date || new Date().toISOString().slice(0,10)}/${slugifyTeam(m.home)}-vs-${slugifyTeam(m.away)}/" style="color:var(--text-secondary);font-size:12px;text-decoration:none;font-weight:600;">View Analysis &rarr;</a>
      </div>
    </div>
  `).join('\n') || '<p style="color:var(--text-secondary);">No upcoming matches listed today for this team.</p>';

  const streaksHtml = (teamData.streaks || []).map(s => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:12px 16px;margin-bottom:10px;">
      <span style="font-weight:700;color:var(--accent);font-size:14px;">🔥 ${s.count} Match Streak</span>
      <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary);">${escapeHtml(s.text)}</p>
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HMGZMW9EDP"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HMGZMW9EDP');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeHtml(metaDesc)}">
<meta name="keywords" content="${escapeHtml(teamName)} betting tips, ${escapeHtml(teamName)} stats, ${escapeHtml(teamName)} predictions, ${escapeHtml(teamName)} form">
<meta property="og:title" content="${escapeHtml(metaTitle)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:description" content="${escapeHtml(metaDesc)}">
<meta property="og:image" content="https://winfulltime.com/winfulltimelogo.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(metaTitle)}">
<meta name="twitter:description" content="${escapeHtml(metaDesc)}">
<meta name="twitter:image" content="https://winfulltime.com/winfulltimelogo.png">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#ff2448">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/app.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SportsTeam",
  "name": "${escapeHtml(teamName)}",
  "url": "${canonicalUrl}",
  "memberOf": { "@type": "SportsOrganization", "name": "${escapeHtml(teamData.league || 'Football League')}" }
}
</script>
<script type="application/ld+json">
${generateTeamFaqSchema(teamName)}
</script>
<style>
.crumbs{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:16px 0 24px}
.crumbs a{color:var(--text-secondary);text-decoration:none}
.crumbs a:hover{color:var(--text-primary)}
.team-hero{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:32px}
.seo-content{margin-top:48px;border-top:1px solid var(--border);padding-top:32px}
.seo-content h2{font-size:22px;font-weight:700;margin-bottom:16px;color:var(--text-primary)}
.faq-list{display:flex;flex-direction:column;gap:8px}
.faq-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.faq-item summary{padding:16px 20px;font-weight:600;font-size:15px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
.faq-item summary::after{content:'+';font-size:18px;font-weight:700;color:var(--accent)}
.faq-item[open] summary::after{content:'\\2212'}
.faq-item p{padding:0 20px 16px;font-size:14px;line-height:1.6;color:var(--text-secondary);margin:0}
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
<a href="/best-picks.html">Best Picks</a>
<a href="/author-picks.html">Author Picks</a>
<a href="/blog/">Blog</a>
</nav>
</div>
</header>
<main class="container">
<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/">Home</a><span>/</span>
  <a href="/predictions/1x2">Predictions</a><span>/</span>
  <span aria-current="page">${escapeHtml(teamName)}</span>
</nav>

<div class="team-hero">
<h1 style="font-size:28px;font-weight:800;margin-bottom:8px;">${escapeHtml(teamName)}</h1>
<p style="color:var(--text-secondary);margin:0;font-size:14px;">${escapeHtml(teamData.league || 'Football')} ${teamData.country ? `(${escapeHtml(teamData.country)})` : ''}</p>
</div>

${streaksHtml ? `<h2 style="font-size:20px;font-weight:700;margin-bottom:16px;">Team Streaks &amp; Form Badges</h2>${streaksHtml}` : ''}

<h2 style="font-size:20px;font-weight:700;margin:24px 0 16px;">Upcoming Fixtures &amp; Predictions</h2>
<div>
  ${upcomingCardsHtml}
</div>

<section class="seo-content">
<h2>About ${escapeHtml(teamName)} Predictions</h2>
<p style="color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
WinFulltime evaluates competitive data for ${escapeHtml(teamName)} to generate probability models across 1X2, Over 2.5 goals, Both Teams to Score (BTTS), and corner lines. Our statistical engine tracks form trends, offensive output, defensive solidity, and historical matchup data.
</p>

<h2>Frequently Asked Questions</h2>
<div class="faq-list">
  <details class="faq-item">
    <summary>How accurate are WinFulltime ${escapeHtml(teamName)} predictions?</summary>
    <p>Our AI model calculates probabilities for ${escapeHtml(teamName)} by evaluating recent team form, goal scoring rates, defensive efficiency, head-to-head records, and home/away splits.</p>
  </details>
  <details class="faq-item">
    <summary>Where can I find upcoming match predictions for ${escapeHtml(teamName)}?</summary>
    <p>All upcoming ${escapeHtml(teamName)} fixtures, odds analysis, and 1X2, Over 2.5, BTTS, and corner predictions are updated daily on WinFulltime.</p>
  </details>
  <details class="faq-item">
    <summary>Does ${escapeHtml(teamName)} perform better at home or away?</summary>
    <p>Our team hub tracks home vs. away form splits, scoring metrics, and clean sheet rates for ${escapeHtml(teamName)} across all competitive fixtures.</p>
  </details>
</div>
</section>
</main>
<footer>
<div class="footer-content">
<p style="text-align:center;color:var(--text-secondary);font-size:13px;">&copy; ${new Date().getFullYear()} WinFulltime. All rights reserved.</p>
</div>
</footer>
</div>
</body>
</html>`;
}

function main() {
  const teamsMap = new Map();

  function getOrCreateTeam(name) {
    const slug = slugifyTeam(name);
    if (!slug) return null;
    if (!teamsMap.has(slug)) {
      teamsMap.set(slug, {
        name,
        slug,
        league: '',
        country: '',
        upcoming: [],
        streaks: []
      });
    }
    return teamsMap.get(slug);
  }

  // Load predictions cache
  if (fs.existsSync(PREDICTIONS_FILE)) {
    try {
      const predData = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
      const matches = predData.matches || [];
      matches.forEach(m => {
        const homeName = (m.home || (m.match ? m.match.split('-')[0] : '')).trim();
        const awayName = (m.away || (m.match ? m.match.split('-')[1] : '')).trim();
        
        if (homeName) {
          const t = getOrCreateTeam(homeName);
          if (t) {
            if (m.league) t.league = m.league;
            if (m.country) t.country = m.country;
            t.upcoming.push({ home: homeName, away: awayName, time: m.time, tip: m.tip, league: m.league, date: m.date });
          }
        }
        if (awayName) {
          const t = getOrCreateTeam(awayName);
          if (t) {
            if (m.league) t.league = m.league;
            if (m.country) t.country = m.country;
            t.upcoming.push({ home: homeName, away: awayName, time: m.time, tip: m.tip, league: m.league, date: m.date });
          }
        }
      });
    } catch (e) {
      console.warn('[team-pages] Error reading predictions cache:', e.message);
    }
  }

  // Load H2H cache for streaks
  if (fs.existsSync(H2H_CACHE_FILE)) {
    try {
      const h2hData = JSON.parse(fs.readFileSync(H2H_CACHE_FILE, 'utf8'));
      const datesObj = h2hData.dates || {};
      Object.keys(datesObj).forEach(d => {
        (datesObj[d] || []).forEach(m => {
          (m.streaks || []).forEach(s => {
            if (s.team) {
              const t = getOrCreateTeam(s.team);
              if (t && !t.streaks.some(x => x.text === s.text)) {
                t.streaks.push(s);
              }
            }
          });
        });
      });
    } catch (e) {
      console.warn('[team-pages] Error reading H2H cache:', e.message);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let generated = 0;

  teamsMap.forEach(tData => {
    const html = generateTeamPage(tData.name, tData.slug, tData);
    const dirPath = path.join(OUTPUT_DIR, tData.slug);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'index.html'), html);
    generated++;
  });

  console.log(`[team-pages] Prerendered ${generated} Team Statistics Pages under ${OUTPUT_DIR}`);
}

if (require.main === module) main();

module.exports = { main };
