(function () {
  window.WFT = window.WFT || {};

  var SESSION_KEY = 'wft-session';
  var userState = { user: null, session: null, loading: true };

  function updateUI(user) {
    var loginLinks = document.querySelectorAll('.wft-auth-login');
    var accountLinks = document.querySelectorAll('.wft-auth-account');
    var logoutBtns = document.querySelectorAll('.wft-auth-logout');
    var upgradeBtns = document.querySelectorAll('.wft-auth-upgrade');
    var loadingEls = document.querySelectorAll('.wft-auth-loading');

    loadingEls.forEach(function (el) { el.style.display = 'none'; });

    if (user) {
      loginLinks.forEach(function (el) { el.style.display = 'none'; });
      accountLinks.forEach(function (el) { el.style.display = ''; });
      logoutBtns.forEach(function (el) { el.style.display = ''; });
      upgradeBtns.forEach(function (el) {
        if (user.isPro) { el.style.display = 'none'; }
        else { el.style.display = ''; }
      });
    } else {
      loginLinks.forEach(function (el) { el.style.display = ''; });
      accountLinks.forEach(function (el) { el.style.display = 'none'; });
      logoutBtns.forEach(function (el) { el.style.display = 'none'; });
      upgradeBtns.forEach(function (el) { el.style.display = ''; });
    }
  }

  var _proFetchScheduledFor = null;
  var _lastProFetchUserId = null;
  var _lastProFetchAt = 0;
  var proStatusResolved = false;
  var API_TIMEOUT_MS = 12000;
  var PROFILE_TIMEOUT_MS = 8000;

  function fetchWithTimeout(url, opts, timeoutMs) {
    opts = opts || {};
    if (opts.signal || typeof AbortController === 'undefined') return fetch(url, opts);
    var controller = new AbortController();
    var requestOpts = {};
    for (var key in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, key)) requestOpts[key] = opts[key];
    }
    requestOpts.signal = controller.signal;
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || API_TIMEOUT_MS);
    function clear() { clearTimeout(timer); }
    return fetch(url, requestOpts).then(function (res) { clear(); return res; }, function (err) { clear(); throw err; });
  }

  function onAuthChange(event, session) {
    if (session) {
      var user = session.user;
      console.log('[auth] onAuthChange event:', event);
      userState.user = {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
      };
      userState.session = session;
      userState.loading = false;
      // Show account/logout immediately; the Pro badge fills in when the
      // membership check below finishes.
      updateUI(userState.user);
      scheduleProFetch();
    } else {
      _proFetchScheduledFor = null;
      _lastProFetchUserId = null;
      proStatusResolved = false;
      userState.user = null;
      userState.session = null;
      userState.loading = false;
      updateUI(null);
    }
  }

  function scheduleProFetch() {
    var user = userState.user;
    var session = userState.session;
    if (!user) return;
    if (_proFetchScheduledFor === user.id) return;
    if (_lastProFetchUserId === user.id && Date.now() - _lastProFetchAt < 2000) return;
    _proFetchScheduledFor = user && user.id;

    function isCurrent() {
      return !!(user && userState.user && userState.user.id === user.id);
    }

    function finish() {
      if (!isCurrent()) return;
      proStatusResolved = true;
      console.log('[scheduleProFetch] Dispatching wft-pro-status, isPro:', userState.user.isPro);
      document.dispatchEvent(new CustomEvent('wft-pro-status'));
      if (_proFetchScheduledFor === user.id) {
        _proFetchScheduledFor = null;
        _lastProFetchUserId = user.id;
        _lastProFetchAt = Date.now();
      }
    }

    var tok = session && session.access_token;
    if (!tok || !user) {
      console.log('[scheduleProFetch] No token');
      if (user) {
        user.isPro = false;
        user.isAdmin = false;
        updateUI(user);
      }
      finish();
      return;
    }

    var SUPABASE_URL = 'https://xogkqpjtxfemcxzsuwke.supabase.co';
    var ANON_KEY = 'sb_publishable_VydS1cmw7_OhFa7e-xUOqQ_tcVRUQoy';
    var headers = { 'Authorization': 'Bearer ' + tok, 'apikey': ANON_KEY };

    function verifyWithBackendFallback() {
      // This endpoint reads the same profile tier. Keep it as an error fallback,
      // but don't hold the UI on a possibly sleeping Render instance.
      fetchWithTimeout(window.WFT_API + '/api/me/subscription', {
        headers: { 'Authorization': 'Bearer ' + tok }
      }, PROFILE_TIMEOUT_MS).then(function(r) {
        if (!r.ok) throw new Error('Subscription check failed: ' + r.status);
        return r.json();
      }).then(function(d) {
        if (!isCurrent() || !d) return;
        userState.user.isPro = d.isPro === true;
        userState.user.isAdmin = d.isAdmin === true;
        if (d.expiresAt) userState.user.expiresAt = d.expiresAt;
        if (d.plan) userState.user.plan = d.plan;
        updateUI(userState.user);
        finish();
      }).catch(function(e) {
        console.warn('[scheduleProFetch] Backend fallback failed:', e);
      });
    }

    console.log('[scheduleProFetch] Fetching profile for', user.id);
    fetchWithTimeout(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + user.id + '&select=vip_status,vip_expires_at', {
      headers: headers
    }, PROFILE_TIMEOUT_MS).then(function(r) {
      if (!r.ok) throw new Error('Profile fetch failed: ' + r.status);
      return r.json();
    }).then(function(rows) {
      console.log('[scheduleProFetch] Profile result:', JSON.stringify(rows));
      if (!isCurrent()) return;
      if (rows && rows[0]) {
        var p = rows[0];
        var isAdmin = p.vip_status === 'admin';
        var isVip = p.vip_status === 'vip' && (!p.vip_expires_at || new Date(p.vip_expires_at) > new Date());
        userState.user.isPro = isAdmin || isVip;
        userState.user.isAdmin = isAdmin;
        userState.user.expiresAt = p.vip_expires_at || null;
        console.log('[scheduleProFetch] isVip:', isVip, 'isAdmin:', isAdmin);
        updateUI(userState.user);
        // This profile result confirms the tier; plan details can load separately.
        finish();
        if (isVip) {
          fetchWithTimeout(SUPABASE_URL + '/rest/v1/subscriptions?user_id=eq.' + userState.user.id + '&select=plan_type&order=created_at.desc&limit=1', {
            headers: headers
          }, PROFILE_TIMEOUT_MS).then(function(r2) {
            if (!r2.ok) return;
            return r2.json();
          }).then(function(subs) {
            if (subs && subs[0]) {
              userState.user.plan = subs[0].plan_type;
              console.log('[scheduleProFetch] Plan:', subs[0].plan_type);
            }
          }).catch(function(e2) {
            console.warn('[scheduleProFetch] Subscription fetch failed:', e2);
          });
        }
      } else {
        console.log('[scheduleProFetch] No profile found, setting isPro=false');
        userState.user.isPro = false;
        userState.user.isAdmin = false;
        updateUI(userState.user);
        finish();
        verifyWithBackendFallback();
      }
    }).catch(function(e) {
      console.warn('[scheduleProFetch] Error:', e);
      if (isCurrent()) {
        userState.user.isPro = false;
        userState.user.isAdmin = false;
        updateUI(userState.user);
        finish();
        verifyWithBackendFallback();
      }
    });
  }

  function tagStatus(data, status) {
    try {
      Object.defineProperty(data, '__status', { value: status, enumerable: false, configurable: true });
    } catch (e) {}
    return data;
  }

  window.WFT.apiFetch = function (path, options) {
    options = options || {};
    var isApiPath = path.startsWith('/api/');
    var url = isApiPath ? window.WFT_API + path : path;

    var sb = window.WFT.supabase;

    function send(token) {
      var opts = {};
      for (var key in options) {
        if (key === 'timeoutMs') continue;
        if (Object.prototype.hasOwnProperty.call(options, key)) opts[key] = options[key];
      }
      if (token) {
        opts.headers = options.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token;
      }
      return fetchWithTimeout(url, opts, options.timeoutMs || API_TIMEOUT_MS).then(function (res) {
        return res.text().then(function (text) {
          var data;
          try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: text }; }
          return { res: res, data: data };
        });
      });
    }

    var method = String(options.method || 'GET').toUpperCase();
    var canRetry = method === 'GET' || method === 'HEAD';

    function wait(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function sendWithRetry(token) {
      if (!canRetry) return send(token);
      var attempt = 0;
      function next() {
        attempt += 1;
        return send(token).then(function (result) {
          var status = result.res && result.res.status;
          if (attempt <= 2 && (status === 408 || status === 502 || status === 503 || status === 504)) {
            return wait(attempt * 500).then(next);
          }
          return result;
        }).catch(function (err) {
          if (attempt <= 2) return wait(attempt * 500).then(next);
          throw err;
        });
      }
      return next();
    }

    function sessionToken() {
      if (!sb) return Promise.resolve(null);
      return sb.auth.getSession().then(function (s) {
        return s.data.session?.access_token || null;
      });
    }

    function finish(result) {
      if (userState.user) {
        if (typeof result.data.isPro !== 'undefined') {
          userState.user.isPro = result.data.isPro;
        }
        if (result.data.plan) {
          userState.user.plan = result.data.plan;
        } else if (typeof result.data.isLifetime !== 'undefined') {
          userState.user.plan = result.data.isLifetime ? 'lifetime' : 'pro';
        }
      }
      return tagStatus(result.data, result.res.status);
    }

    return sessionToken().then(function (token) {
      return sendWithRetry(token).then(function (first) {
        if (first.res.status !== 401 || !sb) return finish(first);
        return sb.auth.refreshSession().then(function () {
          return sessionToken();
        }).then(function (freshToken) {
          return sendWithRetry(freshToken).then(function (second) {
            return finish(second);
          });
        }).catch(function () {
          console.warn('[apiFetch] Token refresh failed, keeping original response');
          return finish(first);
        });
      });
    });
  };

  window.WFT.signOut = function () {
    if (window.WFT.supabase) {
      window.WFT.supabase.auth.signOut().then(function () {
        window.location.href = '/';
      });
    } else {
      document.cookie = SESSION_KEY + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.href = '/';
    }
  };

  window.WFT.getUser = function () { return userState.user; };
  window.WFT.getSession = function () { return userState.session; };
  window.WFT.isAdmin = function () { return !!(userState.user && userState.user.isAdmin); };
  window.WFT.onProStatusReady = function (cb) {
    if (!cb) return;
    if (proStatusResolved || (userState.user && typeof userState.user.isPro !== 'undefined')) {
      cb();
      return;
    }
    var handler = function () {
      document.removeEventListener('wft-pro-status', handler);
      cb();
    };
    document.addEventListener('wft-pro-status', handler);
  };
  window.WFT.onAuthReady = function (cb) {
    if (!userState.loading) { cb(userState.user); return; }
    var check = setInterval(function () {
      if (!userState.loading) { clearInterval(check); cb(userState.user); }
    }, 100);
  };

  function initAuth() {
    var sb = window.WFT.supabase;
    if (!sb) return;
    sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) {
        onAuthChange(null, res.data.session);
      } else {
        userState.loading = false;
        updateUI(null);
      }
    });
    sb.auth.onAuthStateChange(onAuthChange);
  }

  document.addEventListener('wft-supabase-ready', initAuth);

  if (window.WFT.supabase) {
    initAuth();
  } else {
    if (document.readyState === 'complete') {
      setTimeout(function () {
        if (window.WFT.supabase) initAuth();
        else { userState.loading = false; updateUI(null); }
      }, 2000);
    } else {
      window.addEventListener('load', function () {
        setTimeout(function () {
          if (window.WFT.supabase) initAuth();
          else { userState.loading = false; updateUI(null); }
        }, 2000);
      });
    }
    setTimeout(function () {
      if (userState.loading) { userState.loading = false; updateUI(null); }
    }, 5000);
  }

  updateUI(null);
})();
