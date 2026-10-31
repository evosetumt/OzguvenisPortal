<#
  Özgüveniş Portal günlük yedeği: SQL Server veritabanı + yüklenen dosyalar.
  Görev Zamanlayıcı ile her gece çalıştırılır (bkz. docs/SUNUCU-KURULUM.md "Yedekleme").

  Örnek:
    powershell -NoProfile -ExecutionPolicy Bypass -File C:\Apps\Ozguvenis\deploy\yedekle.ps1 `
      -YedekKlasoru D:\Yedek\Ozguvenis -UploadsKlasoru C:\Apps\Ozguvenis\api\uploads -SaklaGun 14

  Notlar:
  - Betiği çalıştıran Windows hesabının SQL Server'da BACKUP DATABASE yetkisi olmalı (db_backupoperator)
    ve SQL Server hizmet hesabı yedek klasörüne yazabilmeli (BACKUP dosyayı SQL Server hizmeti yazar).
  - Yedeği ayrıca başka bir diske / ağ paylaşımına kopyalayın (-KopyaKlasoru).
  - Netsis veritabanı bu betiğin kapsamında değildir; Netsis yedeği mevcut prosedürle alınır.
#>
param(
  [string]$SqlSunucu = 'localhost',
  [string]$Veritabani = 'OzguvenisPortal',
  [Parameter(Mandatory = $true)][string]$YedekKlasoru,
  [string]$UploadsKlasoru = 'C:\Apps\Ozguvenis\api\uploads',
  [string]$KopyaKlasoru = '',
  [int]$SaklaGun = 14
)

$ErrorActionPreference = 'Stop'
$damga = Get-Date -Format 'yyyyMMdd_HHmm'
$log = Join-Path $YedekKlasoru 'yedek.log'
New-Item -ItemType Directory -Force -Path $YedekKlasoru | Out-Null

function Yaz($m) { "$(Get-Date -Format s) $m" | Tee-Object -FilePath $log -Append }

try {
  # 1) Veritabanı (sıkıştırmalı, doğrulama sağlama toplamıyla). Express sürümü COMPRESSION desteklemez; o durumda parametreyi kaldırın.
  $bak = Join-Path $YedekKlasoru "${Veritabani}_$damga.bak"
  $sql = "BACKUP DATABASE [$Veritabani] TO DISK = N'$bak' WITH INIT, COMPRESSION, CHECKSUM, STATS = 25"
  & sqlcmd -S $SqlSunucu -E -C -b -Q $sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd BACKUP başarısız (kod $LASTEXITCODE)" }
  & sqlcmd -S $SqlSunucu -E -C -b -Q "RESTORE VERIFYONLY FROM DISK = N'$bak' WITH CHECKSUM" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Yedek doğrulaması başarısız: $bak" }
  Yaz "Veritabanı yedeği tamam: $bak"

  # 2) Yüklenen dosyalar (masraf fişleri, sözleşmeler, sohbet ekleri)
  if (Test-Path $UploadsKlasoru) {
    $zip = Join-Path $YedekKlasoru "uploads_$damga.zip"
    Compress-Archive -Path (Join-Path $UploadsKlasoru '*') -DestinationPath $zip -CompressionLevel Optimal -Force
    Yaz "Dosya yedeği tamam: $zip"
  } else {
    Yaz "Uyarı: uploads klasörü yok ($UploadsKlasoru), atlandı"
  }

  # 3) İkinci konuma kopya
  if ($KopyaKlasoru) {
    New-Item -ItemType Directory -Force -Path $KopyaKlasoru | Out-Null
    Get-ChildItem $YedekKlasoru -File | Where-Object { $_.Name -like "*_$damga.*" } | Copy-Item -Destination $KopyaKlasoru -Force
    Yaz "Kopya: $KopyaKlasoru"
  }

  # 4) Eski yedekleri temizle
  foreach ($k in @($YedekKlasoru, $KopyaKlasoru) | Where-Object { $_ }) {
    Get-ChildItem $k -File -Include *.bak, *.zip -Recurse |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$SaklaGun) } |
      ForEach-Object { Remove-Item $_.FullName -Force; Yaz "Silindi (eski): $($_.FullName)" }
  }
  exit 0
}
catch {
  Yaz "HATA: $($_.Exception.Message)"
  exit 1
}
