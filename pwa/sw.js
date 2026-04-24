const CACHE_NAME = 'localbridge-pro-v2';
const ASSETS = [
  '/pwa/',
  '/pwa/index.html',
  '/pwa/style.css',
  '/pwa/app.js',
  '/pwa/gsap.js',
  '/pwa/jsQR.js',
  '/pwa/manifest.json'
];

// Install: Cache everything immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching Pro Assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch: Network-first with offline fallback for API, Cache-only for UI
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If it's a local UI asset, serve from cache only for maximum speed
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request));
    return;
  }

  // Otherwise, standard fetch
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});