// Notifies the site owner whenever a payment is recorded.
//
// Email transport: the Resend HTTP API, called directly with fetch so no
// extra dependency is needed. RESEND_API_KEY enables it. When no transport is
// available the notification falls back to the Supabase email channel that
// the welcome email already uses, and the server log always carries the
// details so a payment is never silently swallowed.
//
// Recipient: ADMIN_NOTIFICATION_EMAIL when set, otherwise the email address
// of the account flagged as the admin (profiles.vip_status = 'admin').

var RESEND_API = 'https://api.resend.com/emails';
var DEFAULT_FROM = 'WinFulltime Payments <payments@winfulltime.com>';
var SEND_TIMEOUT_MS = 8000;

// Payments are reported once per provider payment id. The same purchase can
// also arrive as a membership event, so a second guard covers a buyer paying
// the same amount for the same plan within a few minutes of each other.
var notified = {};
var NOTIFIED_TTL_MS = 6 * 60 * 60 * 1000;
var WINDOW_TTL_MS = 10 * 60 * 1000;

function pruneNotified() {
  var now = Date.now();
  Object.keys(notified).forEach(function (key) {
    if (now - notified[key].expiry > NOTIFIED_TTL_MS) delete notified[key];
  });
}

function claim(key, ttl) {
  var now = Date.now();
  var existing = notified[key];
  if (existing && now - existing.stamp < ttl) return false;
  notified[key] = { stamp: now, expiry: now + NOTIFIED_TTL_MS };
  return true;
}

function formatAmount(amount, currency) {
  var value = Number(amount);
  if (!isFinite(value)) return String(amount);
  return value.toFixed(2) + ' ' + (currency || 'USD');
}

function formatMessage(details) {
  var lines = [
    'New payment received',
    '',
    'Plan: ' + (details.planType || 'unknown'),
    'Amount: ' + formatAmount(details.amount, details.currency),
    'Provider: ' + (details.provider || 'unknown'),
    'Payment id: ' + (details.providerPaymentId || 'unknown'),
    'Buyer: ' + (details.email || 'unknown'),
    'User id: ' + (details.userId || 'unknown'),
    'Expires: ' + (details.expiresAt || 'unknown')
  ];
  if (details.registration) lines.push('Account: created after payment (paywall signup)');
  return lines.join('\n');
}

function formatHtml(details) {
  var rows = [
    ['Plan', details.planType || 'unknown'],
    ['Amount', formatAmount(details.amount, details.currency)],
    ['Provider', details.provider || 'unknown'],
    ['Payment id', details.providerPaymentId || 'unknown'],
    ['Buyer', details.email || 'unknown'],
    ['User id', details.userId || 'unknown'],
    ['Expires', details.expiresAt || 'unknown']
  ];
  if (details.registration) rows.push(['Account', 'Created after payment (paywall signup)']);

  var body = rows.map(function (row) {
    return '<tr><td style="padding:6px 14px 6px 0;color:rgba(232,237,245,0.6);font-size:13px;white-space:nowrap;">'
      + row[0] + '</td><td style="padding:6px 0;color:#e8edf5;font-size:13px;font-family:monospace;">'
      + String(row[1]).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0e1117;'
    + 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1117;padding:32px 16px;">'
    + '<tr><td align="center"><table role="presentation" width="100%" style="max-width:520px;background:#151a2c;'
    + 'border-radius:16px;border:1px solid rgba(255,255,255,0.08);">'
    + '<tr><td style="padding:24px 28px 8px;"><h1 style="margin:0;font-size:19px;font-weight:700;color:#e8edf5;">'
    + 'New payment received</h1></td></tr>'
    + '<tr><td style="padding:8px 28px 24px;"><table role="presentation" width="100%">' + body + '</table></td></tr>'
    + '<tr><td style="padding:14px 28px 22px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:rgba(232,237,245,0.4);">'
    + 'WinFulltime &mdash; winfulltime.com</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) {
      setTimeout(function () { resolve({ sent: false, reason: 'notification timed out' }); }, ms);
    })
  ]);
}

// Resend HTTP API.
function sendViaResend(to, subject, html) {
  var key = process.env.RESEND_API_KEY;
  if (!key) return Promise.resolve({ sent: false, reason: 'RESEND_API_KEY not set' });
  return fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ADMIN_NOTIFICATION_FROM || DEFAULT_FROM,
      to: [to],
      subject: subject,
      html: html
    })
  }).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) {
        console.warn('[admin-notify] Email failed:', res.status, text.slice(0, 200));
        return { sent: false, reason: 'email provider returned ' + res.status };
      }
      return { sent: true, channel: 'email' };
    });
  }).catch(function (e) {
    console.warn('[admin-notify] Email failed:', e.message);
    return { sent: false, reason: e.message };
  });
}

// Supabase email channel. The magic-link template renders the payment
// details when the data is attached; without the custom template the admin
// still gets an email, just without the figures.
function sendViaSupabase(client, to, details) {
  if (!client) return Promise.resolve({ sent: false, reason: 'no mail transport' });
  return client.auth.signInWithOtp({
    email: to,
    options: {
      shouldCreateUser: false,
      data: { payment_notification: formatMessage(details) }
    }
  }).then(function (result) {
    if (result && result.error) {
      console.warn('[admin-notify] Supabase email failed:', result.error.message);
      return { sent: false, reason: result.error.message };
    }
    return { sent: true, channel: 'supabase-email' };
  }).catch(function (e) {
    console.warn('[admin-notify] Supabase email failed:', e.message);
    return { sent: false, reason: e.message };
  });
}

function resolveAdminEmail(client) {
  if (process.env.ADMIN_NOTIFICATION_EMAIL) {
    return Promise.resolve(process.env.ADMIN_NOTIFICATION_EMAIL);
  }
  if (!client) return Promise.resolve(null);
  return client.from('profiles').select('email').eq('vip_status', 'admin').limit(1).then(function (res) {
    if (res.error || !res.data || !res.data.length) return null;
    return res.data[0].email || null;
  }).catch(function () { return null; });
}

// Notifies the admin about a recorded payment. Never rejects: a failed
// notification must not fail the payment that triggered it.
function notifyPayment(_a) {
  var details = _a || {};
  var client = details.client || null;

  var exactKey = (details.provider || '') + ':' + (details.providerPaymentId || '');
  var windowKey = (details.provider || '') + ':' + (details.userId || '') + ':'
    + (details.planType || '') + ':' + (details.amount || '');
  pruneNotified();
  if (!claim(exactKey, NOTIFIED_TTL_MS) || !claim(windowKey, WINDOW_TTL_MS)) {
    return Promise.resolve({ sent: false, reason: 'already notified' });
  }

  var subject = 'WinFulltime payment: ' + formatAmount(details.amount, details.currency)
    + ' (' + (details.planType || 'unknown') + ')';
  var html = formatHtml(details);

  console.log('[admin-notify] Payment recorded:', formatMessage(details).replace(/\n/g, ' | '));

  return withTimeout(resolveAdminEmail(client).then(function (to) {
    if (!to) {
      console.warn('[admin-notify] No admin address known; set ADMIN_NOTIFICATION_EMAIL');
      return { sent: false, reason: 'no admin address' };
    }
    return sendViaResend(to, subject, html).then(function (res) {
      if (res.sent) {
        console.log('[admin-notify] Payment email sent to', to);
        return res;
      }
      return sendViaSupabase(client, to, details).then(function (fallback) {
        if (fallback.sent) console.log('[admin-notify] Payment email sent to', to, 'via Supabase');
        return fallback;
      });
    });
  }), SEND_TIMEOUT_MS).catch(function (e) {
    console.warn('[admin-notify] Failed:', e.message);
    return { sent: false, reason: e.message };
  });
}

module.exports = { notifyPayment };
