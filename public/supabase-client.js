(function () {
  if (window.WFT && window.WFT.supabase) return;

  var SUPABASE_URL = 'https://xogkqpjtxfemcxzsuwke.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_VydS1cmw7_OhFa7e-xUOqQ_tcVRUQoy';

  var script = document.createElement('script');
  script.src = 'https://unpkg.com/@supabase/supabase-js@2';
  script.onload = function () {
    if (!window.supabase) return;
    window.WFT = window.WFT || {};
    window.WFT.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    var event = new CustomEvent('wft-supabase-ready', { detail: { supabase: window.WFT.supabase } });
    document.dispatchEvent(event);
  };
  document.head.appendChild(script);
})();
