/* مواظبة وسلوك - Service Worker */
const CACHE = "ms-cache-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event)=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE)?null:caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin: cache-first
  if(url.origin === location.origin){
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if(cached) return cached;
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  // Cross-origin (CDN/fonts): network-first then cache (opaque responses ok)
  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    try{
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    }catch(_){
      const cached = await cache.match(req);
      if(cached) return cached;
      throw _;
    }
  })());
});
