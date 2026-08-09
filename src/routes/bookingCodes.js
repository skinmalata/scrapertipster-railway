'use strict';

const express = require('express');
const router = express.Router();
const { decodeCode, convertCode, createCodeFromLegs, providerStatus, getAvailableMatches, BOOKMAKERS, MAX_LEGS } = require('../services/bookingCodes/converter');
const { recordConversion, getRecent } = require('../services/bookingCodes/recentConversions');
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
    }
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

module.exports = router;
