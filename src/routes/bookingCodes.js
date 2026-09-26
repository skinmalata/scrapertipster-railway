'use strict';

const express = require('express');
const router = express.Router();
const { decodeCode, convertCode, splitCode, mergeCodes, createCodeFromLegs, providerStatus, getAvailableMatches, BOOKMAKERS, MAX_LEGS, MAX_CODES } = require('../services/bookingCodes/converter');
const { recordConversion, getRecent } = require('../services/bookingCodes/recentConversions');
const { announceConversion, announceSplit, announceMerge } = require('../services/codeAnnouncer');
const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  INVALID_CODE: 404,
  TOO_MANY_LEGS: 422,
  INVALID_SELECTIONS: 422,
  UNSUPPORTED_MARKET: 422,
  UNRESOLVED_EVENT: 422,
  NO_CODE: 502,
  UPSTREAM_ERROR: 502,
  NETWORK_ERROR: 502
};

function sendError(res, err) {
  const status = STATUS_BY_CODE[err.code] || 500;
  res.status(status).json({ success: false, error: err.message, code: err.code || 'INTERNAL_ERROR' });
}

function normalizeCountry(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 60 || /[\r\n]/.test(raw)) return '';
  return raw.replace(/\s+/g, ' ');
}

// Telegram announcements are fire-and-forget: a failure there must never take
// down the request, and must never surface as an unhandled rejection.
function noop() {}

router.post('/converter/decode', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await decodeCode({ code: body.code, bookmaker: body.bookmaker });
    res.json({
      success: true,
      bookmaker: result.bookmaker,
      bookmakerName: result.bookmakerName,
      code: result.code,
      legCount: result.legCount,
      totalOdds: result.totalOdds,
      legs: result.legs
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/converter/convert', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await convertCode({ code: body.code, from: body.from, to: body.to, keepLegs: body.keepLegs });
    recordConversion(result);
    announceConversion({ ...result, sourceCode: body.code, country: normalizeCountry(body.country) });
    res.json({
      success: true,
      from: result.from,
      fromName: result.fromName,
      to: result.to,
      toName: result.toName,
      code: result.code,
      legCount: result.legCount,
      totalOdds: result.totalOdds
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Accept pre-decoded Bet9ja legs from client-side decode and convert to target.
// Used when Bet9ja's coupon API blocks server requests (Akamai WAF).
router.post('/converter/convert-decoded', async function (req, res) {
  try {
    const { canonicalize, buildLegs, unsupportedMarketError } = require('../services/bookingCodes/matcher');
    const { recordConversion } = require('../services/bookingCodes/recentConversions');
    const body = req.body || {};
    const legs = Array.isArray(body.legs) ? body.legs : [];
    const to = body.to;
    if (!legs.length) throw new Error('No legs provided.');
    if (!BOOKMAKERS.includes(to)) throw new Error('Unknown target bookmaker.');

    const canonicals = [];
    for (const leg of legs) {
      const canonical = await canonicalize('bet9ja', leg);
      if (!canonical) throw unsupportedMarketError(leg);
      canonical.eventName = leg.E_NAME || leg.eventName || '';
      canonical.marketName = leg.M_NAME || leg.marketName || '';
      canonical.outcomeName = leg.SGN || leg.outcomeName || '';
      canonical.odds = Number(leg.V || leg.odds || 0);
      canonicals.push(canonical);
    }

    const targetLegs = await buildLegs(to, canonicals);
    const { createBet9jaCode } = require('../services/bookingCodes/bet9ja');
    const { createSportybetCode, createMsportCode } = require('../services/bookingCodes/sportradar');
    const { createBetwayCode } = require('../services/bookingCodes/betway');
    const { createBetPawaCode } = require('../services/bookingCodes/betpawa');

    let newCode;
    if (to === 'bet9ja') newCode = await createBet9jaCode(targetLegs);
    else if (to === 'msport') newCode = await createMsportCode(targetLegs);
    else if (to === 'betway') newCode = await createBetwayCode(targetLegs);
    else if (to === 'betpawa') newCode = await createBetPawaCode(targetLegs);
    else newCode = await createSportybetCode(targetLegs);

    const totalOdds = canonicals.reduce(function (p, c) { return p * (c.odds || 1); }, 1);
    const result = {
      from: 'bet9ja',
      fromName: 'Bet9ja',
      to: to,
      toName: { sportybet: 'SportyBet', msport: 'MSport', betway: 'Betway', bet9ja: 'Bet9ja', betking: 'BetKing', betpawa: 'betPawa' }[to],
      code: newCode,
      legCount: legs.length,
      totalOdds: Number(totalOdds.toFixed(2))
    };
    recordConversion(result);
    announceConversion({ ...result, sourceCode: body.code, country: normalizeCountry(body.country) });
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

// Split one booking code into several SportyBet codes. Accepts pre-decoded
// Bet9ja legs (from client-side decode) the same way /convert-decoded does.
router.post('/converter/split', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await splitCode({
      code: body.code,
      from: body.from,
      to: body.to,
      perCode: body.perCode,
      legs: body.legs
    });
    announceSplit({
      fromName: result.fromName,
      toName: result.toName,
      totalSelections: result.totalSelections,
      perCode: result.perCode,
      parts: result.parts,
      country: normalizeCountry(body.country)
    }).catch(noop);
    res.json({
      success: true,
      from: result.from,
      fromName: result.fromName,
      to: result.to,
      toName: result.toName,
      sourceCode: result.sourceCode,
      totalSelections: result.totalSelections,
      perCode: result.perCode,
      partCount: result.partCount,
      parts: result.parts
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Merge several booking codes into a single SportyBet code. Codes may come from
// different bookmakers; each entry is { code, bookmaker } or { legs, bookmaker }.
router.post('/converter/merge', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await mergeCodes({ codes: body.codes, to: body.to });
    const fromName = Array.from(new Set(result.sources.map(function (s) { return s.bookmakerName; }))).join(' + ');
    const record = {
      from: fromName,
      fromName: fromName,
      to: result.to,
      toName: result.toName,
      code: result.code,
      legCount: result.legCount,
      totalOdds: result.totalOdds
    };
    recordConversion(record);
    announceMerge({ ...record, sourceCount: result.sourceCount, duplicatesMerged: result.duplicatesMerged, country: normalizeCountry(body.country) }).catch(noop);
    res.json({
      success: true,
      code: result.code,
      to: result.to,
      toName: result.toName,
      legCount: result.legCount,
      totalOdds: result.totalOdds,
      sourceCount: result.sourceCount,
      sources: result.sources,
      duplicatesMerged: result.duplicatesMerged,
      legs: result.legs
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Create a booking code from plain ticket selections (ticket builder feature).
router.post('/converter/create', async function (req, res) {
  try {
    const body = req.body || {};
    const result = await createCodeFromLegs({ bookmaker: body.bookmaker, legs: body.legs });
    res.json({
      success: true,
      bookmaker: result.bookmaker,
      bookmakerName: result.bookmakerName,
      code: result.code,
      legCount: result.legCount
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/converter', function (req, res) {
  res.json({
    success: true,
    bookmakers: BOOKMAKERS,
    maxSelections: MAX_LEGS,
    limits: {
      preMatchOnly: true,
      maxSelections: MAX_LEGS,
      region: 'NG'
    },
    split: { minPerCode: 2, maxPerCode: MAX_LEGS },
    merge: { minCodes: 2, maxCodes: MAX_CODES, maxSelections: MAX_LEGS }
  });
});

router.get('/converter/status', function (req, res) {
  res.json({ success: true, providers: providerStatus() });
});

// Matches currently available for booking code creation (from the live
// SportyBet schedule). Used by the ticket builder to exclude matches that have
// already started or are not offered by the bookmaker.
router.get('/converter/available-matches', async function (req, res) {
  try {
    const matches = await getAvailableMatches();
    res.json({ success: true, generatedAt: new Date().toISOString(), matches: matches });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/converter/recent', function (req, res) {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
  res.json({ success: true, ...getRecent(limit) });
});

router.get('/converter/test-bet9ja', async function (req, res) {
  try {
    const { bet9jaHeaders } = require('../services/bookingCodes/http');
    const axios = require('axios');
    const url = 'https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCoupon?couponCode=TEST&v_cache_version=1.295.4.219';
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: bet9jaHeaders(),
      timeout: 10000,
      validateStatus: () => true
    });
    const duration = Date.now() - startTime;
    res.json({
      success: true,
      bet9jaStatus: response.status,
      duration: duration + 'ms',
      data: response.data,
      headers: {
        contentType: response.headers['content-type'],
        server: response.headers['server']
      }
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      code: err.code,
      timeout: err.code === 'ECONNABORTED'
    });
  }
});

module.exports = router;
