const CACHE_NAME = 'localbridge-glass-v1';
const CORE_ASSETS = [
    '/pwa/',
    '/pwa/index.html',
    '/pwa/app.js',
    '/pwa/gsap.js',
    '/pwa/jsQR.js',
    '/pwa/manifest.json',
    '/pwa/icon.svg'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching core PWA assets');
            // Use Promise.allSettled so a single missing file doesn't crash the whole cache
            return Promise.allSettled(
                CORE_ASSETS.map(url => cache.add(url).catch(err => console.warn('Failed to cache:', url, err)))
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Skip cross-origin API calls to the desktop app securely
    if (event.request.url.includes(':3000/api/')) {
        return event.respondWith(fetch(event.request));
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Stale-while-revalidate strategy for UI assets
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Ignore network errors (offline)
            });

            return cachedResponse || fetchPromise;
        })
    );
});