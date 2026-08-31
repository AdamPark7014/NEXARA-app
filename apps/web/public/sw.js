/* NEXARA — Web Push + notificaciones estilo “sistema” (navegador / PWA).
 * Registrado con scope "/" desde public/sw.js → debe servirse en el origen del sitio (HTTPS en prod). */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'NEXARA',
    body: '',
    url: '/',
    priority: 'normal',
    tag: '',
    nexara_notification_id: '',
  };
  try {
    if (event.data) {
      const j = event.data.json();
      payload = { ...payload, ...j };
    }
  } catch {
    try {
      const t = event.data?.text?.();
      if (t) payload = { ...payload, ...JSON.parse(t) };
    } catch {
      /* ignore */
    }
  }

  const title = payload.title || 'NEXARA';
  const body = payload.body || '';
  const url = payload.url || '/';
  const priority = String(payload.priority || 'normal').toLowerCase();
  const isHigh = priority === 'high';
  const tag =
    (typeof payload.tag === 'string' && payload.tag.trim()) ||
    (payload.nexara_notification_id ? `nexara-${payload.nexara_notification_id}` : `nexara-${Date.now()}`);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      requireInteraction: isHigh,
      silent: false,
      data: { url, priority, notificationId: payload.nexara_notification_id || '' },
      icon: '/logo-nexara-lockup.png',
      badge: '/logo-nexara-lockup.png',
      vibrate: isHigh ? [140, 50, 140, 50, 140] : [100, 40, 100],
      actions: [{ action: 'open', title: 'Abrir' }],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (!client.url || !('focus' in client)) continue;
        await client.focus();
        if ('navigate' in client && typeof client.navigate === 'function') {
          try {
            return await client.navigate(url);
          } catch {
            /* fall through to postMessage */
          }
        }
        client.postMessage({ type: 'NEXARA_NOTIFICATION_NAV', url });
        return client;
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
