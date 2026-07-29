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

  function onAuthChange(event, session) {
    if (session) {
      var user = session.user;
      var tok = session.access_token;
      console.log('[auth] onAuthChange event:', event, 'token first 20:', tok ? tok.substring(0, 20) : 'MISSING', 'token length:', tok ? tok.length : 0);
      userState.user = {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        isPro: false,
        plan: null
      };
      userState.session = session;
      userState.loading = false;
      fetchProStatus(tok);
    } else {
      userState.user = null;
      userState.session = null;
      userState.loading = false;
      updateUI(null);
    }
  }

  function fetchProStatus(accessToken) {
    fetch(window.WFT_API + '/api/me/subscription', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (userState.user) {
        userState.user.isPro = data.isPro || false;
        userState.user.plan = data.plan || null;
        userState.user.expiresAt = data.expiresAt || null;
        updateUI(userState.user);
      }
      document.dispatchEvent(new CustomEvent('wft-pro-status'));
    }).catch(function () {
      if (userState.user) {
        userState.user.isPro = false;
        userState.user.plan = null;
        updateUI(userState.user);
      }
      document.dispatchEvent(new CustomEvent('wft-pro-status'));
    });
  }

  window.WFT.apiFetch = function (path, options) {
    options = options || {};
    var isApiPath = path.startsWith('/api/');
    var url = isApiPath ? window.WFT_API + path : path;

    if (userState.session) {
      options.headers = options.headers || {};
      var token = userState.session.access_token;
      console.log('[apiFetch] Token first 20:', token ? token.substring(0, 20) : 'MISSING', 'Length:', token ? token.length : 0);
      options.headers['Authorization'] = 'Bearer ' + token;
    } else {
      console.log('[apiFetch] No session, sending without auth');
    }

    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (data && typeof data.isPro !== 'undefined' && userState.user) {
          userState.user.isPro = data.isPro;
        }
        return data;
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

  document.addEventListener('wft-supabase-ready', function () {
    var sb = window.WFT.supabase;
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
  });

  if (!window.WFT.supabase) {
    var ready = function () {
      var sb = window.WFT.supabase;
      sb.auth.getSession().then(function (res) {
        if (res.data && res.data.session) {
          var tok = res.data.session.access_token;
          console.log('[auth fallback] getSession token first 20:', tok ? tok.substring(0, 20) : 'MISSING');
          onAuthChange(null, res.data.session);
        } else {
          userState.loading = false;
          updateUI(null);
        }
      });
      sb.auth.onAuthStateChange(onAuthChange);
    };
    if (document.readyState === 'complete') {
      setTimeout(function () {
        if (window.WFT.supabase) ready();
        else { userState.loading = false; updateUI(null); }
      }, 2000);
    } else {
      window.addEventListener('load', function () {
        setTimeout(function () {
          if (window.WFT.supabase) ready();
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
