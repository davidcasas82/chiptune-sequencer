const CACHE = 'chiptune-5';
const SHELL = [
  './',
  './index.html',
  './sw.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './chiptune-worklet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
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

async function putIsolated(cache, url, response) {
  if (!response || !response.ok || response.body === null) return;
  await cache.put(url, isolate(response));
}

async function precache() {
  const cache = await caches.open(CACHE);
  const scope = self.registration.scope;
  const indexUrl = new URL('./index.html', scope);
  const indexRes = await fetch(new Request(indexUrl, { cache: 'reload' }));
  const html = await indexRes.clone().text();
  await putIsolated(cache, indexUrl, indexRes);
  const saved = await cache.match(indexUrl);
  if (saved) await cache.put(new URL('./', scope), saved.clone());
  const found = new Set();
  const pattern = /(?:src|href)="([^"]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    const ref = match[1];
    if (ref && !ref.startsWith('data:') && !ref.startsWith('blob:')) {
      try {
        found.add(new URL(ref, indexUrl).href);
      } catch {
        // skip a bad reference
      }
    }
    match = pattern.exec(html);
  }
  for (const path of SHELL) found.add(new URL(path, scope).href);
  found.delete(indexUrl.href);
  found.delete(new URL('./', scope).href);
  await Promise.all([...found].map(async (href) => {
    try {
      const res = await fetch(new Request(href, { cache: 'reload' }));
      await putIsolated(cache, href, res);
    } catch {
      // one missing file should not block the shell
    }
  }));
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
  } catch {
    const cached = await cache.match(request) || await cache.match(url.href);
    if (cached) return isolate(cached);
    throw new Error('offline');
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
