var { createClient } = require('@supabase/supabase-js');

var supabaseUrl = process.env.SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_KEY;
var supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn('[auth-middleware] Supabase init failed:', e.message);
  }
}

var REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY',
  'LEMONSQUEEZY_API_KEY'];

function optionalAuth(req, res, next) {
  if (!supabase) { req.user = null; return next(); }

  var header = String(req.headers.authorization || '');
  var match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) { req.user = null; return next(); }

  supabase.auth.getUser(match[1]).then(function (result) {
    if (result.data && result.data.user) {
      req.user = { id: result.data.user.id, email: result.data.user.email || '' };
    } else {
      req.user = null;
    }
    next();
  }).catch(function () {
    req.user = null;
    next();
  });
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, function () {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    next();
  });
}

function requirePro(req, res, next) {
  requireAuth(req, res, function () {
    if (!supabase) return res.status(503).json({ error: 'Auth service unavailable' });

    supabase.from('profiles')
      .select('vip_status, vip_expires_at')
      .eq('id', req.user.id)
      .single()
      .then(function (result) {
        if (result.error) return res.status(500).json({ error: 'Failed to check membership' });

        var profile = result.data;
        if (!profile || profile.vip_status !== 'vip') {
          return res.status(403).json({ error: 'Pro membership required', code: 'PRO_REQUIRED', isPro: false });
        }

        var expiresAt = new Date(profile.vip_expires_at);
        if (expiresAt <= new Date()) {
          return res.status(403).json({ error: 'Pro membership has expired', code: 'PRO_EXPIRED', isPro: false });
        }

        req.profile = profile;
        req.isPro = true;
        next();
      }).catch(function (err) {
        res.status(500).json({ error: 'Failed to check membership' });
      });
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, function () {
    if (!supabase) return res.status(503).json({ error: 'Auth service unavailable' });

    supabase.from('profiles')
      .select('vip_status')
      .eq('id', req.user.id)
      .single()
      .then(function (result) {
        if (result.error) return res.status(500).json({ error: 'Failed to check admin status' });
        if (!result.data || result.data.vip_status !== 'admin') {
          return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
        }
        next();
      }).catch(function () {
        res.status(500).json({ error: 'Failed to check admin status' });
      });
  });
}

module.exports = { optionalAuth, requireAuth, requirePro, requireAdmin, supabase, REQUIRED_ENV };
