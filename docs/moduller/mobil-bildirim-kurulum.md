# Mobil uygulama (Capacitor): Firebase ve bildirim kurulum rehberi

Bu rehber `apps/web` içindeki Capacitor uygulamasının (Android + iOS) push bildirimi alabilmesi için **senin yapman gereken kayıtları** anlatır.
Sunucu tarafı hazır: API, FCM HTTP v1 ile bildirim gönderir, cihaz jetonlarını `POST /api/notifications/devices {platform, token}` ile kaydeder
(ayrıntı: [bildirim-mobil.md](bildirim-mobil.md)). Uygulamadaki kod (`apps/web/src/lib/push.ts`, `initNativeApp`) da hazır.
Eksik olan yalnızca mobil uygulamanın Firebase'e tanıtılması ve iOS'ta FCM bağlantısı.

Firebase projesi: **`ozguvenis-9958a`** (var olan; yeni proje açma).
Uygulama kimliği iki platformda da: **`portal.ozguvenis.com.tr`** (`capacitor.config.ts` ve App Store Connect kaydıyla aynı; Firebase'e bunu kaydet, sonra değiştirme).

> Eski `apps/mobile` (Flutter) denemesi artık kullanılmıyor; bu rehber onu kapsamaz.

---

## 1. Android

1. Firebase konsolu → **Proje ayarları** (dişli) → **Genel** → "Uygulamalarınız" → **Uygulama ekle → Android**.
   (Aynı kimlikle kayıtlı Android uygulaması varsa onu kullan, tekrar ekleme.)
2. **Android paket adı:** `portal.ozguvenis.com.tr`. Takma ad: `Özgüveniş`. SHA-1 şimdilik boş kalabilir.
3. **`google-services.json`** dosyasını indir.
4. Dosyayı şuraya koy: `apps/web/android/app/google-services.json`
5. Bana "Android dosyası koyuldu" de; derleyip denerim.

## 2. iOS

iOS için **ücretli Apple Developer hesabı** gerekir. Bildirim simülatörde çalışmaz, **gerçek iPhone** ister.

1. Firebase konsolu → Proje ayarları → Genel → **Uygulama ekle → iOS**.
2. **Apple paket kimliği (Bundle ID):** `portal.ozguvenis.com.tr`. Takma ad: `Özgüveniş`.
3. **`GoogleService-Info.plist`** dosyasını indir.
4. Dosyayı şuraya koy: `apps/web/ios/App/App/GoogleService-Info.plist`
   (Xcode'da `apps/web/ios/App/App.xcodeproj` açıp dosyayı **App** grubuna sürükleyebilirsin; koyduktan sonra bana söylersen ben de projeye eklerim.)

### 2a. APNs anahtarı (Apple → Firebase)

Firebase iPhone'lara Apple üzerinden bildirim yollar; bunun için Apple'dan anahtar alıp Firebase'e yüklemen gerekir.

1. [developer.apple.com](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Keys** → **+**.
2. Ad: `Ozguvenis Push`. **Apple Push Notifications service (APNs)** kutusunu işaretle → Register.
3. **`.p8` dosyasını indir** (bir kez indirilir, kaybetme). **Key ID**'yi ve sağ üstteki **Team ID**'yi not et.
4. Firebase → Proje ayarları → **Cloud Messaging** sekmesi → "Apple uygulaması yapılandırması" → **APNs kimlik doğrulama anahtarı → Yükle**:
   `.p8` dosyası + Key ID + Team ID.
5. Apple Developer → **Identifiers** → `portal.ozguvenis.com.tr` (yoksa oluştur) → **Push Notifications** yeteneğini işaretle.

### 2b. Xcode ayarları (bunları ben de yapabilirim)

`apps/web/ios/App/App.xcodeproj` → App hedefi → **Signing & Capabilities**:
- **Team:** kendi Apple Developer ekibin.
- **+ Capability → Push Notifications**
- **+ Capability → Background Modes → Remote notifications**

### 2c. iOS'ta FCM jetonu (benim yapacağım kod işi)

Capacitor'un push eklentisi iOS'ta varsayılan olarak **APNs jetonu** verir; sunucumuz ise **FCM jetonu** bekler.
Bu yüzden iOS projesine Firebase Messaging eklenip `AppDelegate`'te jeton FCM'e çevrilecek. Bunu `GoogleService-Info.plist` gelince ben yaparım.
(Bu adım yapılmazsa iPhone'da izin penceresi çıkar ama sunucu cihaza bildirim gönderemez.)

---

## 3. Sunucu (Windows sunucuda, sadece kontrol)

Bildirim sunucudan çıkıyor; `apps/api/.env` içinde şu ikisi **dolu olmalı**, boşsa hiçbir cihaza bildirim gitmez.

| `.env` | Değer |
|---|---|
| `FCM_PROJECT_ID` | `ozguvenis-9958a` |
| `FCM_SERVICE_ACCOUNT_FILE` | Hizmet hesabı JSON dosyasının yolu |

Hizmet hesabı dosyası: Firebase → Proje ayarları → **Hizmet hesapları** → **Yeni özel anahtar oluştur**.
Bu dosya bir sırdır: **repoya koyma**, sunucuda güvenli bir klasörde tut, yolunu `.env`'e yaz, API hizmetini yeniden başlat.

Kontrol: Ayarlar → Bildirimlerim → "Deneme gönder". Kanal sonucu `skipped` ise `.env` eksiktir.
(`FCM_WEB_*` değerleri yalnızca tarayıcı bildirimi içindir, mobil için gerekmez.)

---

## 4. Kontrol listesi

- [ ] `google-services.json` → `apps/web/android/app/` içine koyuldu
- [ ] `GoogleService-Info.plist` → `apps/web/ios/App/App/` içine koyuldu
- [ ] APNs `.p8` anahtarı Firebase'e yüklendi
- [ ] Apple Developer'da Push Notifications yeteneği açık
- [ ] Sunucuda `FCM_PROJECT_ID` ve `FCM_SERVICE_ACCOUNT_FILE` dolu, API yeniden başlatıldı
- [ ] Test için gerçek iPhone (USB ile bağlı, geliştirici modu açık) ve Android telefon/emülatör

**Dosyaların içeriğini bana yapıştırma**, yalnızca klasörüne koy ve haber ver; ben dosya yolundan okurum.
`.p8` anahtarını ve hizmet hesabı JSON'unu **asla** bana gönderme ve repoya koyma; bunlar yalnızca Firebase'e / sunucuya gider.

## 5. Dosyalar gelince benim yapacaklarım

1. Android: derlemek, cihazda bildirim izni ve jeton kaydını doğrulamak.
2. iOS: `GoogleService-Info.plist`'i projeye eklemek, Firebase Messaging'i ve `AppDelegate` jeton dönüşümünü kurmak, Push + Background Modes yeteneklerini açmak.
3. Deneme bildirimi, görev ataması, mesaj ve arama bildirimini uçtan uca denemek.

## Sık karşılaşılan sorunlar

| Belirti | Neden |
|---|---|
| Android'de jeton var ama bildirim gelmiyor | Sunucuda `FCM_SERVICE_ACCOUNT_FILE` boş/yanlış; Deneme gönder `skipped` döner |
| iPhone'da izin penceresi çıkıyor ama bildirim yok | APNs anahtarı Firebase'e yüklenmemiş ya da iOS'ta FCM jeton dönüşümü (2c) yapılmamış |
| iPhone'da hiç jeton alınmıyor | Simülatörde deniyorsun; gerçek cihaz gerekir. Ya da Push Notifications yeteneği eksik |
| `google-services.json` paket adı uyuşmuyor | Kimlik `portal.ozguvenis.com.tr` olmalı |
| İzin bir kez "İzin verme" denmiş | iOS: Ayarlar → Özgüveniş → Bildirimler'den aç |
| Cihaz sunucuya bağlanamıyor | Kök sertifika cihaza yüklenip güvenilmeli (iOS: Ayarlar → Genel → Hakkında → Sertifika Güven Ayarları) |
