# Özgüveniş Portal - durum kontrolü (yönetici gerekmez; günlükleri görmek için yönetici gerekir).
param([string]$Root = 'C:\OzguvenisPortal')

Write-Host "`nBaşlangıç görevi" -ForegroundColor Cyan
Get-ScheduledTask -TaskName 'OzguvenisPortal*' -ErrorAction SilentlyContinue |
  Select-Object TaskName, State, @{ n = 'SonÇalışma'; e = { (Get-ScheduledTaskInfo $_).LastRunTime } } | Format-Table -AutoSize

Write-Host 'Dinlenen portlar' -ForegroundColor Cyan
foreach ($p in 443, 80) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  $name = if ($c) { (Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue).ProcessName } else { '-- dinlenmiyor --' }
  '{0,6}/TCP  {1}' -f $p, $name
}

Write-Host "`nSertifika" -ForegroundColor Cyan
try {
  $pfx = New-Object Security.Cryptography.X509Certificates.X509Certificate2("$Root\certs\sunucu.pfx", (Get-Content "$Root\certs\parola.txt" -Raw).Trim())
  $days = [int]($pfx.NotAfter - (Get-Date)).TotalDays
  "Sunucu sertifikası bitiş: $($pfx.NotAfter.ToString('dd.MM.yyyy')) ($days gün)"
  if ($days -lt 60) { Write-Warning 'Sertifika süresi yaklaşıyor: OKUBENI.md → "Sunucu sertifikasını yenileme"' }
} catch { Write-Warning "Sertifika okunamadı (yönetici olarak çalıştırın): $($_.Exception.Message)" }

Write-Host "`nSağlık" -ForegroundColor Cyan
try { 'Sertifika sayfası (80): ' + (Invoke-WebRequest 'http://localhost/' -UseBasicParsing -TimeoutSec 5).StatusCode } catch { Write-Warning "80 yanıt vermiyor: $($_.Exception.Message)" }
try { 'Portal (443):           ' + (Invoke-RestMethod 'https://localhost/api/health' -TimeoutSec 5 | ConvertTo-Json -Compress) } catch { Write-Warning "https://localhost yanıt vermiyor veya bu bilgisayarda kök sertifika yüklü değil: $($_.Exception.Message)" }

if (Test-Path "$Root\logs\restarts.log") {
  Write-Host "`nSon yeniden başlatmalar" -ForegroundColor Cyan
  Get-Content "$Root\logs\restarts.log" -Tail 5
}
Write-Host "`nGünlükler: $Root\logs (portal.out.log, portal.err.log)"
