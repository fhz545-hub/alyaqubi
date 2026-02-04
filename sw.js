
const CACHE = "yaqubi-rsd-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./assets/app.css",
  "./assets/app.js",
  "./assets/db.js",
  "./assets/util.js",
  "./assets/csv.js",
  "./assets/print.js",
  "./assets/barcode.js",
  "./assets/sms.js",
  "./vendor/xlsx.full.min.js",
  "./README.md",
  "./cloudflare-worker-proxy.js"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null)))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  // cache-first for same-origin
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(cached=>{
        if(cached) return cached;
        return fetch(req).then(res=>{
          const copy = res.clone();
          caches.open(CACHE).then(cache=>cache.put(req, copy)).catch(()=>{});
          return res;
        }).catch(()=>caches.match("./index.html"));
      })
    );
  }
});
