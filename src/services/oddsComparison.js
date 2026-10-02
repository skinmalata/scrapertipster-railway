'use strict';

const fs = require('fs');
const path = require('path');

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
// 'ng' is not a valid region on The Odds API v4: any request carrying it fails
// with HTTP 422 INVALID_REGION, which is why every call here used to come back
// empty and the site fell back to "no verified prices". 'eu' is valid and still
// carries the Nigeria-facing books the audience uses (1xBet, BetOnline/AG).
const ODDS_REGIONS = 'eu';
const ODDS_MARKETS = 'h2h';
const ODDS_FORMAT = 'decimal';
const DATE_FORMAT = 'iso';

const SPORTS_CACHE_MS = 12 * 60 * 60 * 1000;
const ODDS_CACHE_MS = 20 * 60 * 1000;
const MAX_ODDS_CACHE = 60;
// The accumulator sweep (10 sports) plus the analysis pages' per-fixture
// lookups share this daily cap, so it has to cover a full sweep plus headroom.
// The real ceiling is the monthly quota: ACCUMULATOR_CACHE_MS of 6h means at
// most 4 sweeps/day, so ~40 requests/day worst case.
const DAILY_ODDS_BUDGET = 60;

let sportsListCache = { createdAt: 0, data: null, key: null };
let oddsCache = new Map();
let oddsBudget = { day: '', used: 0, remaining: null };

// Direct league-name -> sport key hints. Keys that are not present in the
// current /v4/sports list are ignored and the resolver falls back to the
// fuzzy title/description match.
const LEAGUE_SPORT_OVERRIDES = {
  'premier league': 'soccer_epl',
  'english premier league': 'soccer_epl',
  'championship': 'soccer_efl_champ',
  'efl championship': 'soccer_efl_champ',
  'league one': 'soccer_england_league1',
  'league 1': 'soccer_england_league1',
  'efl league one': 'soccer_england_league1',
  'league two': 'soccer_england_league2',
  'league 2': 'soccer_england_league2',
  'efl league two': 'soccer_england_league2',
  'serie a': 'soccer_italy_serie_a',
  'italian serie a': 'soccer_italy_serie_a',
  'serie b': 'soccer_italy_serie_b',
  'italian serie b': 'soccer_italy_serie_b',
  'la liga': 'soccer_spain_la_liga',
  'spanish la liga': 'soccer_spain_la_liga',
  'primera division spain': 'soccer_spain_la_liga',
  'segunda division': 'soccer_spain_segunda_division',
  'bundesliga': 'soccer_germany_bundesliga',
  'german bundesliga': 'soccer_germany_bundesliga',
  'bundesliga 2': 'soccer_germany_bundesliga2',
  'bundesliga 3': 'soccer_germany_liga3',
  'ligue 1': 'soccer_france_ligue_one',
  'french ligue 1': 'soccer_france_ligue_one',
  'ligue 2': 'soccer_france_ligue_two',
  'eredivisie': 'soccer_netherlands_eredivisie',
  'dutch eredivisie': 'soccer_netherlands_eredivisie',
  'primeira liga': 'soccer_portugal_primeira_liga',
  'portuguese liga': 'soccer_portugal_primeira_liga',
  'turkish super lig': 'soccer_turkey_super_league',
  'super lig': 'soccer_turkey_super_league',
  'turkey super league': 'soccer_turkey_super_league',
  'super league': 'soccer_turkey_super_league',
  'scottish premiership': 'soccer_spl',
  'scottish premier league': 'soccer_spl',
  'premiership scotland': 'soccer_spl',
  'ekstraklasa': 'soccer_poland_ekstraklasa',
  'polish ekstraklasa': 'soccer_poland_ekstraklasa',
  'allsvenskan': 'soccer_sweden_allsvenskan',
  'swedish allsvenskan': 'soccer_sweden_allsvenskan',
  'superettan': 'soccer_sweden_superettan',
  'eliteserien': 'soccer_norway_eliteserien',
  'norwegian eliteserien': 'soccer_norway_eliteserien',
  'superliga': 'soccer_denmark_superliga',
  'danish superliga': 'soccer_denmark_superliga',
  'veikkausliiga': 'soccer_finland_veikkausliiga',
  'austrian bundesliga': 'soccer_austria_bundesliga',
  'swiss super league': 'soccer_switzerland_superleague',
  'swiss superleague': 'soccer_switzerland_superleague',
  'belgian pro league': 'soccer_belgium_first_div',
  'jupiler pro league': 'soccer_belgium_first_div',
  'greek super league': 'soccer_greece_super_league',
  'greek superleague': 'soccer_greece_super_league',
  'liga mx': 'soccer_mexico_ligamx',
  'mexico liga mx': 'soccer_mexico_ligamx',
  'mls': 'soccer_usa_mls',
  'major league soccer': 'soccer_usa_mls',
  'brazil serie a': 'soccer_brazil_campeonato',
  'brasileiro serie a': 'soccer_brazil_campeonato',
  'brazilian serie a': 'soccer_brazil_campeonato',
  'brazil serie b': 'soccer_brazil_serie_b',
  'brazil serie b2': 'soccer_brazil_serie_b',
  'argentine liga profesional': 'soccer_argentina_primera_division',
  'argentina liga profesional': 'soccer_argentina_primera_division',
  'primera division argentina': 'soccer_argentina_primera_division',
  'liga 1 paraguay': 'soccer_argentina_primera_division',
  'chilean primera division': 'soccer_chile_campeonato',
  'china super league': 'soccer_china_superleague',
  'chinese super league': 'soccer_china_superleague',
  'russian premier league': 'soccer_russia_premier_league',
  'saudi pro league': 'soccer_saudi_arabia_pro_league',
  'league of ireland': 'soccer_league_of_ireland',
  'japanese j league': 'soccer_japan_j_league',
  'j league': 'soccer_japan_j_league',
  'k league': 'soccer_korea_kleague1',
  'k league 1': 'soccer_korea_kleague1',
  'copa libertadores': 'soccer_conmebol_copa_libertadores',
  'copa sudamericana': 'soccer_conmebol_copa_sudamericana',
  'champions league': 'soccer_uefa_champs_league',
  'europa league': 'soccer_uefa_europa_league',
  'europa conference league': 'soccer_uefa_europa_conference_league',
  'fa cup': 'soccer_fa_cup',
  'efl cup': 'soccer_england_efl_cup',
  'league cup': 'soccer_england_efl_cup',
  'world cup': 'soccer_fifa_world_cup',
  'nations league': 'soccer_uefa_nations_league',
  'euro 2024': 'soccer_uefa_european_championship',
  'euro': 'soccer_uefa_european_championship',
  'africa cup of nations': 'soccer_africa_cup_of_nations',
  'npfl': 'soccer_nigeria_premier_league',
  'nigerian premier league': 'soccer_nigeria_premier_league',
  'nigeria premier league': 'soccer_nigeria_premier_league',
  'nigerian league': 'soccer_nigeria_premier_league'
};

// Ordered most-likely-first list of soccer sports used as a fallback for
// team-name matching when the page's league label is empty or wrong (analysis
// league strings are often unreliable, e.g. a Championship tie labelled
// "League One"). Each sport's daily odds are cached, so probing several sports
// on the first match is cheap and later matches reuse the cached results.
const FALLBACK_PRIORITY_SPORTS = [
  'soccer_efl_champ',
  'soccer_england_league1',
  'soccer_england_league2',
  'soccer_epl',
  'soccer_italy_serie_a',
  'soccer_italy_serie_b',
  'soccer_spain_la_liga',
  'soccer_spain_segunda_division',
  'soccer_germany_bundesliga',
  'soccer_germany_bundesliga2',
  'soccer_france_ligue_one',
  'soccer_france_ligue_two',
  'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga',
  'soccer_turkey_super_league',
  'soccer_belgium_first_div',
  'soccer_switzerland_superleague',
  'soccer_austria_bundesliga',
  'soccer_denmark_superliga',
  'soccer_sweden_allsvenskan',
  'soccer_norway_eliteserien',
  'soccer_poland_ekstraklasa',
  'soccer_greece_super_league',
  'soccer_spl',
  'soccer_scotland',
  'soccer_brazil_campeonato',
  'soccer_brazil_serie_b',
  'soccer_mexico_ligamx',
  'soccer_usa_mls',
  'soccer_argentina_primera_division',
  'soccer_chile_campeonato',
  'soccer_nigeria_premier_league'
];

const MAX_FALLBACK_PROBES = 5;

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

// The Odds API requires commenceTimeFrom/To as YYYY-MM-DDTHH:MM:SSZ. The
// default toISOString() format carries milliseconds ("...T11:58:14.290Z") and
// is rejected with HTTP 422 INVALID_COMMENCE_TIME_FROM, so strip them.
function toApiTime(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Fetches h2h odds for a sport between industry-standard ISO datetimes.
// Responses with zero events are free on The Odds API, so the budget slot
// consumed above is released when nothing comes back.
async function fetchOddsForSport(sportKey, fromIso, toIso, markets) {
  var marketList = markets || ODDS_MARKETS;
  var fromParam = toApiTime(fromIso);
  var toParam = toApiTime(toIso);
  var cacheKey = sportKey + '|' + fromParam.slice(0, 10) + '|' + toParam.slice(0, 10) + '|' + marketList;
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
    'markets=' + encodeURIComponent(marketList),
    'oddsFormat=' + encodeURIComponent(ODDS_FORMAT),
    'dateFormat=' + encodeURIComponent(DATE_FORMAT),
    'includeLinks=true',
    'commenceTimeFrom=' + encodeURIComponent(fromParam),
    'commenceTimeTo=' + encodeURIComponent(toParam)
  ];

  var events = [];
  try {
    var res = await fetch(ODDS_API_BASE + '/v4/sports/' + encodeURIComponent(sportKey) + '/odds/?' + params.join('&'), {
      signal: AbortSignal.timeout(20000)
    });
    // A failed response (401/429/5xx) can arrive with no x-requests-remaining
    // header. Number(null) is 0, which is finite, so reading it unguarded used
    // to set remaining=0 and permanently exhaust the budget for the process --
    // one bad response silently killed all later odds lookups for the day.
    var remainingHeader = res.headers.get('x-requests-remaining');
    if (remainingHeader !== null && remainingHeader !== '') {
      var remaining = Number(remainingHeader);
      if (Number.isFinite(remaining)) oddsBudget.remaining = remaining;
    }
    if (!res.ok) {
      releaseOddsBudget();
      var detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (e) { detail = ''; }
      var httpError = new Error('odds HTTP ' + res.status + (detail ? ' - ' + detail : ''));
      httpError.status = res.status;
      throw httpError;
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

// Common page-name -> canonical API-name aliases. The analysis data uses short
// or slang names ("Preston", "Sheffield Utd") while The Odds API uses full
// names ("Preston North End", "Sheffield United"). The alias value is a
// normalized token the API name is expected to contain.
const TEAM_ALIASES = {
  'preston': 'preston north end',
  'sheffield utd': 'sheffield united',
  'sheffield wed': 'sheffield wednesday',
  'bolton': 'bolton wanderers',
  'bolton wanderers': 'bolton wanderers',
  'lincoln': 'lincoln city',
  'blackburn': 'blackburn rovers',
  'west ham': 'west ham united',
  'wolves': 'wolverhampton wanderers',
  'wolverhampton': 'wolverhampton wanderers',
  'wba': 'west bromwich albion',
  'west brom': 'west bromwich albion',
  'palace': 'crystal palace',
  'brighton': 'brighton hove albion',
  'man utd': 'manchester united',
  'manchester utd': 'manchester united',
  'man city': 'manchester city',
  'spurs': 'tottenham hotspur',
  'tottenham': 'tottenham hotspur',
  'leeds': 'leeds united',
  'newcastle': 'newcastle united',
  'united': 'united',
  'hod': 'hod',
  'nb': 'nb',
  // NPFL teams
  'enyimba': 'enyimba',
  'kano pillars': 'kano pillars',
  'kano pill': 'kano pillars',
  'rangers international': 'rangers international',
  'heartland': 'heartland',
  'sunshine stars': 'sunshine stars',
  'warri wolves': 'warri wolves',
  'obiobi stars': 'obiobi stars',
  'lobi stars': 'lobi stars',
  'nasarawa united': 'nasarawa united',
  'katsina united': 'katsina united',
  'fc izo': 'fc izo',
  'dynamo star': 'dynamo star',
  'abia warriors': 'abia warriors',
  'remo stars': 'remo stars',
  'shots': 'shots',
  'bendel insurance': 'bendel insurance',
  'tornadoes': 'tornadoes',
  'oundary united': 'boundary united',
  'niger tornadoes': 'niger tornadoes',
  'akwa united': 'akwa united',
  'delta force': 'delta force',
  'crown fc': 'crown fc',
  'eyeope': 'eyeope',
  'squads': 'squads',
  'fc plateau': 'fc plateau',
  'plateau united': 'plateau united',
  'mfm': 'mfm',
  'mountain of fire': 'mountain of fire',
  'sunshine': 'sunshine stars'
};

function aliasTokens(name) {
  var norm = normalizeName(name);
  var tokens = tokenize(name);
  if (TEAM_ALIASES[norm]) {
    return tokenize(TEAM_ALIASES[norm]).length ? tokenize(TEAM_ALIASES[norm]) : tokens;
  }
  // multi-word partial aliases (e.g. "Sheffield Utd") — check after normalizing
  var aliasKey = Object.keys(TEAM_ALIASES).find(function (k) {
    return norm.indexOf(normalizeName(k)) === 0 && tokens[0] === tokenize(k)[0];
  });
  if (aliasKey) {
    var expanded = tokenize(TEAM_ALIASES[aliasKey]);
    if (expanded.length) return expanded;
  }
  return tokens;
}

// Team match score on [0,1]. Accepts exact, alias expansion, and the case where
// one side's significant tokens start the other side (short name -> full name).
function teamMatchScore(pageName, apiName) {
  var pageNorm = normalizeName(pageName);
  var apiNorm = normalizeName(apiName);
  if (!pageNorm || !apiNorm) return 0;
  if (pageNorm === apiNorm) return 1;
  if (apiNorm.indexOf(pageNorm) === 0 || pageNorm.indexOf(apiNorm) === 0) return 0.92;

  var pt = aliasTokens(pageName);
  var at = tokenize(apiName);
  if (!pt.length || !at.length) return 0;
  if (pt[0] === at[0]) return 0.85;
  return tokenOverlap(pt, at);
}

function findEvent(events, home, away) {
  var hTokens = tokenize(home);
  var aTokens = tokenize(away);
  if (!hTokens.length || !aTokens.length) return null;

  var best = null;
  var bestScore = 0;
  for (var j = 0; j < events.length; j++) {
    var candidate = events[j];
    if (!candidate || !candidate.home_team || !candidate.away_team) continue;
    var score = (teamMatchScore(home, candidate.home_team) + teamMatchScore(away, candidate.away_team)) / 2;
    if (score >= 0.75 && score > bestScore) {
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
  '22bet': 'https://22bet.com',
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
  ['22bet', '22bet'],
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

  var fromIso = date + 'T00:00:00Z';
  var toIso = addUtcDays(date, 1) + 'T00:00:00Z';

  // Build the ordered list of sports to try: the league-resolved sport first,
  // then the priority fallbacks (team names are the ground truth and analysis
  // league labels are often empty or wrong, e.g. a Championship tie labelled
  // "League One").
  var primarySport = resolveSportKey(league, sports);
  var candidates = [];
  var seen = {};
  function pushSport(key) {
    if (!key || seen[key]) return;
    var exists = sports.some(function (s) { return s.key === key; });
    if (!exists) return;
    seen[key] = true;
    candidates.push(key);
  }
  pushSport(primarySport);
  FALLBACK_PRIORITY_SPORTS.forEach(pushSport);

  var event = null;
  var sportKey = null;
  var triedAny = false;
  var probes = 0;
  var failReason = null;
  for (var ci = 0; ci < candidates.length; ci++) {
    var key = candidates[ci];
    var isPrimary = key === primarySport;
    // Always try the league-resolved sport, then probe at most MAX_FALLBACK_PROBES
    // additional priority sports. Each sport's events stay cached for the day,
    // so probing several on the first match is cheap and later matches reuse them.
    if (!isPrimary && probes >= MAX_FALLBACK_PROBES) break;
    if (!isPrimary) probes++;
    var events;
    try {
      events = await fetchOddsForSport(key, fromIso, toIso);
      triedAny = true;
    } catch (e) {
      if (e.code === 'ODDS_BUDGET_REACHED') {
        return { available: false, reason: 'budget-limited', message: e.message };
      }
      if (isPrimary) {
        return { available: false, reason: 'source-error' };
      }
      continue;
    }
    if (!events.length) {
      if (isPrimary && !event) failReason = failReason || 'no-events';
      continue;
    }
    event = findEvent(events, home, away);
    if (event) {
      sportKey = key;
      break;
    }
  }

  if (!event) {
    if (!triedAny) return { available: false, reason: 'no-sport-match' };
    return { available: false, reason: failReason || 'no-event' };
  }

  var matchup = { home: event.home_team || home, away: event.away_team || away };
  var allBookmakers = mapBookmakers(event, matchup);
  if (!allBookmakers.length) return { available: false, reason: 'no-odds' };

  // Only show 1xBet, Betway, and 22bet
  var ALLOWED_BOOKMAKERS = ['1xbet', 'betway', '22bet'];
  var bookmakers = allBookmakers.filter(function (b) {
    var key = normalizeName(b.key || '');
    var title = normalizeName(b.title || '');
    return ALLOWED_BOOKMAKERS.some(function (name) {
      return key.indexOf(name) !== -1 || title.indexOf(name) !== -1;
    });
  });
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

// ---------------------------------------------------------------------------
// Market-consensus accumulator pricing (2 Odds of the Day)
//
// The site model and the odds provider cover largely different fixtures, so
// this sweep deliberately does NOT join against predictions. It builds its own
// leg pool from whatever the bookmakers are actually offering, and ranks on
// de-vigged implied probability -- the market's own consensus, rather than our
// own model. That guarantees the accumulator is publishable on any day.
//
// Quota discipline: the free tier allows ~500 requests/month and the analysis
// pages also consume it, so the sweep is capped at ACCUMULATOR_SPORTS entries
// and cached for ACCUMULATOR_CACHE_MS. At 10 sports every 6h that is ~40
// requests/day worst case, and usually far less because sports with no events
// in the window are free and get skipped.
// ---------------------------------------------------------------------------

const ACCUMULATOR_SPORTS = [
  'soccer_uefa_nations_league',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_brazil_campeonato',
  'soccer_argentina_primera_division',
  'soccer_usa_mls',
  'soccer_netherlands_eredivisie'
];

const ACCUMULATOR_CACHE_MS = 6 * 60 * 60 * 1000;
const ACCUMULATOR_MARKETS = 'h2h';
const ACCUMULATOR_MIN_IMPLIED = 0.4; // below this a leg is a coin-flip, not an accumulator building block

let accumulatorCache = { createdAt: 0, from: null, to: null, legs: [], sports: 0, errors: [] };
const ACCUMULATOR_CACHE_DISK = path.join(__dirname, '..', '..', 'two-odds-legs-cache.json');

function deVig(outcomes) {
  const raw = outcomes.map(function(o) { return 1 / Number(o.price); });
  const total = raw.reduce(function(a, b) { return a + b; }, 0);
  if (!(total > 0)) return [];
  return raw.map(function(r) { return r / total; });
}

// Best available price per outcome, carrying the market-consensus probability.
function consensusForEvent(event) {
  var best = {};
  var bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
  for (var b = 0; b < bookmakers.length; b++) {
    var book = bookmakers[b];
    var markets = Array.isArray(book.markets) ? book.markets : [];
    for (var m = 0; m < markets.length; m++) {
      var market = markets[m];
      if (market.key !== 'h2h') continue;
      var probs = deVig(Array.isArray(market.outcomes) ? market.outcomes : []);
      var outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
      for (var o = 0; o < outcomes.length; o++) {
        var outcome = outcomes[o];
        var price = Number(outcome.price);
        if (!Number.isFinite(price) || price <= 1) continue;
        if (!best[outcome.name] || price > best[outcome.name].price) {
          best[outcome.name] = {
            price: Number(price.toFixed(2)),
            implied: probs[o] || 0,
            bookmaker: book.title || book.key || 'Bookmaker'
          };
        }
      }
    }
  }
  return best;
}

function loadAccumulatorCache() {
  if (accumulatorCache.from && Date.now() - accumulatorCache.createdAt < ACCUMULATOR_CACHE_MS) return accumulatorCache;
  try {
    if (fs.existsSync(ACCUMULATOR_CACHE_DISK)) {
      var disk = JSON.parse(fs.readFileSync(ACCUMULATOR_CACHE_DISK, 'utf8'));
      if (disk && Array.isArray(disk.legs) && Date.now() - (disk.createdAt || 0) < ACCUMULATOR_CACHE_MS) {
        accumulatorCache = disk;
        return accumulatorCache;
      }
    }
  } catch (e) {
    console.warn('[two-odds] Leg cache read failed:', e.message);
  }
  return null;
}

function saveAccumulatorCache(payload) {
  try {
    fs.writeFileSync(ACCUMULATOR_CACHE_DISK, JSON.stringify(payload));
  } catch (e) {
    console.warn('[two-odds] Leg cache write failed:', e.message);
  }
}

// Returns the pooled leg list: { match, league, kickoff, selection, price,
// implied, bookmaker }. Never throws; a provider outage yields an empty pool
// and the caller publishes no ticket rather than failing the request.
async function fetchAccumulatorLegs(windowIso) {
  var cached = loadAccumulatorCache();
  if (cached) return cached;

  var from = windowIso && windowIso.from ? windowIso.from : new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  var to = windowIso && windowIso.to ? windowIso.to : new Date(Date.now() + 72 * 3600 * 1000).toISOString();

  var legs = [];
  var errors = [];
  var used = 0;

  for (var i = 0; i < ACCUMULATOR_SPORTS.length; i++) {
    var sportKey = ACCUMULATOR_SPORTS[i];
    var events;
    try {
      events = await fetchOddsForSport(sportKey, from, to, ACCUMULATOR_MARKETS);
    } catch (err) {
      errors.push(sportKey + ': ' + (err.message || 'unavailable'));
      continue;
    }
    used++;
    for (var e = 0; e < events.length; e++) {
      var event = events[e];
      var kickoff = Date.parse(event.commence_time);
      if (!Number.isFinite(kickoff) || kickoff < Date.now() - 6 * 3600 * 1000) continue;
      var consensus = consensusForEvent(event);
      var names = Object.keys(consensus);
      for (var n = 0; n < names.length; n++) {
        var pick = consensus[names[n]];
        if (pick.implied < ACCUMULATOR_MIN_IMPLIED) continue;
        legs.push({
          sport: sportKey,
          league: sportKey.replace(/^soccer_/, '').replace(/_/g, ' '),
          match: event.home_team + ' v ' + event.away_team,
          home: event.home_team,
          away: event.away_team,
          kickoff: event.commence_time,
          kickoffMs: kickoff,
          day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(kickoff)),
          selection: names[n],
          market: 'Match Winner',
          price: pick.price,
          implied: Number(pick.implied.toFixed(4)),
          bookmaker: pick.bookmaker,
          priceStatus: 'verified'
        });
      }
    }
  }

  var payload = { createdAt: Date.now(), from: from, to: to, legs: legs, sports: used, errors: errors };
  if (legs.length) {
    accumulatorCache = payload;
    saveAccumulatorCache(payload);
    console.log('[two-odds] Refreshed leg pool: ' + legs.length + ' legs across ' + used + ' sports');
  } else {
    console.warn('[two-odds] Leg pool empty; keeping any prior cache. errors=' + JSON.stringify(errors));
  }
  return accumulatorCache.legs.length ? accumulatorCache : payload;
}

module.exports = { getOddsComparison, normalizeName, resolveSportKey, findEvent, mapBookmakers, fetchAccumulatorLegs, ACCUMULATOR_SPORTS };
