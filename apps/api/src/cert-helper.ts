import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';

/**
 * İç ağ kurulumu: portal şirket içi kök sertifikayla imzalı HTTPS kullanır. Cihaz bu kökü tanımıyorsa
 * tarayıcı uyarı verir, kamera/mikrofon/bildirim çalışmaz. Bu küçük HTTP sunucusu (varsayılan 80) her cihaza
 * kök sertifikayı ve platforma göre yükleme adımlarını verir; sertifika yüklüyse doğrudan portala yönlendirir.
 * Yalnızca bu sayfayı, herkese açık kök sertifikayı ve (varsa, ANDROID_APK_FILE) Android uygulamasını sunar; gizli anahtar sunulmaz.
 */
const apkFile = () => process.env.ANDROID_APK_FILE ?? '';
export function startCertificateHelper(port: number, caFile: string, httpsPort: number) {
  const cer = readFileSync(caFile);
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
    const portal = `https://${host}${httpsPort === 443 ? '' : `:${httpsPort}`}/`;
    if (req.url?.startsWith('/ozguvenis-kok-sertifika.cer')) {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="ozguvenis-kok-sertifika.cer"',
        'Content-Length': cer.length,
      });
      res.end(cer);
      return;
    }
    if (req.url?.startsWith('/ozguvenis-portal.apk') && apkFile() && existsSync(apkFile())) {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="ozguvenis-portal.apk"',
        'Content-Length': statSync(apkFile()).size,
        'Cache-Control': 'no-cache',
      });
      createReadStream(apkFile()).pipe(res);
      return;
    }
    if (req.url !== '/' && !req.url?.startsWith('/?')) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(page(portal));
  });
  server.on('error', (e) => console.error(`Sertifika sayfası ${port} portunda açılamadı:`, e.message));
  server.listen(port, '0.0.0.0', () => console.log(`Sertifika yükleme sayfası: http://<bu-bilgisayar>${port === 80 ? '' : `:${port}`}/`));
}

function page(portal: string) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Özgüveniş Portal · Bağlantı kurulumu</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--text:#1d2330;--muted:#5b6474;--accent:#2f6fed;--ok:#14804a;--line:#e3e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--card:#1d222b;--text:#eef1f6;--muted:#9aa3b2;--accent:#5b8cff;--ok:#34d399;--line:#2a303c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:28px 16px 48px}h1{font-size:24px;margin:0 0 6px}p{margin:0 0 12px}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:16px 0}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px;margin:4px 8px 4px 0}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
#ok{display:none;border-color:var(--ok)}#ok b{color:var(--ok)}
details{border-top:1px solid var(--line);padding:10px 0}details:first-of-type{border-top:0}summary{cursor:pointer;font-weight:600}
ol{margin:8px 0 4px;padding-left:22px}li{margin:4px 0}code{background:var(--bg);padding:1px 6px;border-radius:6px}
</style></head><body><main>
<h1>Özgüveniş Portal</h1>
<p class="muted">Portal şirket içi güvenli bağlantı (HTTPS) kullanır. Her cihazda <b>bir kez</b> şirket sertifikasını yüklemeniz gerekir; sonra kamera, mikrofon ve bildirimler çalışır.</p>
<div class="card" id="ok"><p><b>✓ Bu cihazda sertifika yüklü.</b></p><a class="btn" href="${portal}">Portala git</a></div>
<div class="card" id="steps">
<a class="btn" href="/ozguvenis-kok-sertifika.cer">1 · Sertifikayı indir</a>
<a class="btn ghost" href="${portal}">2 · Yükledikten sonra portala git</a>
<details open id="win"><summary>Windows</summary><ol>
<li>İndirilen <code>ozguvenis-kok-sertifika.cer</code> dosyasını açın → <b>Sertifika Yükle</b>.</li>
<li><b>Geçerli Kullanıcı</b> → İleri → <b>Tüm sertifikaları aşağıdaki depolama alanına yerleştir</b> → Gözat → <b>Güvenilen Kök Sertifika Yetkilileri</b>.</li>
<li>İleri → Son → güvenlik uyarısına <b>Evet</b>. Tarayıcıyı kapatıp açın.</li></ol></details>
<details id="android"><summary>Android</summary><ol>
<li>Dosyayı indirin.</li>
<li><b>Ayarlar → Güvenlik → Diğer güvenlik ayarları → Şifreleme ve kimlik bilgileri → Sertifika yükle → CA sertifikası</b> (marka/sürüme göre ad değişebilir; Ayarlar'da “sertifika” diye arayın).</li>
<li>Uyarıyı onaylayıp indirilen dosyayı seçin. Chrome'u kapatıp açın.</li></ol>
${apkFile() && existsSync(apkFile()) ? `<p><b>Android uygulaması (deneme):</b> <a href="/ozguvenis-portal.apk">ozguvenis-portal.apk indir</a> → dosyayı açın,
“bilinmeyen kaynaklardan yükleme” iznini Chrome için verin → Yükle. Uygulama sertifikayı kendi içinde taşır; bu adım gerekmez.</p>` : ''}</details>
<details id="ios"><summary>iPhone / iPad</summary><ol>
<li>Bu sayfayı <b>Safari</b>'de açıp dosyayı indirin → “Profil indirildi”.</li>
<li><b>Ayarlar → Profil İndirildi → Yükle</b>.</li>
<li><b>Ayarlar → Genel → Hakkında → Sertifika Güven Ayarları</b> → “Özgüveniş Portal Kök Sertifika” için güveni <b>açın</b>.</li></ol></details>
<details id="mac"><summary>Mac</summary><ol>
<li>Dosyayı açın → Anahtar Zinciri Erişimi'nde <b>Sistem</b> zincirine ekleyin.</li>
<li>Sertifikaya çift tıklayın → <b>Güven → Bu sertifikayı kullanırken: Her Zaman Güven</b>.</li></ol></details>
</div>
<p class="muted">BT için: şirket bilgisayarlarına toplu dağıtım Grup İlkesi ile yapılabilir (Bilgisayar Yapılandırması → Windows Ayarları → Güvenlik Ayarları → Ortak Anahtar İlkeleri → Güvenilen Kök Sertifika Yetkilileri) veya yönetici komut isteminde: <code>certutil -addstore -f Root ozguvenis-kok-sertifika.cer</code></p>
</main>
<script>
// Uygun bölümü aç
var ua = navigator.userAgent, id = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : 'win';
document.querySelectorAll('details').forEach(function (d) { d.open = d.id === id; });
// Sertifika güvenilir mi: HTTPS adrese istek başarılıysa yüklüdür (güvenilmeyen sertifikada tarayıcı isteği reddeder).
fetch(${JSON.stringify(portal + 'api/health')}, { mode: 'no-cors', cache: 'no-store' }).then(function () {
  document.getElementById('ok').style.display = 'block';
}).catch(function () {});
</script></body></html>`;
}
