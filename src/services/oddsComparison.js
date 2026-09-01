'use strict';

// Live 1X2 odds comparison backed by The Odds API (the-odds-api.com).
//
// The analysis pages compare today's match odds across several bookmakers.
// The provider is quota-limited (free tier ~500 requests/month), so:
//   - the soccer sports list (free /v4/sports?all=true) is cached ~12h
//   - per-sport+date odds responses are cached ~20 min
//   - a daily budget guard caps how many paid odds fetches run per day,
//     mirroring the liveTipsBudget pattern used for API-Football
// Requests that The Odds API returns empty for (no events) are not charged,
// so they are not counted against the budget.

const ODDS_API_BASE = 'https://api.the-odds-api.com';
const ODDS_REGIONS = 'eu'; // 1xBet is available in the eu region
const ODDS_MARKETS = 'h2h';
const ODDS_FORMAT = 'decimal';
const DATE_FORMAT = 'iso';

const SPORTS_CACHE_MS = 12 * 60 * 60 * 1000;
const ODDS_CACHE_MS = 20 * 60 * 1000;
const MAX_ODDS_CACHE = 60;
const DAILY_ODDS_BUDGET = 12;

let sportsListCache = { createdAt: 0, data: null, key: null };
let oddsCache = new Map();
let oddsBudget = { day: '', used: 0, remaining: null };

// Direct league-name -> sport key hints. Keys that are not present in the
// current /v4/sports list are ignored and the resolver falls back to the
// fuzzy title/description match.
const LEAGUE_SPORT_OVERRIDES = {
  'premier league': 'soccer_epl',
  'english premier league': 'soccer_epl',
  'liga 1 paraguay': 'soccer_paraguay',
  'paraguay liga 1': 'soccer_paraguay',
  'liga mx': 'soccer_mexico_ligamx',
  'mexico liga mx': 'soccer_mexico_ligamx',
  'argentine liga profesional': 'soccer_argentina_primera',
  'argentina liga profesional': 'soccer_argentina_primera',
  'argentine primera nacional': 'soccer_argentina_primera_nacional',
  'brazil serie a': 'soccer_brazil_campeonato',
  'brasileiro serie a': 'soccer_brazil_campeonato',
  'brazilian serie a': 'soccer_brazil_campeonato',
  'brazil serie b': 'soccer_brazil_serie_b',
  'ligue 1': 'soccer_france_ligue_one',
  'french ligue 1': 'soccer_france_ligue_one',
  'soccer epl': 'soccer_epl',
  'serie a': 'soccer_italy_serie_a',
  'spanish la liga': 'soccer_spain_la_liga',
  'la liga': 'soccer_spain_la_liga',
  'german bundesliga': 'soccer_germany_bundesliga',
  'turkish super lig': 'soccer_turkey_super_lig',
  'super lig': 'soccer_turkey_super_lig',
  'romanian liga 1': 'soccer_romania_liga1',
  'greek super league': 'soccer_greece_super_league',
  'greek superleague': 'soccer_greece_super_league',
  'europa league': 'soccer_uefa_europa_league',
  'champions league': 'soccer_uefa_champions_league',
  'copa libertadores': 'soccer_conmebol_copa_libertadores',
  'copa sudamericana': 'soccer_conmebol_copa_sudamericana',
  'ekstraklasa': 'soccer_poland_ekstraklasa',
  'polish ekstraklasa': 'soccer_poland_ekstraklasa',
  'allsvenskan': 'soccer_sweden_allsvenskan',
  'swedish allsvenskan': 'soccer_sweden_allsvenskan',
  'eroen divisie': 'soccer_netherlands_eredivisie',
  'eredivisie': 'soccer_netherlands_eredivisie',
  'primeira liga': 'soccer_portugal_primeira_liga',
  'portuguese liga': 'soccer_portugal_primeira_liga',
  'russian premier league': 'soccer_russia_premier_league',
  'ukrainian premier league': 'soccer_ukraine_premier_league',
  'czech first league': 'soccer_czechia_first_league',
  'austrian bundesliga': 'soccer_austria_bundesliga',
  'swiss super league': 'soccer_switzerland_super_league',
  'belgian pro league': 'soccer_belgium_first_div',
  'jupiler pro league': 'soccer_belgium_first_div',
  'scottish premiership': 'soccer_scotland_premiership',
  'mls': 'soccer_usa_mls',
  'major league soccer': 'soccer_usa_mls',
  'colombian primera a': 'soccer_colombia_primera_a',
  'chilean primera division': 'soccer_chile_primera',
  'peruvian primera division': 'soccer_peru_primera',
  'uruguayan primera division': 'soccer_uruguay_primera',
  'bolivian primera division': 'soccer_bolivia_primera',
  'ecuadorian liga pro': 'soccer_ecuador_liga_pro',
  'venezuelan primera division': 'soccer_venezuela_primera',
  'japanese j league': 'soccer_japan_j2_league',
  'k league': 'soccer_korea_k_league',
  'indian super league': 'soccer_india_super_league'
};

function apiKey() {
  return process.env.THE_ODDS_API_KEY || '';
}

// Team/league names from the analysis data are messy ("Club A. B." vs
// "A.B."). Lowercase, drop diacritics, strip common club words and articles,
// then reduce runs of junk to single spaces.
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|afc|cf|sc|ac|bk|if|sk|ss|us|utd|ud|cd|club|deportivo)\b/g, ' ')
    .replace(/[''`.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name) {
  return normalizeName(name).split(' ').filter(function (w) { return w.length > 2; });
}

function tokenOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  var matches = 0;
  for (var i = 0; i < a.length; i++) {
    for (var j = 0; j < b.length; j++) {
      if (a[i] === b[j] || a[i].indexOf(b[j]) !== -1 || b[j].indexOf(a[i]) !== -1) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(a.length, b.length);
}

async function fetchSportsList() {
  var key = apiKey();
  if (sportsListCache.data && sportsListCache.key === key && Date.now() - sportsListCache.createdAt < SPORTS_CACHE_MS) {
    return sportsListCache.data;
  }
  var url = ODDS_API_BASE + '/v4/sports/?apiKey=' + encodeURIComponent(key) + '&all=true';
  var res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error('sports list HTTP ' + res.status);
  }
  var data = await res.json();
  if (!Array.isArray(data)) throw new Error('sports list invalid');
  sportsListCache = { createdAt: Date.now(), data: data, key: key };
  return data;
}

function resolveSportKey(league, sports) {
  var leagueNorm = normalizeName(league);
  var leagueTokens = tokenize(league);
  if (!leagueTokens.length) return null;

  var hinted = LEAGUE_SPORT_OVERRIDES[leagueNorm];
  if (hinted) {
    var hintedExists = sports.some(function (s) { return s.key === hinted; });
    if (hintedExists) return hinted;
  }

  var bestKey = null;
  var bestScore = 0;
  sports.forEach(function (s) {
    if (String(s.group || '').toLowerCase() !== 'soccer') return;
    if (s.has_outrights) return;
    var hay = (s.title || '') + ' ' + (s.description || '');
    var hayTokens = tokenize(hay);
    var score = tokenOverlap(leagueTokens, hayTokens);
    var hayNorm = normalizeName(hay);
    if (leagueNorm && hayNorm && (hayNorm.indexOf(leagueNorm) !== -1 || leagueNorm.indexOf(hayNorm) !== -1)) {
      score = Math.max(score, 0.95);
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = s.key;
    }
  });
  return bestScore >= 0.6 ? bestKey : null;
}

function consumeOddsBudget() {
  var today = new Date().toISOString().slice(0, 10);
  if (oddsBudget.day !== today) oddsBudget = { day: today, used: 0, remaining: null };
  if (oddsBudget.remaining !== null && oddsBudget.remaining <= 10) return false;
  if (oddsBudget.used >= DAILY_ODDS_BUDGET) return false;
  oddsBudget.used++;
  return true;
}

function releaseOddsBudget() {
  oddsBudget.used = Math.max(0, oddsBudget.used - 1);
}

// Fetches h2h odds for a sport between industry-standard ISO datetimes.
// Responses with zero events are free on The Odds API, so the budget slot
// consumed above is released when nothing comes back.
async function fetchOddsForSport(sportKey, fromIso, toIso) {
  var cacheKey = sportKey + '|' + fromIso.slice(0, 10) + '|' + toIso.slice(0, 10);
  var cached = oddsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < ODDS_CACHE_MS) return cached.events;

  if (!consumeOddsBudget()) {
    var budgetError = new Error('The daily live-odds budget has been reached. Comparison will resume after the reset.');
    budgetError.code = 'ODDS_BUDGET_REACHED';
    throw budgetError;
  }

  var params = [
    'apiKey=' + encodeURIComponent(apiKey()),
    'regions=' + encodeURIComponent(ODDS_REGIONS),
    'markets=' + encodeURIComponent(ODDS_MARKETS),
    'oddsFormat=' + encodeURIComponent(ODDS_FORMAT),
    'dateFormat=' + encodeURIComponent(DATE_FORMAT),
    'includeLinks=true',
    'commenceTimeFrom=' + encodeURIComponent(fromIso),
    'commenceTimeTo=' + encodeURIComponent(toIso)
  ];

  var events = [];
  try {
    var res = await fetch(ODDS_API_BASE + '/v4/sports/' + encodeURIComponent(sportKey) + '/odds/?' + params.join('&'), {
      signal: AbortSignal.timeout(20000)
    });
    var remaining = Number(res.headers.get('x-requests-remaining'));
    if (Number.isFinite(remaining)) oddsBudget.remaining = remaining;
    if (!res.ok) {
      releaseOddsBudget();
      throw new Error('odds HTTP ' + res.status);
    }
    var body = await res.json();
    if (!Array.isArray(body)) body = [];
    if (body.length) {
      oddsCache.set(cacheKey, { createdAt: Date.now(), events: body });
      if (oddsCache.size > MAX_ODDS_CACHE) {
        oddsCache.delete(oddsCache.keys().next().value);
      }
    } else {
      // No events for this sport/date window is a free (uncharged) response.
      releaseOddsBudget();
    }
    events = body;
  } catch (err) {
    if (err.code !== 'ODDS_BUDGET_REACHED') releaseOddsBudget();
    throw err;
  }
  return events;
}

function findEvent(events, home, away) {
  var h = normalizeName(home);
  var a = normalizeName(away);
  var hTokens = tokenize(home);
  var aTokens = tokenize(away);
  if (!h || !a || !hTokens.length || !aTokens.length) return null;

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!ev || !ev.home_team || !ev.away_team) continue;
    if (normalizeName(ev.home_team) === h && normalizeName(ev.away_team) === a) return ev;
  }

  var best = null;
  var bestScore = 0;
  for (var j = 0; j < events.length; j++) {
    var candidate = events[j];
    if (!candidate || !candidate.home_team || !candidate.away_team) continue;
    var score = (tokenOverlap(hTokens, tokenize(candidate.home_team)) + tokenOverlap(aTokens, tokenize(candidate.away_team))) / 2;
    if (score >= 0.7 && score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

// Known homepages used only when The Odds API's includeLinks does not give us
// an href for a bookmaker (some providers only return a market link).
const BOOKMAKER_HOMEPAGES = {
  bet365: 'https://www.bet365.com',
  betway: 'https://www.betway.com',
  unibet: 'https://www.unibet.com',
  bwin: 'https://www.bwin.com',
  pinnacle: 'https://www.pinnacle.com',
  betfair: 'https://www.betfair.com',
  williamhill: 'https://sports.williamhill.com',
  paddypower: 'https://www.paddypower.com',
  marathonbet: 'https://www.marathonbet.com',
  dafabet: 'https://www.dafabet.com',
  '888sport': 'https://www.888sport.com',
  mrgreen: 'https://www.mrgreen.com',
  betsson: 'https://www.betsson.com',
  nordicbet: 'https://www.nordicbet.com',
  betcris: 'https://www.betcris.com',
  bodog: 'https://www.bodog.com',
  betclic: 'https://www.betclic.com',
  winamax: 'https://www.winamax.com'
};

// Keys carry regional/suffix labels (e.g. "unibet_fr", "sport888", "coolbet")
// that don't match the homepage map directly. Map known base brands so those
// rows still link to the bookmaker's own site.
const BOOKMAKER_KEY_BRANDS = [
  ['unibet', 'unibet'],
  ['williamhill', 'williamhill'],
  ['888sport', '888sport'],
  ['sport888', '888sport'],
  ['bet365', 'bet365'],
  ['betfair', 'betfair'],
  ['betway', 'betway'],
  ['bwin', 'bwin'],
  ['pinnacle', 'pinnacle'],
  ['marathonbet', 'marathonbet'],
  ['paddypower', 'paddypower'],
  ['betsson', 'betsson'],
  ['nordicbet', 'nordicbet'],
  ['betclic', 'betclic'],
  ['winamax', 'winamax']
];

function brandHomepage(bkm) {
  var key = String(bkm.key || '').toLowerCase();
  for (var i = 0; i < BOOKMAKER_KEY_BRANDS.length; i++) {
    if (key.indexOf(BOOKMAKER_KEY_BRANDS[i][0]) !== -1) {
      var url = BOOKMAKER_HOMEPAGES[BOOKMAKER_KEY_BRANDS[i][1]];
      if (url) return url;
    }
  }

  var title = String(bkm.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  var types = ['williamhill', '888sport', 'paddypower', 'marathonbet', 'bet365', 'betfair', 'betway', 'unibet', 'bwin', 'pinnacle', 'betsson', 'nordicbet'];
  for (var j = 0; j < types.length; j++) {
    if (title.indexOf(types[j]) !== -1 && BOOKMAKER_HOMEPAGES[types[j]]) {
      return BOOKMAKER_HOMEPAGES[types[j]];
    }
  }
  return null;
}

function linkForBookmaker(bkm, event) {
  var links = (event.links || []).filter(function (l) {
    return l && Object.prototype.hasOwnProperty.call(l, 'href');
  });
  if (links.length) return links[0].href;
  return brandHomepage(bkm);
}

function outcomePrice(marketOutcomes, label) {
  for (var i = 0; i < marketOutcomes.length; i++) {
    if (String(marketOutcomes[i].name || '').toLowerCase() === label.toLowerCase()) {
      var price = marketOutcomes[i].price;
      return typeof price === 'number' || typeof price === 'string' ? String(price) : null;
    }
  }
  return null;
}

function mapBookmakers(event, matchup) {
  var out = [];
  (event.bookmakers || []).forEach(function (bkm) {
    if (!bkm || bkm.is_open === false) return;
    var h2h = (bkm.markets || []).filter(function (m) { return m.key === 'h2h'; })[0];
    if (!h2h || !Array.isArray(h2h.outcomes)) return;
    var home = outcomePrice(h2h.outcomes, matchup.home);
    var draw = outcomePrice(h2h.outcomes, 'Draw');
    var away = outcomePrice(h2h.outcomes, matchup.away);
    if (!home && !draw && !away) return;
    out.push({
      key: bkm.key || '',
      title: bkm.title || bkm.key || 'Bookmaker',
      home: home,
      draw: draw,
      away: away,
      link: linkForBookmaker(bkm, event)
    });
  });
  return out;
}

function addUtcDays(dateStr, days) {
  var d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getOddsComparison(opts) {
  var home = String(opts.home || '').trim();
  var away = String(opts.away || '').trim();
  var date = String(opts.date || '').trim();
  var league = String(opts.league || '').trim();

  if (!home || !away || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { available: false, reason: 'invalid-parameters' };
  }
  if (!apiKey()) {
    return { available: false, reason: 'not-configured', message: 'Live odds comparison is not configured yet.' };
  }

  var today = new Date().toISOString().slice(0, 10);
  // The Odds API only returns upcoming events — completed days are gone.
  if (date < today) return { available: false, reason: 'past-date' };

  var sports;
  try {
    sports = await fetchSportsList();
  } catch (e) {
    console.warn('[odds-comparison] Sports list fetch failed:', e.message);
    return { available: false, reason: 'source-error' };
  }

  var sportKey = resolveSportKey(league, sports);
  if (!sportKey) return { available: false, reason: 'no-sport-match' };

  var fromIso = date + 'T00:00:00Z';
  var toIso = addUtcDays(date, 1) + 'T00:00:00Z';

  var events;
  try {
    events = await fetchOddsForSport(sportKey, fromIso, toIso);
  } catch (e) {
    console.warn('[odds-comparison] Odds fetch failed (' + sportKey + '):', e.message);
    if (e.code === 'ODDS_BUDGET_REACHED') {
      return { available: false, reason: 'budget-limited', message: e.message };
    }
    return { available: false, reason: 'source-error' };
  }

  if (!events.length) return { available: false, reason: 'no-events' };

  var event = findEvent(events, home, away);
  if (!event) return { available: false, reason: 'no-event' };

  var matchup = { home: event.home_team || home, away: event.away_team || away };
  var bookmakers = mapBookmakers(event, matchup);
  if (!bookmakers.length) return { available: false, reason: 'no-odds' };

  return {
    available: true,
    source: 'The Odds API',
    sport: sportKey,
    commence_time: event.commence_time || '',
    home_team: matchup.home,
    away_team: matchup.away,
    fetchedAt: new Date().toISOString(),
    bookmakers: bookmakers,
    budget: { used: oddsBudget.used, dailyLimit: DAILY_ODDS_BUDGET, remaining: oddsBudget.remaining }
  };
}

module.exports = { getOddsComparison, normalizeName, resolveSportKey, findEvent, mapBookmakers };