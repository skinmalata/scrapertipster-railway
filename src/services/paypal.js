// PayPal integration — mirrors the payment.js (Lemon Squeezy) / whop.js
// interface so providerForPaymentId() can resolve 'paypal' rows the same way.
// One-time Orders v2 checkout: the pricing page creates an order server-side,
// the buyer approves on paypal.com, and payment completion is recorded from a
// PAYMENT.CAPTURE.COMPLETED webhook OR — for accounts that cannot create
// developer webhooks — from a verified IPN posted to the account-level notify
// URL. Requires PAYPAL_CLIENT_ID and PAYPAL_SECRET (PAYPAL_CLIENT_SECRET
// accepted as an alias); PAYPAL_WEBHOOK_ID only when using webhooks.
// PAYPAL_MODE=sandbox for
// test mode. The merchant e-mail receiving the money is whichever PayPal
// account owns the REST app (officialwinfulltime@gmail.com).

var PAYPAL_MODE = process.env.PAYPAL_MODE === 'sandbox' ? 'sandbox' : 'live';
var PAYPAL_API = PAYPAL_MODE === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
var PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
var PAYPAL_SECRET = process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET;
var PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

var PLANS = {
  monthly: { name: 'Pro Monthly', price: '20', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: '100', interval: 'yearly' }
};

var supabase = null;
(function initPaymentDb() {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    try {
      var { createClient } = require('@supabase/supabase-js');
      supabase = createClient(url, key);
    } catch (e) {
      console.warn('[paypal] Supabase init failed:', e.message);
    }
  }
})();

function isConfigured() {
  return !!(PAYPAL_CLIENT_ID && PAYPAL_SECRET);
}

function getAccessToken() {
  if (!isConfigured()) return Promise.reject(new Error('PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_SECRET)'));
  return fetch(PAYPAL_API + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: 'grant_type=client_credentials'
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (!data.access_token) throw new Error(data.error_description || data.error || 'PayPal authentication failed');
    return data.access_token;
  });
}

function createCheckout(_a) {
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl, regToken = _a.regToken;
  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));
  if (!regToken && !userId) return Promise.reject(new Error('Missing user'));
  var plan = PLANS[planType];
  // custom_id (<=255 chars): 'u|<userId>|<plan>' for logged-in upgrades,
  // 'r|<regToken>|<plan>' for paywall-first signups (no account yet).
  var customId = (regToken ? 'r|' + regToken : 'u|' + userId) + '|' + planType;
  return getAccessToken().then(function (token) {
    return fetch(PAYPAL_API + '/v2/checkout/orders', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: plan.price },
          description: 'WinFulltime ' + plan.name,
          custom_id: customId
        }],
        application_context: {
          brand_name: 'WinFulltime',
          user_action: 'PAY_NOW',
          return_url: returnUrl || 'https://winfulltime.com/account.html',
          cancel_url: 'https://winfulltime.com/pricing.html'
        }
      })
    }).then(function (res) { return res.json(); }).then(function (order) {
      if (!order.id || !(order.links || []).length) {
        throw new Error(order.message || (order.details && order.details[0] && order.details[0].description) || 'PayPal order creation failed');
      }
      var approve = null;
      for (var i = 0; i < order.links.length; i++) {
        if (order.links[i].rel === 'approve') approve = order.links[i];
      }
      if (!approve) throw new Error('PayPal approval link missing from order response');
      return { checkoutUrl: approve.href, orderId: order.id, planType: planType, amount: plan.price };
    });
  });
}

function verifyWebhook(_a) {
  var rawBody = _a.rawBody, headers = _a.headers;
  if (!PAYPAL_WEBHOOK_ID) return Promise.resolve(false);
  if (typeof rawBody !== 'string') return Promise.resolve(false);
  if (!headers['paypal-auth-algo'] || !headers['paypal-cert-url'] || !headers['paypal-transmission-id'] ||
      !headers['paypal-transmission-sig'] || !headers['paypal-transmission-time']) return Promise.resolve(false);
  return getAccessToken().then(function (token) {
    return fetch(PAYPAL_API + '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: PAYPAL_WEBHOOK_ID,
        event_body: rawBody
      })
    }).then(function (res) { return res.json(); }).then(function (data) {
      return data.verification_status === 'SUCCESS';
    });
  }).catch(function () { return false; });
}

// IPN verification: post the raw form body back to PayPal with
// cmd=_notify-validate; only the exact string VERIFIED is trusted. No client
// credentials needed — works even when the REST app cannot create webhooks.
function verifyIpn(rawBody) {
  if (typeof rawBody !== 'string' || !rawBody) return Promise.resolve(false);
  var host = PAYPAL_MODE === 'sandbox' ? 'https://ipnpb.sandbox.paypal.com' : 'https://ipnpb.paypal.com';
  var data = 'cmd=_notify-validate&' + rawBody;
  return fetch(host + '/cgi-bin/webscr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: data
  }).then(function (res) { return res.text(); }).then(function (text) {
    return String(text).trim() === 'VERIFIED';
  }).catch(function () { return false; });
}

// Process a verified IPN. Same completion paths as the webhook: regToken →
// create account, userId → record payment. Route-level payment_events dedupe
// keyed on txn_id prevents PayPal's IPN retries from double-processing.
function handleIpn(params) {
  params = params || {};
  if ((params.payment_status || '') !== 'Completed') {
    return Promise.resolve({ handled: false, reason: 'payment_status ' + (params.payment_status || 'missing') });
  }
  if ((params.mc_currency || '') !== 'USD') {
    return Promise.resolve({ handled: false, reason: 'currency ' + (params.mc_currency || 'missing') });
  }
  var txnId = params.txn_id || '';
  if (!txnId) return Promise.resolve({ handled: false, reason: 'missing txn_id' });
  var meta = parseCustomId(params.custom);
  if (!meta) return Promise.resolve({ handled: false, reason: 'no custom_id' });
  var plan = PLANS[meta.planType];
  if (!plan) return Promise.resolve({ handled: false, reason: 'unknown plan ' + meta.planType });
  if (Math.abs(parseFloat(params.mc_gross || '0') - parseFloat(plan.price)) > 0.01) {
    return Promise.resolve({ handled: false, reason: 'amount mismatch ' + params.mc_gross });
  }
  var wantReceiver = process.env.PAYPAL_RECEIVER_EMAIL;
  if (wantReceiver && String(params.receiver_email || '').toLowerCase() !== wantReceiver.toLowerCase()) {
    return Promise.resolve({ handled: false, reason: 'receiver_email mismatch' });
  }
  var email = params.payer_email || '';
  if (meta.regToken) {
    return completeRegistration({
      regToken: meta.regToken,
      email: email,
      planType: meta.planType,
      providerId: txnId,
      expiresAt: computeExpiry(meta.planType),
      amount: plan.price
    });
  }
  return recordPayment(meta.userId, email, meta.planType, txnId, computeExpiry(meta.planType), plan.price);
}

function handleEvent(event) {
  var eventType = event.event_type || '';
  if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
    return Promise.resolve({ handled: false, eventName: eventType });
  }
  return onCaptureCompleted(event.resource || {});
}

function onCaptureCompleted(resource) {
  var captureId = String(resource.id || '');
  if (!captureId) return Promise.resolve({ handled: false, reason: 'Missing capture id' });
  var email = (resource.payer && resource.payer.email_address) || '';
  var amount = (resource.amount && resource.amount.value) || null;
  var orderId = resource.supplementary_data && resource.supplementary_data.related_ids
    ? resource.supplementary_data.related_ids.order_id
    : null;
  return fetchOrderCustom(orderId).then(function (meta) {
    if (!meta) return { handled: false, reason: 'No custom_id on order' };
    var planType = meta.planType;
    var paidAmount = amount || (PLANS[planType] ? PLANS[planType].price : '0');
    if (meta.regToken) {
      return completeRegistration({
        regToken: meta.regToken,
        email: email,
        planType: planType,
        providerId: captureId,
        expiresAt: computeExpiry(planType),
        amount: paidAmount
      });
    }
    if (!meta.userId) return { handled: false, reason: 'No user_id in order custom_id' };
    return recordPayment(meta.userId, email, planType, captureId, computeExpiry(planType), paidAmount);
  });
}

// The capture webhook resource carries the capture id but not the custom_id —
// that lives on the order, so it is fetched back with the order id from
// supplementary_data.related_ids.order_id.
function fetchOrderCustom(orderId) {
  if (!orderId) return Promise.resolve(null);
  return getAccessToken().then(function (token) {
    return fetch(PAYPAL_API + '/v2/checkout/orders/' + encodeURIComponent(orderId), {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
    }).then(function (res) { return res.json(); }).then(function (order) {
      var unit = order.purchase_units && order.purchase_units[0];
      return parseCustomId((unit && unit.custom_id) || '');
    });
  }).catch(function () { return null; });
}

function parseCustomId(raw) {
  var parts = String(raw || '').split('|');
  if (parts[0] === 'r' && parts[1]) return { regToken: parts[1], planType: parts[2] || 'monthly' };
  if (parts[0] === 'u' && parts[1]) return { userId: parts[1], planType: parts[2] || 'monthly' };
  if (parts[0] && parts[1]) return { userId: parts[0], planType: parts[1] || 'monthly' };
  return null;
}

function computeExpiry(planType, fromDate) {
  var d = new Date(fromDate || Date.now());
  if (planType === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (planType === 'lifetime') d.setFullYear(d.getFullYear() + 99);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function recordPayment(userId, email, planType, providerId, expiresAt, amount) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('payments').insert({
    user_id: userId,
    payment_method: 'paypal',
    provider_payment_id: providerId,
    amount: amount,
    currency: 'USD',
    status: 'completed',
    payment_details: { provider: 'paypal', providerId: providerId, planType: planType, email: email }
  }).then(function () {
    return supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: planType,
      payment_id: providerId,
      payment_status: 'active',
      amount: amount,
      currency: 'USD',
      expires_at: expiresAt.toISOString()
    }, { onConflict: 'payment_id' });
  }).then(function () {
    return supabase.rpc('set_vip_status', {
      user_uuid: userId,
      vip_expires: expiresAt.toISOString()
    });
  }).then(function () {
    return { handled: true, reference: providerId, userId: userId, planType: planType, expiresAt: expiresAt };
  });
}

// Paywall-first signup: the order custom_id carried a pending-registration
// token instead of a user id. Create the account now that payment succeeded
// (mirrors whop.completeRegistration, recording payment_method='paypal').
function completeRegistration(_a) {
  var regToken = _a.regToken, email = _a.email, fullName = _a.fullName, planType = _a.planType, providerId = _a.providerId, expiresAt = _a.expiresAt, amount = _a.amount;
  if (!supabase) return Promise.resolve({ handled: false, reason: 'No database' });
  if (!regToken) return Promise.resolve({ handled: false, reason: 'Missing reg_token' });

  return supabase.from('pending_registrations')
    .select('*')
    .eq('reg_token', regToken)
    .single()
    .then(function (regResult) {
      if (regResult.error || !regResult.data) {
        return { handled: false, reason: 'Pending registration not found for token' };
      }
      var reg = regResult.data;
      var regEmail = reg.email || email;
      var regName = reg.full_name || fullName;
      if (!regEmail) return { handled: false, reason: 'Pending registration has no email' };

      return supabase.auth.admin.createUser({
        email: regEmail,
        email_confirm: true,
        user_metadata: { full_name: regName }
      }).then(function (createResult) {
        if (createResult.error) {
          if (createResult.error.message && /already/i.test(createResult.error.message)) {
            return supabase.from('profiles').select('id').eq('email', regEmail).maybeSingle()
              .then(function (profileResult) {
                if (profileResult.error || !profileResult.data) {
                  return { handled: false, reason: 'User exists but profile not found: ' + regEmail };
                }
                return attachRegistration(reg, profileResult.data.id, planType, providerId, expiresAt, amount);
              });
          }
          return { handled: false, reason: 'Account creation failed: ' + createResult.error.message };
        }
        var userId = createResult.data && createResult.data.user && createResult.data.user.id;
        if (!userId) return { handled: false, reason: 'Account created without a user id' };
        return attachRegistration(reg, userId, planType, providerId, expiresAt, amount);
      });
    });
}

function attachRegistration(reg, userId, planType, providerId, expiresAt, amount) {
  var cleanExpiry = expiresAt instanceof Date ? expiresAt : computeExpiry(planType);
  return recordPayment(userId, reg.email, planType, providerId, cleanExpiry, amount)
    .then(function () {
      return supabase.from('pending_registrations')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('reg_token', reg.reg_token)
        .then(function () {
          return { handled: true, registration: true, userId: userId, planType: planType, providerId: providerId };
        });
    })
    .catch(function (err) {
      return { handled: false, reason: 'Payment recording failed: ' + err.message };
    });
}

// PayPal one-time payments have no portal and nothing to cancel — they simply
// expire at the end of the paid period. Kept for interface parity so the
// portal/cancel endpoints resolve 'paypal' payment rows cleanly.
function createCustomerPortal() {
  return Promise.resolve({ error: 'PayPal payments do not auto-renew. Manage the payment from your PayPal account.' });
}

function cancelSubscription() {
  return Promise.resolve({ error: 'This plan was paid with PayPal and does not auto-renew - nothing to cancel.' });
}

module.exports = {
  createCheckout, verifyWebhook, handleEvent,
  createCustomerPortal, cancelSubscription,
  PLANS, isConfigured, PAYPAL_MODE, parseCustomId, verifyIpn, handleIpn
};
