const https = require('https');

const TELEGRAM_API = 'https://api.telegram.org';
const POST_INTERVAL_MS = 90 * 1000;
const MAX_MESSAGE_LENGTH = 4000;

let sentKeys = new Map();
const SENT_KEY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SENT_KEYS = 500;

function formatTip(tip) {
  var minute = tip.minute ? tip.minute + "'" : 'Live';
  var score = tip.signalScore ? Math.round(tip.signalScore) : null;
  var lines = [
    '\u26BD ' + tip.home + ' vs ' + tip.away,
    '\uD83C\uDFC6 ' + (tip.league || ''),
    '\u23F1 ' + minute + '  |  ' + (tip.score || '0 - 0'),
    '',
    '\uD83C\uDFAF ' + tip.market,
    tip.reason || '',
    score ? '\uD83D\uDCCA Signal: ' + score + '%' : '',
    '\uD83E\uDD16 ' + (tip.rule || '')
  ];
  return lines.filter(function(l) { return l !== ''; }).join('\n');
}

function formatSummary(tips) {
  var now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  var header = '\uD83D\uDD34 LIVE IN-PLAY ALERT \u2014 ' + now + ' WAT\n';
  header += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';
  var body = tips.map(function(tip, i) {
    var sep = i < tips.length - 1 ? '\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n' : '';
    return formatTip(tip) + sep;
  }).join('');
  var footer = '\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDCA1 Free tips from winfulltime.com | Bet Responsibly';
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
  if (sentKeys.size > MAX_SENT_KEYS) {
    var keys = sentKeys.keys();
    var toDelete = sentKeys.size - MAX_SENT_KEYS;
    for (var i = 0; i < toDelete; i++) {
      var k = keys.next().value;
      if (k !== undefined) sentKeys.delete(k);
    }
  }
}

async function sendToChannel(botToken, chatId, text) {
  if (text.length > MAX_MESSAGE_LENGTH) {
    var mid = Math.ceil(text.length / 2);
    var splitPoint = text.lastIndexOf('\n\u2501', mid);
    if (splitPoint < mid - 500) splitPoint = mid;
    await sendToChannel(botToken, chatId, text.substring(0, splitPoint));
    await sendToChannel(botToken, chatId, text.substring(splitPoint));
    return;
  }
  var url = TELEGRAM_API + '/bot' + botToken + '/sendMessage';
  var result = await httpPost(url, {
    chat_id: chatId,
    text: text,
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
  if (!newTips.length) {
    console.log('[telegram] No new tips to post (all already sent or none available)');
    return;
  }
  var message = formatSummary(newTips);
  var result = await sendToChannel(botToken, chatId, message);
  if (result && result.ok) {
    console.log('[telegram] Posted', newTips.length, 'new tip(s) to channel');
  }
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
      console.log('[telegram] Polling: ' + (tips ? tips.length : 0) + ' live tips available');
      if (tips && tips.length) {
        await postNewTips(tips, botToken, chatId);
      }
    } catch (e) {
      console.warn('[telegram] Alert cycle failed:', e.message);
    }
  }, POST_INTERVAL_MS);
}

module.exports = { postNewTips, startTelegramBot };
