# Sunucu Kurulumu (Windows Server 2022, IIS)

Hedef: `https://portal.sirketadi.com.tr` (alt alan adı). Tek sunucu, ~30 kullanıcı.

## Genel şema
```
İnternet → 443 → IIS (SSL, statik web, /api ve WebSocket ters proxy) → Node API (Windows hizmeti, 127.0.0.1:3000) → SQL Server
                                                           Arama/toplantı: WebRTC P2P (medya sunucusu yok)
```

## 1. Ön hazırlık
- DNS: `portal` ve `meet` alt alan adları sunucunun dış IP'sine (A kaydı).
- Güvenlik duvarı/NAT: 443/TCP → IIS. Dışarıdan (mobil veri) arama gerekiyorsa ayrıca bir TURN sunucusu (bkz. moduller/mesajlasma-toplanti.md).
- Yazılım: Node.js 20 LTS, IIS + **URL Rewrite** + **Application Request Routing (ARR)**, IIS'te **WebSocket Protocol** özelliği (Server Manager → Roles → Web Server → Application Development).
- SQL Server: `OzguvenisPortal` veritabanı ve `portal_app` kullanıcısı (db_owner yerine üretimde `db_datareader`, `db_datawriter`, `db_ddladmin` yeterlidir). Şifre güçlü ve yalnızca sunucuda.

## 2. Uygulamayı yerleştir
```
C:\Apps\Ozguvenis\api\    ← apps/api/dist, node_modules (üretim), .env, prisma klasörü
C:\Apps\Ozguvenis\web\    ← apps/web/dist içeriği
```
Üretim bağımlılıkları ve veritabanı:
```
cd C:\Apps\Ozguvenis\api
npm install --omit=dev
npx prisma migrate deploy
npx prisma db seed        # yalnızca ilk kurulumda
```
`.env` içinde `NODE_ENV=production`, güçlü `JWT_SECRET`, `CORS_ORIGIN=https://portal.sirketadi.com.tr`, `PORT=3000`. `SHADOW_DATABASE_URL` üretimde gerekmez, ancak şema dosyası tanımlı olduğu için `.env`'de boş olmayan bir değer bulunmalı (aynı `DATABASE_URL` yazılabilir).

## 3. API'yi Windows hizmeti yap (NSSM)
```
nssm install OzguvenisApi "C:\Program Files\nodejs\node.exe" "C:\Apps\Ozguvenis\api\main.js"
nssm set OzguvenisApi AppDirectory C:\Apps\Ozguvenis\api
nssm set OzguvenisApi Start SERVICE_AUTO_START
nssm set OzguvenisApi AppExit Default Restart
nssm set OzguvenisApi AppStdout C:\Apps\Ozguvenis\logs\api.log
nssm set OzguvenisApi AppStderr C:\Apps\Ozguvenis\logs\api.err.log
nssm start OzguvenisApi
```
Not: `dist` içeriğini `api\` köküne kopyalarsanız yol `main.js` olur; `dist` klasörüyle bırakırsanız `api\dist\main.js` yazın. Hizmeti kısıtlı bir Windows kullanıcısıyla çalıştırın (SYSTEM değil).

## 4. IIS sitesi
- Site kökü: `C:\Apps\Ozguvenis\web`, bağlama: `portal.sirketadi.com.tr` 443, sertifika (win-acme ile Let's Encrypt veya kurumsal).
- ARR'de: Server → Application Request Routing Cache → Server Proxy Settings → **Enable proxy**.
- `web\web.config` repoda hazırdır (`apps/web/public/web.config`, derlemede `dist`'e kopyalanır): HTTP→HTTPS yönlendirmesi, `/api/*` → `http://127.0.0.1:3000/api/*` ters proxy, 16 MB yükleme sınırı, `.webmanifest` MIME türü, `index.html` ve `sw.js` için `no-cache`.
- Sohbet ve anlık bildirim WebSocket'i `/api/socket.io` altındadır, aynı `api` kuralıyla geçer. IIS'te **WebSocket Protocol** özelliği kurulu olmalı; ARR yükseltmeyi otomatik iletir.
- ARR → Server Proxy Settings: **Time-out** 120 sn (uzun yüklemeler için), **Reverse rewrite host in response headers** kapalı.

Arayüz `HashRouter` kullandığı için ek SPA yönlendirme kuralı gerekmez.

## 5. Yedekleme
Repodaki `deploy/yedekle.ps1`: `BACKUP DATABASE` (sıkıştırmalı + `CHECKSUM`, ardından `RESTORE VERIFYONLY`), `uploads` klasörünün zip'i, isteğe bağlı ikinci konuma kopya, `-SaklaGun` günden eski yedeklerin silinmesi. Sonuç `yedek.log`'a yazılır, hata olursa çıkış kodu 1.

Görev Zamanlayıcı (her gece 02:30, oturum açılmasa da):
```
schtasks /Create /TN "Ozguvenis Yedek" /SC DAILY /ST 02:30 /RU "SIRKET\svc_portal_yedek" /RP * ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Apps\Ozguvenis\deploy\yedekle.ps1 -YedekKlasoru D:\Yedek\Ozguvenis -UploadsKlasoru C:\Apps\Ozguvenis\api\uploads -KopyaKlasoru \\nas\yedek\ozguvenis -SaklaGun 14"
```
- Çalıştıran hesaba `OzguvenisPortal` üzerinde `db_backupoperator` verin; SQL Server hizmet hesabı yedek klasörüne yazabilmeli (yedek dosyasını SQL Server hizmeti yazar).
- SQL Server Express `COMPRESSION` desteklemez; Express'te betikteki `COMPRESSION,` ifadesini silin.
- Ayda bir yedeği test ortamına geri yükleyerek (`RESTORE DATABASE ... WITH MOVE`) deneyin. Netsis yedeği bu betiğin kapsamında değildir.

## 6. Sesli/görüntülü arama (WebRTC)
Ek sunucu gerekmez: görüntü ve ses kullanıcıların cihazları arasında doğrudan akar, API yalnızca sinyali socket.io üzerinden iletir. Kamera/mikrofon için portal **HTTPS** ile açılmalıdır. İç ağ dışından (mobil veri) katılım olacaksa `.env` → `ICE_SERVERS` ile TURN sunucusu tanımlanır. Ayrıntı: [moduller/mesajlasma-toplanti.md](moduller/mesajlasma-toplanti.md).

## 7. Güncelleme prosedürü
1. Yeni derlemeyi (`npm run build`) geliştirme PC'sinde al.
2. Sunucuda `nssm stop OzguvenisApi`, `api` ve `web` klasörlerini yedekle ve yenisiyle değiştir.
3. `npx prisma migrate deploy`, sonra `nssm start OzguvenisApi`.
4. `https://portal.sirketadi.com.tr/api/health` kontrol et.

## 8. Ortam değişkenleri: bildirim kanalları
`.env`'e eklenir. Boş bırakılan kanal Ayarlar → Bildirim kurallarında "yapılandırılmamış" görünür ve o kanaldan gönderim atlanır (uygulama içi bildirim her zaman çalışır).

| Değişken | Açıklama |
|---|---|
| `PORTAL_URL` | Dışarıdan erişilen adres; e-postadaki bağlantılar için (ör. `https://portal.sirketadi.com.tr`) |
| `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE`, `FCM_WEB_*` | Firebase Cloud Messaging (web, Android, iOS). Bkz. moduller/bildirim-mobil.md |
| `FCM_PROJECT_ID` | Firebase proje kimliği (Android/iOS push) |
| `FCM_SERVICE_ACCOUNT_FILE` | Firebase hizmet hesabı JSON dosyasının yolu (ör. `C:\Apps\Ozguvenis\secrets\fcm.json`; yalnızca hizmet hesabı okuyabilsin, repoya koymayın) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | E-posta kanalı. 587 + `SMTP_SECURE=false` (STARTTLS) veya 465 + `true`. Örnek: `MAIL_FROM="Özgüveniş Portal <portal@sirketadi.com.tr>"` |
| `STORAGE_DIR` | Yüklenen dosyaların klasörü (varsayılan `api\uploads`); yedeğe dahildir |
| `CORS_ORIGIN` | Virgüllü. Mobil uygulama için `https://localhost,capacitor://localhost` ekleyin |

Tarayıcı bildirimleri (FCM) yalnızca HTTPS'te (veya `localhost`'ta) çalışır. iPhone'da tarayıcıdan Web Push için portal "Ana Ekrana Ekle" ile kurulmalıdır (iOS 16.4+); mobil uygulama FCM kullanır. Güvenlik: sunucu yalnızca bilinen tarayıcı push servislerine (Google, Mozilla, Microsoft, Apple) istek atar.

## 9. Mobil uygulama (Android / iOS)
Ayrıntı: [moduller/bildirim-mobil.md](moduller/bildirim-mobil.md). Özet:
1. `apps/web/.env.mobile.example` → `.env.mobile`, `VITE_API_URL` = portalın dış adresi.
2. Android: `apps/web/android` projesi repodadır. `npm run cap:android -w apps/web` (Android Studio açılır) → Build → Generate Signed App Bundle. İmza anahtarını (`.jks`) repoya koymayın, ayrıca yedekleyin.
3. iOS: macOS + Xcode gerekir. macOS'ta bir kez `npx cap add ios`, sonra `npm run cap:ios -w apps/web`.
4. Push: Firebase'de Android uygulaması (`tr.com.ozguvenis.portal`) ekleyip `google-services.json`'ı `apps/web/android/app/` altına koyun; iOS için Firebase'e APNs anahtarı (.p8) yükleyin, Xcode'da Push Notifications yeteneğini açın.
5. API `.env`'de `CORS_ORIGIN`'e mobil kökenleri ekleyin (Bölüm 8).
