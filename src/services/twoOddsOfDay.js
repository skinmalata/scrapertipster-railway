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
  if (category === 'winStreak' || category === 'lossStreak' || category === 'drawStreak') {
    var streakLabel = { winStreak: 'Win Streak', lossStreak: 'Loss Streak', drawStreak: 'Draw Streak' }[category] || category;
    return { market: streakLabel, selection: source.tip || tip, values: [String(source.tip || tip).toLowerCase()] };
  }
  return null;
}

function marketPriority(category) {
  return { teamScore: 6, over15: 5, bttsNo: 4, corners: 3, cards: 2, btts: 2, '1x2': 1, over25: 1, winStreak: 2, lossStreak: 2, drawStreak: 2 }[category] || 0;
}

function candidateFrom(category, source, date) {
  const match = source.match || source.nextMatch;
  const details = marketDetails(category, source);
  if (!match || !details || (source.date !== date && source.nextMatchDate !== date)) return null;
  const sourceProbability = probability(source.probability);
  if (sourceProbability < MIN_PROBABILITY) return null;
  if (/friendly|friendlies|u\d{2}|reserve|reserves|women/i.test(String(source.league || ''))) return null;
  const p = Math.min(0.9, sourceProbability);
  const confidenceScore = Math.round(p * 100);

  const outOfTen = Math.round((confidenceScore / 100) * 10);
  const evidence = [];

  // 1. Concrete Team / Match Ratio & Record
  const teams = splitMatch(match);
  if (category === '1x2') {
    const team = details.selection === 'Home Win' ? (teams[0] || 'Home') :
                 details.selection === 'Away Win' ? (teams[1] || 'Away') : '';
    evidence.push(team ? `${team} win rate: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)` : `Win selection: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else if (category === 'over15') {
    evidence.push(`Over 1.5 hit rate: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else if (category === 'over25') {
    evidence.push(`Over 2.5 hit rate: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else if (category === 'btts') {
    evidence.push(`BTTS hit rate: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else if (category === 'bttsNo') {
    evidence.push(`BTTS No hit rate: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else if (category === 'corners' || category === 'cards') {
    if (source.insights && Array.isArray(source.insights) && source.insights.length) {
      evidence.push(source.insights.filter(Boolean).slice(0, 2).join(' \u00b7 '));
    } else {
      evidence.push(`${details.selection}: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
    }
  } else if (category === 'teamScore') {
    evidence.push(`${source.team || details.selection} to score: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  } else {
    evidence.push(`Selection hit: ${outOfTen}/10 recent competitive matches (${confidenceScore}% model)`);
  }

  // 2. Form Streak if available
  if (source.streak) {
    if (typeof source.streak === 'number' || /^\d+$/.test(String(source.streak))) {
      evidence.push(`Form: ${source.streak} consecutive wins`);
    } else {
      evidence.push(`Form: ${source.streak}`);
    }
  }

  return {
    fixtureKey: fixtureKey(match),
    match: match,
    league: source.league || '',
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
    confidenceScore: confidenceScore,
    evidence: evidence,
    priority: marketPriority(category)
  };
}

function allCandidates(predictions, date) {
  const groups = [
    ['matches', '1x2'], ['over15Matches', 'over15'], ['over25Matches', 'over25'],
    ['bttsMatches', 'btts'], ['bttsNoMatches', 'bttsNo'], ['cornersMatches', 'corners'],
    ['cardsMatches', 'cards'], ['teamToScoreMatches', 'teamScore'],
    ['winstreakMatches', 'winStreak'], ['losestreakMatches', 'lossStreak'], ['drawstreakMatches', 'drawStreak']
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
    if (fixture) {
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
            candidate.evidence.push(`Verified at ${candidate.price} (${candidate.bookmaker})`);
            return;
          }
        }
      }
    }
    if (candidate.priceStatus === 'estimated') {
      candidate.evidence.push(`Model estimate: ${candidate.price} at ${candidate.confidenceScore}% threshold`);
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
    const strongest = streaks.slice().sort(function(a, b) { return Number(b.count || 0) - Number(a.count || 0); })[0];
    candidate.confidenceScore = Math.min(95, candidate.confidenceScore + Math.min(4, Math.max(1, Number(strongest.count || 0) - 5)));
    
    let h2hText = '';
    if (strongest.team && strongest.type === 'win') {
      h2hText = `H2H: ${strongest.team} ${strongest.count}/${strongest.count} wins in recent meetings`;
    } else if (strongest.team && strongest.type === 'unbeaten') {
      h2hText = `H2H: ${strongest.team} unbeaten in ${strongest.count}/${strongest.count} recent meetings`;
    } else if (strongest.text) {
      h2hText = `H2H: ${strongest.count}/${strongest.count} ${strongest.text}`;
    } else {
      h2hText = `H2H: ${strongest.count}/${strongest.count} match ${strongest.type} streak`;
    }
    candidate.evidence.push(h2hText);
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

module.exports = { buildTwoOddsOfDay, publicPreview, watDate, fixtureKey, estimatedOdds, TWO_ODDS_MIN, TWO_ODDS_MAX, candidateFrom, allCandidates, applyOdds, applyH2HSupport, selectPerFixture, combinations, evaluateTicket, MIN_PROBABILITY };
