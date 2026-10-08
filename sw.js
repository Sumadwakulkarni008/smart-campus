const CACHE="smart-campus-v2";
const ASSETS=["./","./index.html","./style.css","./app.js","./supabase-config.js","./manifest.webmanifest","./icon-192.svg","./icon-512.svg"];

self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  
  // IMPORTANT: Bypass caching for Supabase API requests so live data always loads
  if(e.request.url.includes("supabase.co")) return;

  e.respondWith(
    fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return r
    }).catch(()=>caches.match(e.request))
  );
});
