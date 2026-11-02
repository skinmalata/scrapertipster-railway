// Cross-check SportyBet slip selections against WinFulltime model predictions
const d = require('./public/data/predictions.json');

const legs = [
  { sel: 'Home or Draw', odds: 1.11, match: 'AL Hala vs Bouri', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.17, match: 'Nautico PE vs Gremio Novorizontino SP', type: 'DC' },
  { sel: 'Over 0.5', odds: 1.15, match: 'Santos FC SP vs CR Flamengo RJ', type: 'OU' },
  { sel: 'Home', odds: 1.27, match: 'Fluminense FC RJ vs Coritiba FC PR', type: '1X2' },
  { sel: 'Home or Draw', odds: 1.16, match: 'SE Palmeiras SP vs EC Bahia BA', type: 'DC' },
  { sel: 'Over 0.5', odds: 1.25, match: 'CA Paranaense PR vs Atletico Mineiro MG', type: 'OU' },
  { sel: 'Home or Draw', odds: 1.14, match: 'Atletico Nacional vs CD Tolima', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.19, match: 'Fortaleza FC vs Millonarios FC', type: 'DC' },
  { sel: 'Over 2.5', odds: 1.17, match: 'Sporting FC vs Moravia', type: 'OU' },
  { sel: 'Home or Draw', odds: 1.14, match: 'Atletico Rojiblanco vs San Antonio FC', type: 'DC' },
  { sel: 'Under 3.5', odds: 1.13, match: 'Ghazl El Mahallah vs Abo Qair Semads', type: 'OU' },
  { sel: 'Under 3.5', odds: 1.17, match: 'Modern Sport FC vs National Bank of Egypt SC', type: 'OU' },
  { sel: 'Home or Draw', odds: 1.15, match: 'CD FAS Santa Ana vs Alianza FC San Salvador', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.14, match: 'Kuopion Palloseura vs AC Oulu', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.15, match: 'HJK Helsinki vs Vaasan Palloseura', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.15, match: 'Sepahan SC vs Fajr Sepasi FC', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.18, match: 'Foolad Khuzestan FC vs Mes Shahr-e Babak', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.22, match: 'AL Talaba vs Al Shorta SC', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.22, match: 'AL Naft Maysan vs Erbil SC', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.21, match: 'Hapoel Herzelia FC vs Hapoel Mahane Yehuda', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.19, match: 'MS Tira vs Ironi Nesher', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.16, match: 'Holon Yermiyahu FC vs AS Nordia Jerusalem', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.20, match: 'Hapoel Nir Ramat Hasharon FC vs Hapoel Azor FC', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.24, match: 'Shabab AL Ordun vs Al Baqaa', type: 'DC' },
  { sel: 'Home or Draw', odds: 1.15, match: 'Safa SC vs Reyady Abaseya', type: 'DC' },
  { sel: 'Over 2.5', odds: 1.24, match: 'Bryne FK vs Haugesund', type: 'OU' },
  { sel: 'Home or Draw', odds: 1.17, match: 'Atletico Grau vs Los Chankas CYC', type: 'DC' },
  { sel: 'Draw or Away', odds: 1.24, match: 'CD Moquegua vs Cienciano', type: 'DC' },
  { sel: 'Over 1.5', odds: 1.19, match: 'Al-Shamal vs Al Duhail SC', type: 'OU' },
  { sel: 'Over 1.5', odds: 1.15, match: 'AL Wakrah SC vs Al Gharafa SC', type: 'OU' },
  { sel: 'Away', odds: 1.28, match: 'Al-Okhdood Club vs AL Ula', type: '1X2' },
  { sel: 'Over 1.5', odds: 1.20, match: 'Alingsas FC United vs IF Elfsborg', type: 'OU' },
  { sel: 'Away', odds: 1.09, match: 'Enskede IK vs IF Brommapojkarna', type: '1X2' },
  { sel: 'Draw or Away', odds: 1.17, match: 'Namungo FC vs TRA United Sports Club', type: 'DC' },
  { sel: 'Away', odds: 1.08, match: 'Denizli Idman Yurdu vs Serik Belediyespor', type: '1X2' },
  { sel: 'Home or Draw', odds: 1.09, match: 'NEC FC vs Express FC', type: 'DC' },
  { sel: 'Over 1.5', odds: 1.18, match: 'Al-Nasr Dubai CSC vs Hatta SC', type: 'OU' },
  { sel: 'Over 1.5', odds: 1.14, match: 'Khor Fakkan Club vs Al Wasl FC', type: 'OU' }
];

function norm(s) {
  return s.toLowerCase()
    .replace(/\b(fc|sc|cf|afc|bk|if|fk|pk|ac|cd|sc|United|Sports? Club|Club)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function tokens(s) { return new Set(norm(s).split(/\s+/).filter(t => t.length > 1)); }
function overlap(a, b) {
  const A = tokens(a), B = tokens(b);
  let hit = 0;
  A.forEach(t => { if (B.has(t)) hit++; });
  return hit / Math.min(A.size, B.size);
}
function splitMatch(m) {
  const p = m.split(/\s+vs\s+|\s+-\s+/);
  return [p[0] || '', p.slice(1).join(' ') || ''];
}

const markets = [
  { arr: d.matches, kind: '1X2' },
  { arr: d.over15Matches, kind: 'O15' },
  { arr: d.over25Matches, kind: 'O25' },
  { arr: d.under25Matches, kind: 'U25' },
  { arr: d.bttsMatches, kind: 'BTTS' },
  { arr: d.bttsNoMatches, kind: 'BTN' },
  { arr: d.htftMatches, kind: 'HTFT' },
  { arr: d.cornersMatches, kind: 'COR' }
].filter(m => Array.isArray(m.arr));

function findModel(mname) {
  const [mh, ma] = splitMatch(mname);
  let best = null, bestScore = 0;
  for (const mk of markets) {
    for (const m of mk.arr) {
      const [ph, pa] = splitMatch(m.match || '');
      if (!ph) continue;
      const s = (overlap(mh, ph) + overlap(ma, pa)) / 2;
      if (s > bestScore) { bestScore = s; best = { ...m, kind: mk.kind, score: s }; }
    }
  }
  return bestScore >= 0.6 ? best : null;
}

function modelProb(leg, mm) {
  if (!mm) return null;
  const p = mm.probabilities || {};
  // 1X2 / Double Chance only trustworthy from an actual 1X2 market entry
  if (mm.kind === '1X2') {
    if (leg.type === '1X2') {
      if (leg.sel === 'Home') return p.homeWin;
      if (leg.sel === 'Away') return p.awayWin;
      if (leg.sel === 'Draw') return p.draw;
    }
    if (leg.type === 'DC') {
      if (leg.sel === 'Home or Draw') return (p.homeWin || 0) + (p.draw || 0);
      if (leg.sel === 'Draw or Away') return (p.awayWin || 0) + (p.draw || 0);
      if (leg.sel === 'Home or Away') return (p.homeWin || 0) + (p.awayWin || 0);
    }
  }
  // Totals: only exact market matches (no borrowing O1.5 prob for O0.5 etc.)
  if (leg.type === 'OU' && mm.probability != null) {
    if (mm.kind === 'O15' && leg.sel === 'Over 1.5') return mm.probability;
    if (mm.kind === 'O25' && leg.sel === 'Over 2.5') return mm.probability;
    if (mm.kind === 'U25' && leg.sel === 'Under 2.5') return mm.probability;
  }
  return null;
}

const rows = legs.map(leg => {
  const implied = 100 / leg.odds;
  const mm = findModel(leg.match);
  const mp = modelProb(leg, mm);
  // flag model disagreement: we have real 1X2 data and it rates this outcome <40%
  let conflict = null;
  if (mm && mm.kind === '1X2' && mp != null && mp < 40) {
    conflict = `model rates "${leg.sel}" only ${mp}%`;
  }
  const conf = mp != null ? mp : implied;
  return {
    ...leg,
    implied: +implied.toFixed(1),
    modelProb: mp != null ? +mp.toFixed(1) : null,
    modelMatch: mm ? `${mm.match} [${mm.kind}] tip=${mm.tip || '-'} date=${mm.date}` : null,
    matchScore: mm ? +mm.score.toFixed(2) : null,
    conflict,
    conf: +conf.toFixed(1)
  };
});

rows.sort((a, b) => b.conf - a.conf);
console.log('rank | odds | implied | model | selection | match | model source');
rows.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)} | ${r.odds.toFixed(2)} | ${r.implied}% | ${r.modelProb == null ? '  --' : r.modelProb + '%'} | ${r.sel.padEnd(15)} | ${r.match.padEnd(48)} | ${r.modelMatch || 'NO MODEL DATA'}`
  );
});

const top20 = rows.slice(0, 20);
const total = top20.reduce((a, r) => a * r.odds, 1);
const survival = top20.reduce((a, r) => a * (r.conf / 100), 1);
const noModel = rows.filter(r => r.modelProb == null).length;
console.log('\n=== BEST 20 ===');
top20.forEach((r, i) => console.log(`${i + 1}. [${r.odds.toFixed(2)}] ${r.sel} — ${r.match}${r.conflict ? '  ⚠ ' + r.conflict : ''}${r.modelProb != null ? '  (model ' + r.modelProb + '%)' : ''}`));
console.log(`Combined odds: ${total.toFixed(2)}`);
console.log(`Est. survival chance (independent): ${(survival * 100).toFixed(1)}%`);
console.log(`Legs with model data: ${rows.length - noModel}/${rows.length}`);
const flagged = rows.filter(r => r.conflict);
if (flagged.length) {
  console.log('\nMODEL DISAGREEMENTS:');
  flagged.forEach(r => console.log(`  - ${r.match}: slip "${r.sel}" — ${r.conflict}`));
}
