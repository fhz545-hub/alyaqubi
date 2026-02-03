/* Service Worker - Cache First */
const CACHE = "rsd-offline-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./db.js",
  "./rules.js",
  "./sms.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/StudentGuidance_clean.csv"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => cached))
  );
});
