/* डीडवाना-कुचामन पोर्टल — सर्विस वर्कर: ऐप-शैल कैश (दूसरी बार से तुरंत खुलना)।
   Google Sheets / Apps Script के अनुरोध कभी कैश नहीं होते — डेटा हमेशा ताज़ा आता है। */
const CACHE = 'dk-portal-v3';
const INDEX = './index.html';
const PRE = [INDEX, './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function notifyIfChanged(oldRes, newRes) {
  try {
    const a = oldRes && (oldRes.headers.get('etag') || oldRes.headers.get('content-length'));
    const b = newRes.headers.get('etag') || newRes.headers.get('content-length');
    if (a && b && a !== b) (await self.clients.matchAll()).forEach(c => c.postMessage({ type: 'dk-updated' }));
  } catch (_) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // मुख्य पेज (किसी भी ?mon= / ?pgs= पैरामीटर सहित): कैश से तुरंत, पीछे से ताज़ा करें
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(INDEX);
      const net = fetch(INDEX, { cache: 'no-cache' }).then(async r => {
        if (r && r.ok) { await notifyIfChanged(cached, r.clone()); await cache.put(INDEX, r.clone()); }
        return r;
      }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || Response.error();
    })());
    return;
  }

  // अपनी साइट की अन्य स्थिर फ़ाइलें: stale-while-revalidate
  if (url.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }

  // केवल cdnjs की लाइब्रेरी कैश करें (html2canvas); Google डेटा-अनुरोध सीधे नेटवर्क से
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const r = await fetch(req); if (r && r.ok) cache.put(req, r.clone()); return r;
    }));
  }
});
