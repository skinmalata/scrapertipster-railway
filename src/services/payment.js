var crypto = require('crypto');

var LS_API = 'https://api.lemonsqueezy.com/v1';
var LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
var LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID || '441411';
var LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

var VARIANT_IDS = {
  monthly: '1960067',
  yearly: '1960068',
  lifetime: '1960073'
};

var PLANS = {
  monthly: { name: 'Pro Monthly', price: '9.99', variantId: '1960067', interval: 'monthly' },
  yearly: { name: 'Pro Yearly', price: '79.99', variantId: '1960068', interval: 'annually' },
  lifetime: { name: 'Lifetime Pro', price: '399.99', variantId: '1960073', interval: null }
};

function lsHeaders() {
  return {
    'Authorization': 'Bearer ' + LS_API_KEY,
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json'
  };
}

function createCheckout(_a) {
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl;

  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));

  var plan = PLANS[planType];

  return fetch(LS_API + '/checkouts', {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: email,
            name: email.split('@')[0],
            custom: {
              user_id: userId,
              plan_type: planType
            }
          },
          product_options: {
            redirect_url: returnUrl || 'https://winfulltime.com/account.html',
            enabled_variants: [Number(plan.variantId)]
          },
          expires_at: new Date(Date.now() + 86400000).toISOString()
        },
        relationships: {
          store: {
            data: { type: 'stores', id: LS_STORE_ID }
          },
          variant: {
            data: { type: 'variants', id: plan.variantId }
          }
        }
      }
    })
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (!data.data || !data.data.attributes) throw new Error(data.errors ? data.errors[0].detail : 'Lemon Squeezy checkout creation failed');
    return {
      checkoutUrl: data.data.attributes.url,
      variantId: plan.variantId,
      planType: planType,
      amount: plan.price
    };
  });
}

function verifyWebhook(_a) {
  try {
    var rawBody = _a.rawBody, headers = _a.headers;

    if (!LS_WEBHOOK_SECRET) return Promise.resolve(false);

    var signature = headers['x-signature'];
    if (!signature) return Promise.resolve(false);

    if (typeof rawBody !== 'string') return Promise.resolve(false);

    var hash = crypto.createHmac('sha256', LS_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
    return Promise.resolve(crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature)));
  } catch (e) {
    return Promise.resolve(false);
  }
}

function handleEvent(event) {
  var eventName = event.meta ? event.meta.event_name : '';
  var data = event.data;
  if (!data) return Promise.resolve({ handled: false, eventName: eventName });

  var attributes = data.attributes;
  var meta = event.meta;

  switch (eventName) {
    case 'order_created':
      return onOrderCreated(attributes, data, meta);
    case 'subscription_created':
      return onSubscriptionCreated(attributes, data, meta);
    case 'subscription_updated':
      return onSubscriptionUpdated(attributes, data, meta);
    case 'subscription_cancelled':
      return onSubscriptionCancelled(attributes, data, meta);
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
      console.warn('[payment] Supabase init failed:', e.message);
    }
  }
})();

function getCustomData(attributes, meta) {
  var custom = {};
  if (attributes.first_order && attributes.first_order.attributes && attributes.first_order.attributes.custom_data) {
    custom = attributes.first_order.attributes.custom_data;
  } else if (attributes.custom_data) {
    custom = attributes.custom_data;
  } else if (meta && meta.custom_data) {
    custom = meta.custom_data;
  }
  return custom;
}

function onOrderCreated(attributes, data, meta) {
  var custom = getCustomData(attributes, meta) || {};
  var userId = custom.user_id;
  var planType = custom.plan_type || 'lifetime';
  var email = attributes.user_email || '';
  var orderId = String(data.id);
  var amount = attributes.total ? (attributes.total / 100).toFixed(2) : PLANS.lifetime.price;

  if (!userId) return Promise.resolve({ handled: false, reason: 'No user_id in custom_data' });

  var now = new Date();
  var expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 99);

  return recordPayment(userId, email, planType, orderId, expiresAt, amount);
}

function onSubscriptionCreated(attributes, data, meta) {
  var custom = getCustomData(attributes, meta) || {};
  var userId = custom.user_id;
  var planType = custom.plan_type || 'monthly';
  var email = attributes.user_email || '';
  var subscriptionId = String(data.id);

  if (!userId) return Promise.resolve({ handled: false, reason: 'No user_id in custom_data' });

  var now = new Date();
  var expiresAt = new Date(now);
  if (planType === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setMonth(expiresAt.getMonth() + 1);

  var amount = attributes.total ? (attributes.total / 100).toFixed(2) : PLANS[planType].price;

  return recordPayment(userId, email, planType, subscriptionId, expiresAt, amount);
}

function onSubscriptionUpdated(attributes, data, meta) {
  var status = attributes.status;
  var subscriptionId = String(data.id);
  if (!supabase) return Promise.resolve({ handled: false });

  if (status === 'active' || status === 'on_trial') {
    var action = supabase.from('subscriptions').update({ payment_status: 'active' }).eq('payment_id', subscriptionId);
    var custom = getCustomData(attributes, meta);
    if (custom.user_id) {
      var now = new Date();
      var expiresAt = new Date(now);
      var planType = custom.plan_type || 'monthly';
      if (planType === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);
      action = action.then(function () {
        return supabase.from('subscriptions').upsert({
          user_id: custom.user_id,
          plan_type: planType,
          payment_id: subscriptionId,
          payment_status: 'active',
          amount: PLANS[planType].price,
          currency: 'USD',
          expires_at: expiresAt.toISOString()
        }, { onConflict: 'payment_id' });
      }).then(function () {
        return supabase.rpc('set_vip_status', { user_uuid: custom.user_id, vip_expires: expiresAt.toISOString() });
      });
    }
    return action.then(function () { return { handled: true, eventName: 'subscription_updated', status: status }; });
  }

  if (status === 'cancelled' || status === 'expired') {
    return supabase.from('subscriptions')
      .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('payment_id', subscriptionId)
      .select('user_id')
      .single()
      .then(function (result) {
        if (result.data && result.data.user_id) {
          return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
        }
      })
      .then(function () { return { handled: true, eventName: 'subscription_updated', status: status }; });
  }

  return Promise.resolve({ handled: true, eventName: 'subscription_updated', status: status });
}

function onSubscriptionCancelled(attributes, data) {
  var subscriptionId = String(data.id);
  if (!supabase) return Promise.resolve({ handled: false });

  return supabase.from('subscriptions')
    .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('payment_id', subscriptionId)
    .select('user_id')
    .single()
    .then(function (result) {
      if (result.data && result.data.user_id) {
        return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
      }
    })
    .then(function () { return { handled: true, eventName: 'subscription_cancelled' }; });
}

function recordPayment(userId, email, planType, providerId, expiresAt, amount) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('payments').insert({
    user_id: userId,
    payment_method: 'lemonsqueezy',
    provider_payment_id: providerId,
    amount: amount,
    currency: 'USD',
    status: 'completed',
    payment_details: { provider: 'lemonsqueezy', providerId: providerId, planType: planType, email: email }
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

function createCustomerPortal(_a) {
  var subscriptionId = _a.subscriptionId;
  if (!subscriptionId) return Promise.resolve({ error: 'No subscription ID' });

  return fetch(LS_API + '/subscriptions/' + subscriptionId, {
    headers: {
      'Authorization': 'Bearer ' + LS_API_KEY,
      'Accept': 'application/vnd.api+json'
    }
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (!data.data || !data.data.attributes || !data.data.attributes.urls) {
      return { error: 'Failed to get portal URL' };
    }
    return { url: data.data.attributes.urls.customer_portal };
  }).catch(function (e) {
    return { error: e.message };
  });
}

function cancelSubscription(subscriptionId) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('subscriptions')
    .update({ payment_status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('payment_id', subscriptionId)
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
  PLANS, VARIANT_IDS, LS_STORE_ID
};