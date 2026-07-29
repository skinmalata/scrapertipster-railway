var PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
var PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
var PAYSTACK_API = 'https://api.paystack.co';

var crypto = require('crypto');

var PLANS = {
  monthly: { name: 'Pro Monthly', price: '9.99', amountKobo: 999, currency: 'USD', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: '79.99', amountKobo: 7999, currency: 'USD', interval: 'annually' },
  lifetime: { name: 'Lifetime Pro', price: '199.99', amountKobo: 19999, currency: 'USD', interval: null }
};

function paystackHeaders() {
  return {
    'Authorization': 'Bearer ' + PAYSTACK_SECRET_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

function createCheckout(_a) {
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl;

  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));

  var plan = PLANS[planType];

  return fetch(PAYSTACK_API + '/transaction/initialize', {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      email: email,
      amount: plan.amountKobo,
      currency: plan.currency,
      callback_url: returnUrl || 'https://winfulltime.com/account.html',
      metadata: {
        userId: userId,
        planType: planType
      }
    })
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (!data.status) throw new Error(data.message || 'Paystack init failed');
    return {
      checkoutUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
      planType: planType,
      amount: plan.price
    };
  });
}

function verifyWebhook(_a) {
  var rawBody = _a.rawBody, headers = _a.headers;

  var signature = headers['x-paystack-signature'];
  if (!signature) return Promise.resolve(false);

  var hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  return Promise.resolve(hash === signature);
}

function handleEvent(event) {
  var eventType = event.event;

  switch (eventType) {
    case 'charge.success':
      return onChargeSuccess(event.data);
    case 'subscription.create':
    case 'subscription.disable':
      return Promise.resolve({ handled: true, eventType: eventType });
    default:
      return Promise.resolve({ handled: false, eventType: eventType });
  }
}

function onChargeSuccess(data) {
  var metadata = data.metadata || {};
  var userId = metadata.userId;
  var planType = metadata.planType || 'monthly';
  var reference = data.reference;
  var email = data.customer ? data.customer.email : '';

  var now = new Date();
  var expiresAt = new Date(now);
  if (planType === 'monthly') expiresAt.setMonth(expiresAt.getMonth() + 1);
  else if (planType === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setFullYear(expiresAt.getFullYear() + 99);

  return recordPayment(userId, email, planType, reference, expiresAt, data);
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
      console.warn('[payment] Supabase init failed:', e.message);
    }
  }
})();

function recordPayment(userId, email, planType, reference, expiresAt, data) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  var amount = data.amount ? (data.amount / 100).toFixed(2) : PLANS[planType].price;

  return supabase.from('payments').insert({
    user_id: userId,
    payment_method: 'paystack',
    provider_payment_id: reference,
    amount: amount,
    currency: data.currency || 'USD',
    status: 'completed',
    payment_details: { reference: reference, planType: planType, email: email }
  }).then(function () {
    return supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: planType,
      provider_subscription_id: reference,
      payment_status: 'active',
      amount: amount,
      expires_at: expiresAt.toISOString()
    }, { onConflict: 'provider_subscription_id' });
  }).then(function () {
    return supabase.rpc('set_vip_status', {
      user_uuid: userId,
      vip_expires: expiresAt.toISOString()
    });
  }).then(function () {
    return { handled: true, reference: reference, userId: userId, planType: planType, expiresAt: expiresAt };
  });
}

function createCustomerPortal(_a) {
  return Promise.resolve({ url: 'mailto:support@winfulltime.com' });
}

function cancelSubscription(subscriptionId) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('subscriptions')
    .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('provider_subscription_id', subscriptionId)
    .select('user_id')
    .single()
    .then(function (result) {
      if (result.data && result.data.user_id) {
        return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
      }
    });
}

module.exports = {
  createCheckout, verifyWebhook, handleEvent,
  createCustomerPortal, cancelSubscription,
  PLANS, PAYSTACK_PUBLIC_KEY
};
