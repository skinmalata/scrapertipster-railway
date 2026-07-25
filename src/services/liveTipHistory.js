const fs = require('fs');
const path = require('path');
const TIME_ZONE = 'Africa/Lagos';
const HISTORY_RETENTION_DAYS = 90;
const tipsByDay = new Map();
const HISTORY_FILE = process.env.LIVE_TIP_HISTORY_FILE || path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || process.cwd(),
  'live-tip-history.json'
);

let supabase = null;
(function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(url, key);
  } catch (_) {}
})();

function dayKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value ? new Date(value) : new Date());
  const values = {};
  parts.forEach(function(part) { values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function dayAgeInDays(day) {
  const then = new Date(day + 'T00:00:00Z').getTime();
  const now = new Date(dayKey() + 'T00:00:00Z').getTime();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function total(score) { return number(score && score.home) + number(score && score.away); }

function loadHistory() {
  try {
    const saved = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    Object.keys(saved || {}).forEach(function(day) {
      const entries = Array.isArray(saved[day]) ? saved[day] : [];
      tipsByDay.set(day, new Map(entries.filter(function(tip) { return tip && tip.id; }).map(function(tip) { return [tip.id, tip]; })));
    });
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[live-tip-history] Could not load history:', error.message);
  }
  loadFromSupabase();
}

async function loadFromSupabase() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('tip_history').select('day, tips');
    if (error) throw error;
    (data || []).forEach(function(row) {
      const entries = Array.isArray(row.tips) ? row.tips : [];
      const existing = tipsByDay.get(row.day) || new Map();
      entries.filter(function(tip) { return tip && tip.id; }).forEach(function(tip) {
        if (!existing.has(tip.id)) existing.set(tip.id, tip);
      });
      tipsByDay.set(row.day, existing);
    });
    console.log('[live-tip-history] Loaded history from Supabase (' + (data || []).length + ' days)');
  } catch (err) {
    console.warn('[live-tip-history] Supabase load failed:', err.message);
  }
}

function saveHistory() {
  try {
    const saved = {};
    tipsByDay.forEach(function(tips, day) { saved[day] = Array.from(tips.values()); });
    const tempFile = HISTORY_FILE + '.tmp';
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(tempFile, JSON.stringify(saved, null, 2));
    fs.renameSync(tempFile, HISTORY_FILE);
  } catch (error) {
    if (error.code !== 'EACCES') console.warn('[live-tip-history] Could not save history:', error.message);
  }
  saveToSupabase();
}

async function saveToSupabase() {
  if (!supabase) return;
  try {
    const rows = [];
    tipsByDay.forEach(function(tips, day) {
      rows.push({ day: day, tips: Array.from(tips.values()) });
    });
    if (rows.length) {
      const { error } = await supabase.from('tip_history').upsert(rows, { onConflict: 'day' });
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[live-tip-history] Supabase save failed:', err.message);
  }
}

function outcomeForFinal(tip, score) {
  const home = number(score && score.home), away = number(score && score.away), market = tip.market || '';
  const over = market.match(/^Over\s+(\d+(?:\.\d+)?)\s+Match Goals$/i);
  if (over) return total(score) > Number(over[1]) ? 'won' : 'lost';
  if (/^BTTS\s*-\s*Yes$/i.test(market)) return home > 0 && away > 0 ? 'won' : 'lost';
  if (/\s+to Win$/i.test(market)) {
    const team = market.replace(/\s+to Win$/i, '');
    if (team === tip.home) return home > away ? 'won' : 'lost';
    if (team === tip.away) return away > home ? 'won' : 'lost';
  }
  return null;
}

function cornerOutcome(tip, corners) {
  const over = String(tip.market || '').match(/^Over\s+(\d+(?:\.\d+)?)\s+Match Corners$/i);
  if (!over || !Number.isFinite(Number(corners))) return null;
  return Number(corners) > Number(over[1]) ? 'won' : null;
}

function isCornerMarket(tip) {
  return /^Over\s+\d+(?:\.\d+)?\s+Match Corners$/i.test(tip.market || '');
}

function resolveNextGoal(tip, score, final) {
  if (!/\s+to Score Next$/i.test(tip.market || '')) return null;
  const homeIncrease = number(score && score.home) - number(tip.scoreAtTip && tip.scoreAtTip.home);
  const awayIncrease = number(score && score.away) - number(tip.scoreAtTip && tip.scoreAtTip.away);
  if (homeIncrease < 0 || awayIncrease < 0) return null;
  if (homeIncrease === 0 && awayIncrease === 0) return final ? 'lost' : null;
  // Both sides scoring between snapshots cannot establish who scored next.
  if (homeIncrease > 0 && awayIncrease > 0) return 'unresolved';
  const scoringTeam = homeIncrease > 0 ? tip.home : tip.away;
  return tip.market.replace(/\s+to Score Next$/i, '') === scoringTeam ? 'won' : 'lost';
}

function prune() {
  let changed = false;
  tipsByDay.forEach(function(_, key) {
    if (!isValidDayKey(key) || dayAgeInDays(key) > HISTORY_RETENTION_DAYS || dayAgeInDays(key) < 0) {
      tipsByDay.delete(key);
      changed = true;
    }
  });
  if (changed) saveHistory();
}

// Keep a rolling record for performance review. Calls to the public methods
// also prune, so this timer is only a safeguard.
const dailyPruneTimer = setInterval(prune, 60 * 1000);
if (typeof dailyPruneTimer.unref === 'function') dailyPruneTimer.unref();

function recordTips(opportunities, issuedAt) {
  prune();
  const day = dayKey(issuedAt), tips = tipsByDay.get(day) || new Map();
  const tippedFixtures = new Set(Array.from(tips.values()).map(function(tip) { return String(tip.fixtureId); }));
  const published = [];
  (opportunities || []).forEach(function(tip) {
    const fixtureId = String(tip.fixtureId);
    const id = String(tip.fixtureId) + '|' + String(tip.rule);
    // One in-play recommendation per fixture per day. The incoming list is
    // already sorted by signal score, so the strongest qualifying tip wins.
    if (tippedFixtures.has(fixtureId) || tips.has(id)) return;
    const score = String(tip.score || '0 - 0').match(/(\d+)\s*-\s*(\d+)/);
    tips.set(id, { id: id, fixtureId: String(tip.fixtureId), home: tip.home, away: tip.away, league: tip.league, minute: tip.minute, scoreAtTip: { home: score ? Number(score[1]) : 0, away: score ? Number(score[2]) : 0 }, cornersAtTip: Number.isFinite(Number(tip.cornerCount)) ? Number(tip.cornerCount) : null, market: tip.market, rule: tip.rule, signalScore: tip.signalScore, issuedAt: issuedAt || new Date().toISOString(), outcome: 'pending', finalScore: null, resolvedAt: null });
    tippedFixtures.add(fixtureId);
    published.push(tip);
  });
  tipsByDay.set(day, tips);
  saveHistory();
  return published;
}

function settleTips(liveMatches, dailyResults) {
  prune();
  const liveById = new Map((liveMatches || []).map(function(match) { return [String(match.matchId), match]; }));
  let changed = false;
  tipsByDay.forEach(function(tips) {
    tips.forEach(function(tip) {
      if (tip.outcome !== 'pending') return;
      const live = liveById.get(tip.fixtureId), result = dailyResults && dailyResults.get(tip.fixtureId);
      let outcome = live ? (resolveNextGoal(tip, live.score, false) || cornerOutcome(tip, live.corners)) : null;
      let score = live && live.score;
      if (!outcome && result && result.finished) {
        score = result.score;
        outcome = resolveNextGoal(tip, score, true)
          || cornerOutcome(tip, result.corners)
          || outcomeForFinal(tip, score);
        if (!outcome && isCornerMarket(tip) && Number.isFinite(Number(result.corners))) outcome = 'lost';
        if (!outcome) outcome = 'unresolved';
      }
      if (!outcome) return;
      tip.outcome = outcome;
      tip.finalScore = score ? number(score.home) + ' - ' + number(score.away) : null;
      tip.resolvedAt = new Date().toISOString();
      changed = true;
    });
  });
  if (changed) saveHistory();
}

function getTipsForDate(date) {
  prune();
  const selectedDate = isValidDayKey(date) ? date : dayKey();
  const tips = tipsByDay.get(selectedDate);
  if (!tips) return [];
  // Each stored rule is a published tip. Do not collapse different rules that
  // happen to recommend the same market for the same fixture.
  return Array.from(tips.values()).sort(function(a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); });
}

function getTodayTips() {
  return getTipsForDate(dayKey());
}

function getSettledTipsForDate(date) {
  return getTipsForDate(date).filter(function(tip) {
    return tip.outcome === 'won' || tip.outcome === 'lost';
  });
}

function getSettledTodayTips() {
  return getSettledTipsForDate(dayKey());
}

function getPendingCornerFixtureIds() {
  prune();
  const tips = tipsByDay.get(dayKey());
  if (!tips) return [];
  return Array.from(new Set(Array.from(tips.values())
    .filter(function(tip) { return tip.outcome === 'pending' && isCornerMarket(tip) && tip.fixtureId; })
    .map(function(tip) { return tip.fixtureId; })));
}

loadHistory();

module.exports = { recordTips, settleTips, getTodayTips, getTipsForDate, getSettledTodayTips, getSettledTipsForDate, getPendingCornerFixtureIds };
