const CACHE = 'chiptune-4';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function cacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.includes('/src/')) return false;
  if (url.pathname.includes('/@')) return false;
  if (url.pathname.includes('/node_modules/')) return false;
  return true;
}

function isolate(response) {
  if (!response || response.status === 0 || response.type === 'opaque' || response.body === null) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function load(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const network = await fetch(request);
    const isolated = isolate(network);
    if (network.ok && cacheable(url)) {
      try {
        await cache.put(request, isolated.clone());
      } catch {
        return isolated;
      }
    }
    return isolated;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(load(request, url));
});
