'use strict';

const { sendMessage } = require('./telegramBot');

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function chatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

function normalizeCountry(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 60 || /[\r\n]/.test(raw)) return '';
  return raw.replace(/\s+/g, ' ');
}

async function announceConversion(conv) {
  if (!conv || !conv.code) return undefined;
  const country = normalizeCountry(conv.country);
  if (!country) return undefined;

  const text = [
    '\uD83C\uDFAB CODE CONVERTED SUCCESSFULLY',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '\uD83C\uDF0D A user from ' + country + ' converted this code.',
    '\uD83D\uDCC8 From: ' + (conv.fromName || conv.from || 'Source'),
    '\uD83D\uDCC8 To: ' + (conv.toName || conv.to || 'Target'),
    '\uD83E\uDDFE ' + (Number(conv.legCount) || 0) + ' selections  |  Odds: ' + (conv.totalOdds != null ? conv.totalOdds : '-'),
    '',
    '\uD83D\uDD17 winfulltime.com/converter.html'
  ].join('\n');

  try {
    const result = await sendMessage(token(), chatId(), text);
    if (result && result.ok) {
      console.log('[tg] Announced conversion from ' + country + ' (' + (conv.fromName || conv.from) + ' -> ' + (conv.toName || conv.to) + ')');
    } else {
      console.warn('[tg] Conversion announce not sent:', result && result.description);
    }
    return result;
  } catch (err) {
    console.warn('[tg] Conversion announce failed:', err.message);
    return undefined;
  }
}

module.exports = { announceConversion };
