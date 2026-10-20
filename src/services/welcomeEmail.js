// Welcome-email helper for paywall-created (passwordless) accounts.
// After payment we generate a random password, create the Supabase account
// with it, and email the buyer their credentials plus a one-time
// "set your own password" recovery link. The email is a normal Supabase
// magic-link send with options.data attached; the Magic Link template in
// Supabase Dashboard -> Authentication -> Email Templates must render
// {{ .Data.password }} / {{ .Data.set_password_url }} conditionally
// (see docs/supabase-welcome-email-template.html). Without the custom
// template the email still works - it just contains only the magic link.
//
// Rate limit: hosted GoTrue counts auth.admin.createUser against the same
// per-email 60s clock as signInWithOtp, so the immediate welcome send after
// account creation usually429s. We therefore retry in the background
// (detached from the caller's promise so the payment webhook responds fast)
// up to 2 times using the delay parsed from GoTrue's error message.

var crypto = require('crypto');

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
  var setUrlPromise = password
    ? client.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: { redirectTo: 'https://winfulltime.com/reset-password.html' }
      }).then(function (r) {
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
  }).catch(function (e) {
    console.warn(log + ' Welcome email failed for ' + email + ':', e.message);
    return { sent: false, setUrl: null, retryScheduled: false };
  });
}

module.exports = { generatePassword, sendWelcomeEmail };
