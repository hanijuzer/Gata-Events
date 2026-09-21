/* GTA Events Hub service worker — offline shell + last-known events. Bump VERSION when you change any file below. */
const VERSION = 'v1';
const SHELL_CACHE = 'gta-shell-' + VERSION;
const DATA_CACHE = 'gta-data-' + VERSION;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'core.js', 'collector.js', 'sources.js', 'demo-data.js',
  'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/bricolage-grotesque.woff2', 'fonts/public-sans.woff2'
];
const DATA = ['events.json', 'manual-events.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // never cache other sites (feeds, images, maps)

  const name = url.pathname.split('/').pop();
  if (DATA.indexOf(name) !== -1) {                              // events: network first, fall back to last copy
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(DATA_CACHE).then(c => c.put(url.pathname, copy)); return res; })
      .catch(() => caches.open(DATA_CACHE).then(c => c.match(url.pathname)).then(r => r || new Response('{"meta":{},"events":[]}', { headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (req.mode === 'navigate') {                                // pages: network first, fall back to cached shell
    e.respondWith(fetch(req).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {                 // static files: cache first, refresh in background
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
