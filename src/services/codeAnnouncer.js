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

async function deliver(text, label) {
  try {
    const result = await sendMessage(token(), chatId(), text);
    if (result && result.ok) {
      console.log('[tg] Announced ' + label);
    } else {
      console.warn('[tg] Announcement not sent:', result && result.description);
    }
    return result;
  } catch (err) {
    console.warn('[tg] Announcement failed:', err.message);
    return undefined;
  }
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

  return deliver(text, 'conversion from ' + country + ' (' + (conv.fromName || conv.from) + ' -> ' + (conv.toName || conv.to) + ')');
}

// A split produces several codes, so every one of them is posted back to the
// channel — the split point is the whole point of the tool.
async function announceSplit(conv) {
  if (!conv || !Array.isArray(conv.parts) || !conv.parts.length) return undefined;
  const country = normalizeCountry(conv.country);
  if (!country) return undefined;

  const parts = conv.parts;
  const count = parts.length;
  const lines = parts.map(function (part, i) {
    return (i + 1) + '. ' + part.code + '   (' + part.legCount + ' sel)';
  });

  const text = [
    '\uD83C\uDFAB BOOKING CODE SPLIT',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '\uD83C\uDF0D A user from ' + country + ' split this code.',
    '\uD83D\uDCC8 From: ' + (conv.fromName || 'Source'),
    '\uD83D\uDCC8 To: ' + (conv.toName || 'SportyBet'),
    '\uD83E\uDDFE ' + (Number(conv.totalSelections) || 0) + ' selections \u2192 ' + count +
      ' code' + (count === 1 ? '' : 's') + ' of up to ' + (Number(conv.perCode) || 0) + ' selections',
    '',
    lines.join('\n'),
    '',
    '\uD83D\uDD17 winfulltime.com/code-splitter.html'
  ].join('\n');

  return deliver(text, 'split from ' + country + ' (' + count + ' codes)');
}

// Merged codes collapse several slips into one, so the single new code and what
// went into it are both worth posting.
async function announceMerge(conv) {
  if (!conv || !conv.code) return undefined;
  const country = normalizeCountry(conv.country);
  if (!country) return undefined;

  const text = [
    '\uD83C\uDFAB BOOKING CODES MERGED',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '\uD83C\uDF0D A user from ' + country + ' merged ' + (Number(conv.sourceCount) || 0) + ' codes into one.',
    '\uD83D\uDCC8 From: ' + (conv.fromName || 'Multiple bookmakers'),
    '\uD83D\uDCC8 To: ' + (conv.toName || 'SportyBet'),
    '\uD83E\uDDFE ' + (Number(conv.legCount) || 0) + ' selections  |  Odds: ' + (conv.totalOdds != null ? conv.totalOdds : '-'),
    conv.duplicatesMerged
      ? '\uD83D\uDDD2 Duplicate selections merged: ' + conv.duplicatesMerged
      : '',
    '\u00A0',
    '\uD83D\uDD11 Merged code: ' + conv.code,
    '\u00A0',
    '\uD83D\uDD17 winfulltime.com/code-merger.html'
  ].filter(Boolean).join('\n');

  return deliver(text, 'merge from ' + country + ' (' + (conv.sourceCount || 0) + ' codes)');
}

module.exports = { announceConversion, announceSplit, announceMerge };
