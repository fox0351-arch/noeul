const CACHE_NAME = 'noeul-walk-v2';
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  if (request.mode === 'navigate') {
    try {
      const fresh = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      cache.put('/', fresh.clone());
      return fresh;
    } catch {
      const cached = (await caches.match('/')) || (await caches.match(request));
      if (cached) return cached;
      return new Response('오프라인 모드로 동작 중', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  const cached = await caches.match(request);
  if (cached) {
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response('오프라인', { status: 503, statusText: 'Offline' });
  }
}
