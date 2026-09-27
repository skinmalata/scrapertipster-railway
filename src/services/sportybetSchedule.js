'use strict';

// Forebet -> SportyBet fixture matching.
//
// Forebet publishes a global fixture list, but SportyBet - the bookmaker our
// members actually place these picks on - only carries a subset of those
// leagues. A VIP tip for a fixture the bookmaker does not offer is unbettable,
// so the VIP engine only considers fixtures that resolve to a real SportyBet
// event on the same date.
//
// WHY THIS IS NOT A PLAIN STRING MATCH
// The two feeds name the same club differently:
//   Forebet "Deportes Santa Cruz"   SportyBet "CD Santa Cruz"
//   Forebet "Sportivo Dock Sud"     SportyBet "CS Dock Sud"
//   Forebet "O Higgins"             SportyBet "CD O'Higgins"
//   Forebet "Hapoel Raanana"        SportyBet "Hapoel Ra'anana FC"
//   Forebet "CD FAS"                SportyBet "CD FAS Santa Ana"
// so a single canonical key throws away real fixtures. An earlier scored
// ("fuzzy") matcher instead over-matched, because club names are only unique
// INSIDE a country: "Fortaleza" exists in Colombia, Brazil and Ecuador, and a
// Brazil fixture sharing one name line is a different game from the Colombia
// one. That is why country is a first-class part of the key here.
//
// The match therefore accepts a fixture only when ALL of these hold:
//   1. both clubs resolve to the same club (exact spelling variant, or one
//      side's tokens being a subset of the other's), AND
//   2. the countries agree whenever both feeds state one, AND
//   3. the feeds agree on whether this is a women's side, AND
//   4. exactly ONE SportyBet fixture fits. An ambiguous result is rejected
//      rather than guessed.
//
// Rule 4 is why a false positive is close to impossible: the dangerous cases
// are all "several SportyBet fixtures look alike", and those are dropped. The
// cost of a miss is one tip; the cost of a wrong match is a member betting on
// a game we never analysed, so misses are the cheap direction to fail in.

const { getAvailableMatches } = require('./bookingCodes/resolver');

// Club-name tokens carrying no identifying information, seen as a prefix or
// suffix on one feed or the other. Single letters are deliberately absent so
// "Tigres UANL W" cannot collapse onto "Tigres UANL".
const CLUB_TOKEN = 'fc|sc|cf|afc|cd|ca|cs|csd|cfc|ce|cp|fk|sk|ss|ssc|as|ac|usc|us|uv|sd|ud|rc|rcd|rca|rcb|vfl|sv|tsg|fsv|bsc|ml|if|ik|ob|mb|spv|sge|aik|crr|ccc';
// Short leading region/country token: "AJ Auxerre", "FK Ufa", "CA Alvarado".
const LEAD_TOKEN = '[a-z]{2,4}';
const PREFIX_RE = new RegExp('^(?:' + LEAD_TOKEN + '\\s+)?(?:' + CLUB_TOKEN + ')\\s+');
const SUFFIX_RE = new RegExp('\\s+(?:' + CLUB_TOKEN + ')$');

// Standalone markers that identify a women's side. These must survive
// normalisation, so they are matched on the folded text before club tokens are
// stripped.
const WOMENS_RE = /(^|\s)(w|women|woman|womens|femenina|femenino|ladies)(\s|$)/;

// Forebet tags a club with its federation code, e.g. "Huracan FC (URU)".
// Mapped to the country names SportyBet uses in its league strings
// ("Uruguay - Primera Division"). Codes we cannot resolve degrade to "unknown"
// rather than blocking a match, because the uniqueness rule already covers the
// cases that matter.
const COUNTRY_CODES = {
  URU: ['uruguay'], COL: ['colombia'], BRA: ['brazil', 'brasil'],
  BFA: ['brazil', 'brasil'], ARG: ['argentina'], CHI: ['chile'],
  PER: ['peru'], PAR: ['paraguay'], ECU: ['ecuador'], BOL: ['bolivia'],
  VEN: ['venezuela'], MEX: ['mexico'], USA: ['united states', 'usa'],
  CAN: ['canada'], CRC: ['costa rica'], PAN: ['panama'],
  GUA: ['guatemala'], HON: ['honduras'], SLV: ['el salvador'],
  NIC: ['nicaragua'], COS: ['costa rica'], JAM: ['jamaica'],
  TRI: ['trinidad'], HAI: ['haiti'], DOM: ['dominican'],
  ESP: ['spain'], POR: ['portugal'], FRA: ['france'], GER: ['germany'],
  ITA: ['italy'], NED: ['netherlands'], BEL: ['belgium'], SUI: ['switzerland'],
  AUT: ['austria'], POL: ['poland'], CZE: ['czech'], SVK: ['slovakia'],
  HUN: ['hungary'], ROU: ['romania'], BUL: ['bulgaria'], SRB: ['serbia'],
  CRO: ['croatia'], GRE: ['greece'], TUR: ['turkey'], UKR: ['ukraine'],
  RUS: ['russia'], SWE: ['sweden'], NOR: ['norway'], DEN: ['denmark'],
  FIN: ['finland'], IRL: ['ireland'], SCO: ['scotland'], WAL: ['wales'],
  ISL: ['iceland'], ISR: ['israel'], CYP: ['cyprus'], LUX: ['luxembourg'],
  RSA: ['south africa'], EGY: ['egypt'], MAR: ['morocco'], TUN: ['tunisia'],
  ALG: ['algeria'], NGA: ['nigeria'], GHA: ['ghana'], CIV: ['ivory coast'],
  SEN: ['senegal'], MLI: ['mali'], CMR: ['cameroon'], COD: ['dr congo'],
  AUS: ['australia'], NZL: ['new zealand'], JPN: ['japan'], KOR: ['south korea'],
  CHN: ['china'], THA: ['thailand'], VIE: ['vietnam'], IDN: ['indonesia'],
  PHI: ['philippines'], MYS: ['malaysia'], SGP: ['singapore'], IND: ['india'],
  UZB: ['uzbekistan'], KAZ: ['kazakhstan'], AZE: ['azerbaijan'], GEO: ['georgia'],
  ARM: ['armenia'], CYP2: ['cyprus'], LTU: ['lithuania'], LVA: ['latvia'],
  EST: ['estonia'], BLR: ['belarus'], MDA: ['moldova'], ALB: ['albania'],
  SVN: ['slovenia'], BIH: ['bosnia'], MKD: ['north macedonia'], MNE: ['montenegro'],
  KOS: ['kosovo'], NIR: ['northern ireland'], WAL2: ['wales']
};

// Fold one name to comparable text. `apostrophe` decides how an apostrophe
// folds: deleted ("Ra'anana" -> "raanana") or spaced ("O'Higgins" ->
// "o higgins"). Both are legitimate, and neither feed is authoritative, so
// both spellings are produced and indexed.
function fold(name, apostrophe) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')                 // accents: Limeno
    .toLowerCase()
    .replace(/[''`\u2019\u02bc]/g, apostrophe)
    .replace(/\([^)]*\)/g, ' ')                      // (URU), (COL) country tag
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip club tokens until stable ("CD CSD Something" -> "something").
function stripClubTokens(s) {
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(PREFIX_RE, '').replace(SUFFIX_RE, '').trim();
    if (s === before) break;
  }
  return s;
}

// Remove the standalone womens markers. Only ever called for club comparison,
// never for the guard itself, so a women's side is still recognised as one - it
// just stops "Tigres UANL W" from being treated as a different club from
// "CF Tigres UANL" once both feeds have already agreed it is women's.
function stripWomensTokens(s) {
  return String(s || '')
    .split(' ')
    .filter(t => t && !/^(w|women|woman|womens|femenina|femenino|ladies)$/.test(t))
    .join(' ')
    .trim();
}

// Every reasonable spelling of one club name.
function nameVariants(name) {
  const out = new Set();
  for (const apostrophe of ['', ' ']) {
    const folded = stripWomensTokens(fold(name, apostrophe));
    const stripped = stripWomensTokens(stripClubTokens(folded));
    if (stripped) out.add(stripped);
    if (folded && folded !== stripped) out.add(folded);
  }
  return Array.from(out);
}

// Primary normalised key for one club name.
function sportyKey(name) {
  return nameVariants(name)[0] || '';
}

const tokenSet = (s) => new Set(String(s || '').split(' ').filter(Boolean));

// Is `a` the same club as `b`? Accepts any spelling variant, or one side's
// tokens being a SUBSET of the other's - which is what absorbs a feed that
// carries an extra qualifier ("Dock Sud" / "Sportivo Dock Sud", "CD FAS" /
// "CD FAS Santa Ana", "Santa Cruz" / "Deportes Santa Cruz").
//
// The asymmetric form is safe here only because the caller has already
// required the two feeds to agree on country and on whether this is a women's
// side: a bare name subset is meaningless without them, since "Fortaleza" is a
// real club in three countries.
function sameClub(a, b) {
  const av = nameVariants(a);
  const bv = nameVariants(b);
  for (const x of av) {
    for (const y of bv) {
      if (x === y) return true;
    }
  }
  const at = tokenSet(nameVariants(a).map(stripClubTokens)[0]);
  const bt = tokenSet(nameVariants(b).map(stripClubTokens)[0]);
  if (!at.size || !bt.size) return false;
  let aInB = true;
  for (const t of at) {
    if (!bt.has(t)) { aInB = false; break; }
  }
  if (aInB) return true;
  for (const t of bt) {
    if (!at.has(t)) return false;
  }
  return true;
}

function isWomens(name) {
  return WOMENS_RE.test(fold(name, ' '));
}

// Country names implied by a Forebet "(XXX)" tag, or null when unresolvable.
function foreCountryNames(name) {
  const tag = /\(([a-z]{2,4})\)/i.exec(String(name || ''));
  if (!tag) return null;
  const names = COUNTRY_CODES[tag[1].toUpperCase()];
  return names || null;
}

// Country from a SportyBet league string: "Colombia - Liga DIMAYOR" -> "Colombia".
function sportyCountry(league) {
  const first = String(league || '').split(' - ')[0].trim();
  return first && first.toLowerCase() !== 'international' ? first : null;
}

// Countries agree unless both feeds state one and they differ. An unknown on
// either side is permissive, so an unmapped federation code cannot hide a real
// match.
function countriesCompatible(foreName, league) {
  const names = foreCountryNames(foreName);
  const country = sportyCountry(league);
  if (!names || !country) return true;
  const hay = country.toLowerCase();
  return names.some(n => hay.includes(n));
}

// Women's sides: SportyBet marks them in the league name
// ("Mexico - Liga MX, Women"), Forebet in the club name ("Tigres UANL W").
function sportyIsWomens(league) {
  return /women|femenina|ladies/i.test(String(league || ''));
}

// Squad level: senior team, reserves, or a youth side.
//
// This must match EXACTLY between the feeds, and it is the one place where an
// asymmetric (subset) club comparison is unsafe. Because "Bayern Munich" is a
// token subset of "Bayern Munich II", a subset rule would happily resolve the
// senior fixture onto the reserves - a real false positive, and one that puts a
// member on a completely different match. Dropping a squad marker also risks
// the reverse. So senior <> reserves and senior <> U23 are always rejected,
// even when the two feeds spell the level differently ("2" vs "II").
//
// Deliberately excludes short ambiguous tokens such as "al" (Al Ahly),
// "porto" (FC Porto) and "c": those are ordinary club-name words, not squad
// markers, and treating them as such would reject real matches everywhere.
const SQUAD_II = /^(ii|2|b)$/;
const SQUAD_III = /^(iii|3)$/;
const SQUAD_U = /^u(1[6-9]|2[0-3])$/;
const SQUAD_WORD = /^(reserves?|reservas?|castilla|nextgen|academy|academia|primavera|juvenil)$/;

function squadLevel(name) {
  for (const token of fold(name, ' ').split(' ').filter(Boolean)) {
    if (SQUAD_U.test(token)) return token;
    if (SQUAD_II.test(token)) return 'ii';
    if (SQUAD_III.test(token)) return 'iii';
    if (SQUAD_WORD.test(token)) return token;
  }
  return '';
}

// Key for a whole fixture under one specific spelling pair.
function pairKey(home, away) {
  return sportyKey(home) + ' | ' + sportyKey(away);
}

// Index the live schedule by date. Each bucket keeps every exact pair-key
// spelling plus the fixture list for the containment search.
function buildScheduleIndex(matches) {
  const index = new Map();
  for (const m of matches || []) {
    const date = m.date || '';
    if (!date) continue;
    if (!index.has(date)) index.set(date, { keys: new Set(), fixtures: [] });
    const bucket = index.get(date);
    for (const h of nameVariants(m.home)) {
      for (const a of nameVariants(m.away)) {
        bucket.keys.add(h + ' | ' + a);
      }
    }
    bucket.fixtures.push({
      home: m.home,
      away: m.away,
      league: m.league || '',
      country: sportyCountry(m.league),
      womens: sportyIsWomens(m.league) || isWomens(m.home) || isWomens(m.away),
      homeLevel: squadLevel(m.home),
      awayLevel: squadLevel(m.away),
      time: m.time,
      odds: m.odds
    });
  }
  return index;
}

// Find the SportyBet event backing a Forebet fixture, or null.
//
// Returns the matched event (not a boolean) so callers can surface the league
// and odds alongside the pick. An ambiguous match returns null on purpose.
function findSportybetFixture(index, date, home, away) {
  if (!index || !date) return null;
  const bucket = index.get(date);
  if (!bucket) return null;

  // Every guard a fixture must clear, gathered once. The exact-spelling fast
  // path runs through the SAME checks as the containment search - a fast path
  // that skips them is exactly how "Tigres UANL W" came to resolve onto the
  // senior Mexico fixture.
  const womens = isWomens(home) || isWomens(away);
  const homeLevel = squadLevel(home);
  const awayLevel = squadLevel(away);
  const compatible = f =>
    f.womens === womens &&
    f.homeLevel === homeLevel &&
    f.awayLevel === awayLevel &&
    countriesCompatible(home, f.league) &&
    countriesCompatible(away, f.league);

  const homes = nameVariants(home);
  const aways = nameVariants(away);
  for (const h of homes) {
    for (const a of aways) {
      if (!bucket.keys.has(h + ' | ' + a)) continue;
      const exact = bucket.fixtures.find(
        f => nameVariants(f.home).includes(h) && nameVariants(f.away).includes(a) && compatible(f)
      );
      if (exact) return exact;
    }
  }

  const hits = bucket.fixtures.filter(
    f => compatible(f) && sameClub(home, f.home) && sameClub(away, f.away)
  );
  return hits.length === 1 ? hits[0] : null;
}

function isOnSportyBet(index, date, home, away) {
  return findSportybetFixture(index, date, home, away) !== null;
}

// Load and index the live SportyBet pre-match schedule.
//
// FAILS OPEN on purpose. If the bookmaker feed is unreachable (network blip,
// rate limit, empty response) an empty index would make every fixture look
// unavailable and publish an empty VIP list for the day. Throwing lets the
// caller fall back to today's behaviour - publish from Forebet alone - which
// beats silently shipping nothing. The caller is expected to log this.
async function loadSportybetSchedule() {
  const matches = await getAvailableMatches();
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('SportyBet schedule came back empty');
  }
  const index = buildScheduleIndex(matches);
  return { index, total: matches.length, dates: Array.from(index.keys()).sort() };
}

module.exports = {
  sportyKey,
  nameVariants,
  pairKey,
  sameClub,
  isWomens,
  foreCountryNames,
  sportyCountry,
  countriesCompatible,
  squadLevel,
  buildScheduleIndex,
  findSportybetFixture,
  isOnSportyBet,
  loadSportybetSchedule
};
