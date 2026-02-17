/* sw.js */
'use strict';

// ✅ غيّر هذا الرقم عند أي تحديث تريد فرضه فورًا
const SW_VERSION = '2026-02-17-01';
const CACHE_NAME = `moathaba-cache-${SW_VERSION}`;

// ملفات أساسية (عدّلها حسب هيكل مشروعك)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// استقبال رسالة تخطي الانتظار
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// تثبيت: خزّن الأساسيات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  // لا تعمل skipWaiting هنا تلقائيًا، نخليه برسالة حتى ما يقطع المستخدم فجأة
});

// تفعيل: امسح الكاشات القديمة + استلم التحكم فورًا
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith('moathaba-cache-') && k !== CACHE_NAME) ? caches.delete(k) : null)
    );
    await self.clients.claim();
  })());
});

// استراتيجية: Network-first للـ HTML (عشان التغييرات تظهر بسرعة)
// و Cache-first للباقي (أيقونات/ملفات ثابتة)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // نفس النطاق فقط
  if (url.origin !== self.location.origin) return;

  // HTML: شبكة أولاً
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // باقي الملفات: كاش أولاً ثم شبكة
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
