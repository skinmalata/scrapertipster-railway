const https = require('https');

const POLL_INTERVAL_MS = 90 * 1000;
const MAX_STATUS_LENGTH = 500;

let sentKeys = new Map();
const SENT_KEY_TTL_MS = 6 * 60 * 60 * 1000;

function formatTip(tip) {
  var minute = tip.minute ? tip.minute + "'" : 'Live';
  var score = tip.signalScore ? Math.round(tip.signalScore) : null;
  var lines = [
    '\u26BD ' + tip.home + ' vs ' + tip.away,
    '\uD83C\uDFC6 ' + (tip.league || ''),
    '\u23F1 ' + minute + '  |  ' + (tip.score || '0 - 0'),
    '\uD83C\uDFAF ' + tip.market,
    tip.reason || '',
    score ? '\uD83D\uDCCA Signal: ' + score + '%' : ''
  ];
  return lines.filter(function(l) { return l !== ''; }).join('\n');
}

function formatSummary(tips) {
  var now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  var header = '\uD83D\uDD34 LIVE IN-PLAY \u2014 ' + now + ' WAT\n';
  var body = tips.map(function(tip) { return formatTip(tip); }).join('\n\n');
  var footer = '\n\n\uD83D\uDCA1 winfulltime.com | Bet Responsibly\n#FootballPredictions #LiveTips #InPlay';
  return header + '\n' + body + footer;
}

function truncateStatus(status) {
  if (status.length > MAX_STATUS_LENGTH) {
    return status.substring(0, MAX_STATUS_LENGTH - 3) + '...';
  }
  return status;
}

function httpPost(url, body, headers) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var parsed = new URL(url);
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {})
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

async function postToMastodon(status, idempotencyKey, instanceUrl, accessToken) {
  var url = instanceUrl.replace(/\/+$/, '') + '/api/v1/statuses';
  var result = await httpPost(url, { status: status, visibility: 'public' }, {
    'Authorization': 'Bearer ' + accessToken,
    'Idempotency-Key': idempotencyKey
  });
  return result;
}

async function postNewTips(opportunities, instanceUrl, accessToken) {
  if (!accessToken || !instanceUrl) return;
  pruneSentKeys();
  var newTips = (opportunities || []).filter(function(tip) {
    var k = tipKey(tip);
    if (sentKeys.has(k)) return false;
    sentKeys.set(k, Date.now());
    return true;
  });
  if (!newTips.length) {
    console.log('[mastodon] No new tips to post (all already sent or none available)');
    return;
  }
  var status = truncateStatus(formatSummary(newTips));
  var key = 'wft-inplay-' + Date.now();
  console.log('[mastodon] Posting (' + status.length + ' chars):');
  try {
    var result = await postToMastodon(status, key, instanceUrl, accessToken);
    if (result && (result.url || result.uri)) {
      console.log('[mastodon] Posted! URL: ' + (result.url || result.uri));
    } else if (result && result.id) {
      console.log('[mastodon] Posted! ID: ' + result.id);
    } else {
      console.warn('[mastodon] Unexpected response:', JSON.stringify(result).substring(0, 200));
    }
  } catch (err) {
    console.warn('[mastodon] Post failed:', err.message || JSON.stringify(err));
  }
}

function startMastodonBot(getLiveTips, instanceUrl, accessToken) {
  if (!accessToken || !instanceUrl) {
    console.log('[mastodon] Bot not configured (missing MASTODON_ACCESS_TOKEN or MASTODON_INSTANCE_URL)');
    return;
  }
  console.log('[mastodon] Starting alert loop (every 90s) for', instanceUrl);
  setInterval(async function() {
    try {
      var tips = getLiveTips();
      console.log('[mastodon] Polling: ' + (tips ? tips.length : 0) + ' live tips available');
      if (tips && tips.length) {
        await postNewTips(tips, instanceUrl, accessToken);
      }
    } catch (e) {
      console.warn('[mastodon] Alert cycle failed:', e.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { postNewTips, startMastodonBot };
