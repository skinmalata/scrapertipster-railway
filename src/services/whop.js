var crypto = require('crypto');
var welcomeEmail = require('./welcomeEmail');
var paymentValidation = require('./paymentValidation');
var adminNotification = require('./adminNotification');

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
  monthly: { name: 'Pro Monthly', price: String(paymentValidation.PLAN_PRICES.monthly), productId: 'prod_nefnMoSf6OLTC', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: String(paymentValidation.PLAN_PRICES.yearly), productId: 'prod_gfimWW2Emb3OA', interval: 'yearly' }
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
    // The first period is charged like every later one. Leaving this at 0
    // let a subscription start without a charge while still granting Pro.
    planBody.initial_price = Number(plan.price);
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
  return paymentValidation.computeExpiry(planType, fromDate);
}

// The product ids a plan may legitimately be sold under: the one the code
// creates checkouts with, plus the dashboard override when it is set.
function acceptableProductIds(planType) {
  var ids = [];
  var plan = PLANS[planType];
  if (plan && plan.productId) ids.push(plan.productId);
  var envId = planType === 'monthly' ? process.env.WHOP_PRODUCT_MONTHLY
    : planType === 'yearly' ? process.env.WHOP_PRODUCT_YEARLY : null;
  if (envId && ids.indexOf(envId) === -1) ids.push(envId);
  return ids;
}

// Whop reports a payment's price under several fields that differ by taxes
// and fees: "total" excludes buyer fees, "settlement_amount" is what the
// customer was charged. The largest reported figure is the closest to what
// was collected, and a buyer can only ever pay less than the plan price,
// never more.
function collectedAmount(data) {
  var fields = [data && data.total, data && data.settlement_amount];
  var candidates = [];
  for (var i = 0; i < fields.length; i++) {
    var parsed = paymentValidation.parseAmount(fields[i]);
    if (parsed !== null) candidates.push(parsed);
  }
  if (!candidates.length) return null;
  return Math.max.apply(null, candidates);
}

// The product Whop charged for decides which plan was bought. The checkout
// metadata is only consulted when Whop did not name the product, so a
// buyer cannot claim a longer plan than the one that was paid for.
function planForProduct(productId) {
  if (!productId) return null;
  for (var planType in PLANS) {
    if (!Object.prototype.hasOwnProperty.call(PLANS, planType)) continue;
    if (acceptableProductIds(planType).indexOf(productId) !== -1) return planType;
  }
  return null;
}

// Whop's derived payment status values that mean the money never reached the
// account: refunded, blocked, only authorised, and so on.
var NOT_COLLECTED = {
  failed: true,
  blocked: true,
  canceled: true,
  refunded: true,
  auto_refunded: true,
  partially_refunded: true,
  uncollectible: true,
  void: true,
  requires_capture: true,
  drafted: true,
  incomplete: true,
  unresolved: true,
  price_too_low: true
};

// A Whop payment grants Pro only when it actually collected money: it has to
// be in a paid state, in USD, for one of our products, and for at least the
// price of the plan.
function validatePayment(data, planType) {
  var status = String((data && data.status) || '').toLowerCase();
  var substatus = String((data && data.substatus) || '').toLowerCase();
  // A known status that is not "paid" is never a collected payment, and a
  // derived status only stands in when the payment carries no status at all.
  if (status) {
    if (status !== 'paid') {
      return { valid: false, reason: 'Payment status "' + status + '" is not a collected payment' };
    }
  } else if (substatus !== 'succeeded') {
    return { valid: false, reason: 'Payment status missing and substatus is "' + substatus + '"' };
  }
  // A payment that was refunded, blocked or only authorised never collected.
  if (NOT_COLLECTED[substatus]) {
    return { valid: false, reason: 'Payment substatus "' + substatus + '" is not a collected payment' };
  }
  var amount = collectedAmount(data);
  if (amount === null) return { valid: false, reason: 'Payment amount missing' };
  return paymentValidation.validatePayment({
    planType: planType,
    amount: amount,
    currency: (data && data.currency) || null
  });
}

// A membership grants Pro only when it is active, for one of our products
// and when the price the member paid covers the plan. Whop reports that
// price as a formatted string ("$20.00") and the recurring price as
// "$20.00 / month".
function validateMembership(data, planType) {
  var status = String((data && data.status) || '').toLowerCase();
  if (!status) return { valid: false, reason: 'Membership status missing' };
  if (status !== 'active') {
    return { valid: false, reason: 'Membership status "' + status + '" is not an active membership' };
  }
  var amount = paymentValidation.parseAmount(data && data.initial_price_paid);
  if (amount === null) amount = paymentValidation.parseAmount(data && data.formatted_renewal_price);
  if (amount === null) return { valid: false, reason: 'Membership price missing' };
  return paymentValidation.validatePayment({
    planType: planType,
    amount: amount,
    currency: (data && data.currency) || null
  });
}

// The end of the paid period as Whop reports it on the membership.
function membershipExpiry(data, planType) {
  var periodEnd = data && data.renewal_period_end;
  if (periodEnd) {
    var fromUnix = new Date(Number(periodEnd) * 1000);
    if (!isNaN(fromUnix.getTime()) && fromUnix.getTime() > Date.now()) return fromUnix;
  }
  var legacy = data && (data.expires_at || data.expires || data.end_at);
  if (legacy) {
    var legacyDate = new Date(legacy);
    if (!isNaN(legacyDate.getTime()) && legacyDate.getTime() > Date.now()) return legacyDate;
  }
  return computeExpiry(planType);
}

function onPaymentSucceeded(data, event) {
  var meta = extractMeta(data, event) || {};
  var userId = meta.user_id;
  var email = meta.email || (data && data.email) || (data && data.member && data.member.email) || '';
  var paymentId = String(data.id || '');
  if (!paymentId) return Promise.resolve({ handled: false, skipped: true, reason: 'Missing payment id' });

  // The plan comes from the product Whop charged for. The checkout metadata
  // is only a fallback for payloads that do not name the product.
  var productId = data && data.product && data.product.id ? String(data.product.id) : '';
  var planType = planForProduct(productId);
  if (productId && !planType) {
    return Promise.resolve({ handled: false, skipped: true, reason: 'Unknown Whop product ' + productId });
  }
  if (!planType) planType = meta.plan_type || 'monthly';

  // Validate before anything is created: an unpaid or short payment must
  // not create an account or send login credentials.
  var check = validatePayment(data, planType);
  if (!check.valid) {
    console.warn('[whop] Payment rejected:', check.reason);
    return Promise.resolve({ handled: false, skipped: true, reason: check.reason });
  }

  // Paywall-first signup: no account exists yet. Create it after payment.
  if (!userId && meta.reg_token) {
    return completeRegistration({
      regToken: meta.reg_token,
      email: email || '',
      fullName: meta.full_name || '',
      planType: planType,
      providerId: paymentId,
      expiresAt: computeExpiry(planType),
      amount: check.amount
    });
  }

  if (!userId) return Promise.resolve({ handled: false, skipped: true, reason: 'Missing user_id or reg_token' });
  return recordPayment(userId, email, planType, paymentId, computeExpiry(planType), check.amount);
}

function onMembershipActivated(data, event) {
  var meta = extractMeta(data, event) || {};
  var userId = meta.user_id || (data && ((data.user && data.user.id) || (data.member && data.member.id) || data.user_id));
  var email = meta.email || (data && ((data.user && data.user.email) || (data.member && data.member.email) || data.email)) || '';
  var membershipId = String(data.id || '');
  if (!membershipId) return Promise.resolve({ handled: false, skipped: true, reason: 'Missing membership id' });

  var productId = data && data.product && data.product.id ? String(data.product.id) : '';
  var planType = planForProduct(productId);
  if (productId && !planType) {
    return Promise.resolve({ handled: false, skipped: true, reason: 'Unknown Whop product ' + productId });
  }
  if (!planType) planType = meta.plan_type || (data && data.plan && data.plan.plan_type) || 'monthly';

  var check = validateMembership(data, planType);
  if (!check.valid) {
    console.warn('[whop] Membership rejected:', check.reason);
    return Promise.resolve({ handled: false, skipped: true, reason: check.reason });
  }

  var expiresAt = membershipExpiry(data, planType);

  // Paywall-first signup: no account exists yet. Create it after payment.
  if (!userId && meta.reg_token) {
    return completeRegistration({
      regToken: meta.reg_token,
      email: email || '',
      fullName: meta.full_name || '',
      planType: planType,
      providerId: membershipId,
      expiresAt: expiresAt,
      amount: check.amount
    });
  }

  if (!userId) return Promise.resolve({ handled: false, skipped: true, reason: 'Missing user_id or reg_token' });
  return recordPayment(userId, email, planType, membershipId, expiresAt, check.amount);
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
      // A generated password is set at creation so the welcome email can
      // include credentials; the buyer can change it from the emailed link.
      var generatedPassword = welcomeEmail.generatePassword();
      return supabase.auth.admin.createUser({
        email: regEmail,
        email_confirm: true,
        password: generatedPassword,
        user_metadata: { full_name: regName }
      }).then(function (createResult) {
        if (createResult.error) {
          // User may already exist from a prior flow; attach the payment to the
          // existing account in that case (no password is set — magic-link only).
          if (createResult.error.message && /already/i.test(createResult.error.message)) {
            return supabase.from('profiles').select('id').eq('email', regEmail).maybeSingle()
              .then(function (profileResult) {
                if (profileResult.error || !profileResult.data) {
                  return { handled: false, reason: 'User exists but profile not found: ' + regEmail };
                }
                return attachRegistration(reg, profileResult.data.id, planType, providerId, expiresAt, amount, null);
              });
          }
          return { handled: false, reason: 'Account creation failed: ' + createResult.error.message };
        }
        var userId = createResult.data && createResult.data.user && createResult.data.user.id;
        if (!userId) return { handled: false, reason: 'Account created without a user id' };
        return attachRegistration(reg, userId, planType, providerId, expiresAt, amount, generatedPassword);
      });
    });
}

function attachRegistration(reg, userId, planType, providerId, expiresAt, amount, password) {
  var regEmail = reg.email;
  var cleanExpiry = expiresAt instanceof Date ? expiresAt : computeExpiry(planType);
  return recordPayment(userId, regEmail, planType, providerId, cleanExpiry, amount, { registration: true })
    .then(function (paymentResult) {
      return supabase.from('pending_registrations')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('reg_token', reg.reg_token)
        .then(function (upd) {
          if (upd.error) {
            // Payment + VIP already granted; a failed status update must not
            // fail the event (the webhook would retry and double-record).
            console.warn('[whop] Failed to mark registration completed:', upd.error.message);
          }
          // Best-effort: email the buyer their login credentials and a
          // set-your-own-password link (magic-link-only when no password).
          return welcomeEmail.sendWelcomeEmail(supabase, {
            email: regEmail,
            password: password,
            logPrefix: '[whop]'
          }).then(function (welcome) {
            return { handled: true, registration: true, userId: userId, planType: planType, providerId: providerId, loginEmailSent: welcome.sent };
          });
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

// A second event for the same purchase (the payment webhook and the
// membership webhook) and a renewal that arrives before the current period
// ends must never shorten an entitlement that is already in place.
function resolveVipExpiry(userId, baseExpiry) {
  if (!supabase || !userId) return Promise.resolve(baseExpiry);
  return supabase.from('subscriptions')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('payment_status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .then(function (res) {
      if (res.error || !res.data || !res.data.length) return baseExpiry;
      return paymentValidation.latestExpiry(baseExpiry, res.data[0].expires_at);
    })
    .catch(function () { return baseExpiry; });
}

// Records the payment, activates the subscription and grants VIP. Rejects on
// any Supabase error so callers (webhook) can fail the event and let the
// provider retry — a silently swallowed error here previously caused paying
// users to never receive Pro.
function recordPayment(userId, email, planType, providerId, expiresAt, amount, opts) {
  if (!supabase) return Promise.reject(new Error('No database'));
  var periodEnd = expiresAt instanceof Date ? expiresAt : computeExpiry(planType);
  var options = opts || {};

  return resolveVipExpiry(userId, periodEnd).then(function (vipExpiry) {
    return supabase.from('payments').insert({
      user_id: userId,
      payment_method: 'whop',
      provider_payment_id: providerId,
      amount: amount,
      currency: 'USD',
      status: 'completed',
      payment_details: { provider: 'whop', providerId: providerId, planType: planType, email: email }
    }).then(function (ins) {
      if (ins.error) throw new Error('payments insert failed: ' + ins.error.message);
      return supabase.from('subscriptions').upsert({
        user_id: userId,
        plan_type: planType,
        payment_id: providerId,
        payment_status: 'active',
        amount: amount,
        currency: 'USD',
        expires_at: periodEnd.toISOString()
      }, { onConflict: 'payment_id' });
    }).then(function (up) {
      if (up.error) throw new Error('subscriptions upsert failed: ' + up.error.message);
      return supabase.rpc('set_vip_status', {
        user_uuid: userId,
        vip_expires: vipExpiry.toISOString()
      });
    }).then(function (rpc) {
      if (rpc.error) throw new Error('set_vip_status failed: ' + rpc.error.message);
      // Tell the owner about the payment. Best-effort: a failed notification
      // must not fail the payment itself.
      return adminNotification.notifyPayment({
        client: supabase,
        provider: 'whop',
        providerPaymentId: providerId,
        planType: planType,
        amount: amount,
        currency: 'USD',
        email: email,
        userId: userId,
        expiresAt: vipExpiry.toISOString(),
        registration: !!options.registration
      }).then(function () {
        return { handled: true, reference: providerId, userId: userId, planType: planType, expiresAt: vipExpiry };
      });
    });
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
