# Kaldırma (Programlar ve Özellikler → EvoFlow → Kaldır) sırasında kurulum programı çağırır:
# EvoFlow servisi ve bu kurulumun kurduğu Cloudflare Tunnel servisi kaldırılır.
# Veriler (%ProgramData%\EvoFlow: yapılandırma, yüklenen dosyalar, günlükler) ve veritabanı SİLİNMEZ.

param([Parameter(Mandatory)] [string]$AppDir)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'ortak.ps1')

if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
  & (Join-Path $AppDir 'service\EvoFlow.exe') uninstall | ForEach-Object { Write-Log "  $_" }
  Write-Log 'EvoFlow servisi kaldırıldı'
}

# Tünel servisi yalnız bu kurulumun cloudflared'ini kullanıyorsa kaldırılır (başka bir cloudflared kurulumuna dokunulmaz).
$cf = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction SilentlyContinue
if ($cf -and $cf.PathName -like "*$AppDir*") {
  Stop-Service cloudflared -Force -ErrorAction SilentlyContinue
  & (Join-Path $AppDir 'cloudflared\cloudflared.exe') service uninstall | ForEach-Object { Write-Log "  $_" }
  Write-Log 'Cloudflare Tunnel servisi kaldırıldı'
}
Write-Log "Kaldırma tamamlandı. Veriler korunuyor: $DataDir"
exit 0
