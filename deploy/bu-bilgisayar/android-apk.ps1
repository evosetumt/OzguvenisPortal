# Android test APK'sını derler ve sertifika sayfasından (http://<sunucu>/ozguvenis-portal.apk) indirilebilir hale getirir.
# Kullanım (proje kökünde): powershell -ExecutionPolicy Bypass -File deploy\bu-bilgisayar\android-apk.ps1
# Not: Android derleyicisi Türkçe karakterli yolları (ÜMİT) kabul etmez; proje ve SDK geçici sürücü harflerine bağlanır.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$out = 'C:\OzguvenisPortal\indir\ozguvenis-portal.apk'

Push-Location "$root\apps\web"
try {
  npm run build:mobile; if ($LASTEXITCODE) { throw 'mobil derleme başarısız' }
  npx cap sync android; if ($LASTEXITCODE) { throw 'cap sync başarısız' }
} finally { Pop-Location }

subst X: $root; subst Y: $sdk
try {
  $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
  $env:ANDROID_HOME = 'Y:\'
  [IO.File]::WriteAllText('X:\apps\web\android\local.properties', "sdk.dir=Y\:/`n")
  Push-Location X:\apps\web\android
  try { .\gradlew.bat assembleDebug --no-daemon; if ($LASTEXITCODE) { throw 'Gradle derlemesi başarısız' } } finally { Pop-Location }
} finally { subst X: /D; subst Y: /D }

New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
Copy-Item "$root\apps\web\android\app\build\outputs\apk\debug\app-debug.apk" $out -Force
Write-Host "APK hazır: $out"

# Mobil derleme dist klasörünü değiştirir; portalın web sürümü yeniden derlenir.
Push-Location "$root\apps\web"
try { npm run build } finally { Pop-Location }
