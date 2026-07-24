function getLocalDate(timeZone = 'Africa/Lagos') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDailyTicket(predictions, { timeZone = 'Africa/Lagos', legCount = 3 } = {}) {
  const today = getLocalDate(timeZone);
  if (!predictions || predictions.date !== today) {
    return { ok: false, reason: 'Predictions are not current for today.', date: today };
  }

  const categories = [
    ['matches', '1X2'],
    ['over15Matches', 'Over 1.5 Goals'],
    ['over25Matches', 'Over 2.5 Goals'],
    ['bttsMatches', 'Both Teams To Score'],
    ['bttsNoMatches', 'Both Teams Not To Score'],
    ['teamToScore2PlusMatches', 'Team To Score 2+ Goals']
  ];

  const candidates = categories.flatMap(([key, defaultMarket]) => (predictions[key] || []).map((match) => {
    const probability = number(match.probability ?? match.confidence);
    const suppliedOdds = number(match.odds);
    const estimatedOdds = probability ? Number(((100 / probability) / 1.05).toFixed(2)) : null;
    const odds = suppliedOdds && suppliedOdds > 1 ? suppliedOdds : estimatedOdds;
    return {
      match: match.match || match.fixture || match.name,
      pick: match.pick || match.tip || match.prediction || match.market || defaultMarket,
      probability,
      odds,
      league: match.league || ''
    };
  })).filter((selection) => selection.match && selection.pick && selection.probability >= 55 && selection.odds >= 1.2 && selection.odds <= 3);

  const uniqueByMatch = new Map();
  candidates.sort((a, b) => b.probability - a.probability || b.odds - a.odds).forEach((selection) => {
    if (!uniqueByMatch.has(selection.match)) uniqueByMatch.set(selection.match, selection);
  });

  const selections = Array.from(uniqueByMatch.values()).slice(0, legCount);
  if (selections.length < legCount) {
    return { ok: false, reason: 'Not enough qualifying selections for today.', date: today };
  }

  const totalOdds = Number(selections.reduce((total, selection) => total * selection.odds, 1).toFixed(2));
  return { ok: true, date: today, selections, totalOdds };
}

module.exports = { buildDailyTicket, getLocalDate };
