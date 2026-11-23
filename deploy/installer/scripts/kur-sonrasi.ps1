# EvoFlow kurulum sonrası adımları. Kurulum programı (setup.exe) dosyaları kopyaladıktan sonra yönetici olarak çağırır;
# elle de çalıştırılabilir (ör. onarım): powershell -ExecutionPolicy Bypass -File "<kurulum>\scripts\kur-sonrasi.ps1" -AppDir "<kurulum>"
#
#   1. %ProgramData%\EvoFlow altında config / uploads / logs klasörleri (gizli bilgiler yalnız yöneticiler + servis)
#   2. Yapılandırma: yeni kurulumda sihirbaz bilgilerinden, aktarımda eski apps\api\.env'den; güncellemede korunur
#   3. Veritabanı migration'ları (prisma migrate deploy), yeni kurulumda başlangıç verisi (seed)
#   4. Eski "copy-paste" kurulumun (Görev Zamanlayıcı OzguvenisPortal) kaldırılması
#   5. EvoFlow Windows servisi (yoksa kurulur), başlatma ve sağlık kontrolü
#   6. İsteğe bağlı: Cloudflare Tunnel servisi (token verildiyse)
#
# ParamsFile (JSON, kurulum sihirbazı yazar, kurulum bitince silinir):
#   mode: new | import | upgrade, dbServer, dbName, dbUser, dbPassword, adminEmail, adminPassword, publicUrl, importDir, tunnelToken

param(
  [Parameter(Mandatory)] [string]$AppDir,
  [string]$ParamsFile,
  [switch]$NoService   # yalnız test: servis kurmadan yapılandırma + migration
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ortak.ps1')
# Her hata kurulum günlüğüne de yazılır; kurulum programı çıkış kodunu görüp kullanıcıya günlüğün yerini gösterir.
trap { Write-Log "HATA: $($_.Exception.Message)"; exit 1 }

$AppDir = (Resolve-Path $AppDir).Path
$node = Join-Path $AppDir 'runtime\node.exe'
$api = Join-Path $AppDir 'api'
$p = if ($ParamsFile -and (Test-Path $ParamsFile)) { Get-Content $ParamsFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{ mode = 'upgrade' } }

foreach ($d in 'config', 'uploads', 'logs', 'yedek') { New-Item -ItemType Directory -Force (Join-Path $DataDir $d) | Out-Null }
Write-Log "Kurulum sonrası başladı (mod: $($p.mode), klasör: $AppDir)"

# --- 1. Klasör izinleri: config yalnız Yöneticiler + SYSTEM (servis hesabı aşağıda eklenir) ---
$cfgDir = Join-Path $DataDir 'config'
icacls $cfgDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null

# --- 2. Yapılandırma ---
$isNewConfig = -not (Test-Path $ConfigFile)
if ($isNewConfig) {
  if ($p.mode -eq 'import') {
    $oldEnv = Join-Path $p.importDir '.env'
    if (-not (Test-Path $oldEnv)) { throw "Aktarılacak yapılandırma bulunamadı: $oldEnv" }
    Copy-Item $oldEnv $ConfigFile
    Write-Log "Yapılandırma eski kurulumdan aktarıldı: $oldEnv"
    # Eski iç ağ HTTPS/sertifika ayarları: artık TLS'i Cloudflare verir, portal yalnız yerelde HTTP dinler.
    foreach ($k in 'HTTPS_PFX_FILE', 'HTTPS_PFX_PASSPHRASE', 'HTTPS_CA_CERT_FILE', 'HTTPS_PORT', 'HTTP_HELPER_PORT', 'ANDROID_APK_FILE', 'SHADOW_DATABASE_URL') {
      Disable-EnvKey $ConfigFile $k 'EvoFlow kurulumu: Cloudflare Tunnel ile gerekmez'
    }
    # Firebase hizmet hesabı dosyası göreli yoldaysa config klasörüne taşınır.
    $old = Read-EnvFile $ConfigFile
    if ($old['FCM_SERVICE_ACCOUNT_FILE']) {
      $src = $old['FCM_SERVICE_ACCOUNT_FILE']
      if (-not [IO.Path]::IsPathRooted($src)) { $src = Join-Path $p.importDir $src }
      if (Test-Path $src) {
        $dst = Join-Path $cfgDir (Split-Path $src -Leaf)
        Copy-Item $src $dst -Force
        Set-EnvValue $ConfigFile 'FCM_SERVICE_ACCOUNT_FILE' $dst
      } else { Write-Log "UYARI: Firebase hizmet hesabı dosyası bulunamadı: $src (bildirimler için config'e ekleyin)" }
    }
    # Yüklenmiş dosyalar (fişler, ekler, profil resimleri)
    $oldUploads = if ($old['STORAGE_DIR']) { $old['STORAGE_DIR'] } else { Join-Path $p.importDir 'uploads' }
    if (Test-Path $oldUploads) {
      robocopy $oldUploads (Join-Path $DataDir 'uploads') /E /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Yüklenmiş dosyalar kopyalanamadı (robocopy $LASTEXITCODE)" }
      Write-Log "Yüklenmiş dosyalar aktarıldı: $oldUploads"
    }
  } elseif ($p.mode -eq 'new') {
    # Prisma SQL Server bağlantı dizesinde özel karakterler { } ile sarılır; } iki kez yazılır.
    function Esc([string]$v) { '{' + $v.Replace('}', '}}') + '}' }
    $db = "sqlserver://$($p.dbServer);database=$(Esc $p.dbName);user=$(Esc $p.dbUser);password=$(Esc $p.dbPassword);trustServerCertificate=true;encrypt=true"
    $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    Write-Utf8NoBom $ConfigFile @"
# EvoFlow yapılandırması. Değiştirdikten sonra servisi yeniden başlatın: Restart-Service EvoFlow
# Tüm anahtarlar için bkz. kurulum klasöründeki OKUBENI.md

DATABASE_URL="$db"
JWT_SECRET=$([Convert]::ToBase64String($bytes))
JWT_EXPIRES_IN=12h

# Netsis ERP (salt okunur), Firebase bildirimleri, WhatsApp ve TURN sunucusu isteğe bağlıdır; OKUBENI.md'ye bakın.
"@
    Write-Log 'Yeni yapılandırma oluşturuldu'
  } else {
    throw "Yapılandırma dosyası yok ($ConfigFile). Kurulumu 'Yeni kurulum' veya 'Eski kurulumdan aktar' ile çalıştırın."
  }
}

# Kurulumun yönettiği anahtarlar (her kurulum/güncellemede güncel klasörlere göre yazılır).
$cfg = Read-EnvFile $ConfigFile
Set-EnvValue $ConfigFile 'NODE_ENV' 'production'
Set-EnvValue $ConfigFile 'HOST' '127.0.0.1'
if (-not $cfg['PORT']) { Set-EnvValue $ConfigFile 'PORT' '3000' }
Set-EnvValue $ConfigFile 'WEB_DIST_DIR' (Join-Path $AppDir 'web')
Set-EnvValue $ConfigFile 'STORAGE_DIR' (Join-Path $DataDir 'uploads')
$publicUrl = if ($p.publicUrl) { $p.publicUrl.TrimEnd('/') } elseif ($cfg['PUBLIC_URL']) { $cfg['PUBLIC_URL'] } else { 'https://evoflow.ozguvenis.com.tr' }
Set-EnvValue $ConfigFile 'PUBLIC_URL' $publicUrl
# Tarayıcı (yayın adresi) + mobil uygulama kökenleri (Android: https://localhost, iOS: capacitor://localhost)
$origins = New-Object 'Collections.Generic.List[string]'
foreach ($o in ("$($cfg['CORS_ORIGIN'])" -split ',')) { if ($o -and $o -notmatch '^https://192\.168\.|^https://10\.') { $origins.Add($o.Trim()) } }
foreach ($o in $publicUrl, 'https://localhost', 'capacitor://localhost') { if (-not $origins.Contains($o)) { $origins.Add($o) } }
Set-EnvValue $ConfigFile 'CORS_ORIGIN' ($origins -join ',')
$cfg = Read-EnvFile $ConfigFile
$port = [int]$cfg['PORT']

# --- 3. Veritabanı ---
Import-EnvToProcess $ConfigFile
Push-Location $api
try {
  # Harici komutların stderr çıktısı (uyarılar) hata sayılmasın; başarı çıkış koduna göre değerlendirilir.
  $ErrorActionPreference = 'Continue'
  Write-Log 'Veritabanı migration (prisma migrate deploy)'
  & $node 'node_modules\prisma\build\index.js' migrate deploy --schema 'prisma\schema.prisma' 2>&1 | ForEach-Object { Write-Log "  $_" }
  if ($LASTEXITCODE) { throw "Veritabanı migration başarısız (çıkış kodu $LASTEXITCODE). Bağlantı bilgilerini $ConfigFile içinde kontrol edin." }

  if ($p.mode -eq 'new' -and $isNewConfig) {
    Write-Log 'Başlangıç verisi (roller, yönetici, süreçler)'
    $env:SEED_ADMIN_EMAIL = $p.adminEmail
    $env:SEED_ADMIN_PASSWORD = $p.adminPassword
    try {
      & $node 'seed\prisma\seed.js' 2>&1 | ForEach-Object { Write-Log "  $_" }
      if ($LASTEXITCODE) { throw "Başlangıç verisi yüklenemedi (çıkış kodu $LASTEXITCODE)" }
    } finally { Remove-Item Env:SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
  }
} finally { Pop-Location }
# Bundan sonrası da harici araçlar (WinSW, sc.exe, cloudflared) çalıştırır; hatalar açık throw ile ele alınır.

if ($NoService) { Write-Log 'Servis adımı atlandı (-NoService)'; return }

# --- 4. Eski kurulum (Görev Zamanlayıcı + iç ağ HTTPS) kaldırılır ---
foreach ($t in 'OzguvenisPortal', 'OzguvenisPortal-API', 'OzguvenisPortal-Caddy', 'OzguvenisPortal-LiveKit') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $t -Confirm:$false
    Write-Log "Eski başlangıç görevi kaldırıldı: $t"
  }
}
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'OzguvenisPortal\\run-portal' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
foreach ($old in 443, 80) {
  Get-NetTCPConnection -LocalPort $old -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node' -and $proc.Path -notlike "$AppDir*") { Stop-Process -Id $proc.Id -Force; Write-Log "Eski portal süreci durduruldu (port $old)" }
  }
}
Get-NetFirewallRule -DisplayName 'Ozguvenis Portal*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
# Tunnel dışarıya giden bağlantı kurar; içeri açık port gerekmez.

# --- 5. Windows servisi ---
$svcExe = Join-Path $AppDir 'service\EvoFlow.exe'
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
  & $svcExe install | ForEach-Object { Write-Log "  $_" }
  if ($LASTEXITCODE) { throw "Servis kurulamadı (çıkış kodu $LASTEXITCODE)" }
  Write-Log 'EvoFlow servisi kuruldu'
}

# En az yetki: servis kendi sanal hesabıyla (NT SERVICE\EvoFlow) çalışır; yalnız kendi veri klasörlerine yazar.
$account = "NT SERVICE\$ServiceName"
sc.exe config $ServiceName obj= $account | Out-Null
$virtualOk = $LASTEXITCODE -eq 0
if ($virtualOk) {
  icacls $cfgDir /grant "${account}:(OI)(CI)RX" | Out-Null
  foreach ($d in 'uploads', 'logs') { icacls (Join-Path $DataDir $d) /grant "${account}:(OI)(CI)M" | Out-Null }
}

Start-Service $ServiceName
if (-not (Test-PortalHealth $port)) {
  if ($virtualOk) {
    # Sanal hesapla açılamadıysa (ör. SQL Server Windows kimlik doğrulaması kullanılıyorsa) SYSTEM ile denenir.
    Write-Log 'UYARI: Servis sanal hesapla yanıt vermedi; LocalSystem ile yeniden deneniyor'
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe config $ServiceName obj= LocalSystem | Out-Null
    Start-Service $ServiceName
  }
  if (-not (Test-PortalHealth $port)) { throw "Portal başlatıldı ama yanıt vermiyor. Günlükler: $LogDir" }
}
Write-Log "Portal çalışıyor: http://127.0.0.1:$port (yayın adresi: $publicUrl)"

# --- 6. Cloudflare Tunnel (isteğe bağlı) ---
if ($p.tunnelToken) {
  & (Join-Path $PSScriptRoot 'tunnel.ps1') -AppDir $AppDir -Token $p.tunnelToken
} elseif ((Get-Service cloudflared -ErrorAction SilentlyContinue).Status -eq 'Stopped') {
  # Güncellemede durdurulan tünel servisi yeniden başlatılır.
  Start-Service cloudflared -ErrorAction SilentlyContinue
}
Write-Log 'Kurulum sonrası tamamlandı'
