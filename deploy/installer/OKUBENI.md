# EvoFlow sunucu kurulumu

EvoFlow, tek bir kurulum programıyla (`EvoFlow-Setup-<sürüm>.exe`) Windows servisi olarak kurulur. Proje klasörünü kopyalamak, betik çalıştırmak, Node.js veya npm kurmak gerekmez.

```
İnternet ──https──► Cloudflare ──(Tunnel)──► cloudflared servisi ──http──► EvoFlow servisi (127.0.0.1:3000)
                                                                            ├─ /api      API
                                                                            ├─ /socket.io gerçek zamanlı bağlantılar
                                                                            └─ /         arayüz
```

- **EvoFlow** servisi (`EvoFlow Portal`): bilgisayar açılınca otomatik başlar, oturum açılması gerekmez. Çökerse kendiliğinden yeniden başlar. Kendi sanal hesabıyla (`NT SERVICE\EvoFlow`) çalışır.
- **cloudflared** servisi: Cloudflare Tunnel. Dışarıya giden bağlantı kurar; modemde port yönlendirme veya güvenlik duvarında açık port gerekmez.
- Portal yalnız bu bilgisayarın kendisinden (`127.0.0.1`) dinler; ağdaki diğer cihazlar da portala `https://evoflow.ozguvenis.com.tr` üzerinden girer.

## Klasörler

| Yer | İçerik |
|---|---|
| `C:\Program Files\EvoFlow` | Program dosyaları (güncellemede değişir; elle düzenlemeyin) |
| `C:\ProgramData\EvoFlow\config\evoflow.env` | Yapılandırma ve gizli bilgiler (yalnız Yöneticiler + servis okur) |
| `C:\ProgramData\EvoFlow\uploads` | Yüklenen dosyalar (fişler, ekler, profil resimleri) — **yedekleyin** |
| `C:\ProgramData\EvoFlow\logs` | `EvoFlow.out.log`, `EvoFlow.err.log`, `kurulum.log` |

Kaldırma (Ayarlar → Uygulamalar → EvoFlow) servisleri kaldırır; veritabanı ve `C:\ProgramData\EvoFlow` **silinmez**.

## Ön koşullar

- Windows 10/11 veya Windows Server 2019+ (64 bit), yönetici hesabı
- SQL Server (aynı bilgisayarda veya ağda) ve SQL kimlik doğrulamalı bir kullanıcı. Yeni kurulumda veritabanını önceden oluşturun ve kullanıcıya `db_owner` verin.
- Cloudflare hesabında `ozguvenis.com.tr` alanı ve bir tünel (aşağıya bakın)

## İlk kurulum

1. `EvoFlow-Setup-<sürüm>.exe` dosyasını sağ tıklayıp **Yönetici olarak çalıştır**.
2. **Kurulum türü:**
   - *Yeni kurulum*: SQL Server bilgileri ve ilk yönetici hesabı istenir; tablolar ve başlangıç verisi (roller, süreçler) oluşturulur.
   - *Eski kurulumdan aktar*: Bu bilgisayarda eski yöntemle (proje klasöründen `kur.ps1`) çalışan portal varsa seçin ve eski `apps\api` klasörünü gösterin. Ayarlar, Firebase dosyası ve yüklenen dosyalar taşınır, eski Görev Zamanlayıcı görevi ve 80/443 güvenlik duvarı kuralları kaldırılır. Veritabanı aynı kalır, yalnız yeni migration'lar uygulanır.
3. **Yayın:** adres `https://evoflow.ozguvenis.com.tr`. Tünel token'ınız varsa yapıştırın, yoksa boş bırakın (sonra eklenebilir).
4. Kurulum sonunda servis başlatılır ve sağlığı kontrol edilir. Hata olursa ayrıntı `C:\ProgramData\EvoFlow\logs\kurulum.log` içindedir; sorunu giderip kurulumu yeniden çalıştırmanız yeterlidir.

## Cloudflare Tunnel

Cloudflare panelinde: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**. Tünele bir *Public hostname* ekleyin:

| Alan | Değer |
|---|---|
| Subdomain / Domain | `evoflow` / `ozguvenis.com.tr` |
| Service | `HTTP` → `127.0.0.1:3000` |

WebSocket bağlantıları (sohbet, bildirim, arama sinyali) Cloudflare'de varsayılan olarak açıktır; kapatmayın.

Tüneli bu bilgisayara bağlamak için yönetici PowerShell'de:

```powershell
# Token ile (panelde "Install connector" adımında görünen uzun değer)
powershell -ExecutionPolicy Bypass -File "C:\Program Files\EvoFlow\scripts\tunnel.ps1" -Token "eyJh..."

# veya yerel yapılandırma dosyasıyla (config.yml + tünel kimlik .json dosyası)
powershell -ExecutionPolicy Bypass -File "C:\Program Files\EvoFlow\scripts\tunnel.ps1" -ConfigFile "C:\yol\config.yml"
```

`config.yml` içinde `ingress` kuralı `service: http://127.0.0.1:3000` olmalıdır.

## Yapılandırma (`evoflow.env`)

Değiştirdikten sonra: `Restart-Service EvoFlow` (yönetici PowerShell).

Kurulumun yönettiği anahtarlar her güncellemede yeniden yazılır: `NODE_ENV`, `HOST`, `WEB_DIST_DIR`, `STORAGE_DIR`, `PUBLIC_URL`, `CORS_ORIGIN` (yayın adresi ve mobil uygulama kökenleri eklenir; elle eklediğiniz kökenler korunur).

| Anahtar | Açıklama |
|---|---|
| `DATABASE_URL` | SQL Server bağlantısı (`sqlserver://sunucu:1433;database={Ad};user={kullanıcı};password={parola};trustServerCertificate=true;encrypt=true`) |
| `JWT_SECRET` | Oturum imzalama anahtarı (kurulumda rastgele üretilir; değiştirilirse herkes yeniden giriş yapar) |
| `PORT` | Yerel port (varsayılan 3000; değiştirirseniz tünel hedefini de değiştirin) |
| `NETSIS_DB_SERVER`, `NETSIS_DB_NAME`, `NETSIS_DB_USER`, `NETSIS_DB_PASSWORD` … | Netsis ERP (salt okunur). **Tercihen portaldan girin:** Ayarlar → Netsis → Bağlantı ayarları (ekrandan girilen değerler bunların yerine geçer). |
| `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_FILE`, `FCM_WEB_*` | Firebase bildirimleri. Hizmet hesabı JSON dosyasını `config` klasörüne koyup tam yolunu yazın. |
| `WHATSAPP_*` | WhatsApp Business bildirimleri. **Tercihen portaldan girin:** Ayarlar → WhatsApp → WhatsApp bağlantısı (ekrandan girilen değerler bunların yerine geçer). |
| `ICE_SERVERS` | Sesli/görüntülü arama için STUN/TURN listesi (JSON). **İnternet üzerinden, özellikle mobil veride aramalar için TURN sunucusu gerekir**; yalnız STUN ile bazı ağlarda bağlantı kurulamaz. Örnek: `[{"urls":"stun:stun.cloudflare.com:3478"},{"urls":"turn:turn.ornek.com:3478","username":"…","credential":"…"}]` |

## Güncelleme

Yeni `EvoFlow-Setup-<sürüm>.exe` dosyasını yönetici olarak çalıştırın. Sihirbaz soru sormaz: servisler durdurulur, dosyalar değiştirilir, veritabanı migration'ları uygulanır, servisler yeniden başlatılır. Yapılandırma ve yüklenen dosyalar korunur.

Önerilen: güncellemeden önce SQL Server veritabanının yedeğini alın.

## Durum ve sorun giderme

Başlat menüsü → **EvoFlow → EvoFlow durumu**: servisler, yerel ve yayın adresi sağlık kontrolü, son günlük satırları.

| Belirti | Bakılacak yer |
|---|---|
| Kurulum "tamamlanamadı" dedi | `logs\kurulum.log` — çoğunlukla veritabanı bağlantısı/yetkisi |
| Servis başlıyor ama kapanıyor | `logs\EvoFlow.err.log` |
| Yerel çalışıyor, adres açılmıyor | `cloudflared` servisi çalışıyor mu; Cloudflare panelinde tünel *Healthy* mi; hostname hedefi `http://127.0.0.1:3000` mi |
| Aramalar bazı ağlarda bağlanmıyor | `ICE_SERVERS` içinde TURN sunucusu tanımlı mı |

## Kurulum programını üretmek (geliştirici)

Proje kökünde: `powershell -ExecutionPolicy Bypass -File deploy\installer\build-installer.ps1 -Version 1.0.0`

Gerekenler: Node.js + npm, Inno Setup 6. İlk derlemede WinSW (servis sarmalayıcısı, GitHub sürümü v2.12.0) ve cloudflared (Cloudflare'in imzalı sürümü; imza doğrulanır) indirilip `deploy\installer\.cache` altına kaydedilir; SHA256 özetleri de kaydedilir ve sonraki derlemelerde karşılaştırılır.

Gömülü Node sürümü, derlemeyi yapan bilgisayardaki Node sürümüdür (`node -v`); LTS sürüm kullanın.
