const axios = require('axios');
const cheerio = require('cheerio');

const API_URL = 'https://www.h2hstats.net/wp-content/themes/h2hstats/lib/call.php';
const STREAK_CACHE_TTL = 6 * 60 * 60 * 1000;

let streakCache = null;
let streakCacheTime = null;

function todayDateStr() {
  var d = new Date();
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

function normaliseName(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyStreak(rawText) {
  var t = rawText.toLowerCase();
  if (t.includes('won')) {
    var m = rawText.match(/matches in a row in which\s+(.+?)\s+won/i);
    return { type: 'win', team: m ? m[1].trim() : '' };
  }
  if (t.includes('over 1.5') && (t.includes('first half') || t.includes('ht') || t.includes('half'))) {
    return { type: 'ht-over-1.5', team: '' };
  }
  if (t.includes('first half over 1.5') || t.includes('ht over 1.5')) {
    return { type: 'ht-over-1.5', team: '' };
  }
  if (t.includes('over 0.5') && (t.includes('first half') || t.includes('ht') || t.includes('half') || t.includes('goal scored'))) {
    return { type: 'ht-over-0.5', team: '' };
  }
  if (t.includes('goal scored in first half') || t.includes('goal in first half')) {
    return { type: 'ht-over-0.5', team: '' };
  }
  if (t.includes('draw') && !t.includes('unbeaten')) {
    return { type: 'ht-draw', team: '' };
  }
  return null;
}

function parseAllStreaks(html, minStreak) {
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

    var streaks = { win: [], 'ht-over-1.5': [], 'ht-over-0.5': [], 'ht-draw': [] };

    $card.find('.streak-item').each(function (_, item) {
      var $item = $(item);
      var countText = $item.find('.streak-count').text().trim();
      var rawText = $item.find('.streak-text').text().trim();
      var count = parseInt(countText, 10);
      if (isNaN(count) || count < minStreak) return;

      var info = classifyStreak(rawText);
      if (!info) return;

      streaks[info.type].push({ count: count, team: info.team, normal: normaliseName(info.team) });
    });

    var hasAny = Object.keys(streaks).some(function (k) { return streaks[k].length > 0; });
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
    streakCache = parseAllStreaks(res.data, 5);
    streakCacheTime = Date.now();
    var counts = { win: 0, 'ht-over-1.5': 0, 'ht-over-0.5': 0, 'ht-draw': 0 };
    streakCache.forEach(function (m) {
      Object.keys(m.streaks).forEach(function (k) { counts[k] += m.streaks[k].length; });
    });
    console.log('[h2h-streaks] Fetched', streakCache.length, 'matches (wins:' + counts.win + ' ht-o1.5:' + counts['ht-over-1.5'] + ' ht-o0.5:' + counts['ht-over-0.5'] + ' ht-draw:' + counts['ht-draw'] + ')');
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

function getStreakData() {
  return { matches: streakCache || [], cachedAt: streakCacheTime };
}

module.exports = { fetchTodayStreaks, findStreakForTeam, findMatchStreak, getStreakData, normaliseName, parseAllStreaks };
