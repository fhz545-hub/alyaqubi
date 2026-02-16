/* Service Worker — ثانوية اليعقوبي
   - كاش بسيط للأصول الأساسية
   - تفعيل فوري للتحديث عبر رسالة: {type:'ذكرني_بالتحديث'}
*/

const SW_VERSION = '2026-02-16';
const CACHE_NAME = `yaqoubi-pwa-${SW_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
  // (الملف الخارجي غير مستخدم حالياً داخل index.html لكنه يُترك احتياطاً)
  './app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache)=> cache.addAll(CORE_ASSETS))
  );
  // ننتظر رسالة skipWaiting بدل التفعيل الفوري حتى لا ينقطع المستخدم
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async()=>{
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ذكرني_بالتحديث') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    (async()=>{
      const cache = await caches.open(CACHE_NAME);

      // cache-first لملفات الواجهة
      const cached = await cache.match(req, {ignoreSearch:true});
      if (cached) return cached;

      try{
        const fresh = await fetch(req);
        // لا نخزن الاستجابات غير السليمة
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      }catch(err){
        // fallback للصفحة الرئيسية عند عدم توفر الشبكة
        const fallback = await cache.match('./index.html');
        return fallback || new Response('Offline', {status: 503, statusText: 'Offline'});
      }
    })()
  );
});
