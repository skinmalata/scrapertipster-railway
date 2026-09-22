// PayPal integration — mirrors the payment.js (Lemon Squeezy) / whop.js
// interface so providerForPaymentId() can resolve 'paypal' rows the same way.
// One-time Orders v2 checkout: the pricing page creates an order server-side,
// the buyer approves on paypal.com, and the PAYMENT.CAPTURE.COMPLETED webhook
// records the payment and grants Pro. Requires PAYPAL_CLIENT_ID / PAYPAL_SECRET
// (plus PAYPAL_WEBHOOK_ID for signature verification); PAYPAL_MODE=sandbox for
// test mode. The merchant e-mail receiving the money is whichever PayPal
// account owns the REST app (officialwinfulltime@gmail.com).

var PAYPAL_MODE = process.env.PAYPAL_MODE === 'sandbox' ? 'sandbox' : 'live';
var PAYPAL_API = PAYPAL_MODE === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
var PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
var PAYPAL_SECRET = process.env.PAYPAL_SECRET;
var PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

var PLANS = {
  monthly: { name: 'Pro Monthly', price: '20', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: '150', interval: 'yearly' }
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
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl;
  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));
  if (!userId) return Promise.reject(new Error('Missing user'));
  var plan = PLANS[planType];
  return getAccessToken().then(function (token) {
    return fetch(PAYPAL_API + '/v2/checkout/orders', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: plan.price },
          description: 'WinFulltime ' + plan.name,
          custom_id: userId + '|' + planType
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
  return fetchOrderCustom(orderId).then(function (custom) {
    if (!custom || !custom.userId) return { handled: false, reason: 'No user_id in order custom_id' };
    var planType = custom.planType;
    var paidAmount = amount || (PLANS[planType] ? PLANS[planType].price : '0');
    return recordPayment(custom.userId, email, planType, captureId, computeExpiry(planType), paidAmount);
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
      var raw = (unit && unit.custom_id) || '';
      var parts = String(raw).split('|');
      if (!parts[0]) return null;
      return { userId: parts[0], planType: parts[1] || 'monthly' };
    });
  }).catch(function () { return null; });
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
  PLANS, isConfigured, PAYPAL_MODE
};
