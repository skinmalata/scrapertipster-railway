const axios = require('axios');
const cheerio = require('cheerio');

const API_URL = 'https://www.h2hstats.net/wp-content/themes/h2hstats/lib/call.php';
const STREAK_CACHE_TTL = 6 * 60 * 60 * 1000;
// Team-result streaks need a longer sample before they become candidates.
// Other repeated market patterns (goals, BTTS, first-half, corners and cards)
// enter the queue from six consecutive matches.
const RESULT_STREAK_MINIMUM = 8;
const MARKET_STREAK_MINIMUM = 6;

let streakCache = null;
let streakCacheTime = null;

function todayDateStr() {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  var value = {};
  parts.forEach(function(part) { value[part.type] = part.value; });
  return value.year + '-' + value.month + '-' + value.day;
}

function normaliseName(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyStreak(rawText) {
  var t = String(rawText || '').toLowerCase().replace(/\s+/g, ' ').trim();
  var scope = /\bat home\b|\bat this stadium\b/.test(t) ? 'home' : (/\baway\b/.test(t) ? 'away' : 'all');
  if (t.includes('won')) {
    var m = rawText.match(/matches in a row in which\s+(.+?)\s+won/i);
    return { type: 'win', family: 'team-result', scope: scope, team: m ? m[1].replace(/\s+at this stadium$/i, '').trim() : '' };
  }
  if (t.includes('unbeaten') || t.includes('no losses')) {
    var unbeaten = rawText.match(/(?:where|with)\s+(?:the\s+)?(.+?)\s+(?:was\s+)?(?:unbeaten|no losses)/i);
    return { type: 'unbeaten', family: 'team-result', scope: scope, team: unbeaten ? unbeaten[1].trim() : '' };
  }
  if (t.includes('over 1.5') && (t.includes('first half') || t.includes('ht') || t.includes('half'))) {
    return { type: 'ht-over-1.5', family: 'first-half-goals', scope: 'match', team: '' };
  }
  if (t.includes('first half over 1.5') || t.includes('ht over 1.5')) {
    return { type: 'ht-over-1.5', family: 'first-half-goals', scope: 'match', team: '' };
  }
  if (t.includes('over 0.5') && (t.includes('first half') || t.includes('ht') || t.includes('half') || t.includes('goal scored'))) {
    return { type: 'ht-over-0.5', family: 'first-half-goals', scope: 'match', team: '' };
  }
  if (t.includes('goal scored in first half') || t.includes('goal in first half')) {
    return { type: 'ht-over-0.5', family: 'first-half-goals', scope: 'match', team: '' };
  }
  if (t.includes('draw') && !t.includes('unbeaten') && (t.includes('first half') || t.includes('ht') || t.includes('half'))) {
    return { type: 'ht-draw', family: 'first-half-result', scope: 'match', team: '' };
  }
  if (/both teams to score|btts/.test(t)) return { type: t.includes('no') ? 'btts-no' : 'btts-yes', family: 'goals', scope: 'match', team: '' };
  if (/corner/.test(t)) return { type: 'corners', family: 'corners', scope: 'match', team: '' };
  if (/card|booking/.test(t)) return { type: 'cards', family: 'cards', scope: 'match', team: '' };
  if (/over|under|goals?|goal in both halves|even goals|odd goals/.test(t)) return { type: 'goals', family: 'goals', scope: 'match', team: '' };
  return { type: 'other', family: 'other', scope: scope, team: '' };
}

function minimumForStreak(info) {
  return info.type === 'win' || info.type === 'unbeaten'
    ? RESULT_STREAK_MINIMUM
    : MARKET_STREAK_MINIMUM;
}

function parseAllStreaks(html) {
  var $ = cheerio.load(html);
  var results = [];

  $('.match-card').each(function (_, card) {
    var $card = $(card);
    var time = $card.find('.match-time').clone().children().remove().end().text().trim();
    var league = $card.find('.match-league-overview').text().replace('|', '').trim();
    var teams = [];
    $card.find('.match-teams .team').each(function (_, t) {
      teams.push($(t).text().trim());
    });
    if (teams.length < 2) return;

    var streaks = { all: [], win: [], 'ht-over-1.5': [], 'ht-over-0.5': [], 'ht-draw': [] };

    $card.find('.streak-item').each(function (_, item) {
      var $item = $(item);
      var countText = $item.find('.streak-count').text().trim();
      var rawText = $item.find('.streak-text').text().trim();
      var count = parseInt(countText, 10);
      var info = classifyStreak(rawText);
      if (isNaN(count) || count < minimumForStreak(info)) return;
      var record = {
        count: count,
        type: info.type,
        family: info.family,
        scope: info.scope,
        team: info.team,
        normal: normaliseName(info.team),
        text: rawText.replace(/\s+/g, ' ').trim()
      };
      streaks.all.push(record);
      if (streaks[info.type]) streaks[info.type].push(record);
    });

    var hasAny = streaks.all.length > 0;
    if (!hasAny) return;

    results.push({
      time: time,
      league: league,
      match: teams[0] + ' - ' + teams[1],
      home: teams[0],
      away: teams[1],
      homeNormal: normaliseName(teams[0]),
      awayNormal: normaliseName(teams[1]),
      streaks: streaks
    });
  });

  return results;
}

async function fetchTodayStreaks() {
  var today = todayDateStr();
  if (streakCache && streakCacheTime && (Date.now() - streakCacheTime) < STREAK_CACHE_TTL) return streakCache;

  try {
    var params = { show_finished: 0, date: today, category: 'overview', filter: '', gmt: '0', sport: '1' };
    var res = await axios.get(API_URL, { params: params, timeout: 15000 });
    streakCache = parseAllStreaks(res.data);
    streakCacheTime = Date.now();
    var counts = { all: 0, win: 0, 'ht-over-1.5': 0, 'ht-over-0.5': 0, 'ht-draw': 0 };
    streakCache.forEach(function (m) {
      Object.keys(m.streaks).forEach(function (k) { counts[k] += m.streaks[k].length; });
    });
    console.log('[h2h-streaks] Fetched', streakCache.length, 'qualified candidate matches (' + counts.all + ' streaks; 8+ results, 6+ markets; wins:' + counts.win + ' ht-o1.5:' + counts['ht-over-1.5'] + ' ht-o0.5:' + counts['ht-over-0.5'] + ' ht-draw:' + counts['ht-draw'] + ')');
    return streakCache;
  } catch (err) {
    console.warn('[h2h-streaks] Fetch failed:', err.message);
    if (streakCache) return streakCache;
    return [];
  }
}

function findStreakForTeam(teamName, isHome) {
  if (!streakCache || !teamName) return null;
  var normal = normaliseName(teamName);

  for (var i = 0; i < streakCache.length; i++) {
    var entry = streakCache[i];
    var matchNormal = isHome ? entry.homeNormal : entry.awayNormal;
    if (matchNormal !== normal) continue;
    var arr = entry.streaks.win || [];
    for (var j = 0; j < arr.length; j++) {
      if (arr[j].normal === normal) return arr[j];
    }
  }

  for (var i = 0; i < streakCache.length; i++) {
    var arr = streakCache[i].streaks.win || [];
    for (var j = 0; j < arr.length; j++) {
      if (arr[j].normal === normal) return arr[j];
    }
  }

  return null;
}

function findMatchStreak(homeName, awayName, streakType) {
  if (!streakCache || !homeName || !awayName) return null;
  var hNorm = normaliseName(homeName);
  var aNorm = normaliseName(awayName);

  for (var i = 0; i < streakCache.length; i++) {
    var entry = streakCache[i];
    if (entry.homeNormal === hNorm && entry.awayNormal === aNorm) {
      var arr = entry.streaks[streakType] || [];
      if (arr.length > 0) return arr[0];
    }
  }

  for (var i = 0; i < streakCache.length; i++) {
    var entry = streakCache[i];
    if (entry.homeNormal === aNorm && entry.awayNormal === hNorm) {
      var arr = entry.streaks[streakType] || [];
      if (arr.length > 0) return arr[0];
    }
  }

  return null;
}

function findAllStreaksForMatch(homeName, awayName) {
  if (!streakCache || !homeName || !awayName) return [];
  var home = normaliseName(homeName);
  var away = normaliseName(awayName);
  for (var i = 0; i < streakCache.length; i++) {
    var entry = streakCache[i];
    if ((entry.homeNormal === home && entry.awayNormal === away) ||
        (entry.homeNormal === away && entry.awayNormal === home)) {
      return (entry.streaks.all || []).slice();
    }
  }
  return [];
}

function getStreakData() {
  return { matches: streakCache || [], cachedAt: streakCacheTime };
}

module.exports = { fetchTodayStreaks, findStreakForTeam, findMatchStreak, findAllStreaksForMatch, getStreakData, normaliseName, parseAllStreaks, minimumForStreak, RESULT_STREAK_MINIMUM, MARKET_STREAK_MINIMUM };
