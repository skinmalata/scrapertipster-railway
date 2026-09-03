const express = require('express');
const router = express.Router();
const pushStore = require('../services/pushStore');
const { requireAdmin } = require('../middleware/auth');
const { sendToAll } = require('../services/pushNotifications');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[push] VAPID keys not configured — push notifications disabled');
}

// Hydrate persisted subscriptions into memory at startup.
pushStore.loadAll().catch(function (e) {
  console.warn('[push] Failed to initialise store:', e && e.message);
});

// Return the VAPID public key so the frontend can subscribe
router.get('/push/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Store a push subscription (persisted to Supabase when available)
router.post('/push/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  const total = await pushStore.add(endpoint, keys, req.get('user-agent') || '');
  console.log('[push] Subscription added, total:', total);
  res.json({ success: true, total });
});

// Remove a push subscription
router.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }
  const removed = await pushStore.remove(endpoint);
  console.log('[push] Subscription removed, total:', pushStore.getSubscriptionCount());
  res.json({ success: true, total: pushStore.getSubscriptionCount() });
});

// Debug endpoint — only accessible on the server
router.get('/push/stats', (req, res) => {
  res.json({ total: pushStore.getSubscriptionCount(), persistent: pushStore.supabaseEnabled() });
});

// Manual broadcast — admin only. POST a title/body/url (and optional tag).
router.post('/push/send', requireAdmin, async (req, res) => {
  const { title, body, url, tag } = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Missing body text' });
  }
  const result = await sendToAll(pushStore.getSubscriptions(), {
    title: title || 'WinFulltime',
    body,
    url: url || '/',
    tag: tag || 'wf-manual-broadcast'
  });
  if (!result) {
    return res.status(503).json({ error: 'Push not configured or no subscribers', total: pushStore.getSubscriptionCount() });
  }
  res.json({ success: true, ...result });
});

module.exports = {
  router,
  subscriptions: pushStore.getSubscriptions(),
  getSubscriptionCount: pushStore.getSubscriptionCount
};
