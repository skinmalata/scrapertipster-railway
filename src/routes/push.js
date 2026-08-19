const express = require('express');
const router = express.Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[push] VAPID keys not configured — push notifications disabled');
}

// In-memory subscription store.  Lost on server restart; users re-subscribe
// on next visit.  For persistence, add a Supabase table later.
const subscriptions = new Map();

function getSubscriptionCount() {
  return subscriptions.size;
}

// Return the VAPID public key so the frontend can subscribe
router.get('/push/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Store a push subscription
router.post('/push/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  subscriptions.set(endpoint, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: req.get('user-agent') || '',
    createdAt: new Date().toISOString()
  });
  console.log('[push] Subscription added, total:', subscriptions.size);
  res.json({ success: true, total: subscriptions.size });
});

// Remove a push subscription
router.post('/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }
  subscriptions.delete(endpoint);
  console.log('[push] Subscription removed, total:', subscriptions.size);
  res.json({ success: true, total: subscriptions.size });
});

// Debug endpoint — only accessible on the server
router.get('/push/stats', (req, res) => {
  res.json({ total: subscriptions.size });
});

module.exports = { router, subscriptions, getSubscriptionCount };
