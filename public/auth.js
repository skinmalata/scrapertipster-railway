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

  var _proFetchScheduled = false;

  function onAuthChange(event, session) {
    if (session) {
      var user = session.user;
      var tok = session.access_token;
      console.log('[auth] onAuthChange event:', event, 'token first 20:', tok ? tok.substring(0, 20) : 'MISSING', 'token length:', tok ? tok.length : 0);
      userState.user = {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
      };
      userState.session = session;
      userState.loading = false;
      scheduleProFetch();
    } else {
      userState.user = null;
      userState.session = null;
      userState.loading = false;
      updateUI(null);
    }
  }

  function scheduleProFetch() {
    if (_proFetchScheduled) return;
    _proFetchScheduled = true;
    setTimeout(function() {
      var sb = window.WFT.supabase;
      if (!sb || !userState.user) {
        console.log('[scheduleProFetch] No supabase or user');
        _proFetchScheduled = false;
        document.dispatchEvent(new CustomEvent('wft-pro-status'));
        return;
      }
      sb.auth.getSession().then(function(s) {
        var tok = s.data.session?.access_token;
        if (!tok) {
          console.log('[scheduleProFetch] No token');
          _proFetchScheduled = false;
          if (userState.user) {
            userState.user.isPro = false;
            userState.user.isAdmin = false;
            updateUI(userState.user);
          }
          document.dispatchEvent(new CustomEvent('wft-pro-status'));
          return;
        }
        var SUPABASE_URL = 'https://xogkqpjtxfemcxzsuwke.supabase.co';
        var ANON_KEY = 'sb_publishable_VydS1cmw7_OhFa7e-xUOqQ_tcVRUQoy';
        var headers = { 'Authorization': 'Bearer ' + tok, 'apikey': ANON_KEY };
        console.log('[scheduleProFetch] Fetching profile for', userState.user.id);
        fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userState.user.id + '&select=vip_status,vip_expires_at', {
          headers: headers
        }).then(function(r) {
          if (!r.ok) throw new Error('Profile fetch failed: ' + r.status);
          return r.json();
        }).then(function(rows) {
          console.log('[scheduleProFetch] Profile result:', JSON.stringify(rows));
          if (rows && rows[0]) {
            var p = rows[0];
            var isAdmin = p.vip_status === 'admin';
            var isVip = p.vip_status === 'vip' && (!p.vip_expires_at || new Date(p.vip_expires_at) > new Date());
            userState.user.isPro = isAdmin || isVip;
            userState.user.isAdmin = isAdmin;
            userState.user.expiresAt = p.vip_expires_at || null;
            console.log('[scheduleProFetch] isVip:', isVip, 'isAdmin:', isAdmin);
            updateUI(userState.user);
            if (isVip) {
              fetch(SUPABASE_URL + '/rest/v1/subscriptions?user_id=eq.' + userState.user.id + '&select=plan_type&order=created_at.desc&limit=1', {
                headers: headers
              }).then(function(r2) {
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
            if (userState.user) {
              userState.user.isPro = false;
              userState.user.isAdmin = false;
              updateUI(userState.user);
            }
          }
        }).catch(function(e) {
          console.warn('[scheduleProFetch] Error:', e);
          if (userState.user) {
            userState.user.isPro = false;
            userState.user.isAdmin = false;
            updateUI(userState.user);
          }
        }).finally(function() {
          console.log('[scheduleProFetch] Dispatching wft-pro-status, isPro:', userState.user ? userState.user.isPro : 'no user');
          document.dispatchEvent(new CustomEvent('wft-pro-status'));
          _proFetchScheduled = false;
        });
      });
    }, 1000);
  }

  window.WFT.apiFetch = function (path, options) {
    options = options || {};
    var isApiPath = path.startsWith('/api/');
    var url = isApiPath ? window.WFT_API + path : path;

    var sb = window.WFT.supabase;
    var tokenPromise = sb ? sb.auth.getSession().then(function(s) { return s.data.session?.access_token || null; }) : Promise.resolve(null);
    return tokenPromise.then(function(token) {
      if (token) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = 'Bearer ' + token;
      }
      return fetch(url, options).then(function (res) {
        return res.json().then(function (data) {
          if (userState.user) {
            if (typeof data.isPro !== 'undefined') {
              userState.user.isPro = data.isPro;
            }
            if (data.plan) {
              userState.user.plan = data.plan;
            } else if (typeof data.isLifetime !== 'undefined') {
              userState.user.plan = data.isLifetime ? 'lifetime' : 'pro';
            }
          }
          return data;
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
        var tok = res.data.session.access_token;
        console.log('[auth] getSession token first 20:', tok ? tok.substring(0, 20) : 'MISSING');
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
