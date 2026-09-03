const webPush = require('web-push');
const pushStore = require('./pushStore');

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@winfulltime.com';

let scraperService = null;
let h2hService = null;
function getScraperService() {
  if (!scraperService) scraperService = require('./scraper');
  return scraperService;
}
function getH2hService() {
  if (!h2hService) h2hService = require('./h2hWinningStreaks');
  return h2hService;
}

if (VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Count today's matches in a cache market array (each entry carries a date).
function countForDate(matches, date) {
  return (matches || []).filter(m => m && m.date === date).length;
}

// Remind users to play early and summarise today's pick counts across the
// 1X2, Over 2.5 and Unbeaten markets. Returns null when there is nothing to
// say today (no 1X2 or Over 2.5 picks available).
async function buildNotificationPayload() {
  const cache = getScraperService().loadCachedPredictions();
  const today = new Date().toISOString().split('T')[0];

  const x12 = countForDate(cache && cache.matches, today);
  const over25 = countForDate(cache && cache.over25Matches, today);

  // Only require the core 1X2 market to be present; if there are no 1X2
  // picks there is little point reminding users to play.
  if (x12 === 0) {
    console.log('[push] No 1X2 predictions for today, skipping notification');
    return null;
  }

  // Unbeaten picks come from the same source as /predictions/unbeaten.
  let unbeaten = 0;
  try {
    const streaks = await getH2hService().fetchTodayStreaks();
    unbeaten = Array.isArray(streaks) ? streaks.length : 0;
  } catch (e) {
    console.warn('[push] Could not load unbeaten count:', e && e.message);
  }

  const parts = [];
  if (x12) parts.push(x12 + ' 1X2');
  if (over25) parts.push(over25 + ' Over 2.5');
  if (unbeaten) parts.push(unbeaten + ' unbeaten');

  const body = 'Play early to lock in today\'s picks: ' + parts.join(', ') + '.' +
    (unbeaten === 0 ? ' Unbeaten streak updates later today.' : '');

  return {
    title: '\u23F0 Play Early \u2014 Today\'s Picks Are Live',
    body: body,
    url: '/predictions/1x2',
    tag: 'wf-daily-predictions'
  };
}

// Send a raw notification to every current subscriber. Returns a summary or
// null when there is nothing to send. Used by both the scheduled daily
// notification and the manual admin broadcast.
async function sendToAll(subscriptionsMap, { title, body, url, tag }) {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.log('[push] VAPID keys not configured, notification not sent');
    return null;
  }

  const notificationPayload = JSON.stringify({
    title: title || 'WinFulltime',
    body: body || 'New predictions available!',
    url: url || '/',
    tag: tag || 'winfulltime-predictions'
  });

  const entries = Array.from(subscriptionsMap.entries());
  if (entries.length === 0) {
    console.log('[push] No subscribers, notification not sent');
    return null;
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.allSettled(
    entries.map(async ([endpoint, sub]) => {
      const pushSubscription = {
        endpoint: endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      try {
        await webPush.sendNotification(pushSubscription, notificationPayload);
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) {
          pushStore.remove(endpoint);
          removed++;
        }
      }
    })
  );

  console.log('[push] Notification sent:', sent, '| failed:', failed, '| expired removed:', removed, '| total subs:', entries.length);
  return { sent, failed, removed, total: entries.length };
}

async function sendDailyPredictionsNotification(subscriptionsMap) {
  const payload = await buildNotificationPayload();
  if (!payload) {
    console.log('[push] No predictions for today, skipping daily notification');
    return null;
  }
  return sendToAll(subscriptionsMap, {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag
  });
}

module.exports = { sendDailyPredictionsNotification, sendToAll, buildNotificationPayload };
