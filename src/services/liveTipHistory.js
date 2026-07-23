const fs = require('fs');
const path = require('path');
const TIME_ZONE = 'Africa/Lagos';
const tipsByDay = new Map();
const HISTORY_FILE = process.env.LIVE_TIP_HISTORY_FILE || path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || process.cwd(),
  'live-tip-history.json'
);

function dayKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value ? new Date(value) : new Date());
  const values = {};
  parts.forEach(function(part) { values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
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
    // A missing or malformed history file must never prevent live tips loading.
    if (error.code !== 'ENOENT') console.warn('[live-tip-history] Could not load history:', error.message);
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
    console.warn('[live-tip-history] Could not save history:', error.message);
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
  const today = dayKey();
  let changed = false;
  tipsByDay.forEach(function(_, key) {
    if (key !== today) {
      tipsByDay.delete(key);
      changed = true;
    }
  });
  if (changed) saveHistory();
}

function recordTips(opportunities, issuedAt) {
  prune();
  const day = dayKey(issuedAt), tips = tipsByDay.get(day) || new Map();
  (opportunities || []).forEach(function(tip) {
    const id = String(tip.fixtureId) + '|' + String(tip.rule);
    if (tips.has(id)) return;
    const score = String(tip.score || '0 - 0').match(/(\d+)\s*-\s*(\d+)/);
    tips.set(id, { id: id, fixtureId: String(tip.fixtureId), home: tip.home, away: tip.away, league: tip.league, minute: tip.minute, scoreAtTip: { home: score ? Number(score[1]) : 0, away: score ? Number(score[2]) : 0 }, market: tip.market, rule: tip.rule, signalScore: tip.signalScore, issuedAt: issuedAt || new Date().toISOString(), outcome: 'pending', finalScore: null, resolvedAt: null });
  });
  tipsByDay.set(day, tips);
  saveHistory();
}

function settleTips(liveMatches, dailyResults) {
  prune();
  const tips = tipsByDay.get(dayKey());
  if (!tips) return;
  const liveById = new Map((liveMatches || []).map(function(match) { return [String(match.matchId), match]; }));
  tips.forEach(function(tip) {
    if (tip.outcome !== 'pending') return;
    const live = liveById.get(tip.fixtureId), result = dailyResults && dailyResults.get(tip.fixtureId);
    let outcome = live ? resolveNextGoal(tip, live.score, false) : null;
    let score = live && live.score;
    if (!outcome && result && result.finished) {
      score = result.score;
      outcome = resolveNextGoal(tip, score, true) || outcomeForFinal(tip, score) || 'unresolved';
    }
    if (!outcome) return;
    tip.outcome = outcome;
    tip.finalScore = score ? number(score.home) + ' - ' + number(score.away) : null;
    tip.resolvedAt = new Date().toISOString();
    saveHistory();
  });
}

function getTodayTips() {
  prune();
  const tips = tipsByDay.get(dayKey());
  if (!tips) return [];
  const uniqueTips = new Map();
  tips.forEach(function(tip) {
    const key = String(tip.fixtureId) + '|' + String(tip.market || '').toLowerCase();
    const existing = uniqueTips.get(key);
    // Preserve the first published tip for a market, unless a later duplicate
    // is the one that has already been settled.
    if (!existing || (existing.outcome === 'pending' && tip.outcome !== 'pending')) uniqueTips.set(key, tip);
  });
  return Array.from(uniqueTips.values()).sort(function(a, b) { return new Date(b.issuedAt) - new Date(a.issuedAt); });
}

loadHistory();

module.exports = { recordTips, settleTips, getTodayTips };
