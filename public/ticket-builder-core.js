/* Ticket Builder Core - client-side port of src/services/ticketBuilder.js,
   src/services/dailyPool.js and the helpers they need from
   src/services/twoOddsOfDay.js. Pure functions only - no secrets, no Node APIs.
   Exposes window.WFTTicketBuilder. */
(function (root) {
  'use strict';

  var MIN_PROBABILITY = 0.7;
  // Booking codes can only use 1X2 / Double Chance / Over markets, and with a
  // 0.70 probability floor every leg tops out around 1.37 odds, so three legs
  // can never reach the default target. Lower the floor for booking-code mode
  // so legs in the ~0.55-0.70 probability band (odds ~1.4-1.7) can be combined.
  var BOOKING_CODE_MIN_PROB = 0.55;
  var UNBEATEN_MIN_PROB = 0.42;
  var UNBEATEN_MAX_PROB = 0.85;

  function watDate(value) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value ? new Date(value) : new Date());
    var result = {};
    parts.forEach(function (part) { result[part.type] = part.value; });
    return result.year + '-' + result.month + '-' + result.day;
  }

  function normalise(value) {
    return String(value || '').toLowerCase()
      .replace(/\(w\)|\(u\d+\)/g, '')
      .replace(/\b(fc|afc|cf|sc|ac|united)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function normaliseTeam(value) {
    return String(value || '').toLowerCase()
      .replace(/\b(fc|afc|cf|sc|ac|the|united)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function splitMatch(match) {
    var parts = String(match || '').split(/\s+(?:-|vs)\s+/i).map(function (part) { return part.trim(); });
    return parts.length === 2 && parts[0] && parts[1] ? parts : [];
  }

  function splitMatchName(match) {
    return splitMatch(match);
  }

  function lagosNowString() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    function get(type) {
      var f = parts.find(function (p) { return p.type === type; });
      return f ? f.value : '00';
    }
    var hour = get('hour') === '24' ? '00' : get('hour');
    return get('year') + '-' + get('month') + '-' + get('day') + ' ' + hour + ':' + get('minute');
  }

  function hasKickedOff(dateStr, timeStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    var t = String(timeStr || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(t)) return false;
    var bits = t.split(':');
    var kickoff = dateStr + ' ' + (bits[0].length === 1 ? '0' + bits[0] : bits[0]) + ':' + bits[1];
    return kickoff < lagosNowString();
  }

  function teamKey(match) {
    var parts = splitMatch(match);
    if (parts.length !== 2) return null;
    return normaliseTeam(parts[0]) + '|' + normaliseTeam(parts[1]);
  }

  function fixtureKey(match) {
    var teams = splitMatch(match).map(normalise);
    return teams.length === 2 ? teams.sort().join('|') : normalise(match);
  }

  function estimatedOdds(probabilityValue) {
    var conservativeProbability = Math.min(0.92, probabilityValue + 0.03);
    return Number((1 / conservativeProbability).toFixed(2));
  }

  function buildPool(predictions, options) {
    options = options || {};
    var date = options.date || watDate();
    var oddsResponse = options.oddsResponse;
    var h2hMatches = options.h2hMatches;
    var unbeatenData = options.unbeatenData;
    var safeOnly = options.safeOnly || false;
    var minProbability = options.minProbability || MIN_PROBABILITY;
    var minOdds = options.minOddsPerLeg || 1.0;
    var maxOdds = options.maxOddsPerLeg || 100;
    var markets = options.markets;
    var maxEntries = options.maxEntries;
    var bookingCodeMode = options.bookingCodeMode || false;
    var availableMatches = options.availableMatches;
    // Booking-code mode relaxes the confidence floor so higher-odds legs are
    // available (see BOOKING_CODE_MIN_PROB above).
    var minProbability = options.minProbability || (bookingCodeMode ? BOOKING_CODE_MIN_PROB : MIN_PROBABILITY);

    var availableKeys = null;
    if (bookingCodeMode && Array.isArray(availableMatches)) {
      availableKeys = new Set();
      availableMatches.forEach(function (m) {
        availableKeys.add(normaliseTeam(m.home) + '|' + normaliseTeam(m.away));
      });
    }

    if (!predictions || !Array.isArray(predictions.matches)) {
      return { pool: [], date: date, total: 0 };
    }

    var availableDates = (predictions.dates || []).slice().sort().reverse();
    if (!availableDates.includes(date) && availableDates.length) {
      date = availableDates[0];
    }

    var pool = [];
    var seen = new Set();

    function pickKey(match, tip, pickDate) {
      return fixtureKey(match) + '|' + String(tip || '').trim().toLowerCase() + '|' + (pickDate || date);
    }

    function addPicks(category, matches, tipMap, probabilityFn) {
      if (!Array.isArray(matches)) return;
      if (Array.isArray(markets) && markets.length > 0 && !markets.some(function (m) { return m.toLowerCase() === category.toLowerCase(); })) return;

      matches.forEach(function (source) {
        var matchName = source.nextMatch || source.match;
        if (!matchName) return;

        if (source.result || source.score) return;
        if (bookingCodeMode && hasKickedOff(source.date, source.time)) return;
        if (availableKeys) {
          var akey = teamKey(matchName);
          if (!akey || !availableKeys.has(akey)) return;
        }

        var tip = typeof tipMap === 'function' ? tipMap(source) : (source.tip || '');
        if (!tip) return;

        var rawProb = probabilityFn ? probabilityFn(source) : Number(source.probability);
        var prob = Number.isFinite(rawProb) && rawProb > 0 ? (rawProb > 1 ? rawProb / 100 : rawProb) : 0;
        if (prob < minProbability) return;

        var pickDate = source.date || date;
        // Booking-code mode allows picks from any upcoming date (not only the
        // selected day) so matches the bookmaker actually offers still count.
        if (!bookingCodeMode && pickDate !== date) return;

        var key = pickKey(matchName, tip, pickDate);
        if (seen.has(key)) return;
        seen.add(key);

        var p = Math.min(0.92, prob);
        var odds = estimatedOdds(p);

        if (odds < minOdds || odds > maxOdds) return;

        pool.push({
          match: matchName,
          tip: tip,
          odds: odds,
          probability: Math.round(prob * 100),
          date: pickDate,
          time: source.time || '',
          league: source.league || '',
          category: category,
          sourceProbability: prob,
          fixtureKey: fixtureKey(matchName),
          streak: source.streak || null,
          oddsSource: 'estimated',
          bookmaker: '',
          evidence: []
        });
      });
    }

    addPicks('1x2', predictions.matches);
    addPicks('over15', predictions.over15Matches);
    addPicks('over25', predictions.over25Matches);
    addPicks('btts', predictions.bttsMatches);
    addPicks('bttsNo', predictions.bttsNoMatches);
    addPicks('corners', predictions.cornersMatches);
    addPicks('cards', predictions.cardsMatches);
    addPicks('teamScore', predictions.teamToScore2PlusMatches);

    function streakTip(s, word) {
      var team = s.match || '';
      var count = s.streak || '';
      return team + ' to ' + word + ' (Back To Back: ' + count + ')';
    }
    addPicks('winStreak', predictions.winstreakMatches, function (s) { return streakTip(s, 'Win'); });
    addPicks('lossStreak', predictions.losestreakMatches, function (s) { return streakTip(s, 'Lose'); });
    addPicks('drawStreak', predictions.drawstreakMatches, function (s) { return streakTip(s, 'Draw'); });

    if (unbeatenData && Array.isArray(unbeatenData)) {
      var unbeatenAllowed = !Array.isArray(markets) || markets.length === 0 || markets.some(function (m) { return m.toLowerCase() === 'unbeaten'; });
      if (unbeatenAllowed) {
        unbeatenData.forEach(function (item) {
          if (!item.match || !Array.isArray(item.streaks)) return;
          (item.streaks || []).forEach(function (s) {
            var tipText = (s.team || '') + ' or Draw';
            if (!tipText) return;

            var rawProb = Math.min(UNBEATEN_MAX_PROB, Math.max(UNBEATEN_MIN_PROB, 0.50 + (Number(s.count) || 0) * 0.02));
            var prob = Math.min(0.92, rawProb);
            if (prob < minProbability) return;

            var odds = estimatedOdds(prob);
            if (odds < minOdds || odds > maxOdds) return;

            var key = pickKey(item.match, tipText, date);
            if (seen.has(key)) return;
            seen.add(key);

            pool.push({
              match: item.match,
              tip: tipText,
              odds: odds,
              probability: Math.round(prob * 100),
              date: date,
              time: item.time || '',
              league: item.league || '',
              category: 'Unbeaten',
              sourceProbability: prob,
              fixtureKey: fixtureKey(item.match),
              streak: null,
              oddsSource: 'estimated',
              bookmaker: '',
              evidence: []
            });
          });
        });
      }
    }

    if (safeOnly) {
      pool = pool.filter(function (p) { return p.sourceProbability >= 0.7; });
    }

    if (maxEntries && pool.length > maxEntries) {
      pool.sort(function (a, b) { return b.sourceProbability - a.sourceProbability; });
      pool = pool.slice(0, maxEntries);
    }

    return {
      pool: pool,
      date: date,
      total: pool.length
    };
  }

  function applyLiveOdds(pool, oddsResponse) {
    if (!oddsResponse || !Array.isArray(oddsResponse)) return pool;
    var fixtures = oddsResponse;

    var CATEGORY_MARKET_MAP = {
      '1x2': { market: 'Match Winner', valueMap: { '1': ['1', 'home'], 'X': ['x', 'draw'], '2': ['2', 'away'] } },
      'over15': { market: 'Goals Over/Under' },
      'over25': { market: 'Goals Over/Under' },
      'btts': { market: 'Both Teams Score', valueMap: { yes: ['yes'], no: ['no'] } },
      'bttsNo': { market: 'Both Teams Score', valueMap: { yes: ['yes'], no: ['no'] } },
      'corners': { market: 'Corners Over/Under' },
      'cards': { market: 'Cards Over/Under' }
    };

    pool.forEach(function (pick) {
      var pair = splitMatchName(pick.match).map(normaliseTeam);
      if (pair.length !== 2) return;

      var fixture = fixtures.find(function (f) {
        return normaliseTeam(f.teams && f.teams.home && f.teams.home.name) === pair[0] &&
          normaliseTeam(f.teams && f.teams.away && f.teams.away.name) === pair[1];
      });
      if (!fixture) return;

      var catMap = CATEGORY_MARKET_MAP[pick.category];
      if (!catMap) return;

      var bookmakers = Array.isArray(fixture.bookmakers) ? fixture.bookmakers : [];
      var ordered = bookmakers.slice();

      for (var bi = 0; bi < ordered.length; bi++) {
        var bets = Array.isArray(ordered[bi].bets) ? ordered[bi].bets : [];
        for (var mi = 0; mi < bets.length; mi++) {
          var bet = bets[mi];
          if (normaliseTeam(bet.name) !== normaliseTeam(catMap.market)) continue;

          var targetValue = catMap.valueMap ? catMap.valueMap[pick.tip] : [pick.tip.toLowerCase()];
          if (!targetValue) targetValue = [pick.tip.toLowerCase()];

          var value = (bet.values || []).find(function (v) {
            return targetValue.some(function (tv) { return normaliseTeam(v.value) === normaliseTeam(tv); });
          });
          var price = value && Number.parseFloat(value.odd);
          if (Number.isFinite(price) && price > 1) {
            pick.odds = Number(price.toFixed(2));
            pick.oddsSource = 'verified';
            pick.bookmaker = ordered[bi].name || 'API-Football';
            return;
          }
        }
      }
    });

    return pool;
  }

  function loadUnbeatenDates(unbeatenRaw) {
    if (!unbeatenRaw) return {};
    if (unbeatenRaw.dates && typeof unbeatenRaw.dates === 'object') return unbeatenRaw.dates;
    if (unbeatenRaw.date && Array.isArray(unbeatenRaw.matches)) {
      return { [unbeatenRaw.date]: unbeatenRaw.matches };
    }
    return {};
  }

  function getUnbeatenForDate(unbeatenDates, date) {
    if (!unbeatenDates || !date) return [];
    if (unbeatenDates[date]) return unbeatenDates[date];
    var sorted = Object.keys(unbeatenDates).sort().reverse();
    return sorted.length ? unbeatenDates[sorted[0]] : [];
  }

  function matchIdentity(match) {
    var teams = splitMatchName(match).map(normaliseTeam).filter(Boolean);
    return teams.length === 2 ? teams.sort().join('|') : normaliseTeam(match);
  }

  var BOOKING_CODE_TIPS = {
    '1x2': ['1', 'X', '2', '1X', 'X2', '12'],
    'over15': ['Over 1.5'],
    'over25': ['Over 2.5']
  };
  function bookingCodeEligible(category, tip) {
    var allowed = BOOKING_CODE_TIPS[String(category || '').toLowerCase()];
    if (!allowed) return false;
    return allowed.indexOf(String(tip || '').trim()) !== -1;
  }

  function matchIdentity(match) {
    var teams = splitMatchName(match).map(normaliseTeam).filter(Boolean);
    return teams.length === 2 ? teams.sort().join('|') : normaliseTeam(match);
  }

  // Shared combination engine: given a pool of picks (each with .match, .tip,
  // .odds, .fixtureKey, .sourceProbability) find the tickets whose multiplied
  // odds land closest to the target. Used by both the prediction builder and
  // the schedule fallback.
  function combineSelections(pool, options) {
    options = options || {};
    var numLegs = options.numLegs || 3;
    var targetOdds = options.targetOdds || 20;
    var maxOdds = options.maxOdds || 500;
    var maxTickets = options.maxTickets || 8;

    var minTicketOdds = targetOdds * 0.8;
    var maxTicketOdds = targetOdds * 1.2;
    if (maxOdds && maxTicketOdds > maxOdds) maxTicketOdds = maxOdds;

    var usedPerFixture = new Map();
    var onePerFixture = [];
    pool.forEach(function (p) {
      var key = p.fixtureKey;
      var existing = usedPerFixture.get(key);
      if (!existing || p.sourceProbability > existing.sourceProbability) {
        usedPerFixture.set(key, p);
      }
    });
    onePerFixture = Array.from(usedPerFixture.values());
    var poolForCombos = onePerFixture.length > 50 ? onePerFixture : pool;

    if (options.shuffle) {
      poolForCombos.sort(function () { return Math.random() - 0.5; });
    } else {
      poolForCombos.sort(function (a, b) { return a.odds - b.odds; });
    }

    var tickets = [];
    var seenKeys = new Set();
    var MAX_ITER = 50000;
    var iterations = 0;

    function backtrack(start, current, product, usedMatches) {
      if (iterations >= MAX_ITER) return;
      if (current.length >= 2 && product >= minTicketOdds) {
        iterations++;
        var key = current.map(function (s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); }).sort().join('||');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          tickets.push({
            selections: current.slice(),
            totalOdds: Number(product.toFixed(2)),
            diff: Math.abs(product - targetOdds)
          });
        }
      }
      if (current.length >= numLegs) return;
      for (var j = start; j < poolForCombos.length; j++) {
        if (iterations >= MAX_ITER) return;
        var p = poolForCombos[j];
        var matchId = matchIdentity(p.match);
        if (usedMatches.has(matchId)) continue;
        var newProduct = product * p.odds;
        if (newProduct > maxTicketOdds) break;
        usedMatches.add(matchId);
        current.push(p);
        backtrack(j + 1, current, newProduct, usedMatches);
        current.pop();
        usedMatches.delete(matchId);
      }
    }

    backtrack(0, [], 1, new Set());

    if (tickets.length === 0) {
      return {
        available: false,
        reason: 'No ticket met the specified criteria. Try adjusting the number of legs, target odds, or odds range.',
        ticket: null, tickets: []
      };
    }

    tickets.sort(function (a, b) { return a.diff - b.diff; });

    var top = [];
    var usedPairs = new Set();
    var usedMatchIds = new Set();
    var taken = new Set();

    for (var round = 0; round < maxTickets; round++) {
      var bestIdx = -1;
      for (var pass = 0; pass < 2 && bestIdx === -1; pass++) {
        var bestScore = -Infinity;
        for (var ti = 0; ti < tickets.length; ti++) {
          if (taken.has(ti)) continue;
          var pairs = tickets[ti].selections.map(function (s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); });
          var matchIds = tickets[ti].selections.map(function (s) { return matchIdentity(s.match); });
          if (pairs.some(function (pair) { return usedPairs.has(pair); })) continue;
          if (pass === 0 && matchIds.some(function (matchId) { return usedMatchIds.has(matchId); })) continue;
          var freshCount = matchIds.filter(function (mId) { return !usedMatchIds.has(mId); }).length;
          var sc = freshCount * 100 - tickets[ti].diff;
          if (sc > bestScore) { bestScore = sc; bestIdx = ti; }
        }
      }
      if (bestIdx === -1) break;
      var t = tickets[bestIdx];
      taken.add(bestIdx);
      top.push(t);
      var tpairs = t.selections.map(function (s) { return matchIdentity(s.match) + '|' + normaliseTeam(s.tip); });
      tpairs.forEach(function (pair) { usedPairs.add(pair); });
      t.selections.forEach(function (s) { usedMatchIds.add(matchIdentity(s.match)); });
    }

    return {
      available: top.length > 0,
      reason: top.length > 0 ? null : 'No ticket met the specified criteria.',
      ticket: top[0] || null,
      tickets: top
    };
  }

  // Fallback that builds a booking-code ticket straight from the bookmaker's
  // schedule (the /api/converter/available-matches payload now carries the live
  // 1X2 odds). Used when the prediction feed has no overlap with the schedule,
  // so a code can still be produced whenever the bookmaker offers fixtures.
  function buildFromSchedule(availableMatches, options) {
    options = options || {};
    var numLegs = options.numLegs || 3;
    var targetOdds = options.targetOdds || 5;
    var maxOdds = options.maxOdds || 100;
    var minOddsPerLeg = options.minOddsPerLeg || 1.05;
    var maxOddsPerLeg = options.maxOddsPerLeg || 100;
    var shuffle = options.shuffle === true;
    var date = options.date || watDate();
    var generatedAt = new Date().toISOString();

    if (!Array.isArray(availableMatches)) {
      return { available: false, date: date, generatedAt: generatedAt, reason: 'No matches are available on the bookmaker right now.', ticket: null, tickets: [] };
    }

    var pool = [];
    var seen = new Set();
    var SIGNS = ['1', 'X', '2'];
    availableMatches.forEach(function (m) {
      if (!(m.home && m.away)) return;
      var match = m.home + ' - ' + m.away;
      if (m.date && hasKickedOff(m.date, m.time)) return;
      if (!m.date && hasKickedOff(date, m.time)) return;
      var odds = m.odds || {};
      SIGNS.forEach(function (sign) {
        var odd = Number(odds[sign]);
        if (!(Number.isFinite(odd) && odd >= minOddsPerLeg && odd <= maxOddsPerLeg)) return;
        var key = match + '|' + sign;
        if (seen.has(key)) return;
        seen.add(key);
        var implied = 1 / odd;
        pool.push({
          match: match,
          tip: sign,
          odds: Number(odd.toFixed(2)),
          probability: Math.round(implied * 100),
          date: m.date || date,
          time: m.time || '',
          league: m.league || '',
          category: '1x2',
          sourceProbability: implied,
          fixtureKey: fixtureKey(match),
          streak: null,
          oddsSource: 'bookmaker',
          bookmaker: 'SportyBet',
          evidence: []
        });
      });
    });

    if (pool.length < 2) {
      return {
        available: false, date: date, generatedAt: generatedAt,
        reason: 'Not enough upcoming matches on the bookmaker to build a booking code. Try again when the next fixtures are available.',
        ticket: null, tickets: [], pool: { pool: pool, total: pool.length }
      };
    }

    var combo = combineSelections(pool, {
      numLegs: numLegs,
      targetOdds: targetOdds,
      maxOdds: maxOdds,
      shuffle: shuffle,
      maxTickets: options.maxTickets || 3
    });

    return {
      available: combo.available,
      date: date,
      generatedAt: generatedAt,
      reason: combo.available ? null : (combo.reason || 'No ticket met the specified criteria.'),
      ticket: combo.ticket,
      tickets: combo.tickets,
      pool: { pool: pool, total: pool.length },
      candidateCount: pool.length
    };
  }

  function buildTicket(predictions, options) {
    options = options || {};
    var requestedDate = options.date;
    var oddsResponse = options.oddsResponse;
    var markets = options.markets;
    var safeOnly = options.safeOnly || false;
    var numLegs = options.numLegs || 3;
    var maxOdds = options.maxOdds || 500;
    var minOddsPerLeg = options.minOddsPerLeg || 1.0;
    var maxOddsPerLeg = options.maxOddsPerLeg || 100;
    var targetOdds = options.targetOdds || 20;
    var maxTickets = options.maxTickets || 8;
    var bookingCodeMode = options.bookingCodeMode === true;

    // Booking-code legs are valid from ~1.05, so high-confidence picks that
    // estimate below the UI's 1.20 floor are not thrown away.
    if (bookingCodeMode && minOddsPerLeg > 1.05) {
      minOddsPerLeg = 1.05;
    }

    var generatedAt = new Date().toISOString();
    var date = requestedDate || watDate();

    if (!predictions || !Array.isArray(predictions.matches)) {
      return { available: false, date: date, generatedAt: generatedAt, reason: 'Pre-match data is not available yet.', ticket: null, tickets: [] };
    }

    var availableDates = (predictions.dates || []).slice().sort().reverse();
    if (!availableDates.includes(date) && availableDates.length) {
      date = availableDates[0];
    }

    var unbeatenDates = loadUnbeatenDates(options.unbeatenData || options.unbeatenDates);
    var unbeatenForDate = getUnbeatenForDate(unbeatenDates, date);

    var poolResult = buildPool(predictions, {
      date: date,
      oddsResponse: oddsResponse,
      h2hMatches: options.h2hMatches,
      unbeatenData: unbeatenForDate,
      safeOnly: safeOnly,
      minProbability: options.minProbability,
      minOddsPerLeg: minOddsPerLeg,
      maxOddsPerLeg: maxOddsPerLeg,
      markets: markets,
      maxEntries: 200,
      bookingCodeMode: bookingCodeMode,
      availableMatches: options.availableMatches
    });

    var pool = poolResult.pool;

    if (Array.isArray(markets) && markets.length > 0) {
      pool = pool.filter(function (p) {
        return markets.some(function (m) { return m.toLowerCase() === String(p.category).toLowerCase(); });
      });
    }

    if (bookingCodeMode) {
      pool = pool.filter(function (p) { return bookingCodeEligible(p.category, p.tip); });
    }

    applyLiveOdds(pool, oddsResponse);

    var filtered = pool.filter(function (p) { return p.odds >= minOddsPerLeg && p.odds <= maxOddsPerLeg; });
    if (filtered.length < 2) {
      return {
        available: false, date: date, generatedAt: generatedAt,
        reason: bookingCodeMode
          ? 'Not enough upcoming matches for a booking code. Matches that have already kicked off or are not offered by the bookmaker were excluded. Try again when the next fixtures are available, or adjust your target odds.'
          : 'Not enough selections match the criteria. Try adjusting market filters or odds range.',
        ticket: null, tickets: [], pool: poolResult
      };
    }

    var combo = combineSelections(filtered, {
      numLegs: numLegs,
      targetOdds: targetOdds,
      maxOdds: maxOdds,
      shuffle: options.shuffle,
      maxTickets: maxTickets
    });

    if (!combo.available) {
      return {
        available: false, date: date, generatedAt: generatedAt,
        reason: combo.reason || 'No ticket met the specified criteria. Try adjusting the number of legs, target odds, or odds range.',
        ticket: null, tickets: [], pool: poolResult
      };
    }

    return {
      available: true,
      date: date,
      generatedAt: generatedAt,
      reason: null,
      ticket: combo.ticket,
      tickets: combo.tickets,
      pool: poolResult,
      candidateCount: poolResult.total
    };
  }

  root.WFTTicketBuilder = {
    build: buildTicket,
    buildFromSchedule: buildFromSchedule,
    buildPool: buildPool,
    applyLiveOdds: applyLiveOdds,
    watDate: watDate,
    fixtureKey: fixtureKey,
    estimatedOdds: estimatedOdds,
    MIN_PROBABILITY: MIN_PROBABILITY
  };
})(typeof window !== 'undefined' ? window : this);
