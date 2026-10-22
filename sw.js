// Uni Bob service worker: opens offline after the first visit, and fetches fresh data when online.

const VERSION = 'unibob-2026-10-22-1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/data.js',
  'js/logic/grades.js', 'js/logic/search.js', 'js/logic/contextual.js', 'js/logic/dates.js', 'js/logic/geo.js', 'js/logic/filters.js',
  'js/ui/dom.js', 'js/ui/icons.js', 'js/ui/components.js', 'js/ui/greetings.js', 'js/ui/sidebar.js',
  'js/screens/subjects.js', 'js/screens/onboarding.js', 'js/screens/explore.js', 'js/screens/uni.js', 'js/screens/course.js',
  'js/screens/favourites.js', 'js/screens/summer.js', 'js/screens/whatif.js', 'js/screens/contextual.js',
  'js/screens/timeline.js', 'js/screens/settings.js',
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
const DATA_FILES = [
  'data/universities.json', 'data/programmes.json', 'data/timeline.json', 'data/glossary.json', 'data/subjects.json', 'data/meta.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES);
    const data = await caches.open(DATA);
    await data.addAll(DATA_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith(VERSION)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // Refresh in the background so the next launch gets any fixes.
    fetch(request).then((r) => { if (r.ok) cache.put(request, r); }).catch(() => {});
    return cached;
  }
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/')) { event.respondWith(networkFirst(req)); return; }
  if (req.mode === 'navigate') {
    event.respondWith(cacheFirst(new Request(new URL('index.html', self.registration.scope))).catch(() => fetch(req)));
    return;
  }
  event.respondWith(cacheFirst(req));
});
