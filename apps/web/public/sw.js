/* NEXARA — service worker mínimo para Web Push (fondo / pestaña cerrada con permiso del navegador) */
self.addEventListener('push', (event) => {
  let payload = { title: 'NEXARA', body: '', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'NEXARA', {
      body: payload.body || '',
      data: { url: payload.url || '/' },
      icon: '/logo-nexara.png',
      badge: '/logo-nexara.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
