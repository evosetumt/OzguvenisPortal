# Güncellemede dosyalar değiştirilmeden önce kurulum programı çağırır: EvoFlow servisi ve bu kurulumun
# cloudflared servisi durdurulur (çalışan node.exe / cloudflared.exe dosyaları kilitli olur). Hata durumunda kurulumu durdurmaz.

param([Parameter(Mandatory)] [string]$AppDir)
$ErrorActionPreference = 'Continue'

$targets = @('EvoFlow')
$cf = Get-CimInstance Win32_Service -Filter "Name='cloudflared'" -ErrorAction SilentlyContinue
if ($cf -and $cf.PathName -like "*$AppDir*") { $targets += 'cloudflared' }
foreach ($name in $targets) {
  $s = Get-Service $name -ErrorAction SilentlyContinue
  if ($s -and $s.Status -ne 'Stopped') {
    Stop-Service $name -Force -ErrorAction SilentlyContinue
    try { $s.WaitForStatus('Stopped', '00:00:30') } catch { }
  }
}
exit 0
