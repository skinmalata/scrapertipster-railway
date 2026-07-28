var PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
var PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
var PAYPAL_API = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

var PLANS = {
  monthly: { name: 'Pro Monthly', price: '9.99', currency: 'USD', trial: false },
  yearly: { name: 'Pro Yearly', price: '79.99', currency: 'USD', trial: false },
  lifetime: { name: 'Lifetime Pro', price: '199.99', currency: 'USD', trial: false }
};

function getAccessToken() {
  var auth = Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_CLIENT_SECRET).toString('base64');
  return fetch(PAYPAL_API + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  }).then(function (res) { return res.json(); }).then(function (data) {
    if (data.error) throw new Error(data.error_description || 'PayPal auth failed');
    return data.access_token;
  });
}

function createProduct(accessToken) {
  return fetch(PAYPAL_API + '/v1/catalogs/products', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      name: 'WinFulltime Pro Membership',
      description: 'Premium football prediction analytics',
      type: 'SERVICE',
      category: 'SOFTWARE'
    })
  }).then(function (res) { return res.json(); });
}

function createPlan(accessToken, productId, planType) {
  var plan = PLANS[planType];
  if (!plan) throw new Error('Invalid plan type: ' + planType);

  var billingCycles = [];
  if (planType === 'monthly') {
    billingCycles.push({
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: plan.price, currency_code: plan.currency } }
    });
  } else if (planType === 'yearly') {
    billingCycles.push({
      frequency: { interval_unit: 'YEAR', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: plan.price, currency_code: plan.currency } }
    });
  }

  return fetch(PAYPAL_API + '/v1/billing/plans', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      product_id: productId,
      name: plan.name,
      description: 'WinFulltime ' + plan.name,
      status: 'ACTIVE',
      billing_cycles: planType === 'lifetime' ? [] : billingCycles,
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: planType === 'lifetime' ? { value: plan.price, currency_code: plan.currency } : undefined,
        setup_fee_failure_action: 'CANCEL',
        payment_failure_threshold: 3
      }
    })
  }).then(function (res) { return res.json(); });
}

function createCheckout(_a) {
  var userId = _a.userId, email = _a.email, planType = _a.planType, returnUrl = _a.returnUrl;

  if (!PLANS[planType]) return Promise.reject(new Error('Invalid plan type'));

  return getAccessToken().then(function (token) {
    return createProduct(token).then(function (product) {
      var productId = product.id;
      return createPlan(token, productId, planType).then(function (plan) {
        var planId = plan.id;
        var planData = PLANS[planType];
        var startTime = new Date();
        startTime.setMinutes(startTime.getMinutes() + 5);

        if (planType === 'lifetime') {
          return fetch(PAYPAL_API + '/v1/billing/subscriptions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              plan_id: planId,
              start_time: startTime.toISOString(),
              subscriber: { email_address: email, name: { given_name: email } },
              application_context: {
                brand_name: 'WinFulltime',
                locale: 'en-US',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'SUBSCRIBE_NOW',
                return_url: returnUrl || 'https://winfulltime.com/account.html',
                cancel_url: 'https://winfulltime.com/pricing.html'
              }
            })
          }).then(function (res) { return res.json(); }).then(function (sub) {
            var approvalUrl = (sub.links || []).find(function (l) { return l.rel === 'approve'; });
            return {
              checkoutUrl: approvalUrl ? approvalUrl.href : null,
              subscriptionId: sub.id,
              planId: planId,
              planType: planType,
              amount: planData.price
            };
          });
        }

        return fetch(PAYPAL_API + '/v1/billing/subscriptions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            plan_id: planId,
            start_time: startTime.toISOString(),
            subscriber: { email_address: email, name: { given_name: email } },
            application_context: {
              brand_name: 'WinFulltime',
              locale: 'en-US',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'SUBSCRIBE_NOW',
              return_url: returnUrl || 'https://winfulltime.com/account.html',
              cancel_url: 'https://winfulltime.com/pricing.html'
            }
          })
        }).then(function (res) { return res.json(); }).then(function (sub) {
          var approvalUrl = (sub.links || []).find(function (l) { return l.rel === 'approve'; });
          return {
            checkoutUrl: approvalUrl ? approvalUrl.href : null,
            subscriptionId: sub.id,
            planId: planId,
            planType: planType,
            amount: planData.price
          };
        });
      });
    });
  });
}

function verifyWebhook(_a) {
  var rawBody = _a.rawBody, headers = _a.headers;

  return getAccessToken().then(function (token) {
    return fetch(PAYPAL_API + '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: rawBody
      })
    }).then(function (res) { return res.json(); }).then(function (result) {
      return result.verification_status === 'SUCCESS';
    });
  });
}

function handleEvent(event) {
  var eventType = event.event_type;
  var resource = event.resource;

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.UPDATED':
      return onSubscriptionActivated(resource);
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      return onSubscriptionCancelled(resource);
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      return onSubscriptionExpired(resource);
    case 'PAYMENT.SALE.COMPLETED':
      return onSaleCompleted(resource);
    default:
      return Promise.resolve({ handled: false, eventType: eventType });
  }
}

function onSubscriptionActivated(resource) {
  var subscriptionId = resource.id;
  var userId = resource.custom_id;
  var planType = resource.plan && resource.plan.name ? (
    resource.plan.name.toLowerCase().includes('yearly') ? 'yearly'
    : resource.plan.name.toLowerCase().includes('lifetime') ? 'lifetime'
    : 'monthly'
  ) : 'monthly';

  var now = new Date();
  var expiresAt = new Date(now);
  if (planType === 'monthly') expiresAt.setMonth(expiresAt.getMonth() + 1);
  else if (planType === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setFullYear(expiresAt.getFullYear() + 99);

  return updateSubscription(subscriptionId, userId, planType, 'active', expiresAt, resource);
}

function onSubscriptionCancelled(resource) {
  var subscriptionId = resource.id;
  return cancelSubscription(subscriptionId);
}

function onSubscriptionExpired(resource) {
  var subscriptionId = resource.id;
  return expireSubscription(subscriptionId);
}

function onSaleCompleted(resource) {
  var billingAgreementId = resource.billing_agreement_id;
  var amount = resource.amount && resource.amount.total;
  var paymentId = resource.id;

  return Promise.resolve({ handled: true, billingAgreementId: billingAgreementId, amount: amount, paymentId: paymentId });
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

function updateSubscription(subscriptionId, userId, planType, status, expiresAt, resource) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('subscriptions').upsert({
    user_id: userId || 'pending',
    plan_type: planType,
    provider_subscription_id: subscriptionId,
    payment_status: status,
    expires_at: expiresAt.toISOString()
  }, { onConflict: 'provider_subscription_id' }).then(function () {
    if (userId) {
      return supabase.rpc('set_vip_status', {
        user_uuid: userId,
        vip_expires: expiresAt.toISOString()
      });
    }
  });
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

function expireSubscription(subscriptionId) {
  if (!supabase) return Promise.resolve({ error: 'No database' });

  return supabase.from('subscriptions')
    .update({ payment_status: 'expired' })
    .eq('provider_subscription_id', subscriptionId)
    .select('user_id')
    .single()
    .then(function (result) {
      if (result.data && result.data.user_id) {
        return supabase.rpc('revoke_vip_status', { user_uuid: result.data.user_id });
      }
    });
}

function createCustomerPortal(_a) {
  return Promise.resolve({ url: 'https://www.paypal.com/myaccount/autopay/' });
}

module.exports = {
  createCheckout, verifyWebhook, handleEvent,
  createCustomerPortal, cancelSubscription: cancelSubscription,
  PLANS, PAYPAL_CLIENT_ID
};
