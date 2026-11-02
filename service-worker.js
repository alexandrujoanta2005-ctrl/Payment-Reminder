const CACHE='payment-reminder-v4';
const ASSETS=['./','index.html','styles.css','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./')))
  );
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||''}}
  const options={
    body:data.body||'Ai o plată de verificat.',
    icon:'icons/icon-192.png',
    badge:'icons/icon-192.png',
    tag:data.tag||'payment-reminder-push',
    renotify:true,
    data:{url:data?.data?.url||'./',reminderId:data?.data?.reminderId||null}
  };
  event.waitUntil(self.registration.showNotification(data.title||'💰 Payment Reminder',options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'./';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){if('focus'in client){client.focus();if('navigate'in client)client.navigate(target).catch(()=>{});return}}
    return clients.openWindow(target);
  }));
});
