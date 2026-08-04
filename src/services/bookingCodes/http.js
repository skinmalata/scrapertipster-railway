'use strict';

const axios = require('axios');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sportradarHeaders(origin) {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Current-Country': 'NG',
    Origin: origin,
    Referer: origin + '/ng/sport/soccer'
  };
}

function bet9jaHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://coupon.bet9ja.com/',
    Origin: 'https://coupon.bet9ja.com'
  };
}

function bet9jaSportsHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://sports.bet9ja.com/',
    Origin: 'https://sports.bet9ja.com'
  };
}

function betwayHeaders() {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Brand-Id': 'f8a8d16a-d619-4b49-aa8c-f21211403c92',
    'Current-Country': 'NG',
    Origin: 'https://www.betway.com.ng',
    Referer: 'https://www.betway.com.ng/'
  };
}

function wrapUpstreamError(err, label) {
  const status = err && err.response ? err.response.status : null;
  const reason = status
    ? (label + ' returned an error (HTTP ' + status + ').')
    : 'Could not reach ' + label + '.';
  const wrapped = new Error(reason + ' Please try again shortly.');
  wrapped.code = 'NETWORK_ERROR';
  return wrapped;
}

function blockedError(status) {
  const wrapped = new Error(
    status === 429
      ? 'The bookmaker service is rate-limiting requests right now. Please try again shortly.'
      : 'The bookmaker service blocked the request (HTTP ' + status + '). Please try again shortly.'
  );
  wrapped.code = 'NETWORK_ERROR';
  return wrapped;
}

async function getJson(url, headers, timeout) {
  try {
    const res = await axios.get(url, { headers, timeout: timeout || 15000, validateStatus: function () { return true; } });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      throw blockedError(res.status);
    }
    return res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    throw wrapUpstreamError(err, 'the bookmaker service');
  }
}

async function postJson(url, body, headers, timeout) {
  try {
    const res = await axios.post(url, body, { headers, timeout: timeout || 15000, validateStatus: function () { return true; } });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      throw blockedError(res.status);
    }
    return res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    throw wrapUpstreamError(err, 'the bookmaker service');
  }
}

async function postForm(url, formBody, headers, timeout) {
  const params = new URLSearchParams();
  for (const key of Object.keys(formBody)) params.append(key, formBody[key]);
  const fullHeaders = Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, headers);
  try {
    const res = await axios.post(url, params.toString(), { headers: fullHeaders, timeout: timeout || 15000, validateStatus: function () { return true; } });
    if (res.status >= 500 || res.status === 429 || res.status === 403) {
      throw blockedError(res.status);
    }
    return res.data;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR') throw err;
    throw wrapUpstreamError(err, 'the bookmaker service');
  }
}

module.exports = { sportradarHeaders, bet9jaHeaders, bet9jaSportsHeaders, betwayHeaders, getJson, postJson, postForm, BROWSER_UA };
