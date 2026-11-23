# Cloudflare Tunnel'ı Windows servisi olarak kurar (cloudflared, kurulum klasöründe gelir). Yönetici olarak çalıştırın.
#
#   Token ile (Cloudflare panelinde oluşturulan tünel, önerilen):
#     powershell -ExecutionPolicy Bypass -File "<kurulum>\scripts\tunnel.ps1" -Token "<tünel token'ı>"
#   Yapılandırma dosyasıyla (yerel yönetilen tünel: config.yml + <tünel-id>.json):
#     powershell -ExecutionPolicy Bypass -File "<kurulum>\scripts\tunnel.ps1" -ConfigFile "C:\yol\config.yml"
#   Sunucuda zaten başka bir uygulamanın tüneli (cloudflared servisi) varsa betik ona DOKUNMAZ; evoflow adresini o tünele
#   Public hostname olarak ekleyin. Mevcut servisi bilerek değiştirmek için: -Replace
#   Kaldırma:
#     powershell -ExecutionPolicy Bypass -File "<kurulum>\scripts\tunnel.ps1" -Remove
#
# Tünelin yönlendirmesi (public hostname) evoflow.ozguvenis.com.tr → http://127.0.0.1:<PORT> (varsayılan 3000) olmalı.

param(
  [string]$AppDir = (Split-Path $PSScriptRoot -Parent),
  [string]$Token,
  [string]$ConfigFile,
  [switch]$Remove,
  [switch]$Replace   # mevcut cloudflared servisini kaldırıp bu token/yapılandırmayla yeniden kurar
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ortak.ps1')
$exe = Join-Path $AppDir 'cloudflared\cloudflared.exe'
if (-not (Test-Path $exe)) { throw "cloudflared bulunamadı: $exe" }

# cloudflared bilgi satırlarını (INF) stderr'e yazar; Windows PowerShell 5.1 'Stop' altında bunları hata sayıp betiği keser.
# Başarı yalnız çıkış koduna göre değerlendirilir.
function Invoke-Cloudflared([string]$What, [string[]]$CfArgs) {
  $ErrorActionPreference = 'Continue'
  & $exe @CfArgs 2>&1 | ForEach-Object { Write-Log "  $_" }
  if ($LASTEXITCODE) { throw "$What başarısız (cloudflared çıkış kodu $LASTEXITCODE)" }
}

$existing = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($existing -and -not ($Remove -or $Replace)) {
  # Aynı bilgisayarda tek cloudflared servisi olabilir; başka uygulamaların tünelini bozmamak için değiştirilmez.
  Write-Log 'UYARI: Bu bilgisayarda zaten bir Cloudflare Tunnel servisi var; değiştirilmedi.'
  Write-Log "  Cloudflare panelinde o tünele Public hostname ekleyin: evoflow.ozguvenis.com.tr -> http://127.0.0.1:<PORT>"
  Write-Log '  (Mevcut servisi bilerek değiştirmek için tunnel.ps1 -Replace)'
  return
}
if ($existing -or $Remove) {
  if ($existing) {
    Stop-Service cloudflared -Force -ErrorAction SilentlyContinue
    Invoke-Cloudflared 'Önceki Cloudflare Tunnel servisini kaldırma' @('service', 'uninstall')
    # Servis kaydı silinene kadar beklenir; aksi halde yeni kurulum "servis zaten var" hatası verir.
    for ($i = 0; $i -lt 30 -and (Get-Service cloudflared -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
    Write-Log 'Önceki Cloudflare Tunnel servisi kaldırıldı'
  }
  if ($Remove) { return }
}

if ($Token) {
  Invoke-Cloudflared 'Cloudflare Tunnel servis kurulumu' @('service', 'install', $Token)
} elseif ($ConfigFile) {
  if (-not (Test-Path $ConfigFile)) { throw "Yapılandırma dosyası yok: $ConfigFile" }
  # Windows servisi SYSTEM profilindeki .cloudflared klasörünü okur; config.yml ve içinde adı geçen kimlik dosyası oraya kopyalanır.
  $dst = Join-Path $env:SystemRoot 'System32\config\systemprofile\.cloudflared'
  New-Item -ItemType Directory -Force $dst | Out-Null
  $yml = Get-Content $ConfigFile -Raw
  if ($yml -match '(?m)^\s*credentials-file:\s*(.+?)\s*$') {
    $cred = $Matches[1].Trim('"', "'")
    if (-not [IO.Path]::IsPathRooted($cred)) { $cred = Join-Path (Split-Path $ConfigFile) $cred }
    if (-not (Test-Path $cred)) { throw "Tünel kimlik dosyası bulunamadı: $cred" }
    Copy-Item $cred (Join-Path $dst (Split-Path $cred -Leaf)) -Force
    $yml = $yml -replace '(?m)^(\s*credentials-file:\s*).+$', ('$1' + (Join-Path $dst (Split-Path $cred -Leaf)))
  }
  Write-Utf8NoBom (Join-Path $dst 'config.yml') $yml
  icacls $dst /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
  Invoke-Cloudflared 'Cloudflare Tunnel servis kurulumu' @('service', 'install')
} else {
  throw '-Token veya -ConfigFile verin (ya da kaldırmak için -Remove).'
}
Start-Service cloudflared -ErrorAction SilentlyContinue
Write-Log 'Cloudflare Tunnel servisi kuruldu ve başlatıldı'
