// Service Worker para notificaciones push de hora de comida
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};

  const options = {
    body: data.mensaje || 'Nueva notificación',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.tipo || 'notification',
    requireInteraction: data.tipo?.includes('EXPIRED') || data.tipo?.includes('APPROACHING'),
    data: {
      url: '/console/lunch-breaks',
      ...data,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || 'Notificación', options)
  );
});

// Manejo de clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Si hay una ventana abierta, enfócala
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return (client as any).focus();
        }
      }
      // Si no hay ventana abierta, abre una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
