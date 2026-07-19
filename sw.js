/* Bocas SaaS — Service Worker: notifications when tab is minimized */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'ORDER_NOTIFY') {
    event.waitUntil(
      self.registration.showNotification(data.title || '¡Nuevo pedido!', {
        body: data.body || 'Tienes un pedido nuevo en Bocas',
        tag: data.tag || 'bocas-order',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 400]
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        // Open business dashboard if possible
        const url = self.registration.scope + 'business/';
        return self.clients.openWindow(url);
      }
    })
  );
});
