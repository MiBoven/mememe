// mememe service worker — stale-while-revalidate for the app's own files.
// Requests to other sites (meme templates) are never cached here.
const CACHE = 'mememe-v1.0.0';
const ASSETS = [
  '/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/favicon.ico',
  '/android-chrome-192x192.png', '/android-chrome-512x512.png', '/og-image.png',
  '/icons/favicon-16x16.png', '/icons/favicon-32x32.png', '/icons/apple-touch-icon.png',
  '/fonts/Anton-Regular.woff', '/fonts/ComicRelief-Regular.woff', '/fonts/ComicRelief-Bold.woff',
  '/fonts/ArchivoBlack-Regular.woff', '/fonts/Montserrat-Variable.woff', '/fonts/Bitter-Variable.woff',
  '/fonts/AnonymousPro-Regular.woff', '/fonts/AnonymousPro-Bold.woff'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // add one by one so a single missing file doesn't break the whole install
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mememe-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached || (req.mode === 'navigate' ? cache.match('/index.html') : undefined));
      return cached || network;
    })
  );
});
