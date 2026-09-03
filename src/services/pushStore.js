// Persistent push subscription store.
// Subscriptions live in Supabase (table: push_subscriptions) so they survive
// server restarts.  An in-memory Map mirrors them for fast, synchronous reads
// by the daily notification sender.  If Supabase is not configured, the store
// degrades to in-memory-only (same behaviour as the original implementation).
var supabase = null;
try {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    var { createClient } = require('@supabase/supabase-js');
    supabase = createClient(url, key);
  } else {
    console.warn('[push-store] SUPABASE_URL/SUPABASE_SERVICE_KEY not set — push subscriptions in-memory only');
  }
} catch (e) {
  console.warn('[push-store] Supabase init failed:', e.message);
}

var TABLE = 'push_subscriptions';

// In-memory mirror: endpoint -> { endpoint, p256dh, auth, userAgent, createdAt }
var subscriptions = new Map();

// Load all persisted subscriptions into memory at startup.
async function loadAll() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from(TABLE).select('*');
    if (error) throw error;
    subscriptions.clear();
    (data || []).forEach(function (row) {
      subscriptions.set(row.endpoint, {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        userAgent: row.user_agent || '',
        createdAt: row.created_at || ''
      });
    });
    console.log('[push-store] Loaded', subscriptions.size, 'subscriptions from Supabase');
  } catch (e) {
    console.warn('[push-store] Failed to load subscriptions:', e && e.message);
  }
}

async function add(endpoint, keys, userAgent) {
  subscriptions.set(endpoint, {
    endpoint: endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent || '',
    createdAt: new Date().toISOString()
  });
  if (supabase) {
    try {
      const { error } = await supabase.from(TABLE).upsert(
        {
          endpoint: endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent || '',
          created_at: new Date().toISOString()
        },
        { onConflict: 'endpoint' }
      );
      if (error) throw error;
    } catch (e) {
      console.warn('[push-store] Failed to persist subscription:', e && e.message);
    }
  }
  return subscriptions.size;
}

async function remove(endpoint) {
  const existed = subscriptions.delete(endpoint);
  if (supabase) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('endpoint', endpoint);
      if (error) throw error;
    } catch (e) {
      console.warn('[push-store] Failed to remove subscription:', e && e.message);
    }
  }
  return existed;
}

function getMap() {
  return subscriptions;
}

function getCount() {
  return subscriptions.size;
}

module.exports = {
  loadAll: loadAll,
  add: add,
  remove: remove,
  getSubscriptionCount: getCount,
  getSubscriptions: getMap,
  supabaseEnabled: function () { return !!supabase; }
};
