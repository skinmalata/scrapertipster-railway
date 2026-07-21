

 let allPicks = [];

 let allUnbeaten = [];

 let lastData = null;

 let lastUbData = null;

 let lastTarget = 20;

 async function generateTickets(shuffle) {

 const target = parseFloat(document.getElementById('ticketTarget').value);

 const minOdds = parseFloat(document.getElementById('ticketMinOdds').value);

 const maxOdds = parseFloat(document.getElementById('ticketMaxOdds').value);

 const todayOnly = document.getElementById('ticketTodayOnly').checked;

 const results = document.getElementById('ticketResults');

 lastTarget = target;

 results.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Building tickets...</div></div>';

 try {

 if (!lastData) {

 const res = await fetch('/data/predictions.json');

 if (!res.ok) throw new Error('Failed to load predictions');

 lastData = await res.json();

 }

 if (!lastUbData) {

 try {

 const ubRes = await fetch('/data/h2h-unbeaten.json');

 if (ubRes.ok) lastUbData = await ubRes.json();

 } catch (e) {}

 }

 const data = lastData;

 const today = data.date || new Date().toISOString().split('T')[0];

 let unbeatenMatches = [];

 if (lastUbData) {

 unbeatenMatches = (lastUbData.dates && lastUbData.dates[today]) || [];

 }

 allPicks = [];

 const seen = new Set();

 function addPicks(matches, category) {

 if (!matches) return;

 for (const m of matches) {

 const matchName = m.nextMatch || m.match;

 if (!matchName || !m.tip || !m.probability) continue;

 const effectiveProb = m.probability > 0 && m.probability <= 100 ? m.probability : 50;

 if (todayOnly && m.date !== today) continue;
 if (effectiveProb < 40) continue;

 const odds = parseFloat(((100 / effectiveProb) / 1.05).toFixed(2));

 if (odds < minOdds || odds > maxOdds) continue;

 let tipText = m.tip;

 if (m.streak && m.match && matchName !== m.match) {

 tipText = m.match + ' - ' + m.tip;

 }

 const key = matchName + '|' + tipText + '|' + m.date;

 if (seen.has(key)) continue;

 seen.add(key);

 allPicks.push({

 match: matchName,

 tip: tipText,

 odds: odds,

 probability: effectiveProb,

 date: m.date,

 time: m.time || '',

 league: m.league || '',

 category: category

 });

 }

 }

 function addUnbeatenPicks(matches) {

 if (!matches) return;

 for (const m of matches) {

 if (!m.match || !m.streaks) continue;

 const matchDate = today;

 for (const s of m.streaks) {

 const tipText = s.team + ' or Draw';

 const key = m.match + '|' + tipText + '|' + matchDate;

 if (seen.has(key)) continue;

 const prob = Math.min(85, Math.max(42, 50 + s.count * 2));

 const odds = parseFloat(((100 / prob) / 1.05).toFixed(2));

 if (odds < minOdds || odds > maxOdds) continue;

 seen.add(key);

 allPicks.push({

 match: m.match,

 tip: tipText,

 odds: odds,

 probability: prob,

 date: matchDate,

 time: m.time || '',

 league: m.league || '',

 category: 'Unbeaten'

 });

 }

 }

 }

 addPicks(data.matches, '1X2');

 addPicks(data.over15Matches, 'Over 1.5');

 addPicks(data.over25Matches, 'Over 2.5');

 addPicks(data.bttsMatches, 'BTTS YES');

 addPicks(data.bttsNoMatches, 'BTTS NO');

 addUnbeatenPicks(unbeatenMatches);

 if (allPicks.length === 0) {

 results.innerHTML = '<div class="no-matches"><p>No picks match the criteria. Try adjusting your odds range or disable "Only Today\'s Matches".</p></div>';

 return;

 }

 buildTickets(target, shuffle);

 } catch (e) {

 results.innerHTML = '<div class="no-matches"><p>Unable to generate tickets. The prediction data may be unavailable. Try again later.</p></div>';

 }

 }

 function shuffleTickets() {

 if (allPicks.length === 0) {

 generateTickets(true);

 return;

 }

 buildTickets(lastTarget, true);

 }

 function buildTickets(target, shuffle) {

 const results = document.getElementById('ticketResults');

 const picks = shuffle ? shuffleArray([...allPicks]) : [...allPicks];

 picks.sort(function(a, b) { return a.odds - b.odds; });

 const scored = picks.map(function(p) {

 return Object.assign({}, p, {

 score: Math.abs(Math.log(p.odds) - Math.log(target) / 4)

 });

 });

 scored.sort(function(a, b) { return a.score - b.score; });

 var pool = [];

 var perCategory = {};

 for (var ci = 0; ci < scored.length; ci++) {

 var cat = scored[ci].category;

 if (!perCategory[cat]) perCategory[cat] = [];

 perCategory[cat].push(scored[ci]);

 }

 var cats = Object.keys(perCategory);

 var poolMatchCount = new Map();

 var poolLeagueCount = new Map();

 var catIdx = 0;

 for (var i = 0; i < 120; i++) {

 var catKey = cats[catIdx % cats.length];

 var catPicks = perCategory[catKey];

 var idx = Math.floor(catIdx / cats.length);

 if (idx < catPicks.length) {

 var pick = catPicks[idx];

 var mcnt = poolMatchCount.get(pick.match) || 0;

 var lcnt = poolLeagueCount.get(pick.league) || 0;

 if (mcnt < 2 && lcnt < 6) {

 poolMatchCount.set(pick.match, mcnt + 1);

 poolLeagueCount.set(pick.league, lcnt + 1);

 pool.push(pick);

 }

 }

 catIdx++;

 }

 var extraPicks = scored.filter(function(p) {

 return p.probability >= 40 && p.probability <= 55;

 });

 for (var ei = 0; ei < extraPicks.length && pool.length < 150; ei++) {

 var ep = extraPicks[ei];

 var emcnt = poolMatchCount.get(ep.match) || 0;

 if (emcnt < 2) {

 poolMatchCount.set(ep.match, emcnt + 1);

 pool.push(ep);

 }

 }

 pool.sort(function(a, b) { return a.odds - b.odds; });

 var tickets = [];

 var seenKeys = new Set();

 var iterations = 0;

 var MAX_ITER = 50000;

 var maxLegs = 8;

 function backtrack(start, current, product, usedMatches) {

 if (iterations >= MAX_ITER) return;

 if (current.length >= 2) {

 iterations++;

 var key = current.map(function(s) { return s.match + '|' + s.tip; }).sort().join('||');

 if (!seenKeys.has(key)) {

 seenKeys.add(key);

 tickets.push({

 selections: current.slice(),

 totalOdds: parseFloat(product.toFixed(2)),

 diff: Math.abs(product - target)

 });

 }

 }

 if (current.length >= maxLegs) return;

 for (var j = start; j < pool.length; j++) {

 if (iterations >= MAX_ITER) return;

 var p = pool[j];

 if (usedMatches.has(p.match)) continue;

 var newProduct = product * p.odds;

 if (newProduct > target * 1.2) break;

 usedMatches.add(p.match);

 current.push(p);

 backtrack(j + 1, current, newProduct, usedMatches);

 current.pop();

 usedMatches.delete(p.match);

 }

 }

 backtrack(0, [], 1, new Set());

 if (tickets.length === 0) {

 results.innerHTML = '<div class="no-matches"><p>No ticket combinations found. Try adjusting your target odds or range.</p></div>';

 return;

 }

 tickets.sort(function(a, b) { return a.diff - b.diff; });

 var top = [];

 var usedPairs = new Map();

 var taken = new Set();

 var maxTickets = 8;

 for (var round = 0; round < maxTickets; round++) {

 var bestIdx = -1;

 var bestScore = -Infinity;

 for (var ti = 0; ti < tickets.length; ti++) {

 if (taken.has(ti)) continue;

 var pairs = tickets[ti].selections.map(function(s) { return s.match + '|' + s.tip; });

 var exceeds = pairs.some(function(p) { return (usedPairs.get(p) || 0) >= 2; });

 if (exceeds) continue;

 var newCount = pairs.filter(function(p) { return !usedPairs.has(p); }).length;

 var sc = newCount * 100 - tickets[ti].diff;

 if (sc > bestScore) {

 bestScore = sc;

 bestIdx = ti;

 }

 }

 if (bestIdx === -1) break;

 var t = tickets[bestIdx];

 taken.add(bestIdx);

 top.push(t);

 var tpairs = t.selections.map(function(s) { return s.match + '|' + s.tip; });

 for (var pi = 0; pi < tpairs.length; pi++) {

 usedPairs.set(tpairs[pi], (usedPairs.get(tpairs[pi]) || 0) + 1);

 }

 }

 if (top.length < 2 && tickets.length > 0) {

 top.length = 0;

 top.push.apply(top, tickets.slice(0, maxTickets));

 }

 var AFFILIATE_URL = '';

 var html = top.map(function(ticket, tidx) {

 var legLines = ticket.selections.map(function(s, i) {

 return (i + 1) + '. ' + s.match + ' - ' + s.tip;

 });

 var copyData = JSON.stringify({

 legs: legLines,

 total: ticket.totalOdds,

 num: tidx + 1,

 target: target,

 aff: AFFILIATE_URL

 });

 var tableRows = ticket.selections.map(function(s, si) {

 return '<tr class="ticket-row fade-in" style="animation-delay: ' + (tidx * 80 + si * 30) + 'ms">' +

 '<td class="ticket-cell-num">' + (si + 1) + '</td>' +

 '<td class="ticket-cell-match">' + s.match + '</td>' +

 '<td class="ticket-cell-tip"><span class="tip-badge">' + s.tip + '</span></td>' +

 '</tr>'; }).join('');

 return '<div class="ticket-table-wrap fade-in" style="animation-delay: ' + (tidx * 80) + 'ms">' +

 '<div class="ticket-table-header">' +

 '<span class="ticket-table-title">Ticket ' + (tidx + 1) + ' &mdash; ' + ticket.selections.length + ' Legs</span>' +

 '<span class="ticket-odds">' + ticket.totalOdds + ' odds</span>' +

 '</div>' +

 '<table class="ticket-table">' +

 '<thead><tr>' +

 '<th class="th-num">#</th>' +

 '<th class="th-match">Match</th>' +

 '<th class="th-tip">Selection</th>' +

 '</tr></thead>' +

 '<tbody>' + tableRows + '</tbody>' +

 '</table>' +

 '<div class="ticket-table-footer">' +



 '<div class="ticket-actions">' +

 '<button class="copy-btn" data-copy=\'' + copyData + '\'>' +

 '<span class="copy-icon"></span> Copy Selections</button>' +

 '<div class="share-wrap"><button class="share-btn" data-toggle="share-' + tidx + '">&#9733; Share</button><div class="share-dropdown" id="share-' + tidx + '">' +

 '<a class="share-option" href="https://api.whatsapp.com/send?text=' + encodeURIComponent('WinFulltime Ticket ' + (tidx+1) + ' - ' + ticket.selections.length + ' Legs @ ' + ticket.totalOdds + ' odds') + '" target="_blank" rel="noopener">WhatsApp</a>' +

 '<a class="share-option" href="https://twitter.com/intent/tweet?text=' + encodeURIComponent('Check out this accumulator from @winfulltime! ' + ticket.totalOdds + ' odds, ' + ticket.selections.length + ' legs') + '" target="_blank" rel="noopener">X / Twitter</a>' +

 '<a class="share-option" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://winfulltime.com/ticket-builder.html') + '&quote=' + encodeURIComponent('Football Accumulator @ ' + ticket.totalOdds + ' odds') + '" target="_blank" rel="noopener">Facebook</a>' +

 '<a class="share-option" href="https://t.me/share/url?url=' + encodeURIComponent('https://winfulltime.com/ticket-builder.html') + '&text=' + encodeURIComponent('Football Accumulator @ ' + ticket.totalOdds + ' odds - ' + ticket.selections.length + ' legs') + '" target="_blank" rel="noopener">Telegram</a>' +

 '<a class="share-option share-copy" data-copy=\'' + copyData + '\'>' + 'Copy Link</a>' +

 '</div></div>' +

 (AFFILIATE_URL ? '<a href="' + AFFILIATE_URL + '" target="_blank" rel="noopener" class="bet-btn"> Bet Now</a>' : '') +

 '</div></div></div>';

 }).join('');

 results.innerHTML = '<div class="matches-grid">' + html + '</div>';

 }

 function shuffleArray(arr) {

 for (var i = arr.length - 1; i > 0; i--) {

 var j = Math.floor(Math.random() * (i + 1));

 var tmp = arr[i];

 arr[i] = arr[j];

 arr[j] = tmp;

 }

 return arr;

 }

 document.addEventListener('click', function(e) {

 var btn = e.target.closest('[data-copy]');

 if (!btn) return;

 var data = JSON.parse(btn.dataset.copy);

 var aff = data.aff ? '\n\n ' + data.aff : '';

 var text = 'WinFulltime Ticket ' + data.num + ' - ' + data.legs.length + ' Legs @ ' + data.total + ' odds\n\n' +

 data.legs.join('\n') + '\n\nTotal Odds: ' + data.total + '\nTarget: ' + data.target + aff;

 navigator.clipboard.writeText(text).then(function() {

 btn.classList.add('copied');

 var orig = btn.innerHTML;

 btn.innerHTML = '<span class="copy-icon"></span> Copied!';

 setTimeout(function() {

 btn.innerHTML = orig;

 btn.classList.remove('copied');

 }, 2000);

 }).catch(function() {

 alert('Failed to copy. Select and copy manually.');

 });

 });


 document.addEventListener('click', function(e) {
  var toggle = e.target.closest('[data-toggle]');
  if (toggle) {
   var dd = document.getElementById(toggle.dataset.toggle);
   if (dd) {
    var isOpen = dd.classList.contains('open');
    document.querySelectorAll('.share-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
    if (!isOpen) dd.classList.add('open');
   }
   return;
  }
  if (!e.target.closest('.share-wrap')) {
   document.querySelectorAll('.share-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
  }
 });
