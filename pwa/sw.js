/* ═══════════════════════════════════════════
   LocalBridge Service Worker
   Fully offline — zero CDN dependencies
═══════════════════════════════════════════ */

const CACHE = 'localbridge-v1';

// Only cache LOCAL assets — no CDN garbage
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './jsQR.js',
    './manifest.json',
    './icon.svg',
    './sw.js',
];

/* ── Install: cache all core assets ── */
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(err => {
            console.warn('[SW] Cache install failed:', err);
        })
    );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

/* ── Fetch strategy ── */
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // 1. API calls to the laptop server → ALWAYS network, never cache
    if (url.includes(':3000/')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ error: 'Laptop disconnected' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // 2. External URLs (fonts, CDNs) → network only, don't cache
    if (!url.startsWith(self.location.origin)) {
        event.respondWith(fetch(event.request).catch(() => new Response('', { status: 408 })));
        return;
    }

    // 3. Local app assets → Cache First, fallback to network
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
