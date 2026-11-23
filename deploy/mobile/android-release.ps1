# Google Play'e yüklenecek imzalı Android App Bundle (AAB) üretir.
# Kullanım (proje kökünde):
#   powershell -ExecutionPolicy Bypass -File deploy\mobile\android-release.ps1 -VersionCode 2 -VersionName 1.0.1
# -VersionCode: Play'e her yüklemede bir öncekinden BÜYÜK tam sayı olmalı (verilmezse build.gradle'daki değer kullanılır).
# -VersionName: kullanıcıya görünen sürüm (ör. 1.0.1).
#
# Önkoşullar: apps\web\.env.mobile (VITE_API_URL=https://evoflow.ozguvenis.com.tr), apps\web\android\keystore.properties
# (deploy\mobile\android-keystore-olustur.ps1). Çıktı: deploy\mobile\cikti\ozguvenis-portal-<sürüm>-<kod>.aab
# Not: Android derleyicisi Türkçe karakterli yolları (ÜMİT) kabul etmez; proje ve SDK geçici sürücü harflerine bağlanır.
param(
  [int]$VersionCode = 0,
  [string]$VersionName = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$web = "$root\apps\web"
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$gradleFile = "$web\android\app\build.gradle"
$outDir = "$PSScriptRoot\cikti"

if (-not (Test-Path "$web\android\keystore.properties")) {
  throw 'apps\web\android\keystore.properties yok. Önce deploy\mobile\android-keystore-olustur.ps1 çalıştırın (veya yedekteki dosyayı geri koyun).'
}
if (-not (Test-Path "$web\.env.mobile")) { throw 'apps\web\.env.mobile yok. .env.mobile.example dosyasını kopyalayıp düzenleyin.' }
$apiLine = Select-String -Path "$web\.env.mobile" -Pattern '^\s*VITE_API_URL\s*=\s*(.+)$' | Select-Object -First 1
$apiUrl = if ($apiLine) { $apiLine.Matches[0].Groups[1].Value.Trim() } else { '' }
if ($apiUrl -notmatch '^https://') { throw ".env.mobile içindeki VITE_API_URL https:// ile başlamalı (şu an: '$apiUrl')." }
if ($apiUrl -ne 'https://evoflow.ozguvenis.com.tr') { Write-Warning "VITE_API_URL = $apiUrl (beklenen: https://evoflow.ozguvenis.com.tr). Devam ediliyor." }

# Sürüm numaraları build.gradle'a yazılır (dosya UTF-8, BOM'suz kalır).
$gradle = [IO.File]::ReadAllText($gradleFile)
if ($VersionCode -gt 0) {
  $current = [int]([regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value)
  if ($VersionCode -le $current) { Write-Warning "VersionCode ($VersionCode) mevcut değerden ($current) büyük değil; Play Console daha önce yüklenmiş bir kodu reddeder." }
  $gradle = [regex]::Replace($gradle, 'versionCode\s+\d+', "versionCode $VersionCode")
}
if ($VersionName) {
  if ($VersionName -notmatch '^[0-9A-Za-z.\-]+$') { throw "Geçersiz VersionName: $VersionName" }
  $gradle = [regex]::Replace($gradle, 'versionName\s+"[^"]*"', "versionName `"$VersionName`"")
}
[IO.File]::WriteAllText($gradleFile, $gradle, (New-Object Text.UTF8Encoding($false)))
$code = [regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
$name = [regex]::Match($gradle, 'versionName\s+"([^"]*)"').Groups[1].Value
Write-Host "Sürüm: $name (kod $code)" -ForegroundColor Cyan

function Free-Drive([string[]]$letters) {
  foreach ($l in $letters) { if (-not (Test-Path "${l}:\")) { return "${l}:" } }
  throw "Boş sürücü harfi bulunamadı ($($letters -join ', '))."
}

$localProps = "$web\android\local.properties"
$localPropsOld = if (Test-Path $localProps) { [IO.File]::ReadAllText($localProps) } else { $null }
try {
  Push-Location $web
  try {
    npm run build:mobile; if ($LASTEXITCODE) { throw 'mobil derleme başarısız' }
    npx cap sync android; if ($LASTEXITCODE) { throw 'cap sync başarısız' }
  } finally { Pop-Location }

  $p = Free-Drive @('X', 'W', 'V', 'U')
  $s = Free-Drive @('Y', 'T', 'S', 'R')
  subst $p $root; subst $s $sdk
  try {
    $env:JAVA_HOME = $jbr
    $env:ANDROID_HOME = "$s\"
    $sdkEsc = $s -replace ':', '\:'
    [IO.File]::WriteAllText("$p\apps\web\android\local.properties", "sdk.dir=$sdkEsc/`n")
    Push-Location "$p\apps\web\android"
    try { .\gradlew.bat bundleRelease --no-daemon; if ($LASTEXITCODE) { throw 'Gradle derlemesi başarısız' } } finally { Pop-Location }
  } finally {
    subst $p /D; subst $s /D
    # Android Studio'nun kullandığı asıl SDK yolu geri yazılır (geçici sürücü harfi kalmasın).
    if ($null -ne $localPropsOld) { [IO.File]::WriteAllText($localProps, $localPropsOld) } else { Remove-Item $localProps -ErrorAction SilentlyContinue }
  }

  $aab = "$web\android\app\build\outputs\bundle\release\app-release.aab"
  if (-not (Test-Path $aab)) { throw "AAB bulunamadı: $aab" }
  # İmza kontrolü: imzasız AAB'yi Play Console kabul etmez.
  $verify = & "$jbr\bin\jarsigner.exe" -verify $aab 2>&1 | Out-String
  if ($verify -notmatch 'jar verified') { throw "AAB imzalı görünmüyor:`n$verify" }

  New-Item -ItemType Directory -Force $outDir | Out-Null
  $out = Join-Path $outDir "ozguvenis-portal-$name-$code.aab"
  Copy-Item $aab $out -Force
  Write-Host ''
  Write-Host "AAB hazır: $out" -ForegroundColor Green
  Write-Host 'Play Console > uygulama > Test ve yayın > (iç test / kapalı test / üretim) > Yeni sürüm oluştur > bu dosyayı yükleyin.'
  Write-Host 'build.gradle sürüm değişikliğini git ile kaydetmeyi unutmayın.'
} finally {
  # Mobil derleme dist klasörünü değiştirir; portalın web sürümü yeniden derlenir.
  Push-Location $web
  try { npm run build } finally { Pop-Location }
}
