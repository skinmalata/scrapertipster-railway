const webPush = require('web-push');

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@winfulltime.com';

let scraperService = null;
function getScraperService() {
  if (!scraperService) scraperService = require('./scraper');
  return scraperService;
}

if (VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function buildNotificationPayload() {
  const cache = getScraperService().loadCachedPredictions();
  const matches = (cache && cache.matches) || [];
  const today = new Date().toISOString().split('T')[0];
  const todayMatches = matches.filter(m => m.date === today);

  if (todayMatches.length === 0) {
    return null;
  }

  const count = todayMatches.length;

  const cats = { '1X2': 0, 'BTTS YES': 0, 'Over 2.5': 0 };
  todayMatches.forEach(m => {
    const tip = m.tip || '';
    if (tip === '1' || tip === 'X' || tip === '2') cats['1X2']++;
    else if (tip === 'BTTS YES') cats['BTTS YES']++;
    else if (tip === 'Over 2.5') cats['Over 2.5']++;
  });

  const parts = [];
  if (cats['1X2']) parts.push(cats['1X2'] + ' 1X2');
  if (cats['BTTS YES']) parts.push(cats['BTTS YES'] + ' BTTS');
  if (cats['Over 2.5']) parts.push(cats['Over 2.5'] + ' O/U');

  const body = parts.length > 0
    ? count + ' matches today \u2014 ' + parts.join(', ') + '. Tap to view!'
    : count + ' matches today. Tap to view predictions!';

  return {
    title: '\u26BD Today\'s Predictions',
    body: body,
    url: '/predictions/1x2',
    tag: 'wf-daily-predictions'
  };
}

async function sendDailyPredictionsNotification(subscriptionsMap) {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.log('[push] VAPID keys not configured, skipping daily notification');
    return;
  }

  const payload = buildNotificationPayload();
  if (!payload) {
    console.log('[push] No predictions for today, skipping notification');
    return;
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag
  });

  const entries = Array.from(subscriptionsMap.entries());
  if (entries.length === 0) {
    console.log('[push] No subscribers, skipping notification');
    return;
  }

  let sent = 0;
  let failed = 0;
  let removed = 0;

  const results = await Promise.allSettled(
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
          subscriptionsMap.delete(endpoint);
          removed++;
        }
      }
    })
  );

  console.log('[push] Daily notification sent:', sent, '| failed:', failed, '| expired removed:', removed, '| total subs:', entries.length);
  return { sent, failed, removed, total: entries.length };
}

module.exports = { sendDailyPredictionsNotification, buildNotificationPayload };
