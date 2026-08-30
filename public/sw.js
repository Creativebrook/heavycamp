const CACHE='heavycamp-shell-v6',SHELL=['/manifest.webmanifest','/icon-192.png','/icon-384.png','/icon-512.png','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put('/',x));return r}).catch(()=>caches.match('/')));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(k=>k.put(e.request,x));return r})));
});
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch{}e.waitUntil(self.registration.showNotification(d.title||'HeavyCamp',{body:d.body||'New music is waiting for you.',icon:'/icon-192.png',badge:'/icon-192.png',tag:d.tag||'heavycamp',data:{url:d.url||'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus'in c){c.navigate(e.notification.data?.url||'/');return c.focus()}}return self.clients.openWindow(e.notification.data?.url||'/')}))});
