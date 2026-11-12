// Service worker de Marga: solo recibe notificaciones push (no guarda caché,
// así un deploy nuevo se ve al instante). Lo registra src/lib/push.js.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    aviso = { body: event.data ? event.data.text() : '' };
  }
  const titulo = aviso.title || 'Marga';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.body || '',
      tag: aviso.tag || undefined,
      renotify: !!aviso.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: aviso.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.registration.scope) && 'focus' in v) return v.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});
