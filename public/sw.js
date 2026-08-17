const CACHE_NAME = 'winfulltime-v8';
const STATIC_CACHE = 'winfulltime-static-v8';
const DYNAMIC_CACHE = 'winfulltime-dynamic-v8';
const IMAGE_CACHE = 'winfulltime-images-v8';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/ticket-builder.html',
  '/converter.html',
  '/best-picks.html',
  '/author-picks.html',
  '/2-odds-of-the-day.html',
  '/analysis.html',
  '/about.html',
  '/advertise.html',
  '/contact.html',
  '/terms.html',
  '/privacy.html',
  '/policy.html',
  '/options.html',
  '/offline.html',
  '/blog/',
  '/styles.css',
  '/app.css',
  '/auth.js',
  '/config.js',
  '/pwa.js',
  '/supabase-client.js',
  '/responsible-gambling.js',
  '/free-ticket-builder.js',
  '/match-analysis-links.js',
  '/winfulltimelogo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
  '/predictions/1x2.html',
  '/predictions/over-2-5.html',
  '/predictions/over-1-5.html',
  '/predictions/btts.html',
  '/predictions/btts-no.html',
  '/predictions/corners.html',
  '/predictions/cards.html',
  '/predictions/unbeaten.html',
  '/predictions/winning-streak.html',
  '/predictions/losing-streak.html',
  '/predictions/draws-streak.html',
  '/predictions/in-play.html',
  '/predictions/league/premier-league/',
  '/predictions/league/la-liga/',
  '/predictions/league/serie-a/',
  '/predictions/league/ligue-1/',
  '/predictions/league/uefa-champions-league/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Some static assets failed to cache:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.pathname.startsWith('/blog/thumbnails/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (url.pathname.startsWith('/predictions/')) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  if (url.pathname.startsWith('/data/')) {
    // Results are written to this file after matches finish. Serving a cached
    // copy first leaves completed markets looking unresolved until a reload.
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/ticket-builder.html') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/offline.html');
    }
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open') {
    event.waitUntil(clients.openWindow('/'));
  }
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'WinFulltime', {
      body: data.body || 'New predictions available!',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      vibrate: [200, 100, 200],
      tag: 'winfulltime-predictions',
      data: { url: data.url || '/' }
    })
  );
});
