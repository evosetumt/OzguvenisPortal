/* Özgüveniş Portal service worker: Firebase Cloud Messaging bildirimleri ve bildirime tıklayınca ilgili sayfayı açma.
   Bilinçli olarak önbellekleme yapmaz (yetki ve güncel veri için /api hiçbir zaman önbelleğe alınmamalı). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const scoped = (w) => w.url.startsWith(self.registration.scope);

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data && event.data.text() }; }
  // FCM veri mesajı: { data: { title, body, link, tag, openLabel, sticky, close }, from, ... }
  if (data && typeof data.data === 'object') data = data.data;
  event.waitUntil(handlePush(data));
});

// Nasıl gösterileceğini sunucu söyler (sticky, close, openLabel); burada bildirim türüne göre karar verilmez.
async function handlePush(data) {
  // Başka cihazda cevaplanan/reddedilen aramanın zili gibi: aynı etiketli bildirimi kapat.
  if (data.close === '1') {
    const list = await self.registration.getNotifications({ tag: data.tag });
    list.forEach((n) => n.close());
    return;
  }
  // Portal bu cihazda ekranda açıksa uygulama içi bildirim/zil zaten görünüyor; işletim sistemi bildirimi tekrarlanmaz.
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.some((w) => scoped(w) && w.visibilityState === 'visible' && w.focused)) return;

  const sticky = data.sticky === '1';
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/';
  const actions = data.openLabel ? [{ action: 'open', title: data.openLabel }] : [];
  if (sticky) actions.push({ action: 'dismiss', title: 'Kapat' });
  await self.registration.showNotification(data.title || 'Özgüveniş Portal', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: data.tag,
    renotify: !!data.tag, // aynı etiketle gelen yeni bildirim yerine geçer ama yine titreşir/ses verir
    requireInteraction: sticky, // örn. gelen arama: kullanıcı dokunana kadar ekranda kalır
    vibrate: sticky ? [400, 200, 400, 200, 400, 200, 400] : [120, 60, 120],
    timestamp: Date.now(),
    actions,
    data: { link },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  // HashRouter: uygulama yolu # sonrasındadır.
  const url = new URL(`./#${event.notification.data?.link || '/'}`, self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find(scoped);
    if (open) {
      await open.focus();
      return open.navigate(url).catch(() => undefined);
    }
    return self.clients.openWindow(url);
  })());
});
