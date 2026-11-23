# Özgüveniş Portal – Mağaza yayını (Google Play + Apple App Store, özel dağıtım)

Uygulama kimliği (her iki mağazada): **`tr.com.ozguvenis.portal`** — yayından sonra değiştirilemez.
Uygulama, portala **https://evoflow.ozguvenis.com.tr** adresinden (Cloudflare Tunnel, normal TLS) bağlanır.
Mağaza politikaları sık değişir: “kontrol edin” yazan yerlerde güncel konsol ekranına/belgeye bakın.

---

## 0. Ön hazırlık (bir kez)

1. **Sunucu tarafı** (API):
   - `CORS_ORIGIN` içine `https://localhost` (Android) ve `capacitor://localhost` (iOS) eklenmeli.
   - Dış ağdan/mobil veriden arama için TURN sunucusu gerekir (`ICE_SERVERS`); yalnızca STUN ile bazı ağlarda arama bağlanmaz.
   - `https://evoflow.ozguvenis.com.tr/gizlilik.html` açılıyor olmalı (bkz. §5).
2. **`apps/web/.env.mobile`** (gitignore'da; örnek: `.env.mobile.example`):
   ```
   VITE_API_URL=https://evoflow.ozguvenis.com.tr
   VITE_NATIVE_PUSH=0      # Firebase dosyaları eklenince 1
   ```
3. **Firebase** (anlık bildirim; proje zaten var: sunucudaki hizmet hesabı dosyasının projesi):
   - Firebase konsolu → Proje ayarları → *Uygulama ekle* → **Android**, paket adı `tr.com.ozguvenis.portal` → `google-services.json` indir → `apps/web/android/app/google-services.json`.
   - *Uygulama ekle* → **iOS**, Bundle ID `tr.com.ozguvenis.portal` → `GoogleService-Info.plist` indir.
     Mac olmadığı için bu dosya Codemagic'e base64 değişken olarak girilir (§3.4). Depoya EKLEMEYİN (gitignore'da).
   - iOS için **APNs anahtarı**: developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → “+” →
     *Apple Push Notifications service (APNs)* işaretle → indir (`AuthKey_XXXX.p8`, **yalnızca bir kez indirilebilir**, yedekleyin).
     Firebase → Proje ayarları → **Cloud Messaging** → Apple uygulaması → *APNs kimlik doğrulama anahtarı* → .p8 dosyası + Key ID + Team ID.
   - İki dosya da eklendikten sonra `VITE_NATIVE_PUSH=1` yapılır (yoksa bildirim açılırken uygulama çöker).
4. **Demo hesap** (iki mağazanın incelemecileri için): portalda gerçek müşteri/ERP verisi görmeyen, örnek görev/mesaj içeren
   bir kullanıcı açın (ör. `inceleme@ozguvenis.com.tr`). Parolayı yalnızca konsoldaki inceleme bilgisine yazın.
   İncelemeciler giriş yapamazsa uygulama reddedilir; hesabın yayın sürecinde açık kalması gerekir.

---

## 1. Android – Google Play

### 1.1 Yükleme anahtarı (bir kez)
```powershell
powershell -ExecutionPolicy Bypass -File deploy\mobile\android-keystore-olustur.ps1
```
- `apps/web/android/ozguvenis-upload.jks` ve `apps/web/android/keystore.properties` oluşur (ikisi de gitignore'da).
- **Bu iki dosyayı hemen yedekleyin** (parola kasası / şifreli harici disk). Play App Signing açık olduğu için kaybolursa
  Play Console → *Uygulama bütünlüğü* üzerinden yükleme anahtarı sıfırlama istenebilir, ama süreç günler sürer.

### 1.2 AAB üretme (Windows, bu bilgisayar)
```powershell
powershell -ExecutionPolicy Bypass -File deploy\mobile\android-release.ps1 -VersionCode 1 -VersionName 1.0.0
```
Çıktı: `deploy/mobile/cikti/ozguvenis-portal-<sürüm>-<kod>.aab`. Betik sonunda web sürümünü (`dist`) yeniden derler.
Alternatif: Codemagic `android-release` iş akışı (§3).

### 1.3 Play Console'da uygulama
1. play.google.com/console → **Uygulama oluştur**: ad “Özgüveniş”, dil Türkçe, *Uygulama*, *Ücretsiz*.
2. **Dağıtım seçimi** (özel kullanım için üç yol, ihtiyacınıza göre):
   - **(a) Yönetilen Google Play – özel uygulama (önerilen, kurumsal):** Yalnızca şirketinizin yönetilen Google Play
     kuruluşundaki cihazlara görünür, herkese açık listelenmez. Ön koşul: Android Enterprise / bir EMM (ör. Google Endpoint
     Management, Intune) ile cihaz yönetimi. Play Console → *Gelişmiş ayarlar* → **Yönetilen Google Play** sekmesinden
     kuruluş kimliğinizi ekleyip uygulamayı “özel” yapın. **Kontrol edin:** özel olarak işaretlenen uygulama sonradan herkese
     açılamaz; özel uygulamalar için inceleme genelde daha hafiftir ama politika kuralları yine geçerlidir.
   - **(b) Kapalı test kanalı:** *Test → Kapalı test* → bir kanal oluştur → test kullanıcıları için e-posta listesi veya
     Google Grubu. Kullanıcılar katılım bağlantısıyla yükler. EMM gerekmez. **Kontrol edin:** 2023 sonrası açılan *kişisel*
     geliştirici hesaplarında üretime çıkmadan önce belirli sayıda testçiyle belirli gün kapalı test şartı vardır;
     *kuruluş* hesaplarında bu şart yoktur.
   - **(c) Dahili test:** En hızlı yol (incelemesiz/çok kısa), en fazla 100 testçi. İlk deneme için idealdir.
3. **Uygulama bütünlüğü → Play App Signing:** varsayılan olarak Google'ın yönettiği imzayı kabul edin. Sizin anahtarınız
   yalnızca *yükleme anahtarı* olur.
4. **Yeni sürüm:** seçtiğiniz kanal → *Yeni sürüm oluştur* → AAB'yi yükleyin → sürüm notu → incelemeye gönder.
   (İlk AAB elle yüklenmelidir; sonrasında Codemagic API ile yükleyebilir.)
5. **Uygulama içeriği** (Politika → Uygulama içeriği) — hepsi doldurulmadan yayın açılmaz:
   - **Gizlilik politikası:** `https://evoflow.ozguvenis.com.tr/gizlilik.html` (önce hukuk incelemesi, §5).
   - **Uygulama erişimi:** “Tüm işlevler kısıtlı” → demo hesap kullanıcı adı/parola + kısa açıklama
     (“Şirket içi uygulamadır; hesaplar yönetici tarafından açılır”).
   - **Reklamlar:** Yok.
   - **İçerik derecelendirmesi** anketi (iş/üretkenlik uygulaması).
   - **Hedef kitle:** 18+ (çocuklara yönelik değil).
   - **Veri güvenliği formu** (kodda doğrulanan gerçek durum; hukukla birlikte gözden geçirin):
     | Veri türü | Toplanıyor | Amaç | Not |
     |---|---|---|---|
     | Ad, e-posta, telefon, kullanıcı kimliği | Evet | Uygulama işlevi, hesap yönetimi | Zorunlu (hesap) |
     | Mesajlar (uygulama içi) | Evet | Uygulama işlevi | |
     | Fotoğraflar / dosyalar | Evet | Uygulama işlevi | Kullanıcı seçtiğinde |
     | Ses/görüntü (arama) | **Hayır** (cihazlar arası WebRTC, sunucu kaydetmez) | | Kontrol edin: “işleniyor ama toplanmıyor” |
     | Takvim | Hayır (yalnızca cihazda yazılır, sunucuya gitmez) | | |
     | Cihaz kimliği (push jetonu) | Evet | Bildirimler | |
     | Konum, rehber, reklam kimliği | Hayır | | |
     - Aktarım sırasında şifreleme: **Evet** (HTTPS).  Veri silme talebi: **Evet** (yönetici/KVKK kanalı).
   - **Hassas izinler:** kamera/mikrofon/takvim gerekçeleri sorulursa: arama, fiş fotoğrafı, cihaz takvimine yazma.
6. **Mağaza girişi:** kısa/uzun açıklama, 512×512 ikon (`apps/web/public/icons/icon-512.png`), 1024×500 öne çıkan grafik,
   en az 2 telefon ekran görüntüsü. Özel/kapalı dağıtımda da istenir.

---

## 2. iOS – Apple App Store (Mac olmadan)

### 2.1 Apple Developer (developer.apple.com)
1. **Identifiers → “+” → App IDs → App**: Bundle ID *Explicit* `tr.com.ozguvenis.portal`, açıklama “Ozguvenis Portal”.
   Capabilities: **Push Notifications** işaretli. (Codemagic profili bu App ID'den üretir; push yeteneği yoksa imza hatası alınır.)
2. **APNs anahtarı** → Firebase'e yükleme: §0.3.
3. **App Store Connect API anahtarı** (Codemagic için): appstoreconnect.apple.com → *Kullanıcılar ve Erişim* →
   **Entegrasyonlar → App Store Connect API** → anahtar oluştur, rol **App Manager** (veya Admin). İndir (`AuthKey_XXXX.p8`,
   tek sefer), **Issuer ID** ve **Key ID**'yi not edin. .p8 dosyasını depoya koymayın (gitignore'da `*.p8`).

### 2.2 App Store Connect uygulama kaydı
1. *Uygulamalar → “+” → Yeni Uygulama*: platform iOS, ad “Özgüveniş” (mağazada benzersiz olmalı; doluysa
   “Özgüveniş Portal”), dil Türkçe, Bundle ID `tr.com.ozguvenis.portal`, SKU `ozguvenis-portal`.
2. *Genel Bilgiler → Apple ID* (sayı) → Codemagic `APP_STORE_APPLE_ID` değişkeni.
3. **Uygulama Gizliliği:** Gizlilik politikası URL'si `https://evoflow.ozguvenis.com.tr/gizlilik.html`; veri türleri
   yukarıdaki Play tablosuyla tutarlı doldurulur (“takip için kullanılıyor mu”: **Hayır**).
4. **İhracat uyumu:** `Info.plist`'te `ITSAppUsesNonExemptEncryption = false` (yalnızca işletim sisteminin standart
   şifrelemesi: HTTPS, WebRTC). Her yüklemede soru sorulmaz. Kontrol edin: şirket ek bir şifreleme eklerse değiştirin.

### 2.3 Özel dağıtım yolu (biri seçilir)
- **(a) Listelenmemiş uygulama (Unlisted App Distribution):** Uygulama App Store'da aranınca çıkmaz, yalnızca doğrudan
  bağlantıyla yüklenir; herhangi bir Apple Kimliği kurabilir (giriş zaten portal hesabı ister).
  1. Uygulama normal App Store incelemesinden geçecek şekilde hazırlanır (demo hesap şart).
  2. Apple'ın **“Unlisted App Distribution” talep formu** doldurulur (developer.apple.com → Support/Contact →
     “Unlisted app distribution request”; bağlantı yeri değişebilir, kontrol edin). App Store Connect'teki uygulamanın
     Apple ID'si ve kullanım amacı (“yalnızca şirket çalışanları için iş uygulaması”) yazılır.
  3. Onaylanınca *Fiyatlandırma ve Kullanılabilirlik* bölümünde dağıtım yöntemi **Listelenmemiş** olarak görünür; sürüm
     incelemeye gönderilir ve onaydan sonra size özel bağlantı verilir. Kontrol edin: onay öncesi/sonrası sıralama.
- **(b) Apple Business Manager – Özel (custom) uygulama:** Yalnızca şirketinizin ABM hesabına dağıtılır, cihazlara
  MDM ile veya *Uygulamalar ve Kitaplar* üzerinden kod ile verilir. Ön koşul: şirketin **Apple Business Manager** hesabı
  (D-U-N-S numarası gerekir). App Store Connect → *Fiyatlandırma ve Kullanılabilirlik* → **Özel olarak iş/eğitim için**
  → kuruluşun ABM Organizasyon ID'si eklenir. Kontrol edin: bir sürüm özel dağıtımla yayınlandıktan sonra herkese
  açık yapılamaz.
- Öneri: MDM yoksa **(a) Listelenmemiş**, MDM/ABM varsa **(b)**.

### 2.4 Codemagic (bulutta derleme)
1. codemagic.io → GitHub/GitLab/Bitbucket deposunu bağlayın (depo bir uzak sunucuda olmalı). `codemagic.yaml` kökte hazır.
2. **Teams → Integrations → Developer Portal → Connect:** App Store Connect API anahtarı (Issuer ID, Key ID, .p8).
   Entegrasyona verdiğiniz ad `codemagic.yaml` içindeki `OZGUVENIS_ASC` ile aynı olmalı (farklıysa yaml'ı düzeltin).
3. **Code signing identities → iOS certificates:** “Generate certificate” ile Apple Distribution sertifikası oluşturun
   (veya Codemagic'in otomatik oluşturmasına izin verin). Profiller derleme sırasında `ios_signing` ayarıyla otomatik alınır.
4. **Environment variables** (Application → Environment variables):
   - Grup `ozguvenis_mobil`: `VITE_API_URL=https://evoflow.ozguvenis.com.tr`, `VITE_NATIVE_PUSH=1`,
     `GOOGLE_SERVICE_INFO_PLIST` = plist'in base64'ü (**Secret**). Windows'ta base64 almak için:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\yol\GoogleService-Info.plist")) | Set-Clipboard
     ```
     Android için aynı şekilde `GOOGLE_SERVICES_JSON` (google-services.json'ın base64'ü).
   - Grup `app_store`: `APP_STORE_APPLE_ID` (sayı), isteğe bağlı `APP_VERSION` (ör. `1.0.1`).
   - Grup `google_play` (Android Codemagic ile yüklenecekse): `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` = Play Console API
     hizmet hesabı JSON'u (Google Cloud'da hizmet hesabı → Play Console *Kullanıcılar ve izinler*'de yetki verin; kontrol edin).
   - Android imzası: *Code signing identities → Android keystores* → `ozguvenis-upload.jks` yükle, referans adı
     `ozguvenis_upload`, parola/alias `keystore.properties`'teki değerler.
5. Derlemeyi başlatın: Codemagic arayüzünden *Start new build* → `ios-release`, ya da `mobil-v1.0.0` gibi bir etiket
   (tag) gönderin (her iki iş akışı `mobil-v*` etiketleriyle tetiklenir).
6. Başarılı derleme IPA'yı App Store Connect'e yükler ve **TestFlight**'a gönderir (işlenmesi 10–30 dk).

### 2.5 TestFlight ve inceleme
1. App Store Connect → TestFlight → *Dahili test*: ekip üyelerini ekleyin, iPhone'da TestFlight uygulamasıyla kurun.
   Push, arama (kamera/mikrofon), takvim ve dosya yüklemeyi gerçek cihazda deneyin.
2. *App Store* sekmesi → sürüm: ekran görüntüleri (6.7"/6.9" iPhone zorunlu; iPad desteği açık olduğu için iPad
   ekran görüntüsü de istenir — kontrol edin; iPad istemiyorsanız `TARGETED_DEVICE_FAMILY` = 1 yapılabilir),
   açıklama, anahtar kelimeler, destek URL'si, gizlilik URL'si, derlemeyi seçin.
3. **İnceleme bilgileri:** “Oturum açma gerekli” → demo hesap; not:
   > Bu uygulama yalnızca Özgüveniş çalışanları için şirket içi iş uygulamasıdır (görevler, mesajlaşma, toplantı/arama,
   > masraf onayı). Hesaplar şirket yöneticisi tarafından açılır; inceleme için demo hesap verilmiştir.
   > Kamera/mikrofon: sesli-görüntülü arama ve fiş fotoğrafı. Takvim: kullanıcı açarsa portal takvimini cihazdaki ayrı
   > “Özgüveniş” takvimine yazar.
4. Dikkat: Apple *4.2 Minimum işlevsellik* (yalnızca web sitesini saran uygulama) gerekçesiyle ret verebilir. Yanıtta
   yerel özellikleri vurgulayın: anlık bildirim, cihaz takvimi eşitleme, kamera/mikrofon ile arama, Android geri tuşu vb.
   Listelenmemiş/ABM dağıtımında da inceleme yapılır.

---

## 3. Sürüm numaraları

| | Kullanıcıya görünen | Her yüklemede artmalı |
|---|---|---|
| Android | `versionName` (build.gradle) | `versionCode` (tam sayı) |
| iOS | `MARKETING_VERSION` (project.pbxproj) | `CURRENT_PROJECT_VERSION` (derleme no) |

- Yerel Android: `android-release.ps1 -VersionCode <n+1> -VersionName 1.0.1`, ardından build.gradle değişikliğini commit edin.
- Codemagic: derleme numaraları mağazadaki son numara + 1 olarak otomatik yazılır; görünen sürüm için `APP_VERSION`
  değişkenini güncelleyin (ya da build.gradle / pbxproj'u elle değiştirip commit edin).
- Web tarafındaki değişiklikler (`apps/web/src`) uygulamaya gömülü olduğu için mobil kullanıcıya ancak yeni mağaza
  sürümüyle ulaşır. API ile uyumsuz değişikliklerde eski uygulama sürümlerini düşünün.

---

## 4. Sizin sağlamanız gerekenler (kontrol listesi)

- [ ] `ozguvenis-upload.jks` + `keystore.properties` → **yedeklendi** (2 ayrı güvenli yer)
- [ ] Firebase `google-services.json` (Android) ve `GoogleService-Info.plist` (iOS)
- [ ] APNs anahtarı (.p8) → Firebase'e yüklendi, dosya yedeklendi
- [ ] App Store Connect API anahtarı (.p8 + Issuer ID + Key ID) → Codemagic'e girildi
- [ ] App ID'de Push Notifications yeteneği açık
- [ ] Demo inceleme hesabı (gerçek veri görmeyen)
- [ ] Gizlilik bildirimi hukuk/KVKK incelemesinden geçti, taslak uyarısı kaldırıldı, yayında
- [ ] API: `CORS_ORIGIN` mobil kökenleri, TURN sunucusu
- [ ] Mağaza görselleri: ekran görüntüleri, Play öne çıkan grafik (1024×500)
- [ ] Dağıtım yolu kararı: Play (yönetilen özel / kapalı / dahili), Apple (listelenmemiş / ABM)

## 5. Gizlilik sayfası

`apps/web/public/gizlilik.html` web derlemesiyle `https://evoflow.ozguvenis.com.tr/gizlilik.html` adresine çıkar.
**TASLAK**tır: sarı alanlar (şirket unvanı, başvuru kanalı, saklama süreleri, hukuki dayanaklar, yurt dışı aktarım) hukuk
birimi tarafından doldurulup sayfadaki taslak kutusu kaldırılmadan mağazalara URL olarak verilmemelidir.

## 6. Dosyalar

| Dosya | Görev |
|---|---|
| `deploy/mobile/android-keystore-olustur.ps1` | Yükleme anahtarı + keystore.properties |
| `deploy/mobile/android-release.ps1` | İmzalı AAB (yerel, Türkçe yol için subst ile) |
| `deploy/mobile/ios-ikon-uret.mjs` | iOS ikon (1024, alfasız) ve açılış ekranı |
| `codemagic.yaml` | Bulutta iOS (TestFlight) ve Android (Play iç test) derlemesi |
| `apps/web/ios/` | Capacitor iOS projesi (Swift Package Manager; CocoaPods gerekmez) |
| `apps/web/ios/App/App/Info.plist` | İzin açıklamaları (Türkçe), arka plan bildirimi |
| `apps/web/ios/App/App/App*.entitlements` | Push (aps-environment) – Debug: development, Release: production |
