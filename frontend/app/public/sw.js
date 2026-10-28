/* Abu Tax service worker: sayt telefonga ilova sifatida o'rnatiladi va sekin internetda tez ochiladi.
 * - /assets/* (hash'li, o'zgarmaydi) — keshdan, bo'lmasa tarmoqdan;
 * - sahifalar — tarmoqdan, internet yo'q bo'lsa keshdagi index.html;
 * - /api, /socket.io, /uploads, /files — HECH QACHON keshlanmaydi (shaxsiy va jonli ma'lumot). */
const VERSION = 'abutax-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|socket\.io|uploads|files)\//.test(url.pathname)) return;

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(VERSION).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
  }
});
