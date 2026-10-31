# Özgüveniş Portal - bu bilgisayardaki kalıcı kurulumu durdurur ve kaldırır (YÖNETİCİ PowerShell'de).
# Veritabanı, yüklenen dosyalar ve C:\OzguvenisPortal klasörü (sertifikalar, günlükler) silinmez.
$ErrorActionPreference = 'Stop'
foreach ($t in 'OzguvenisPortal', 'OzguvenisPortal-API', 'OzguvenisPortal-Caddy', 'OzguvenisPortal-LiveKit') {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $t
    Unregister-ScheduledTask -TaskName $t -Confirm:$false
    "Kaldırıldı: $t"
  }
}
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object {
  if ((Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match 'OzguvenisPortal\\run-') { Stop-Process -Id $_.Id -Force }
}
Get-Process caddy, livekit-server -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($port in 443, 80) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    if ((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'node') { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}
Get-NetFirewallRule -DisplayName 'Ozguvenis Portal*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
'Tamam. C:\OzguvenisPortal klasörünü (sertifikalar dahil) isterseniz elle silebilirsiniz.'
