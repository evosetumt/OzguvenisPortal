# EvoFlow durumu: servisler, sağlık kontrolü, son günlük satırları. Başlat menüsü → EvoFlow → Durum.

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'ortak.ps1')
$cfg = Read-EnvFile $ConfigFile
$port = if ($cfg['PORT']) { [int]$cfg['PORT'] } else { 3000 }

Write-Host "`n== Servisler ==" -ForegroundColor Cyan
foreach ($name in $ServiceName, 'cloudflared') {
  $s = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
  if ($s) { '{0,-12} {1,-9} başlangıç: {2,-6} hesap: {3}' -f $name, $s.State, $s.StartMode, $s.StartName }
  else { '{0,-12} kurulu değil' -f $name }
}

Write-Host "`n== Sağlık ==" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 5
  "Yerel:  http://127.0.0.1:$port  → $($r.StatusCode)"
} catch { "Yerel:  http://127.0.0.1:$port  → YANIT YOK ($($_.Exception.Message))" }
if ($cfg['PUBLIC_URL']) {
  try {
    $r = Invoke-WebRequest "$($cfg['PUBLIC_URL'])/api/health" -UseBasicParsing -TimeoutSec 10
    "Yayın:  $($cfg['PUBLIC_URL'])  → $($r.StatusCode)"
  } catch { "Yayın:  $($cfg['PUBLIC_URL'])  → YANIT YOK ($($_.Exception.Message))" }
}

Write-Host "`n== Son günlük satırları ($LogDir) ==" -ForegroundColor Cyan
foreach ($f in 'EvoFlow.out.log', 'EvoFlow.err.log', 'kurulum.log') {
  $path = Join-Path $LogDir $f
  if (Test-Path $path) { "--- $f"; Get-Content $path -Tail 8 }
}
Write-Host "`nYapılandırma: $ConfigFile"
if ($Host.Name -eq 'ConsoleHost') { Read-Host "`nKapatmak için Enter" | Out-Null }
