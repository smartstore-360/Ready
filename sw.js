/* SmartStore 360 — service worker (GitHub Pages copy only).
 * Keeps the app's screens, fonts, icons and PDF tool on the phone so the app
 * opens without internet. It never stores or answers server (Apps Script)
 * requests: sales and data always go to the server, or to the outbox inside
 * the app when offline.
 */
const VERSION = 'ss360-v3.16';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CDN = [
  ['https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap', 'no-cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css', 'no-cors'],
  ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'cors']
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(([url, mode]) => fetch(url, { mode: mode, credentials: 'omit' })
      .then(r => (r.ok || r.type === 'opaque') ? c.put(url, r) : null).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ss360-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // server calls are POSTs: never touched
  const url = new URL(req.url);
  if (/(^|\.)google(usercontent)?\.com$/.test(url.hostname) && !CDN_HOSTS.includes(url.hostname)) return;

  // The app page: newest from the network when it answers quickly, otherwise the saved copy.
  if (req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')))) {
    event.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-store' }), timeout(6000)]);
        if (res && res.ok) c.put('./', res.clone());
        return res;
      } catch (e) {
        return (await c.match('./')) || (await c.match(req)) || new Response('Offline and the app has not been saved on this phone yet. Open it once with internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Fonts, icons, PDF tool, manifest: saved copy first, refreshed in the background.
  if (url.origin === location.origin || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req, { ignoreVary: true }) || await c.match(req.url, { ignoreVary: true });
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { event.waitUntil(net); return hit; }
      return (await net) || new Response('', { status: 504 });
    })());
  }
});
