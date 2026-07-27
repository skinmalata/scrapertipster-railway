const TWO_ODDS_MIN = 2.5;
const TWO_ODDS_MAX = 4;
const MAX_LEGS = 4;
const MIN_PROBABILITY = 0.7;

function watDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value ? new Date(value) : new Date());
  const result = {};
  parts.forEach(function(part) { result[part.type] = part.value; });
  return result.year + '-' + result.month + '-' + result.day;
}

function normalise(value) {
  return String(value || '').toLowerCase()
    .replace(/\(w\)|\(u\d+\)/g, '')
    .replace(/\b(fc|afc|cf|sc|ac|united)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function splitMatch(match) {
  const parts = String(match || '').split(/\s+(?:-|vs)\s+/i).map(function(part) { return part.trim(); });
  return parts.length === 2 && parts[0] && parts[1] ? parts : [];
}

function fixtureKey(match) {
  const teams = splitMatch(match).map(normalise);
  return teams.length === 2 ? teams.sort().join('|') : normalise(match);
}

function probability(value) {
  const result = Number(value);
  return Number.isFinite(result) ? Math.max(0, Math.min(1, result > 1 ? result / 100 : result)) : 0;
}

function estimatedOdds(probabilityValue) {
  // A three-point probability margin produces a deliberately conservative
  // model price when a verified bookmaker line is unavailable.
  const conservativeProbability = Math.min(0.92, probabilityValue + 0.03);
  return Number((1 / conservativeProbability).toFixed(2));
}

function marketDetails(category, source) {
  const tip = String(source.tip || '').trim();
  if (category === '1x2') {
    if (tip === '1') return { market: 'Match Winner', selection: 'Home Win', values: ['1', 'home'] };
    if (tip === '2') return { market: 'Match Winner', selection: 'Away Win', values: ['2', 'away'] };
    if (tip === 'X') return { market: 'Match Winner', selection: 'Draw', values: ['x', 'draw'] };
    if (/^(1X|X2|12)$/.test(tip)) return { market: 'Double Chance', selection: tip, values: [tip.toLowerCase()] };
  }
  if (category === 'over15' || category === 'over25') return { market: 'Goals Over/Under', selection: tip, values: [tip.toLowerCase()] };
  if (category === 'btts') return { market: 'Both Teams Score', selection: 'BTTS Yes', values: ['yes'] };
  if (category === 'bttsNo') return { market: 'Both Teams Score', selection: 'BTTS No', values: ['no'] };
  if (category === 'corners') return { market: 'Corners Over/Under', selection: tip, values: [tip.toLowerCase()] };
  if (category === 'cards') return { market: 'Cards Over/Under', selection: tip, values: [tip.toLowerCase()] };
  if (category === 'teamScore') return { market: 'Team to Score', selection: source.team + ' to Score', values: [] };
  return null;
}

function marketPriority(category) {
  return { teamScore: 6, over15: 5, bttsNo: 4, corners: 3, cards: 2, btts: 2, '1x2': 1, over25: 1 }[category] || 0;
}

function candidateFrom(category, source, date) {
  const match = source.match || source.nextMatch;
  const details = marketDetails(category, source);
  if (!match || !details || source.date !== date && source.nextMatchDate !== date) return null;
  const sourceProbability = probability(source.probability);
  if (sourceProbability < MIN_PROBABILITY) return null;
  if (/friendly|friendlies|u\d{2}|reserve|reserves|women/i.test(String(source.league || ''))) return null;
  const p = Math.min(0.9, sourceProbability);
  const evidence = buildEvidence(category, source, p);
  return {
    fixtureKey: fixtureKey(match),
    match: match,
    league: source.league || 'Unknown competition',
    time: source.time || '',
    market: details.market,
    selection: details.selection,
    values: details.values,
    category: category,
    sourceProbability: p,
    estimatedOdds: estimatedOdds(p),
    price: estimatedOdds(p),
    priceStatus: 'estimated',
    bookmaker: null,
    confidenceScore: Math.round(p * 100),
    evidence: evidence,
    priority: marketPriority(category)
  };
}

function buildEvidence(category, source, probabilityValue) {
  const confidence = Math.round(probabilityValue * 100);
  const probs = source.probabilities || {};
  const league = source.league || '';
  const match = source.match || '';
  const teams = splitMatch(match);
  const home = teams[0] || '';
  const away = teams[1] || '';
  if (category === '1x2') {
    const homeP = Math.round(probs.homeWin || 0);
    const drawP = Math.round(probs.draw || 0);
    const awayP = Math.round(probs.awayWin || 0);
    const gap = homeP - awayP;
    const parts = [];
    if (homeP) parts.push(home + ' win probability ' + homeP + '%');
    if (drawP) parts.push('draw ' + drawP + '%');
    if (awayP) parts.push(away + ' win ' + awayP + '%');
    const edge = gap > 30 ? home + ' are strong favourites with a ' + gap + '-point probability advantage'
      : gap > 15 ? home + ' hold a clear ' + gap + '-point edge'
      : gap > 5 ? home + ' hold a modest ' + gap + '-point edge'
      : 'A tightly contested match with minimal probability separation';
    return [edge + '. ' + parts.join(', ') + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  if (category === 'over25') {
    const over = Math.round(probs.over25 || 0);
    const under = Math.round(probs.under25 || 0);
    return ['Over 2.5 goal probability ' + confidence + '% (' + over + '% over vs ' + under + '% under)'
      + '. Both teams contribute to an open, high-scoring fixture profile'
      + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  if (category === 'over15') {
    const over = Math.round(probs.over15 || 0);
    const under = Math.round(probs.under15 || 0);
    return ['Over 1.5 goal probability ' + confidence + '% (' + over + '% over vs ' + under + '% under)'
      + '. Goal-scoring expected from the early stages of this fixture'
      + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  if (category === 'btts') {
    const yes = Math.round(probs.bttsYes || 0);
    const no = Math.round(probs.bttsNo || 0);
    return ['BTTS probability ' + confidence + '% (Yes ' + yes + '% vs No ' + no + '%)'
      + '. Both sides have the attacking capability and defensive vulnerabilities to score'
      + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  if (category === 'bttsNo') {
    const ots = Math.round(probs.ots || 0);
    return ['BTTS No probability ' + confidence + '% (One-team-score ' + ots + '%)'
      + '. One side dominates possession and chance creation, limiting the opponent'
      + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  if (category === 'corners') {
    const existing = (source.insights || []).filter(Boolean).slice(0, 2);
    return existing.length ? existing.concat(league ? [league] : []) : ['Corner market qualified at ' + confidence + '% confidence' + (league ? '. League: ' + league : '')];
  }
  if (category === 'cards') {
    const existing = (source.insights || []).filter(Boolean).slice(0, 2);
    return existing.length ? existing.concat(league ? [league] : []) : ['Card market qualified at ' + confidence + '% confidence' + (league ? '. League: ' + league : '')];
  }
  if (category === 'teamScore') {
    return ['Team-to-score probability ' + confidence + '%'
      + (source.team ? '. ' + source.team + ' have a consistent scoring record' : '')
      + (league ? '. League: ' + league : '')].filter(Boolean);
  }
  return ['Model confidence ' + confidence + '%'];
}

function allCandidates(predictions, date) {
  const groups = [
    ['matches', '1x2'], ['over15Matches', 'over15'], ['over25Matches', 'over25'],
    ['bttsMatches', 'btts'], ['bttsNoMatches', 'bttsNo'], ['cornersMatches', 'corners'],
    ['cardsMatches', 'cards'], ['teamToScoreMatches', 'teamScore']
  ];
  const candidates = [];
  groups.forEach(function(group) {
    (predictions[group[0]] || []).forEach(function(source) {
      const candidate = candidateFrom(group[1], source, date);
      if (candidate) candidates.push(candidate);
    });
  });
  return candidates;
}

function applyOdds(candidates, oddsResponse) {
  const fixtures = Array.isArray(oddsResponse) ? oddsResponse : [];
  candidates.forEach(function(candidate) {
    const pair = splitMatch(candidate.match).map(normalise);
    const fixture = fixtures.find(function(item) {
      return normalise(item.teams && item.teams.home && item.teams.home.name) === pair[0] &&
        normalise(item.teams && item.teams.away && item.teams.away.name) === pair[1];
    });
    if (!fixture) return;
    const bookmakers = Array.isArray(fixture.bookmakers) ? fixture.bookmakers : [];
    const preferredId = Number(process.env.PRIMARY_ODDS_BOOKMAKER_ID);
    const orderedBookmakers = bookmakers.slice().sort(function(a, b) {
      return Number(b.id === preferredId) - Number(a.id === preferredId);
    });
    for (const bookmaker of orderedBookmakers) {
      for (const bet of bookmaker.bets || []) {
        if (normalise(bet.name) !== normalise(candidate.market)) continue;
        const value = (bet.values || []).find(function(entry) {
          return candidate.values.includes(normalise(entry.value));
        });
        const price = Number(value && value.odd);
        if (Number.isFinite(price) && price > 1) {
          candidate.price = Number(price.toFixed(2));
          candidate.priceStatus = 'verified';
          candidate.bookmaker = bookmaker.name || 'API-Football bookmaker';
          candidate.evidence.push('Verified bookmaker price');
          return;
        }
      }
    }
  });
  return candidates;
}

function applyH2HSupport(candidates, h2hMatches) {
  const entries = Array.isArray(h2hMatches) ? h2hMatches : [];
  candidates.forEach(function(candidate) {
    const entry = entries.find(function(item) { return fixtureKey(item.match) === candidate.fixtureKey; });
    const streaks = entry && entry.streaks && Array.isArray(entry.streaks.all) ? entry.streaks.all : [];
    if (!streaks.length) return;
    const sorted = streaks.slice().sort(function(a, b) { return Number(b.count || 0) - Number(a.count || 0); });
    const strongest = sorted[0];
    candidate.confidenceScore = Math.min(95, candidate.confidenceScore + Math.min(4, Math.max(1, Number(strongest.count || 0) - 5)));
    const relevant = sorted.filter(function(s) {
      if (candidate.category === '1x2') return s.type === 'win' || s.type === 'unbeaten';
      if (candidate.category === 'btts' || candidate.category === 'bttsNo') return s.family === 'goals';
      if (candidate.category === 'corners') return s.family === 'corners';
      if (candidate.category === 'cards') return s.family === 'cards';
      if (candidate.category === 'over25' || candidate.category === 'over15') return s.family === 'goals';
      if (candidate.category === 'teamScore') return s.type === 'win' || s.family === 'goals';
      return true;
    }).slice(0, 3);
    if (relevant.length) {
      relevant.forEach(function(s) { candidate.evidence.push(s.text); });
    } else {
      candidate.evidence.push(strongest.text);
    }
    candidate.h2hStatus = 'unverified';
  });
}

function selectPerFixture(candidates) {
  const grouped = new Map();
  candidates.forEach(function(candidate) {
    const existing = grouped.get(candidate.fixtureKey);
    // The chosen market is the strongest probability signal. Verified price,
    // confidence and conservative-market priority settle close decisions.
    const score = candidate.sourceProbability * 100 + (candidate.priceStatus === 'verified' ? 3 : 0) + candidate.priority;
    const existingScore = existing ? existing.sourceProbability * 100 + (existing.priceStatus === 'verified' ? 3 : 0) + existing.priority : -Infinity;
    if (!existing || score > existingScore) grouped.set(candidate.fixtureKey, candidate);
  });
  return Array.from(grouped.values());
}

function combinations(items, maxLength) {
  const result = [];
  function walk(start, selected) {
    if (selected.length) result.push(selected.slice());
    if (selected.length === maxLength) return;
    for (let i = start; i < items.length; i++) {
      selected.push(items[i]);
      walk(i + 1, selected);
      selected.pop();
    }
  }
  walk(0, []);
  return result;
}

function evaluateTicket(legs) {
  const combinedOdds = legs.reduce(function(total, leg) { return total * leg.price; }, 1);
  const baseProbability = legs.reduce(function(total, leg) { return total * leg.sourceProbability; }, 1);
  const leagues = new Set();
  let correlationPenalty = 1;
  legs.forEach(function(leg) {
    if (leagues.has(leg.league)) correlationPenalty *= 0.97;
    leagues.add(leg.league);
  });
  return {
    legs: legs,
    combinedOdds: Number(combinedOdds.toFixed(2)),
    adjustedProbability: Number((baseProbability * correlationPenalty).toFixed(4)),
    priceType: legs.every(function(leg) { return leg.priceStatus === 'verified'; }) ? 'verified' :
      legs.some(function(leg) { return leg.priceStatus === 'verified'; }) ? 'mixed' : 'model'
  };
}

function buildTwoOddsOfDay(predictions, options) {
  const requestedDate = (options && options.date) || watDate();
  const generatedAt = new Date().toISOString();
  if (!predictions || !Array.isArray(predictions.matches)) {
    return { available: false, date: requestedDate, generatedAt: generatedAt, reason: 'Pre-match data is not available yet.', ticket: null };
  }
  const availableDates = (predictions.dates || []).slice().sort().reverse();
  let date = requestedDate;
  if (!availableDates.includes(date) && availableDates.length) {
    date = availableDates[0];
  }
  const candidates = allCandidates(predictions, date);
  applyH2HSupport(candidates, options && options.h2hMatches);
  applyOdds(candidates, options && options.oddsResponse);
  const selections = selectPerFixture(candidates);
  const tickets = combinations(selections, MAX_LEGS).map(evaluateTicket).filter(function(ticket) {
    return ticket.combinedOdds >= TWO_ODDS_MIN && ticket.combinedOdds <= TWO_ODDS_MAX;
  });
  tickets.sort(function(a, b) {
    if (b.adjustedProbability !== a.adjustedProbability) return b.adjustedProbability - a.adjustedProbability;
    const typeRank = { verified: 3, mixed: 2, model: 1 };
    if (typeRank[b.priceType] !== typeRank[a.priceType]) return typeRank[b.priceType] - typeRank[a.priceType];
    return Math.abs(a.combinedOdds - 3) - Math.abs(b.combinedOdds - 3);
  });
  const ticket = tickets[0] || null;
  return {
    available: Boolean(ticket), date: date, generatedAt: generatedAt,
    reason: ticket ? null : 'No ticket met the unchanged 2.50–4.00 odds and confidence rules today.',
    ticket: ticket,
    candidateCount: selections.length,
    methodology: 'One strongest market per fixture. A ticket is selected only when its combined odds are 2.50–4.00 without relaxing the confidence threshold.'
  };
}

function publicPreview(payload) {
  const ticket = payload && payload.ticket;
  return {
    available: Boolean(ticket), date: payload && payload.date, generatedAt: payload && payload.generatedAt,
    reason: payload && payload.reason, methodology: payload && payload.methodology,
    ticket: ticket ? {
      legCount: ticket.legs.length,
      combinedOdds: ticket.combinedOdds,
      priceType: ticket.priceType,
      adjustedProbability: ticket.adjustedProbability,
      locked: true
    } : null
  };
}

module.exports = { buildTwoOddsOfDay, publicPreview, watDate, fixtureKey, estimatedOdds, TWO_ODDS_MIN, TWO_ODDS_MAX };
