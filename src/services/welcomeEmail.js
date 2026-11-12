// Welcome-email helper for paywall-created (passwordless) accounts.
// After payment we generate a random password, create the Supabase account
// with it, and email the buyer their credentials plus a one-time
// "set your own password" recovery link. When Resend is configured, deliver
// the generated link directly so account-creation rate limits and Supabase
// email-template settings do not block access. Otherwise use Supabase OTP.
//
// Rate limit: hosted GoTrue counts auth.admin.createUser against the same
// per-email 60s clock as signInWithOtp, so the immediate welcome send after
// account creation usually429s. We therefore retry in the background
// (detached from the caller's promise so the payment webhook responds fast)
// up to 2 times using the delay parsed from GoTrue's error message.

var crypto = require('crypto');
var RESEND_API = 'https://api.resend.com/emails';
var DEFAULT_FROM = 'WinFulltime <payments@winfulltime.com>';

// 56 unambiguous characters (no 0/O/1/l/I). Rejection sampling avoids the
// modulo bias a naive bytes[i] % CHARSET.length would introduce.
var CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length) {
  length = length || 14;
  var out = '';
  var limit = 256 - (256 % CHARSET.length);
  while (out.length < length) {
    var bytes = crypto.randomBytes(length * 2);
    for (var i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < limit) out += CHARSET[bytes[i] % CHARSET.length];
    }
  }
  return out;
}

function rateLimitDelayMs(message) {
  var m = /after (\d+) seconds?/i.exec(message || '');
  return m ? (parseInt(m[1], 10) + 2) * 1000 : null;
}

function attemptOtp(client, email, options, log, attempt) {
  return client.auth.signInWithOtp({ email: email, options: options }).then(function (result) {
    if (result.error) {
      var wait = rateLimitDelayMs(result.error.message);
      if (wait && attempt < 3) {
        return { sent: false, retryAfterMs: wait };
      }
      console.warn(log + ' Welcome email failed for ' + email + ':', result.error.message);
      return { sent: false, retryAfterMs: null };
    }
    console.log(log + ' Welcome email sent to ' + email + ' (attempt ' + attempt + ')');
    return { sent: true, retryAfterMs: null };
  }).catch(function (e) {
    console.warn(log + ' Welcome email failed for ' + email + ':', e.message);
    return { sent: false, retryAfterMs: null };
  });
}

// Detached background retry chain: keeps trying until sent or attempts
// exhausted, without extending the caller's promise (webhook responsiveness).
function scheduleRetries(client, email, options, log, delayMs, attempt) {
  setTimeout(function () {
    attemptOtp(client, email, options, log, attempt).then(function (r) {
      if (!r.sent && r.retryAfterMs) {
        scheduleRetries(client, email, options, log, r.retryAfterMs, attempt + 1);
      }
    });
  }, delayMs);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>\"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch];
  });
}

function sendLoginLinkViaResend(email, link, password, log) {
  var key = process.env.RESEND_API_KEY;
  if (!key || !link) return Promise.resolve({ sent: false });
  var message = password
    ? 'Your Pro account is active. Use this secure link to set your password and sign in.'
    : 'Use this secure, one-time link to sign in to your WinFulltime account.';
  var safeLink = escapeHtml(link);
  return fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.WELCOME_EMAIL_FROM || process.env.ADMIN_NOTIFICATION_FROM || DEFAULT_FROM,
      to: [email],
      subject: password ? 'Your WinFulltime Pro account is ready' : 'Your WinFulltime sign-in link',
      text: message + '\n\n' + link + '\n\nThis link is private and can only be used once.',
      html: '<!doctype html><html><body style="margin:0;padding:32px 16px;background:#0e1117;color:#e8edf5;font-family:Arial,sans-serif">' +
        '<main style="max-width:520px;margin:auto;padding:28px;border-radius:14px;background:#151a2c">' +
        '<h1 style="font-size:22px">WinFulltime Pro</h1><p>' + message + '</p>' +
        '<p><a href="' + safeLink + '" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#ff2448;color:#fff;text-decoration:none;font-weight:bold">' +
        (password ? 'Set password and sign in' : 'Sign in securely') + '</a></p>' +
        '<p style="font-size:12px;color:#aab4c4">This link is private and can only be used once. If you did not make this purchase, contact support.</p>' +
        '</main></body></html>'
    })
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (body) {
      console.warn(log + ' Welcome email provider returned ' + res.status + ':', body.slice(0, 200));
      return { sent: false };
    });
    console.log(log + ' Welcome email sent to ' + email + ' via Resend');
    return { sent: true };
  }).catch(function (e) {
    console.warn(log + ' Welcome email provider failed for ' + email + ':', e.message);
    return { sent: false };
  });
}

// Best-effort: never throws, never fails the payment/registration flow.
// Resolves { sent: Boolean, setUrl: String|null, retryScheduled: Boolean }.
// When retryScheduled is true the first attempt was rate-limited and a
// background retry will deliver the email ~1 minute later.
function sendWelcomeEmail(client, opts) {
  var email = opts && opts.email;
  var password = (opts && opts.password) || null;
  var log = (opts && opts.logPrefix) || '[welcome-email]';
  if (!client || !email) return Promise.resolve({ sent: false, setUrl: null, retryScheduled: false });

  // Generate the set-password (recovery) link first so the magic-link OTP
  // sent second is the freshest token in the rate-limit clock. supabase-js
  // 2.99 nests the GoTrue payload under data.properties; older versions used
  // data.actions[0].link — accept both.
  var useResend = !!process.env.RESEND_API_KEY;
  var setUrlPromise = (password || useResend)
    ? client.auth.admin.generateLink({
        type: password ? 'recovery' : 'magiclink',
        email: email,
        options: { redirectTo: password ? 'https://winfulltime.com/account.html?welcome=1' : 'https://winfulltime.com/account.html?welcome=1' }
      }).then(function (r) {
        if (r.error) throw r.error;
        var data = r.data || {};
        var props = data.properties || {};
        var actions = data.actions || [];
        return props.action_link || (actions[0] && actions[0].link) || null;
      }).catch(function (e) {
        console.warn(log + ' Recovery-link generation failed for ' + email + ':', e.message);
        return null;
      })
    : Promise.resolve(null);

  return setUrlPromise.then(function (setUrl) {
    if (useResend && setUrl) {
      return sendLoginLinkViaResend(email, setUrl, password, log).then(function (result) {
        if (result.sent) return { sent: true, setUrl: setUrl, retryScheduled: false };
        return sendWithSupabaseOtp(client, email, password, setUrl, log);
      });
    }
    return sendWithSupabaseOtp(client, email, password, setUrl, log);
  }).catch(function (e) {
    console.warn(log + ' Welcome email failed for ' + email + ':', e.message);
    return { sent: false, setUrl: null, retryScheduled: false };
  });
}

function sendWithSupabaseOtp(client, email, password, setUrl, log) {
    var options = { shouldCreateUser: false };
    if (password) {
      var data = { password: password };
      if (setUrl) data.set_password_url = setUrl;
      options.data = data;
    }
    return attemptOtp(client, email, options, log, 1).then(function (r) {
      if (r.sent) return { sent: true, setUrl: setUrl, retryScheduled: false };
      if (r.retryAfterMs) {
        console.warn(log + ' Rate-limited for ' + email + '; scheduling background retry in ' + Math.round(r.retryAfterMs / 1000) + 's');
        scheduleRetries(client, email, options, log, r.retryAfterMs, 2);
        return { sent: false, setUrl: setUrl, retryScheduled: true };
      }
      return { sent: false, setUrl: setUrl, retryScheduled: false };
    });
}

module.exports = { generatePassword, sendWelcomeEmail };
