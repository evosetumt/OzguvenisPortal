# Google Play için YÜKLEME (upload) anahtarını oluşturur ve apps\web\android\keystore.properties dosyasını yazar.
# Kullanım (proje kökünde): powershell -ExecutionPolicy Bypass -File deploy\mobile\android-keystore-olustur.ps1
#
# - Anahtar deposu: apps\web\android\ozguvenis-upload.jks (gitignore'da: *.jks)
# - Parolalar: apps\web\android\keystore.properties (gitignore'da) — düz metin; bu bilgisayardan başka yere koymayın.
# - Var olan bir anahtar deposunun ÜZERİNE YAZMAZ. Yenisini oluşturmak için eskisini bilerek taşıyın/silin.
# - Play App Signing açıkken bu anahtar yalnızca "yükleme anahtarı"dır; kaybolursa Play Console'dan sıfırlama istenebilir
#   (günler sürer). Yine de MUTLAKA yedekleyin (bkz. deploy\mobile\MAGAZA.md).
param(
  [string]$Alias = 'ozguvenis-upload',
  [string]$DName = 'CN=Ozguvenis Portal, O=Ozguvenis, C=TR',
  [int]$ValidityDays = 10000
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$androidDir = "$root\apps\web\android"
$jksName = 'ozguvenis-upload.jks'
$jks = Join-Path $androidDir $jksName
$propsFile = Join-Path $androidDir 'keystore.properties'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$keytool = "$jbr\bin\keytool.exe"

if (-not (Test-Path $keytool)) { throw "keytool bulunamadı: $keytool (Android Studio kurulu mu?)" }
if (Test-Path $jks) { throw "Anahtar deposu zaten var: $jks — üzerine yazılmaz. Mevcut anahtarı kullanın; gerçekten yenisi gerekiyorsa eskisini YEDEKLEDİKTEN sonra taşıyın." }
if (Test-Path $propsFile) { throw "keystore.properties zaten var: $propsFile — önce içeriğini kontrol edin (mevcut bir anahtara ait olabilir)." }

function Read-Plain([string]$prompt) {
  $sec = Read-Host -AsSecureString $prompt
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host ''
Write-Host 'Anahtar deposu parolası belirleyin (en az 8 karakter). PKCS12 biçiminde anahtar parolası da aynıdır.' -ForegroundColor Cyan
$pw = Read-Plain 'Parola'
if ($pw.Length -lt 8) { throw 'Parola en az 8 karakter olmalı.' }
$pw2 = Read-Plain 'Parola (tekrar)'
if ($pw -ne $pw2) { throw 'Parolalar eşleşmiyor.' }

# Parola komut satırında görünmesin: keytool'a ortam değişkeniyle verilir.
$env:OZG_KS_PASS = $pw
try {
  & $keytool -genkeypair -v -storetype PKCS12 -keystore $jks -alias $Alias -keyalg RSA -keysize 2048 `
    -validity $ValidityDays -dname $DName -storepass:env OZG_KS_PASS -keypass:env OZG_KS_PASS
  if ($LASTEXITCODE) { throw 'keytool anahtar oluşturamadı' }
  Write-Host ''
  & $keytool -list -v -keystore $jks -alias $Alias -storepass:env OZG_KS_PASS | Select-String 'SHA1:|SHA256:|Valid|Geçerli'
} finally { Remove-Item Env:\OZG_KS_PASS -ErrorAction SilentlyContinue }

# java.util.Properties ISO-8859-1 okur: ters bölü kaçırılır, ASCII dışı karakterler \uXXXX yazılır.
function Esc([string]$v) {
  $sb = New-Object Text.StringBuilder
  foreach ($c in $v.ToCharArray()) {
    if ($c -eq '\') { [void]$sb.Append('\\') }
    elseif ([int]$c -gt 126 -or [int]$c -lt 32) { [void]$sb.Append(('\u{0:x4}' -f [int]$c)) }
    else { [void]$sb.Append($c) }
  }
  $sb.ToString()
}
$props = @(
  '# Play Store yükleme anahtarı (deploy\mobile\android-keystore-olustur.ps1 ile oluşturuldu). DEPOYA EKLEMEYİN.'
  "storeFile=$jksName"
  "storePassword=$(Esc $pw)"
  "keyAlias=$(Esc $Alias)"
  "keyPassword=$(Esc $pw)"
) -join "`n"
[IO.File]::WriteAllText($propsFile, $props + "`n", (New-Object Text.UTF8Encoding($false)))
$pw = $null; $pw2 = $null

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Red
Write-Host ' ANAHTARI ŞİMDİ YEDEKLEYİN!' -ForegroundColor Red
Write-Host "   $jks" -ForegroundColor Yellow
Write-Host "   $propsFile  (parolalar)" -ForegroundColor Yellow
Write-Host ' Bu iki dosyayı şirket parola kasasına / şifreli USB''ye / güvenli bir' -ForegroundColor Red
Write-Host ' yere kopyalayın. Bilgisayar bozulursa veya dosya silinirse uygulamanın' -ForegroundColor Red
Write-Host ' güncellemesini yükleyemezsiniz (Play Console''dan anahtar sıfırlama gerekir).' -ForegroundColor Red
Write-Host ' Codemagic kullanılacaksa .jks dosyasını oraya da yükleyin (MAGAZA.md).' -ForegroundColor Red
Write-Host '==================================================================' -ForegroundColor Red
