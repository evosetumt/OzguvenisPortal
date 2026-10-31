# Bildirim kanalları, analiz ve mobil uygulama

## Bildirim akışı
```
Modül olayı (task.assigned, order.created, expense.submitted ...)
   → NotificationsService kuralı (alıcılar kodda, modül registerRule ile ekler)
   → notification_rules: olay etkin mi, hangi kanallar (inapp, push, email, whatsapp)
   → user_notification_prefs: kullanıcı kuralın kanallarından bazılarını kapatabilir
   → kanallar: uygulama içi kayıt + push (Firebase Cloud Messaging: web, Android, iOS) + e-posta (SMTP) + WhatsApp (Faz 4)
   → notification_deliveries: dış kanal sonucu (sent / failed / skipped)
```
- Kural satırı yoksa koddaki varsayılan kanallar geçerlidir (`task.assigned`, `task.due_soon`: uygulama içi + push; diğerleri uygulama içi).
- Kanal yapılandırılmamışsa (ortam değişkeni yok) gönderim `skipped` olarak loglanır, hata vermez.
- Kişi kendi eylemi için bildirim almaz.

## API
| Uç nokta | Açıklama |
|---|---|
| `GET /notifications/prefs`, `PUT /notifications/prefs {items:[{eventCode, channels}]}` | Kullanıcının olay bazında kanal tercihi |
| `POST /notifications/test` | Kendine tüm kanallardan deneme; kanal bazında sonuç |
| `GET /notifications/push-config` | Tarayıcının FCM jetonu alması için Firebase web yapılandırması (eksikse `web: null`) |
| `POST /notifications/devices {platform: web\|android\|ios, token}` / `DELETE` / `GET` | Push cihaz kaydı (FCM kayıt jetonu) |
| `GET /notifications/rules`, `PUT /notifications/rules/:eventCode {channels, isActive}` | `notification.manage` izni |
| `GET /reports/tasks?weeks=4..26` | Görev analizi (`report.read` kapsamına göre) |

Arayüz: Ayarlar → **Bildirimlerim** (bu cihazda push aç/kapat, olay × kanal tercihleri, deneme) ve **Bildirim kuralları** (yönetici). Analiz menüsü: özet, haftalık açılan/tamamlanan, kişi ve proje bazında yük, Netsis iş emri istatistikleri.

## Firebase Cloud Messaging (tüm cihazlar)
Proje: `ozguvenis-9958a`. Sunucu FCM HTTP v1 API'sini kullanır (`apps/api/src/push/fcm.client.ts`, ek paket yok).

| `apps/api/.env` | Nereden |
|---|---|
| `FCM_PROJECT_ID` | Firebase proje kimliği |
| `FCM_SERVICE_ACCOUNT_FILE` | Proje ayarları → Hizmet hesapları → **Yeni özel anahtar oluştur** → JSON dosyasının yolu (repoya koymayın). Bu olmadan hiçbir cihaza bildirim gitmez. |
| `FCM_WEB_API_KEY`, `FCM_WEB_APP_ID`, `FCM_WEB_MESSAGING_SENDER_ID` | Proje ayarları → Genel → Web uygulaması (`firebaseConfig`) |
| `FCM_WEB_VAPID_KEY` | Proje ayarları → Cloud Messaging → Web Push sertifikaları → **Anahtar çifti oluştur** (genel anahtar) |

- Tarayıcı: Ayarlar → Bildirimlerim → "Bu cihazda aç". Firebase SDK (yalnızca bu anda yüklenir) portalın `sw.js` service worker'ıyla FCM jetonu alır.
- Web'e yalnızca veri mesajı gider; bildirimi `apps/web/public/sw.js` gösterir ve tıklanınca ilgili sayfayı açar. `sw.js` önbellekleme yapmaz.
- Tarayıcı bildirimi yalnızca HTTPS'te (veya `localhost`'ta) çalışır. iPhone'da tarayıcıdan bildirim için portal "Ana Ekrana Ekle" ile kurulmalıdır (iOS 16.4+).
- Gelen arama (`call.incoming`) yüksek öncelikli ve kısa ömürlü (60 sn) gönderilir; yalnızca uygulaması o an açık olmayan cihazlara.
- `manifest.webmanifest` + ikonlar: portal "Ana ekrana ekle" ile uygulama gibi kurulabilir. İkonları yeniden üretmek için: `node deploy/ikon-uret.mjs`.

## Mobil (Capacitor)
| Komut (`apps/web` içinde) | İş |
|---|---|
| `npm run build:mobile` | `.env.mobile` ile derler (`VITE_API_URL` = API'nin tam adresi) |
| `npm run cap:sync` | Derler ve `android/` (ve varsa `ios/`) projesine kopyalar |
| `npm run cap:android` / `cap:ios` | Senkronlar ve Android Studio / Xcode'u açar |

- Kimlik: `tr.com.ozguvenis.portal`, ad `Özgüveniş` (`capacitor.config.ts`).
- Canlı geliştirme: `CAP_SERVER_URL=http://<bilgisayar-ip>:5173 npx cap run android` (cihaz ve bilgisayar aynı ağda).
- Gereken API ayarı: `CORS_ORIGIN` içine `https://localhost` (Android) ve `capacitor://localhost` (iOS).
- Push: Firebase projesi → Android uygulaması ekle → `google-services.json` dosyasını `apps/web/android/app/` altına koy. iOS: Firebase'e APNs anahtarı (.p8), Xcode → Signing & Capabilities → Push Notifications + Background Modes (Remote notifications). Sunucu tarafı: `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE` (Firebase → Proje ayarları → Hizmet hesapları → yeni özel anahtar).
- Uygulama açılışında `initNativeApp(navigate)` (lib/push.ts) çağrılır: bildirime dokununca ilgili sayfa açılır, Android geri tuşu geçmişte geri gider.
- Yayın: Android → Android Studio → Generate Signed App Bundle → Google Play Console (dahili test kanalı önerilir, 30 kullanıcı için "Internal testing" yeterli). iOS → Xcode Archive → App Store Connect / TestFlight veya Apple Business Manager ile özel dağıtım.

## Roller ve modül yetkileri
Ayarlar → **Roller ve yetkiler** (`user.manage`): her rol için modül modül erişim — *Erişim yok / Yalnızca kendi kayıtları / Departmanı (Netsis: plasiyeri) / Tümü*. Finansal modüller (Cari hesaplar, Sipariş/teklif/sevk, Masraflar, Ödeme takibi) işaretlidir. Katalog: `apps/api/src/common/permission-catalog.ts`.
- Kaydedince o roldeki kullanıcıların açık oturumlarına `auth:changed` gider; istemci jetonunu yeniler, menü ve sayfa erişimi hemen güncellenir (çıkış gerekmez). Kullanıcının rolü/durumu değişince de aynısı olur.
- Admin rolü her zaman tam yetkilidir, değiştirilemez/silinemez. Kullanıcısı olan rol silinemez. Kendi kullanıcı yönetimi yetkisini kaldırmak engellenir.
- Asıl denetim API'dedir; arayüzde menü ve sayfa erişimi de aynı izinlere bağlıdır (adres çubuğundan da girilemez).
- `npm run db:seed` artık mevcut rollerin yetkilerine dokunmaz (yalnızca ilk kurulumda varsayılanları yükler).
- API: `GET /api/permissions/catalog`, `GET/POST /api/roles`, `PATCH /api/roles/:id {permissions: {kod: kapsam | null}}`, `DELETE /api/roles/:id`.

## Canlı veri ve cihaz bildirimleri (30.10.2026)

- **Canlı güncelleme:** API'de her veritabanı yazımı (Prisma ara katmanı, `prisma.service.ts`) bir konuya eşlenir (tasks, meetings,
  calendar, users, erp, expenses, process, payments, tracking, whatsapp, settings) ve soketle `data:changed { topics }` olarak
  duyurulur; veri gönderilmez. Web'de `useApi` adresin ilk parçasına göre ilgili konuları dinler ve veriyi sessizce yeniden çeker
  (veri aynıysa ekran değişmez). Sekme/uygulama arka plandaysa ön plana gelince bir kez yenilenir; bağlantı kopup gelince de yenilenir.
  Netsis (erp) duyurusu en fazla 10 sn'de bir gider.
- **Ön plan bilgisi:** istemci `presence:visible` gönderir. Mesaj bildirimi yalnızca kullanıcı hiçbir cihazda portala bakmıyorsa gider.
- **Gelen arama:** zil push'u her cihaza gider (`tag: call-<id>`); tarayıcıda dokunulana kadar ekranda kalır, "Cevapla / Kapat"
  düğmeleri vardır. Bir cihazda cevaplanınca/reddedilince diğer tarayıcılardaki zil `call.cancel` ile kapanır; cevapsız kalırsa
  aynı etiketle "Cevapsız arama" bildirimine dönüşür.
- **Service worker:** portal o cihazda ekranda ve odaktaysa işletim sistemi bildirimi gösterilmez (uygulama içi zil/bildirim yeterli).
- **Bildirim izni:** bildirimi kapalı cihazda sağ altta "Bildirimleri açın" kartı çıkar (7 gün ertelenebilir). iPhone/iPad Safari'de
  web bildirimi yalnızca ana ekrana eklenmiş portalda çalışır; kart bunu anlatır (iOS 16.4+).
- **Mobil uygulama (Capacitor):** Android için Firebase'den `google-services.json` (`android/app/`), iOS için Firebase'e APNs
  anahtarı ve Xcode'da Push Notifications yeteneği gerekir; bunlar olmadan yerel uygulamada push çalışmaz (PWA çalışır).
