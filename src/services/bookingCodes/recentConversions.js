'use strict';

// Rolling record of successful code conversions for the "Converted today"
// social-proof feed on the converter page. Mirrors the live-tip-history disk
// pattern (env-path override -> /var/data on Render) so the feed survives
// redeploys. Only the from/to pair, selection count, odds and timestamp are
// stored — never the booking code itself — so no visitor slip is exposed.
//
// All storage failures are swallowed: conversion logging must never block or
// fail a successful convert request.

const fs = require('fs');
const path = require('path');

const RECENT_FILE = process.env.CONVERTER_RECENT_FILE || path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RENDER_DISK_PATH || process.cwd(),
  'converter-recent.json'
);
const TIME_ZONE = 'Africa/Lagos';
const RETENTION_HOURS = 48;
const MAX_ENTRIES = 100;

let entries = [];
let writeQueue = Promise.resolve();

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
    if (Array.isArray(saved)) {
      entries = saved.filter(e => e && e.createdAt);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[converter-recent] Could not load:', err.message);
  }
}

function dayKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(value ? new Date(value) : new Date());
  const values = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
}

function save() {
  writeQueue = writeQueue.then(() => new Promise(resolve => {
    try {
      const temp = RECENT_FILE + '.tmp';
      fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true });
      fs.writeFileSync(temp, JSON.stringify(entries, null, 2));
      fs.renameSync(temp, RECENT_FILE);
    } catch (err) {
      if (err.code !== 'EACCES' && err.code !== 'ENOENT') console.warn('[converter-recent] Could not save:', err.message);
    }
    resolve();
  }));
}

function prune() {
  const cutoff = Date.now() - RETENTION_HOURS * 3600 * 1000;
  const before = entries.length;
  entries = entries.filter(e => new Date(e.createdAt).getTime() >= cutoff);
  return entries.length !== before;
}

function recordConversion(result) {
  if (!result || (!result.from && !result.to)) return;
  const oddsValue = result.totalOdds;
  const hasOdds = oddsValue !== null && oddsValue !== undefined && oddsValue !== '';
  entries.unshift({
    from: result.from,
    to: result.to,
    fromName: result.fromName,
    toName: result.toName,
    legCount: Number(result.legCount) || 0,
    totalOdds: hasOdds && Number.isFinite(Number(oddsValue)) ? Number(oddsValue) : null,
    createdAt: new Date().toISOString()
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  prune();
  save();
}

function getRecent(limit) {
  prune();
  const today = dayKey();
  const todayEntries = entries.filter(e => dayKey(e.createdAt) === today);
  const count = todayEntries.length;
  const list = todayEntries.slice(0, limit || 25);
  return { date: today, count: count, entries: list };
}

load();

module.exports = { recordConversion, getRecent };
