const CACHE = "yaqubi-rsd-cache-v14";
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
  "./assets/StudentGuidance_clean.csv"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE ? caches.delete(k):null)))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  if(req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then(cached=>{
      if(cached) return cached;
      return fetch(req).then(res=>{
        // cache successful same-origin GET
        try{
          const url = new URL(req.url);
          if(url.origin === self.location.origin && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE).then(cache=>cache.put(req, copy));
          }
        }catch(_){}
        return res;
      }).catch(()=>caches.match("./index.html"));
    })
  );
});
