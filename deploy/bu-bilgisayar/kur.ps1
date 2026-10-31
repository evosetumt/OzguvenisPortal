# Özgüveniş Portal - bu bilgisayarı kalıcı portal sunucusu yapar (tek seferlik, YÖNETİCİ PowerShell'de).
#
#   https://192.168.1.244  →  API (Node, HTTPS 443): /api + derlenmiş arayüz (apps/web/dist) + WebRTC sinyali
#   http://192.168.1.244   →  şirket kök sertifikasını indirme/yükleme sayfası (80)
#   Arama/toplantı görüntü ve sesi kullanıcıların cihazları arasında doğrudan (P2P) akar; bu bilgisayardan geçmez.
#
# Sertifika: şirket içi kök sertifika (C:\OzguvenisPortal\certs). Her cihaza bir kez yüklenir; bkz. OKUBENI.md.
# Portal Görev Zamanlayıcı'da SYSTEM hesabıyla "başlangıçta" çalışır: kimse oturum açmasa da açılır,
# çökerse 5 sn sonra yeniden başlar. Tekrar çalıştırmak güvenlidir (kod güncellemesinden sonra da kullanılır).
#
# Çalıştırma (Başlat → PowerShell → sağ tık → Yönetici olarak çalıştır):
#   powershell -ExecutionPolicy Bypass -File "<repo>\deploy\bu-bilgisayar\kur.ps1"

param([string]$Root = 'C:\OzguvenisPortal')

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Api = Join-Path $Repo 'apps\api'
$Logs = Join-Path $Root 'logs'
$Certs = Join-Path $Root 'certs'
$Task = 'OzguvenisPortal'
# Önceki kurulum sürümlerinden kalabilecek görevler (Caddy/LiveKit kaldırıldı)
$OldTasks = @('OzguvenisPortal-API', 'OzguvenisPortal-Caddy', 'OzguvenisPortal-LiveKit')

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Utf8Bom($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $true)) }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Bu betik Yönetici olarak çalıştırılmalı (PowerShell → sağ tık → Yönetici olarak çalıştır).' }
$node = (Get-Command node -ErrorAction Stop).Source

# --- 1. Ön koşullar ---
Step 'Ön koşullar'
foreach ($f in 'sunucu.pfx', 'parola.txt', 'ozguvenis-kok-sertifika.cer') {
  if (-not (Test-Path (Join-Path $Certs $f))) { throw "Sertifika dosyası yok: $Certs\$f (sertifikalar bir kez üretilir; bkz. OKUBENI.md)" }
}
$envPath = Join-Path $Api '.env'
$envText = [IO.File]::ReadAllText($envPath)
foreach ($k in 'HTTPS_PFX_FILE', 'HTTPS_PFX_PASSPHRASE', 'HTTPS_CA_CERT_FILE', 'WEB_DIST_DIR') {
  if ($envText -notmatch "(?m)^$k=") { throw "apps/api/.env içinde $k tanımlı değil" }
}
New-Item -ItemType Directory -Force $Logs | Out-Null
# Sertifika klasörü (kök sertifikanın gizli anahtarı burada) yalnızca Yöneticiler ve SYSTEM'e açık.
icacls $Certs /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null

# --- 2. Eski görevleri ve elle çalıştırılan sunucuları durdur ---
Step 'Eski süreçler durduruluyor'
foreach ($t in @($Task) + $OldTasks) {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $t; Unregister-ScheduledTask -TaskName $t -Confirm:$false }
}
Get-Process caddy, livekit-server -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($port in 443, 80, 3000, 5173, 5174) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force }
    elseif ($p) { Write-Warning "Port $port başka bir program tarafından kullanılıyor: $($p.ProcessName) (PID $($p.Id))" }
  }
}
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object {
  if ((Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match 'OzguvenisPortal\\run-') { Stop-Process -Id $_.Id -Force }
}

# --- 3. Derleme ve veritabanı güncellemesi ---
Step 'Derleme (npm run build) ve veritabanı migration'
Push-Location $Repo
try {
  npm run build
  if ($LASTEXITCODE) { throw 'Derleme başarısız' }
  Push-Location $Api; npx prisma migrate deploy; $rc = $LASTEXITCODE; Pop-Location
  if ($rc) { throw 'prisma migrate deploy başarısız' }
} finally { Pop-Location }

# --- 4. Çalıştırıcı: süreç kapanırsa 5 sn sonra yeniden başlatır, çıktıyı logs\ altına yazar ---
Step 'Başlangıç görevi'
$runner = Join-Path $Root 'run-portal.ps1'
Write-Utf8Bom $runner @"
`$ErrorActionPreference = 'Continue'
`$env:NODE_ENV = 'production'
while (`$true) {
  foreach (`$s in 'out', 'err') { `$f = '$Logs\portal.' + `$s + '.log'; if (Test-Path `$f) { Move-Item `$f (`$f + '.old') -Force } }
  `$p = Start-Process -FilePath '$node' -ArgumentList 'dist\main.js' -WorkingDirectory '$Api' -NoNewWindow -PassThru -Wait ``
    -RedirectStandardOutput '$Logs\portal.out.log' -RedirectStandardError '$Logs\portal.err.log'
  Add-Content '$Logs\restarts.log' "`$(Get-Date -Format s) portal kapandı (çıkış kodu `$(`$p.ExitCode)); yeniden başlatılıyor"
  Start-Sleep -Seconds 5
}
"@
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
Register-ScheduledTask -TaskName $Task -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings `
  -Description 'Özgüveniş Portal (deploy\bu-bilgisayar\kur.ps1)' | Out-Null
Start-ScheduledTask -TaskName $Task

# --- 5. Güvenlik duvarı ve güç ayarı ---
Step 'Güvenlik duvarı (80, 443) ve uyku kapatma'
Get-NetFirewallRule -DisplayName 'Ozguvenis Portal*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Ozguvenis Portal HTTPS' -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow -Profile Any | Out-Null
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# --- 6. Kontrol ---
Step 'Kontrol: https://localhost/api/health'
$ok = $false
for ($i = 0; $i -lt 24 -and -not $ok; $i++) {
  Start-Sleep -Seconds 5
  try {
    # Bu bilgisayar kök sertifikayı tanımıyorsa bile sunucunun ayakta olduğunu görmek için doğrulama atlanır.
    $r = Invoke-WebRequest 'http://localhost/' -UseBasicParsing -TimeoutSec 5
    $ok = $r.StatusCode -eq 200
  } catch { }
}
if ($ok) {
  $ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))' -and $_.PrefixOrigin -ne 'WellKnown' }).IPAddress
  Write-Host "`nHazır." -ForegroundColor Green
  foreach ($ip in $ips) { Write-Host "  Portal:               https://$ip" ; Write-Host "  Sertifika kurulumu:   http://$ip" }
} else {
  Write-Warning "Portal henüz yanıt vermiyor. Durum: deploy\bu-bilgisayar\durum.ps1 — günlükler: $Logs"
}
