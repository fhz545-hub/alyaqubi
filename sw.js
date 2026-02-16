/* sw.js */
'use strict';

const CACHE_NAME = 'moathaba-v2026-02-16-01'; // غيّر الرقم عند كل تحديث
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// تثبيت
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// تفعيل + تنظيف كاش قديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// جلب
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) الصفحة/التنقل: Network First (عشان التعديلات تظهر)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 2) باقي الملفات: Cache First ثم Network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      });
    })
  );
});
// ✅ ضع هذا في آخر sw.js (خارج أي addEventListener آخر)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ذكرني_بالتحديث') {
    self.skipWaiting();
  }
});
