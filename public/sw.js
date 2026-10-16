// 폰 알림 받기 (웹 푸시, 2026-10-16). 앱이 닫혀 있어도 서버가 보낸 알림을 화면에 띄우고, 누르면 그 화면을 연다.
// 화면 저장(오프라인)은 하지 않는다 — 알림만.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '근태관리', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '근태관리', {
      body: data.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/admin' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'navigate' in w) {
          await w.focus();
          return w.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
