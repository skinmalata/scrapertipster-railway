var crypto = require('crypto');

// Parallel Whop integration — mirrors the payment.js (Lemon Squeezy) interface so the
// two providers can be A/B tested before switching over. Nothing here touches the
// live Lemon Squeezy flow; Whop routes are wired separately in api.js.

var WHOP_API = 'https://api.whop.com/api/v1';
var WHOP_API_KEY = process.env.WHOP_API_KEY;
var WHOP_COMPANY_ID = process.env.WHOP_COMPANY_ID;
var WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET;

// Whop plans are created per-checkout (inline plans), so there are no static variant
// IDs. variantId is kept for interface parity with payment.js and filled after checkout.
// Each plan references the product created in the Whop dashboard (WHOP_PRODUCT_* env vars).
var PLANS = {
  monthly: { name: 'Pro Monthly', price: '20', productId: 'prod_nefnMoSf6OLTC', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: '150', productId: 'prod_gfimWW2Emb3OA', interval: 'yearly' }
};

var VARIANT_IDS = {}; // populated at runtime by createCheckout

function whopHeaders() {
  return {
    'Authorization': 'Bearer ' + WHOP_API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

function createCheckout(_a) {
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl, regToken = _a.regToken, fullName = _a.fullName;

  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));
  var plan = PLANS[planType];
  if (!WHOP_COMPANY_ID) return Promise.reject(new Error('WHOP_COMPANY_ID not set'));
  if (!plan.productId) return Promise.reject(new Error('WHOP_PRODUCT_' + planType.toUpperCase() + ' not set for ' + planType));

  var planBody = {
    company_id: WHOP_COMPANY_ID,
    product_id: plan.productId,
    currency: 'usd',
    plan_type: plan.interval ? 'renewal' : 'one_time',
    force_create_new_plan: false
  };
  if (plan.interval) {
    planBody.renewal_price = Number(plan.price);
    planBody.initial_price = 0;
    if (plan.interval === 'monthly') planBody.billing_period = 30;
    if (plan.interval === 'yearly') planBody.billing_period = 365;
  } else {
    planBody.initial_price = Number(plan.price);
  }

  // Registration checkout: there is no account yet, so the custom metadata
  // carries a registration token instead of a user id. The webhook uses it to
  // create the account after payment succeeds (paywall-first signup).
  var metadata = { plan_type: planType, email: email };
  if (regToken) {
    metadata.reg_token = regToken;
    metadata.full_name = fullName || '';
  } else {
    metadata.user_id = userId;
  }

  return fetch(WHOP_API + '/checkout_configurations', {
    method: 'POST',
    headers: whopHeaders(),
    body: JSON.stringify({
      plan: planBody,
      metadata: metadata,
      redirect_url: returnUrl || 'https://winfulltime.com/account.html',
      mode: 'payment'
    })
  }).then(function (res) { return res.json(); }).then(function (data) {
    var config = data && (data.data || data);
    if (!config || !config.id) {
      throw new Error(data && data.error ? JSON.stringify(data.error) : 'Whop checkout creation failed');
    }
    var planId = (config.plan && config.plan.id) || plan.variantId;
    if (planId) VARIANT_IDS[planType] = planId;
    var url = config.purchase_url || config.url || config.checkout_url || config.checkoutUrl || ('https://whop.com/checkout/' + config.id);
    return {
      checkoutUrl: url,
      variantId: planId,
      planType: planType,
      amount: plan.price,
      sessionId: config.id
    };
  });
}

// Standard Webhooks spec (https://github.com/standard-webhooks/standard-webhooks)
// Signed content: "{webhook-id}.{webhook-timestamp}.{raw body}"
// Whop's dashboard secret is a plain-text string; the HMAC key is its raw UTF-8
// bytes (Whop's SDK base64-encodes it before handing it to the verifier).
// Signature header: "v1,<base64-hmac-sha256>" (may contain multiple, space-separated).
function verifyWebhook(_a) {
  try {
    var rawBody = _a.rawBody, headers = _a.headers;
    if (!WHOP_WEBHOOK_SECRET) return Promise.resolve(false);

    var msgId = headers['webhook-id'];
    var timestamp = headers['webhook-timestamp'];
    var signature = String(headers['webhook-signature'] || '');
    if (!msgId || !timestamp || !signature) return Promise.resolve(false);
    if (typeof rawBody !== 'string') return Promise.resolve(false);

    var sigs = signature.split(',');
    if (sigs[0] !== 'v1') return Promise.resolve(false);
    var candidates = sigs.slice(1).join(',').trim().split(/\s+/).filter(Boolean);
    if (!candidates.length) return Promise.resolve(false);

    var signedContent = msgId + '.' + timestamp + '.' + rawBody;
    var secretBytes = Buffer.from(WHOP_WEBHOOK_SECRET, 'utf8');
    var hmac = crypto.createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest('base64');

    var expected = Buffer.from(hmac, 'base64');
    for (var i = 0; i < candidates.length; i++) {
      var a = Buffer.from(candidates[i], 'base64');
      if (a.length === expected.length && crypto.timingSafeEqual(a, expected)) {
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

function handleEvent(event) {
  var eventName = event.type || '';
  var data = event.data || {};
  switch (eventName) {
    case 'payment.succeeded':
      return onPaymentSucceeded(data, event);
    case 'membership.activated':
      return onMembershipActivated(data, event);
    case 'membership.deactivated':
      return onMembershipDeactivated(data, event);
    default:
      return Promise.resolve({ handled: false, eventName: eventName });
  }
}

var supabase = null;
(function initPaymentDb() {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    try {
      var { createClient } = require('@supabase/supabase-js');
      supabase = createClient(url, key);
    } catch (e) {
      console.warn('[whop] Supabase init failed:', e.message);
    }
  }
})();

function extractMeta(data, event) {
  return (data && data.metadata) || (event && event.metadata) || {};
}

function computeExpiry(planType, fromDate) {
  var d = new Date(fromDate || Date.now());
  if (planType === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (planType === 'lifetime') d.setFullYear(d.getFullYear() + 99);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function amountOf(data, planType, fallback) {
  var amt = (data && (data.amount || data.total)) || (data && data.amount_after_fees);
  if (amt != null && isNaN(Number(amt)) === false) return Number(amt).toFixed(2);
  return fallback || (PLANS[planType] ? PLANS[planType].price : null);
}

function onPaymentSucceeded(data, event) {
  var meta = extractMeta(data, event) || {};
  var userId = meta.user_id;
  var planType = meta.plan_type || 'monthly';
  var email = meta.email || (data && data.email) || (data && data.member && data.member.email) || '';
  var paymentId = String(data.id || '');
  if (!paymentId) return Promise.resolve({ handled: false, reason: 'Missing payment id' });

  // Paywall-first signup: no account exists yet. Create it after payment.
  if (!userId && meta.reg_token) {
    return completeRegistration({
      regToken: meta.reg_token,
      email: email || '',
      fullName: meta.full_name || '',
      planType: planType,
      providerId: paymentId,
      expiresAt: computeExpiry(planType),
      amount: amountOf(data, planType)
    });
  }

  if (!userId) return Promise.resolve({ handled: false, reason: 'Missing user_id or reg_token' });
  var amount = amountOf(data, planType);
  return recordPayment(userId, email, planType, paymentId, computeExpiry(planType), amount);
}

function onMembershipActivated(data, event) {
  var meta = extractMeta(data, event) || {};
  var userId = meta.user_id || (data && ((data.user && data.user.id) || (data.member && data.member.id) || data.user_id));
  var planType = meta.plan_type || (data && data.plan && data.plan.plan_type) || 'monthly';
  var email = meta.email || (data && ((data.user && data.user.email) || (data.member && data.member.email) || data.email)) || '';
  var membershipId = String(data.id || '');
  if (!membershipId) return Promise.resolve({ handled: false, reason: 'Missing membership id' });

  // Paywall-first signup: no account exists yet. Create it after payment.
  if (!userId && meta.reg_token) {
    return completeRegistration({
      regToken: meta.reg_token,
      email: email || '',
      fullName: meta.full_name || '',
      planType: planType,
      providerId: membershipId,
      expiresAt: data.expires_at || data.expires || data.end_at ? (new Date(data.expires_at || data.expires || data.end_at)) : computeExpiry(planType),
      amount: amountOf(data, planType)
    });
  }

  if (!userId) return Promise.resolve({ handled: false, reason: 'Missing user_id or reg_token' });
  var expiresAt = data.expires_at || data.expires || data.end_at;
  if (!expiresAt) expiresAt = computeExpiry(planType);
  else expiresAt = new Date(expiresAt);
  var amount = amountOf(data, planType);
  return recordPayment(userId, email, planType, membershipId, expiresAt, amount);
}

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

      // Create the Supabase account (confirmed) now that payment succeeded.
      return supabase.auth.admin.createUser({
        email: regEmail,
        email_confirm: true,
        user_metadata: { full_name: regName }
      }).then(function (createResult) {
        if (createResult.error) {
          // User may already exist from a prior flow; attach the payment to the
          // existing account in that case.
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
  var regEmail = reg.email;
  var cleanExpiry = expiresAt instanceof Date ? expiresAt : computeExpiry(planType);
  return recordPayment(userId, regEmail, planType, providerId, cleanExpiry, amount)
    .then(function (paymentResult) {
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

function onMembershipDeactivated(data, event) {
  var membershipId = String(data.id || '');
  if (!supabase) return Promise.resolve({ handled: false });

  var meta = extractMeta(data, event) || {};
  var planType = meta.plan_type || (data && data.plan && data.plan.plan_type) || 'monthly';

  var action = supabase.from('subscriptions')
    .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('payment_id', membershipId)
    .select('user_id')
    .single();

  if (meta.user_id) {
    action = action.then(function (result) {
      var uid = (result.data && result.data.user_id) || meta.user_id;
      return supabase.rpc('revoke_vip_status', { user_uuid: uid });
    });
  } else {
    action = action.then(function (result) {
      if (result.data && result.data.user_id) {
        return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
      }
    });
  }
  return action.then(function () { return { handled: true, eventName: 'membership.deactivated' }; });
}

function recordPayment(userId, email, planType, providerId, expiresAt, amount) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('payments').insert({
    user_id: userId,
    payment_method: 'whop',
    provider_payment_id: providerId,
    amount: amount,
    currency: 'USD',
    status: 'completed',
    payment_details: { provider: 'whop', providerId: providerId, planType: planType, email: email }
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

// Whop has no white-label customer portal. This returns the member-facing membership
// page on Whop. Replace with the Memberships API (update cancel_at_period_end / cancel)
// if you prefer to build manage/cancel into your own UI.
function createCustomerPortal(_a) {
  var subscriptionId = _a.subscriptionId;
  if (!subscriptionId) return Promise.resolve({ error: 'No subscription ID' });
  return Promise.resolve({ url: 'https://whop.com/memberships/' + subscriptionId });
}

function cancelSubscription(subscriptionId) {
  if (!supabase) return Promise.resolve({ error: 'No database' });
  if (!WHOP_API_KEY || !subscriptionId) return Promise.resolve({ error: 'Missing Whop API key or subscription ID' });

  // Cancel immediately on Whop, then revoke locally.
  return fetch(WHOP_API + '/memberships/' + encodeURIComponent(subscriptionId) + '/cancel', {
    method: 'POST',
    headers: whopHeaders()
  }).catch(function () { return null; }).then(function () {
    return supabase.from('subscriptions')
      .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('payment_id', subscriptionId)
      .select('user_id')
      .single();
  }).then(function (result) {
    if (result && result.data && result.data.user_id) {
      return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
    }
  });
}

module.exports = {
  createCheckout, verifyWebhook, handleEvent,
  createCustomerPortal, cancelSubscription,
  PLANS, VARIANT_IDS
};
