'use strict';

// Telegram notifications for the converter/code features:
//  - the daily Betway booking code, announced as soon as a new code for today
//    is published (the operator adds the line to data/betway-daily-code.json
//    and deploys, so the server announces on boot);
//  - every successful user code conversion, forwarded to the channel live.
//
// The "already announced" state lives on the same persisted volume as the
// converter feed (env-path override -> /var/data on Render/Railway volume) so
// redeploys with the same code do not spam the channel.
//
// All send/storage failures are swallowed: announcements must never break a
// page render or a convert request.

const fs = require('fs');
const path = require('path');
const { sendMessage } = require('./telegramBot');

const STATE_FILE = process.env.BETWAY_ANNOUNCE_FILE || path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || process.cwd(),
  'betway-code-announced.json'
);

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function chatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

let announced = {};
let loaded = false;

function loadState() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved && typeof saved === 'object') announced = saved;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[tg-betway] Could not load state:', err.message);
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const temp = STATE_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(announced, null, 2));
    fs.renameSync(temp, STATE_FILE);
  } catch (err) {
    if (err.code !== 'EACCES' && err.code !== 'ENOENT') console.warn('[tg-betway] Could not save state:', err.message);
  }
}

// Announce today's Betway booking code once per date+code value. Returns the
// send result when a new message was posted, otherwise resolves silently.
async function announceDailyCode(today) {
  if (!today || !today.code) return undefined;
  loadState();
  if (announced[today.date] === today.code) return undefined;

  const text = [
    '\uD83C\uDF81 BETWAY CODE OF THE DAY',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '\uD83D\uDCC5 ' + today.date,
    '',
    '\uD83C\uDFAF Booking code:',
    '  ' + today.code,
    '',
    '\uD83D\uDD17 Convert it at winfulltime.com/converter.html',
    '18+ only. T&Cs apply. Please gamble responsibly.'
  ].join('\n');

  try {
    const result = await sendMessage(token(), chatId(), text);
    if (result && result.ok) {
      announced[today.date] = today.code;
      saveState();
      console.log('[tg-betway] Announced Betway code for ' + today.date + ' (' + today.code + ')');
    } else {
      console.warn('[tg-betway] Announce of Betway code not sent:', result && result.description);
    }
    return result;
  } catch (err) {
    console.warn('[tg-betway] Announce failed:', err.message);
    return undefined;
  }
}

// Forward a successful conversion to the channel. Fire-and-forget.
async function announceConversion(conv) {
  if (!conv || !conv.code) return undefined;
  const text = [
    '\uD83C\uDFAB CODE CONVERTED SUCCESSFULLY',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    (conv.fromName || 'Source') + ' code: ' + (conv.sourceCode || '?'),
    (conv.toName || 'Target') + ' code: ' + conv.code,
    '\uD83E\uDDFE ' + (Number(conv.legCount) || 0) + ' selections  |  Odds: ' + (conv.totalOdds != null ? conv.totalOdds : '-'),
    '',
    '\uD83D\uDD17 winfulltime.com/converter.html'
  ].join('\n');
  try {
    const result = await sendMessage(token(), chatId(), text);
    if (result && result.ok) {
      console.log('[tg] Announced conversion (' + (conv.fromName || conv.from) + ' -> ' + (conv.toName || conv.to) + ')');
    }
    return result;
  } catch (err) {
    console.warn('[tg] Conversion announce failed:', err.message);
    return undefined;
  }
}

module.exports = { announceDailyCode, announceConversion };