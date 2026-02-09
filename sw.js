const CACHE = "ms-v11-20260209";
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./sw.js"];
self.addEventListener("install", (e)=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate", (e)=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))).then(()=>self.clients.claim())
));
self.addEventListener("fetch", (e)=>{
  const req=e.request;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    e.respondWith(
      caches.match(req).then(cached=>cached||fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=>cached))
    );
  }
});