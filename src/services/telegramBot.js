const https = require('https');

const TELEGRAM_API = 'https://api.telegram.org';
const POST_INTERVAL_MS = 90 * 1000;
const MAX_MESSAGE_LENGTH = 4000;

let sentKeys = new Map();
const SENT_KEY_TTL_MS = 6 * 60 * 60 * 1000;

function escapeMarkdown(text) {
  return String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function formatTip(tip) {
  var minute = tip.minute ? tip.minute + "'" : 'Live';
  var score = tip.signalScore ? Math.round(tip.signalScore) : null;
  var signalLine = score ? '📊 Signal: ' + score + '%' : '';
  var lines = [
    '⚽ *' + escapeMarkdown(tip.home) + ' vs ' + escapeMarkdown(tip.away) + '*',
    '🏆 ' + escapeMarkdown(tip.league || ''),
    '⏱ ' + minute + '  |  ' + escapeMarkdown(tip.score || '0 - 0'),
    '',
    '🎯 *' + escapeMarkdown(tip.market) + '*',
    escapeMarkdown(tip.reason || ''),
    signalLine ? '' : '',
    signalLine,
    '🤖 ' + escapeMarkdown(tip.rule || '')
  ];
  return lines.filter(function(l) { return l !== ''; }).join('\n');
}

function formatSummary(tips) {
  var now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  var header = '🔴 *LIVE IN-PLAY ALERT* — ' + now + ' WAT\n';
  header += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  var body = tips.map(function(tip, i) {
    var sep = i < tips.length - 1 ? '\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n' : '';
    return formatTip(tip) + sep;
  }).join('');
  var footer = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n💡 Free tips from winfulltime\\.com | Bet Responsibly';
  return header + body + footer;
}

function httpPost(url, body) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var parsed = new URL(url);
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    var req = https.request(options, function(res) {
      var chunks = '';
      res.on('data', function(c) { chunks += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve({ ok: false, error: chunks }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function tipKey(tip) {
  return tip.fixtureId + '|' + tip.rule;
}

function pruneSentKeys() {
  var now = Date.now();
  sentKeys.forEach(function(timestamp, key) {
    if (now - timestamp > SENT_KEY_TTL_MS) sentKeys.delete(key);
  });
}

async function sendToChannel(botToken, chatId, text) {
  if (text.length > MAX_MESSAGE_LENGTH) {
    var mid = Math.ceil(text.length / 2);
    var splitPoint = text.lastIndexOf('\n━━━', mid);
    if (splitPoint < mid - 500) splitPoint = mid;
    await sendToChannel(botToken, chatId, text.substring(0, splitPoint));
    await sendToChannel(botToken, chatId, text.substring(splitPoint));
    return;
  }
  var url = TELEGRAM_API + '/bot' + botToken + '/sendMessage';
  var result = await httpPost(url, {
    chat_id: chatId,
    text: text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  });
  if (!result.ok) {
    console.warn('[telegram] Send failed:', result.description || result.error || 'unknown');
  }
  return result;
}

async function postNewTips(opportunities, botToken, chatId) {
  if (!botToken || !chatId) return;
  pruneSentKeys();
  var newTips = (opportunities || []).filter(function(tip) {
    var k = tipKey(tip);
    if (sentKeys.has(k)) return false;
    sentKeys.set(k, Date.now());
    return true;
  });
  if (!newTips.length) return;
  var message = formatSummary(newTips);
  await sendToChannel(botToken, chatId, message);
  console.log('[telegram] Posted', newTips.length, 'new tip(s) to channel');
}

function startTelegramBot(getLiveTips, botToken, chatId) {
  if (!botToken || !chatId) {
    console.log('[telegram] Bot not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return;
  }
  console.log('[telegram] Starting alert loop (every 90s) for chat', chatId);
  setInterval(async function() {
    try {
      var tips = getLiveTips();
      if (tips && tips.length) {
        await postNewTips(tips, botToken, chatId);
      }
    } catch (e) {
      console.warn('[telegram] Alert cycle failed:', e.message);
    }
  }, POST_INTERVAL_MS);
}

module.exports = { postNewTips, startTelegramBot };
