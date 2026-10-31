# Bu bilgisayarı kalıcı portal sunucusu yapmak (iç ağ, şirket sertifikası)

Sonuç: portal iç ağdaki herkese **https://192.168.1.244** (Wi-Fi ağından **https://192.168.2.141**) adresinden açılır. Sesli/görüntülü arama, toplantı ve bildirimler, şirket kök sertifikasını yüklemiş tüm cihazlarda çalışır. Bilgisayar açılınca, kimse oturum açmasa bile portal kendiliğinden başlar.

```
Tarayıcı ──https:443──► API (Node, tek süreç): /api + arayüz (apps/web/dist) + WebRTC sinyali (socket.io)
Tarayıcı ──http:80────► Sertifika kurulum sayfası (kök sertifikayı indir + adımlar)
Tarayıcı ◄──görüntü/ses (WebRTC, P2P)──► Tarayıcı   (bu bilgisayardan geçmez)
```

## Sertifika

Alan adının DNS'i (`ozguvenis.com.tr`, dijitalreklamevi) bu kurulum için kullanılmaz; HTTPS **şirket içi kök sertifika** ile sağlanır.

| Dosya (`C:\OzguvenisPortal\certs`) | Ne | Gizli mi |
|---|---|---|
| `ozguvenis-kok-sertifika.cer` | Kök sertifika: cihazlara yüklenen | Hayır (herkese dağıtılır) |
| `kok-ozel-anahtar.pfx` | Kök sertifikanın gizli anahtarı (yeni sunucu sertifikası imzalamak için) | **Evet**: yedekleyin, paylaşmayın |
| `sunucu.pfx` | Portalın sunucu sertifikası (IP'ler: 192.168.1.244, 192.168.2.141; ad: DESKTOP-FPLQGC8) | **Evet** |
| `parola.txt` | İki `.pfx` dosyasının parolası (`apps/api/.env` → `HTTPS_PFX_PASSPHRASE`) | **Evet** |

- Kök sertifika 10 yıl, sunucu sertifikası 825 gün (**01.02.2029**) geçerlidir. `durum.ps1` kalan süreyi gösterir.
- Bilgisayarın IP adresi değişirse sertifika geçersiz olur: router'da `192.168.1.244` için **DHCP rezervasyonu** yapın.

## Cihazlara kök sertifikayı yükleme (her cihazda bir kez)

Kullanıcı tarayıcıda **http://192.168.1.244** adresini açar. Sayfa cihazına göre adımları gösterir ve sertifikayı indirtir. Yükleme tamamlanınca sayfa bunu algılar ve "Portala git" düğmesi çıkar.

- **Windows (toplu):** Etki alanı varsa Grup İlkesi → Bilgisayar Yapılandırması → Windows Ayarları → Güvenlik Ayarları → Ortak Anahtar İlkeleri → Güvenilen Kök Sertifika Yetkilileri → İçeri aktar. Tek bilgisayarda yönetici komut isteminde: `certutil -addstore -f Root ozguvenis-kok-sertifika.cer`
- **Android:** Ayarlar → Güvenlik → Şifreleme ve kimlik bilgileri → Sertifika yükle → CA sertifikası.
- **iPhone/iPad:** Safari ile indir → Ayarlar → Profil İndirildi → Yükle → Genel → Hakkında → Sertifika Güven Ayarları → güveni aç.
- Firefox kendi sertifika deposunu kullanır: Ayarlar → Gizlilik ve Güvenlik → Sertifikaları Göster → Yetkililer → İçe aktar.

## Kalıcı kurulum (bir kez, yönetici)

Başlat → "PowerShell" → sağ tık → **Yönetici olarak çalıştır**:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\ÜMİT\Desktop\Ozguvenis\Ozguvenis\deploy\bu-bilgisayar\kur.ps1"
```

Betiğin yaptıkları:
- Elle başlatılmış geliştirme ve üretim süreçlerini durdurur; eski Caddy ve LiveKit görevlerini kaldırır.
- Uygulamayı derler ve veritabanı migration'larını uygular.
- `OzguvenisPortal` başlangıç görevini kaydeder. Görev SYSTEM hesabıyla, `NODE_ENV=production` ile `apps/api/dist/main.js` çalıştırır; süreç çökerse 5 sn sonra yeniden başlar.
- Sertifika klasörünü yalnızca Yöneticiler ve SYSTEM'e açar.
- Güvenlik duvarında 80 ve 443 portlarını açar, prizdeyken uykuyu kapatır.

## Güncelleme (kod değişince)

Aynı `kur.ps1` betiğini tekrar çalıştırın: derler, migration'ları uygular, portalı yeniden başlatır.

## Durum ve sorun giderme

```powershell
powershell -ExecutionPolicy Bypass -File "...\deploy\bu-bilgisayar\durum.ps1"
```

| Belirti | Bakılacak yer |
|---|---|
| "Bağlantınız gizli değil" uyarısı | O cihazda kök sertifika yüklü değil → http://192.168.1.244 |
| Adres hiç açılmıyor | `durum.ps1` → 443 dinleniyor mu? Günlük: `C:\OzguvenisPortal\logs\portal.err.log` |
| Wi-Fi'deki cihazlar bağlanamıyor | 192.168.2.x ağından 192.168.1.244'e yönlendirme olmalı (router ayarı) |
| Arama bağlanıyor ama görüntü/ses gelmiyor | Cihazlar birbirine doğrudan ulaşamıyor (farklı ağ, mobil veri). `apps/api/.env` → `ICE_SERVERS` ile TURN sunucusu ekleyin |
| Tarayıcı bildirimi açılmıyor | Kök sertifika yüklü olmalı (service worker güvenilmeyen sertifikada çalışmaz) |

## Sunucu sertifikasını yenileme / IP değişikliği

Kök sertifika değişmediği sürece cihazlarda hiçbir şey yapılmaz. Yalnızca `sunucu.pfx` kök anahtarla yeniden imzalanır (yönetici PowerShell):

```powershell
$d = 'C:\OzguvenisPortal\certs'; $pass = (Get-Content "$d\parola.txt" -Raw).Trim(); $pw = ConvertTo-SecureString $pass -Force -AsPlainText
$ca = Import-PfxCertificate -FilePath "$d\kok-ozel-anahtar.pfx" -CertStoreLocation Cert:\CurrentUser\My -Password $pw -Exportable
$san = '2.5.29.17={text}IPAddress=192.168.1.244&IPAddress=192.168.2.141&IPAddress=127.0.0.1&DNS=localhost&DNS=DESKTOP-FPLQGC8'
$srv = New-SelfSignedCertificate -Subject 'CN=Ozguvenis Portal' -Signer $ca -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(825) -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1', '2.5.29.19={critical}{text}ca=0')
Export-PfxCertificate -Cert $srv -FilePath "$d\sunucu.pfx" -Password $pw -ChainOption BuildChain
Remove-Item "Cert:\CurrentUser\My\$($srv.Thumbprint)", "Cert:\CurrentUser\My\$($ca.Thumbprint)"
Stop-ScheduledTask OzguvenisPortal; Start-ScheduledTask OzguvenisPortal
```

Kaldırmak için: `kaldir.ps1` (yönetici). Veritabanı, dosyalar ve sertifikalar silinmez.

## Mobil uygulama

Android/iOS derlemesinde `apps/web/.env.mobile` dosyasına `VITE_API_URL=https://192.168.1.244` yazılır. Uygulamanın şirket kök sertifikasına güvenmesi ayrıca ayarlanmalıdır: Android'de ağ güvenliği yapılandırması, iOS'ta cihaza yüklenen profil.
