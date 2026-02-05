
/* Yaqubi RSD Offline PWA Service Worker */
const CACHE = "yaqubi-rsd-cache-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.css",
  "./assets/app.js",
  "./assets/students_seed.json",
  "./assets/rules_seed.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if(url.origin !== location.origin) return;

  // Navigation: serve cached index
  if(req.mode === "navigate"){
    event.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put("./index.html", copy));
        return res;
      }).catch(()=>caches.match("./index.html"))
    );
    return;
  }

  // Cache-first for core / assets
  event.respondWith(
    caches.match(req).then(cached=>{
      if(cached) return cached;
      return fetch(req).then(res=>{
        // cache successful responses
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put(req, copy));
        }
        return res;
      }).catch(()=>cached);
    })
  );
});
