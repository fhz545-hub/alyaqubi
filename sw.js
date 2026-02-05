const CACHE = "yaqubi-rsd-v3-2026-02-05";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./db.js",
  "./barcode.js",
  "./rules.js",
  "./sms.js",
  "./assets/app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/students_seed.json",
  "./assets/rules_seed.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE ? caches.delete(k) : null)))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET
  if (req.method !== "GET" || url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(()=>{});
      return res;
    }).catch(()=>cached))
  );
});
