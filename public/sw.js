/* Sygen Admin Service Worker */
const VERSION = 'v3';
const STATIC_CACHE = `sygen-admin-static-${VERSION}`;
const PAGES_CACHE = `sygen-admin-pages-${VERSION}`;
const KNOWN_CACHES = new Set([STATIC_CACHE, PAGES_CACHE]);

const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('sygen-admin-') && !KNOWN_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_PAGES_CACHE') {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

function isStaticAsset(url) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/_next/image')) return true;
  if (url.pathname === '/manifest.json') return true;
  if (url.pathname.startsWith('/splash/')) return true;
  return /\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|eot|css|js|map)$/i.test(
    url.pathname
  );
}

// Must mirror API_PREFIXES in https-proxy.mjs — anything that routes to the
// Sygen backend should bypass SW caching entirely.
const API_PREFIXES = ['/api/', '/upload', '/files', '/health', '/ws/'];

function isApiRequest(url) {
  return API_PREFIXES.some((p) => url.pathname === p.replace(/\/$/, '') ||
    url.pathname.startsWith(p));
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  return (
    request.method === 'GET' &&
    request.headers.get('accept')?.includes('text/html')
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }
});
