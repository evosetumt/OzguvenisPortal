# EvoFlow kurulum programını (EvoFlow-Setup-<sürüm>.exe) üretir. Geliştirme bilgisayarında, proje kökünden:
#   powershell -ExecutionPolicy Bypass -File deploy\installer\build-installer.ps1 [-Version 1.2.0] [-StageOnly]
#
# Çıktı: deploy\installer\out\EvoFlow-Setup-<sürüm>.exe — hedef sunucuda Node.js, npm veya kaynak kod gerekmez.
# Paket içeriği: gömülü Node çalışma zamanı, derlenmiş API + üretim bağımlılıkları, derlenmiş arayüz, Prisma migration'ları,
# WinSW (servis sarmalayıcısı) ve cloudflared (Cloudflare Tunnel istemcisi).
# Gereken: Node.js + npm, Inno Setup 6 (https://jrsoftware.org/isinfo.php), ilk derlemede internet (WinSW/cloudflared indirilir).

param(
  [string]$Version,
  [switch]$StageOnly,  # yalnız paket klasörünü hazırla (setup.exe derleme)
  [switch]$NoVendor    # yalnız test: WinSW/cloudflared olmadan paket (setup.exe üretilemez)
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Here = $PSScriptRoot
$Out = Join-Path $Here 'out'
$Stage = Join-Path $Out 'stage'
$Cache = Join-Path $Here '.cache'
$ApiSrc = Join-Path $Repo 'apps\api'
$WebSrc = Join-Path $Repo 'apps\web'

# Sabit sürümler: değiştirirken .cache klasörünü silin (yeniden indirilir ve özeti yeniden kaydedilir).
$WinSwUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$CloudflaredUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
# Harici komut: başarı çıkış koduna göre değerlendirilir (Windows PowerShell 5.1 stderr'e yazılan uyarıları hata sayar).
function Run([string]$What, [scriptblock]$Cmd) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $Cmd 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE) { throw "$What başarısız (çıkış kodu $LASTEXITCODE)" }
}

if (-not $Version) { $Version = (Get-Content (Join-Path $ApiSrc 'package.json') -Raw | ConvertFrom-Json).version }
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $StageOnly -and -not $iscc) { throw 'Inno Setup 6 bulunamadı (winget install JRSoftware.InnoSetup)' }

# --- 1. Üçüncü taraf ikili dosyalar (önbellekte yoksa indirilir, doğrulanır) ---
Step 'Servis sarmalayıcısı (WinSW) ve Cloudflare Tunnel istemcisi'
New-Item -ItemType Directory -Force $Cache | Out-Null
function Get-Vendor([string]$Url, [string]$Name) {
  $file = Join-Path $Cache $Name
  $pin = "$file.sha256"
  if (-not (Test-Path $file)) {
    Write-Host "  indiriliyor: $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest $Url -OutFile $file -UseBasicParsing
  }
  $hash = (Get-FileHash $file -Algorithm SHA256).Hash
  # İlk indirmede özet kaydedilir; sonraki derlemelerde dosya değişmişse derleme durur.
  if (Test-Path $pin) {
    if ((Get-Content $pin -Raw).Trim() -ne $hash) { throw "$Name özeti kayıtlı değerle uyuşmuyor ($pin). Dosyayı ve özeti silip yeniden indirin." }
  } else { Set-Content $pin $hash; Write-Host "  $Name SHA256: $hash (kaydedildi)" }
  return $file
}
if ($NoVendor) {
  if (-not $StageOnly) { throw '-NoVendor yalnız -StageOnly ile kullanılabilir' }
  $winsw = $null; $cloudflared = $null
} else {
  $winsw = Get-Vendor $WinSwUrl 'WinSW-x64.exe'
  $cloudflared = Get-Vendor $CloudflaredUrl 'cloudflared.exe'
  $sig = Get-AuthenticodeSignature $cloudflared
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Cloudflare') {
    throw "cloudflared.exe imzası geçersiz ($($sig.Status), $($sig.SignerCertificate.Subject)). Dosyayı silip yeniden indirin."
  }
}

# --- 2. Derleme ---
Step "Derleme (sürüm $Version)"
Push-Location $Repo
try { Run 'npm run build' { npm run build } } finally { Pop-Location }

# --- 3. Paket klasörü ---
Step 'Paket klasörü hazırlanıyor'
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
$dirs = 'runtime', 'api', 'web', 'service', 'cloudflared', 'scripts'
foreach ($d in $dirs) { New-Item -ItemType Directory -Force (Join-Path $Stage $d) | Out-Null }

# Node çalışma zamanı: derlemede kullanılan sürümle aynı (hedefte Node kurulumu gerekmez).
Copy-Item (Get-Command node).Source (Join-Path $Stage 'runtime\node.exe')

# API: derlenmiş kod + Prisma şeması/migration'ları (shadow DB satırı üretimde gereksiz, çıkarılır)
$apiStage = Join-Path $Stage 'api'
Copy-Item (Join-Path $ApiSrc 'dist') (Join-Path $apiStage 'dist') -Recurse
New-Item -ItemType Directory -Force (Join-Path $apiStage 'prisma') | Out-Null
Copy-Item (Join-Path $ApiSrc 'prisma\migrations') (Join-Path $apiStage 'prisma\migrations') -Recurse
$schema = (Get-Content (Join-Path $ApiSrc 'prisma\schema.prisma') -Raw) -replace '(?m)^\s*shadowDatabaseUrl\s*=.*\r?\n', ''
[IO.File]::WriteAllText((Join-Path $apiStage 'prisma\schema.prisma'), $schema, (New-Object Text.UTF8Encoding $false))

# Başlangıç verisi betiği (seed) JavaScript'e derlenir (hedefte ts-node yok).
Push-Location $ApiSrc
try {
  Run 'seed derlemesi' { npx tsc prisma/seed.ts --outDir (Join-Path $apiStage 'seed') --rootDir . --module commonjs --target es2022 --esModuleInterop --skipLibCheck --resolveJsonModule }
} finally { Pop-Location }

# Üretim bağımlılıkları: API'nin bağımlılıkları + Prisma CLI (migration için); kökteki güvenlik sabitlemeleri (overrides) korunur.
$apiPkg = Get-Content (Join-Path $ApiSrc 'package.json') -Raw | ConvertFrom-Json
$rootPkg = Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json
$deps = [ordered]@{}
foreach ($pr in $apiPkg.dependencies.PSObject.Properties) { $deps[$pr.Name] = $pr.Value }
$deps['prisma'] = $apiPkg.devDependencies.prisma
$stagePkg = [ordered]@{ name = 'evoflow-api'; version = $Version; private = $true; dependencies = $deps }
if ($rootPkg.overrides) { $stagePkg.overrides = $rootPkg.overrides }
if ($rootPkg.allowScripts) { $stagePkg.allowScripts = $rootPkg.allowScripts }
[IO.File]::WriteAllText((Join-Path $apiStage 'package.json'), ($stagePkg | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
Push-Location $apiStage
try {
  Run 'npm install (üretim)' { npm install --omit=dev --no-audit --no-fund --no-workspaces }
  Run 'prisma generate' { node node_modules\prisma\build\index.js generate --schema prisma\schema.prisma }
} finally { Pop-Location }
if (-not (Get-ChildItem (Join-Path $apiStage 'node_modules\@prisma\engines') -Filter 'schema-engine*.exe' -ErrorAction SilentlyContinue)) {
  throw 'Prisma schema-engine bulunamadı (migration için gerekli). npm install çıktısını kontrol edin.'
}

# Arayüz
Copy-Item (Join-Path $WebSrc 'dist\*') (Join-Path $Stage 'web') -Recurse

# Servis ve tünel
if ($winsw) { Copy-Item $winsw (Join-Path $Stage 'service\EvoFlow.exe') }
Copy-Item (Join-Path $Here 'service\EvoFlow.xml') (Join-Path $Stage 'service\EvoFlow.xml')
if ($cloudflared) { Copy-Item $cloudflared (Join-Path $Stage 'cloudflared\cloudflared.exe') }

# Betikler: Windows PowerShell 5.1 Türkçe karakterleri doğru okusun diye UTF-8 BOM ile yazılır.
foreach ($f in Get-ChildItem (Join-Path $Here 'scripts') -Filter '*.ps1') {
  [IO.File]::WriteAllText((Join-Path $Stage "scripts\$($f.Name)"), [IO.File]::ReadAllText($f.FullName), (New-Object Text.UTF8Encoding $true))
}
Copy-Item (Join-Path $Here 'OKUBENI.md') (Join-Path $Stage 'OKUBENI.md')
Set-Content (Join-Path $Stage 'VERSION') $Version

$size = [math]::Round(((Get-ChildItem $Stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "  paket: $Stage ($size MB)"
if ($StageOnly) { return }

# --- 4. Kurulum programı ---
Step 'Kurulum programı derleniyor (Inno Setup)'
Run 'ISCC' { & $iscc "/DAppVersion=$Version" "/DStageDir=$Stage" "/DOutDir=$Out" (Join-Path $Here 'evoflow.iss') }
Write-Host "`nHazır: $(Join-Path $Out "EvoFlow-Setup-$Version.exe")" -ForegroundColor Green
