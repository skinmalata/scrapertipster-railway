(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) {
    root.WFT = root.WFT || {};
    root.WFT.SportyBuilderChat = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_MESSAGE_LENGTH = 500;
  var MIN_LEG_ODDS = 1.06;
  var MAX_LEG_ODDS = 20;
  var MIN_TARGET_ODDS = 2;
  var MAX_TARGET_ODDS = 50;
  var MAX_LEGS = 20;

  var HELP_TEXT = 'Try: "book 10 winning basketball matches with at least 2 odds each", ' +
    '"give me five straight wins", "5 x over 2.5 football", ' +
    '"both teams to score no with min 1.30", "EPL BTTS No with min 1.30", ' +
    '"NBA moneyline accumulator odds 6", "under 2.5 football target 5x", ' +
    '"dc 12 premier league", or "basketball points over under 6x".';

  var MARKET_PATTERNS = [
    { market: 'over35', pattern: /\b(?:over|o)[\s-]*3[.\s]*5\b/i },
    { market: 'over25', pattern: /\b(?:over|o)[\s-]*2[.\s]*5\b/i },
    { market: 'over15', pattern: /\b(?:over|o)[\s-]*1[.\s]*5\b/i },
    { market: 'under25', pattern: /\b(?:under|u)[\s-]*2[.\s]*5\b/i },
    { market: 'under15', pattern: /\b(?:under|u)[\s-]*1[.\s]*5\b/i },
    { market: 'dc12', pattern: /\b(?:dc\s*12|double\s+chance\s*12|12\s+double\s+chance|home\s+or\s+away)\b/i },
    { market: '1x2', pattern: /\b(?:1\s*x\s*2|match\s+(?:result|winner)|moneyline|(?:straight\s+)?wins?|to\s+win|dc(?!\s*12)|double\s+chance(?!\s*12)|1x|x2)\b/i },
    { market: 'bttsno', pattern: /\b(?:btts\s*(?:no|ng)|ng|gg\s*(?:no|ng)|both\s+teams?\s+(?:to\s+score\s+(?:no|not)|not\s+to\s+score|to\s+fail\s+to\s+score)|both\s+teams?\s+score\s+(?:no|not))\b/i },
    { market: 'btts', pattern: /\b(?:btts(?!\s*(?:no|ng))|btts\s+yes|both\s+teams?\s*(?:to\s+)?score(?!\s*(?:no|not))|both\s+to\s+score|gg(?!\s*(?:no|ng))|gg\s+yes)\b/i },
    { market: 'highestscoringhalf', pattern: /\b(?:highest\s+scoring\s+half|highest\s+scoring\s+(?:1st|2nd|first|second)\s+half|hsh|(?:1st|2nd|first|second)\s+half(?!\s+(?:over|under|o|u)\b))\b/i },
    { market: 'dnb', pattern: /\b(?:draw\s+no\s+bet|dnb)\b/i },
    { market: 'corners', pattern: /\b(?:corners?|over\s+9[.\s]*5\s+corners?)\b/i },
    { market: 'basketball-total', pattern: /\b(?:(?:points?|totals?)\s+(?:over|under)|basketball\s+totals?|over\s*\/\s*under\s+points|(?:over|under)\s+\d+(?:\.\d+)?\s+points)\b/i }
  ];

  var MARKET_LABELS = {
    '1x2': '1X2 / moneyline', over15: 'Over 1.5', over25: 'Over 2.5',
    over35: 'Over 3.5', under15: 'Under 1.5', under25: 'Under 2.5',
    btts: 'BTTS', bttsno: 'BTTS No / NG', dc12: 'Double Chance (12)',
    highestscoringhalf: 'Highest scoring half', dnb: 'Draw no bet',
    corners: 'Corners', 'basketball-total': 'Basketball points'
  };

  var LEAGUE_ALIASES = {
    epl: 'premier league', 'english premier league': 'premier league',
    ucl: 'champions league', 'uefa champions league': 'champions league',
    laliga: 'la liga', seriea: 'serie a', ligue1: 'ligue 1',
    'saudi pro': 'saudi pro league', 'turkish super lig': 'turkish super lig'
  };

  var KNOWN_LEAGUES = [
    { name: 'premier league', pattern: /\b(?:epl|premier\s+league)\b/i },
    { name: 'champions league', pattern: /\b(?:ucl|champions\s+league)\b/i },
    { name: 'europa league', pattern: /\beuropa\s+league\b/i },
    { name: 'la liga', pattern: /\bla\s*liga\b/i },
    { name: 'serie a', pattern: /\bserie\s*a\b/i },
    { name: 'bundesliga', pattern: /\bbundesliga\b/i },
    { name: 'ligue 1', pattern: /\bligue\s*1\b/i },
    { name: 'eredivisie', pattern: /\beredivisie\b/i },
    { name: 'primeira liga', pattern: /\bprimeira\s+liga\b/i },
    { name: 'championship', pattern: /\bchampionship\b/i },
    { name: 'mls', pattern: /\bmls\b/i },
    { name: 'liga mx', pattern: /\bliga\s+mx\b/i },
    { name: 'saudi pro league', pattern: /\bsaudi\s+pro\s+league\b/i },
    { name: 'turkish super lig', pattern: /\bturkish\s+super\s+lig\b/i },
    { name: 'nba', pattern: /\bnba\b/i }
  ];

  var COUNT_WORDS = {
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
  };
  var COUNT_TARGET = '(?:winning\\s+|straight\\s+)*(?:basketball|football|soccer|footy|corner|corners?|btts(?:\\s*(?:no|ng))?|gg(?:\\s*(?:no|ng))?|over|under|o[\\s-]*[123][.\\s]*5|u[\\s-]*[123][.\\s]*5|dc|double(?:\\s+chance)?|highest(?:\\s+scoring)?|hsh|1\\s*x\\s*2|moneyline|match(?:es)?|games?|legs?|picks?|selections?|wins?)';
  var COUNT_PATTERN = new RegExp('\\b(?<!\\.)(\\d{1,2})[\\s-]*(?:x[\\s-]*)?(?=' + COUNT_TARGET + '\\b)', 'i');
  var COUNT_X_PATTERN = new RegExp('(?<!\\.)(\\d{1,2})[\\s-]*x[\\s-]*(?=' + COUNT_TARGET + '\\b)', 'i');
  var COUNT_WORD_PATTERN = new RegExp('\\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\\b[\\s-]*(?:x[\\s-]*)?(?=' + COUNT_TARGET + '\\b)', 'i');
  var SPACED_DECIMAL_PATTERN = /\b(over|under|o|u)[\s-]*([123])[\s-]+5\b/gi;
  var TOTAL_MIN_PATTERNS = [
    /\b(?:min(?:imum)?|at\s+least)\s+total\s+odds?\s*(?:of|=|:|at)?\s*(\d+(?:\.\d+)?)\s*x?\b/i
  ];
  var MIN_PATTERNS = [
    /\bmin(?:imum)?\s*(?:leg\s+)?odds?\s*(?:of|=|:|at|>=)?\s*(\d+(?:\.\d+)?)\s*x?\b/i,
    /\bmin(?:imum)?\s*(?:odds?)?\s*[:=]\s*(\d+(?:\.\d+)?)\b/i,
    /\bmin(?:imum)?\s*[:=]?\s*(\d+(?:\.\d+)?)\b(?!\s*(?:legs?|matches?|games?))/i,
    /\b(?:at\s+least|from|above)\s+(\d+(?:\.\d+)?)\s*(?:x\s*)?odds?\b/i,
    /\bodds?\s+(?:from|above)\s+(\d+(?:\.\d+)?)\b/i,
    /\bodds?\s+(?:at\s+least|no\s+less\s+than|greater\s+than|over)\s+(\d+(?:\.\d+)?)\b/i
  ];
  var MAX_PATTERNS = [
    /\bmax(?:imum)?\s*(?:leg\s+)?odds?\s*(?:of|=|:|at|<=)?\s*(\d+(?:\.\d+)?)\s*x?\b/i,
    /\bmax(?:imum)?\s*(?:odds?)?\s*[:=]\s*(\d+(?:\.\d+)?)\b/i,
    /\bmax(?:imum)?\s*[:=]?\s*(\d+(?:\.\d+)?)\b(?!\s*(?:legs?|matches?|games?))/i,
    /\b(?:up\s+to|at\s+most|no\s+more\s+than|under)\s+(\d+(?:\.\d+)?)\s*(?:x\s*)?odds?\b/i,
    /\bodds?\s+(?:at\s+most|no\s+more\s+than|less\s+than|under)\s+(\d+(?:\.\d+)?)\b/i
  ];
  var TARGET_PATTERNS = [
    /\b(?:target|total|aim\s+for|make)\s*(?:odds?)?\s*(?:of|=|:|at|to)?\s*(\d+(?:\.\d+)?)\s*x?\b/i,
    /\b(?:accumulator|parlay|multi(?:plier)?|combined)\s*(?:odds?)?\s*(?:of|=|:|at|to)?\s*(\d+(?:\.\d+)?)\s*x?\b/i,
    /\b(?:aim|reach|hit)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*x?\b/i,
    /\b(\d+(?:\.\d+)?)\s*x\s+odds?\b/i,
    /\b(\d+(?:\.\d+)?)\s+odds?\b/i,
    /\b(\d+(?:\.\d+)?)\s*x\b/i
  ];
  var STOP_AT = /\b(?:with|having|min(?:imum)?|max(?:imum)?|target|total\s+odds|odds?|only|please|give|build|generate|book|over|under|at\s+least|today|tomorrow|matches?|games?|legs?|picks?|selections?)\b/i;

  function blankSpaces(length) {
    var out = '';
    for (var i = 0; i < length; i++) out += ' ';
    return out;
  }

  function removeOnce(text, matched) {
    if (!matched) return text;
    var index = text.indexOf(matched);
    if (index === -1) return text;
    return text.slice(0, index) + blankSpaces(matched.length) + text.slice(index + matched.length);
  }

  function extractFirst(patterns, text) {
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(text);
      if (match) return { value: parseFloat(match[1]), matched: match[0] };
    }
    return null;
  }

  function normaliseKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function clamp(value, min, max, warnings, label) {
    if (value < min) {
      warnings.push(label + ' was raised to ' + min + '.');
      return min;
    }
    if (value > max) {
      warnings.push(label + ' was capped at ' + max + '.');
      return max;
    }
    return value;
  }

  function unique(values) {
    var seen = {};
    var result = [];
    values.forEach(function (value) {
      var key = normaliseKey(value);
      if (!key || seen[key]) return;
      seen[key] = true;
      result.push(value);
    });
    return result;
  }

  function canonicalLeague(value) {
    var key = normaliseKey(value);
    return LEAGUE_ALIASES[key] || String(value || '').trim().replace(/\s+/g, ' ');
  }

  function extractLeagues(text) {
    var found = [];
    var cue = /\b(?:leagues?|competitions?|tournaments?)\s*(?:are|is|of|:|=)?\s*([^.!?]{1,160})/i.exec(text);
    if (cue) {
      var segment = cue[1].split(STOP_AT)[0];
      segment.split(/,|;|\band\b|&|\//i).forEach(function (part) {
        var cleaned = String(part || '').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 60) found.push(canonicalLeague(cleaned));
      });
    }
    KNOWN_LEAGUES.forEach(function (entry) {
      if (entry.pattern.test(text)) found.push(entry.name);
    });
    return unique(found).slice(0, 8);
  }

  function detectSport(text, errors) {
    var excluded = [];
    var working = String(text).replace(/\bno\s+(football|basketball|soccer)\b/i, function (match, word) {
      excluded.push(/soccer/i.test(word) ? 'football' : word.toLowerCase());
      return blankSpaces(match.length);
    });
    var football = /\b(?:football|soccer|footy|epl|premier\s+league)\b/i.test(working);
    var basketball = /\b(?:basketball|nba)\b/i.test(working);
    if (football && basketball) return 'all';
    if (basketball && !football) return 'basketball';
    if (football && !basketball) return 'football';
    if (excluded.length === 1) return excluded[0] === 'basketball' ? 'football' : 'basketball';
    if (/\b(?:all|both|any)\s+sports?\b/i.test(working)) return 'all';
    return null;
  }

  function detectMarkets(text) {
    var markets = [];
    MARKET_PATTERNS.forEach(function (entry) {
      if (entry.pattern.test(text) && markets.indexOf(entry.market) === -1) markets.push(entry.market);
    });
    return markets.slice(0, 8);
  }

  function marketLabel(market) {
    return MARKET_LABELS[market] || market;
  }

  function describe(intent) {
    var parts = [];
    parts.push(intent.sport ? intent.sport.charAt(0).toUpperCase() + intent.sport.slice(1) : 'All sports');
    parts.push(intent.markets.length ? intent.markets.map(marketLabel).join(' + ') : 'All markets');
    if (intent.leagues.length) parts.push(intent.leagues.join(', '));
    if (intent.numLegs !== null) parts.push(intent.numLegs + ' matches');
    if (intent.minOddsPerLeg !== null) parts.push('min ' + intent.minOddsPerLeg.toFixed(2));
    if (intent.maxOddsPerLeg !== null) parts.push('max ' + intent.maxOddsPerLeg.toFixed(2));
    if (intent.targetOdds !== null) parts.push('target ' + intent.targetOdds.toFixed(2) + 'x');
    if (intent.straightWinsOnly) parts.push('straight wins only');
    return parts.join(' | ');
  }

  function suggestedTarget(intent) {
    if (intent.targetOdds !== null) return intent.targetOdds;
    if (intent.numLegs === null) return null;
    var perLeg = intent.minOddsPerLeg;
    if (perLeg === null) {
      var odds = intent.markets.map(function (market) {
        return ({ corners: 1.5, btts: 1.8, bttsno: 1.5, over15: 1.3, over25: 1.6,
          over35: 2, under15: 1.3, under25: 1.35, dnb: 1.5, dc12: 1.35,
          highestscoringhalf: 1.3, '1x2': 1.5, 'basketball-total': 1.25 })[market] || 1.5;
      });
      perLeg = odds.length ? odds.reduce(function (a, b) { return a + b; }, 0) / odds.length : 1.5;
    }
    return Math.round(Math.min(MAX_TARGET_ODDS, Math.max(MIN_TARGET_ODDS, Math.pow(perLeg, intent.numLegs))) * 100) / 100;
  }

  function parseIntent(message) {
    var warnings = [];
    var errors = [];
    var raw = String(message == null ? '' : message).trim();
    var intent = {
      sport: null, markets: [], leagues: [], minOddsPerLeg: null, maxOddsPerLeg: null,
      targetOdds: null, numLegs: null, straightWinsOnly: false, suggestedTargetOdds: null
    };

    if (!raw) {
      return { recognized: false, intent: intent, summary: '', warnings: warnings,
        errors: ['Please describe the games and odds you want.'], help: HELP_TEXT };
    }
    if (raw.length > MAX_MESSAGE_LENGTH) {
      return { recognized: false, intent: intent, summary: '', warnings: warnings,
        errors: ['Please keep your message under ' + MAX_MESSAGE_LENGTH + ' characters.'], help: HELP_TEXT };
    }

    var text = raw.toLowerCase();
    text = text.replace(SPACED_DECIMAL_PATTERN, function (match, prefix, digit) {
      return prefix + digit + '.5';
    });
    text = text.replace(COUNT_WORD_PATTERN, function (match, word) {
      return String(COUNT_WORDS[word.toLowerCase()]);
    });
    text = text.replace(COUNT_X_PATTERN, '$1 ');
    var totalMin = extractFirst(TOTAL_MIN_PATTERNS, text);
    if (totalMin) text = removeOnce(text, totalMin.matched);
    var min = extractFirst(MIN_PATTERNS, text);
    if (min) {
      text = removeOnce(text, min.matched);
      intent.minOddsPerLeg = clamp(min.value, MIN_LEG_ODDS, MAX_LEG_ODDS, warnings, 'Minimum odds');
    }
    var max = extractFirst(MAX_PATTERNS, text);
    if (max) {
      text = removeOnce(text, max.matched);
      intent.maxOddsPerLeg = clamp(max.value, MIN_LEG_ODDS, MAX_LEG_ODDS, warnings, 'Maximum odds');
    }
    var target = totalMin || extractFirst(TARGET_PATTERNS, text);
    if (target) {
      if (!totalMin) text = removeOnce(text, target.matched);
      intent.targetOdds = clamp(target.value, MIN_TARGET_ODDS, MAX_TARGET_ODDS, warnings, 'Target odds');
    }

    var count = COUNT_PATTERN.exec(text);
    if (count) {
      var legs = parseInt(count[1], 10);
      if (legs < 2 || legs > MAX_LEGS) {
        errors.push('Number of matches must be between 2 and ' + MAX_LEGS + '.');
      } else {
        intent.numLegs = legs;
      }
      text = removeOnce(text, count[0]);
    }

    if (intent.minOddsPerLeg !== null && intent.maxOddsPerLeg !== null &&
        intent.maxOddsPerLeg <= intent.minOddsPerLeg) {
      errors.push('Maximum odds per leg must be greater than minimum odds per leg.');
    }
    if (intent.numLegs !== null && intent.minOddsPerLeg !== null &&
        Math.pow(intent.minOddsPerLeg, intent.numLegs) > MAX_TARGET_ODDS) {
      errors.push(intent.numLegs + ' legs at ' + intent.minOddsPerLeg.toFixed(2) +
        ' odds each would exceed the 50x ticket limit. Lower the leg count or the minimum odds.');
    }

    intent.sport = detectSport(text, errors);
    intent.markets = detectMarkets(text);
    intent.leagues = extractLeagues(text);
    var wantsStraightWins = /\b(?:winning|straight\s+wins?|to\s+win|moneyline)\b/i.test(text);
    var nonWinMarketsOnly = intent.markets.length > 0 && intent.markets.every(function (m) { return m !== '1x2'; });
    intent.straightWinsOnly = wantsStraightWins && !nonWinMarketsOnly;
    intent.suggestedTargetOdds = suggestedTarget(intent);

    if (intent.sport === 'football' && intent.markets.indexOf('basketball-total') !== -1) {
      errors.push('Basketball points totals need basketball or all sports.');
    }
    if (intent.sport === 'basketball') {
      var footballOnly = intent.markets.filter(function (m) {
        return ['over15', 'over25', 'over35', 'under15', 'under25', 'btts', 'bttsno',
          'dc12', 'highestscoringhalf', 'dnb', 'corners'].indexOf(m) !== -1;
      });
      if (footballOnly.length) errors.push('Football markets need football or all sports.');
    }

    var recognized = !!(intent.sport || intent.markets.length || intent.leagues.length ||
      intent.minOddsPerLeg !== null || intent.maxOddsPerLeg !== null ||
      intent.targetOdds !== null || intent.numLegs !== null || intent.straightWinsOnly);

    return {
      recognized: recognized,
      intent: intent,
      summary: describe(intent),
      warnings: unique(warnings),
      errors: unique(errors),
      help: HELP_TEXT
    };
  }

  return {
    parseIntent: parseIntent,
    HELP_TEXT: HELP_TEXT,
    MAX_MESSAGE_LENGTH: MAX_MESSAGE_LENGTH,
    MARKET_LABELS: MARKET_LABELS
  };
});
