const CACHE = "alyaqubi-v4.1.0";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./db.js",
  "./rules.js",
  "./sms.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/barcode.js",
  "./assets/students_default.json",
  "./assets/StudentGuidance_clean.csv"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=> k===CACHE ? null : caches.delete(k))))
    .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return; // don't interfere external
  e.respondWith(
    caches.match(req).then(cached=>{
      if(cached) return cached;
      return fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(()=>cached);
    })
  );
});
