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
    Promise.all([
      self.registration.showNotification(data.title || '근태관리', {
        body: data.body || '',
        icon: '/brand/icon-192.png',
        badge: '/brand/icon-192.png',
        tag: data.tag,
        data: { url: data.url || '/admin' },
      }),
      updateBadge(),
    ]),
  );
});

// 앱 아이콘 숫자 (2026-10-21 의뢰인: 카카오톡처럼) — 앱이 닫혀 있어도 알림이 오면 종과 같은 숫자로 바꾼다. 못 세면 그대로 둔다
async function updateBadge() {
  if (!self.navigator.setAppBadge) return;
  try {
    const r = await fetch('/api/me/alerts', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return;
    const c = await r.json();
    const n = (c.notices || 0) + (c.messages || 0) + (c.decided || 0) + (c.requests || 0);
    await (n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge());
  } catch {
    // 연결이 끊겼으면 다음 알림이나 앱을 열 때 맞춘다
  }
}

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
