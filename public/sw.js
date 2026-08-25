// Wake Lock는 페이지(WakeLockProvider)가 담당합니다. SW는 화면을 켜 둘 수 없습니다.
// 대신 오래된 지도 스크립트를 붙잡지 않고, 관리자 시뮬 HTML을 홈 캐시에 덮어쓰지 않습니다.
const CACHE_NAME = 'noeul-walk-v9';
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/icon-my-location.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== 'noeul-share-target')
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/share-target'
  ) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/admin')) return;

  event.respondWith(handleFetch(request, url));
});

async function handleFetch(request, url) {
  if (request.mode === 'navigate') {
    try {
      const fresh = await fetch(request);
      if (fresh.ok && (url.pathname === '/' || url.pathname === '')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put('/', fresh.clone());
      }
      return fresh;
    } catch {
      const cached = (await caches.match(request)) || (await caches.match('/'));
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

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const values = Array.from(formData.values());
    const file = values.find((value) => value instanceof File);
    if (file instanceof File) {
      const cache = await caches.open('noeul-share-target');
      await cache.put(
        '/__shared_file__',
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name || 'shared.gpx'),
          },
        })
      );
    }
  } catch (error) {
    console.error('[노을-share] share target failed', error);
  }
  return Response.redirect('/?shared=gpx', 303);
}
