# EvoFlow kurulum betiklerinin ortak yardımcıları (kur-sonrasi.ps1, kaldir-oncesi.ps1, tunnel.ps1, durum.ps1 içe aktarır).

$script:ServiceName = 'EvoFlow'
# EVOFLOW_DATA_DIR yalnız test içindir (gerçek kurulum her zaman %ProgramData%\EvoFlow kullanır).
$script:DataDir = if ($env:EVOFLOW_DATA_DIR) { $env:EVOFLOW_DATA_DIR } else { Join-Path $env:ProgramData 'EvoFlow' }
$script:ConfigFile = Join-Path $script:DataDir 'config\evoflow.env'
$script:LogDir = Join-Path $script:DataDir 'logs'

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

# .env dosyasını sıralı sözlük olarak okur (yorum ve boş satırlar atlanır; tırnaklar soyulur).
function Read-EnvFile([string]$Path) {
  $map = [ordered]@{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
    $v = $Matches[2].Trim()
    if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) { $v = $v.Substring(1, $v.Length - 2) }
    $map[$Matches[1]] = $v
  }
  return $map
}

# Anahtarı dosyada günceller ya da sona ekler; dosyadaki diğer satırlara (yorumlar dahil) dokunmaz.
function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
  # Not: dizi doğrudan List'e dönüştürülürse PowerShell 5.1'de sabit boyutlu kalabilir; AddRange ile doldurulur.
  $lines = New-Object 'Collections.Generic.List[string]'
  if (Test-Path $Path) { $lines.AddRange([string[]][IO.File]::ReadAllLines($Path)) }
  $quoted = if ($Value -match '[\s#"]') { '"' + $Value.Replace('"', '\"') + '"' } else { $Value }
  $done = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))\s*=") { $lines[$i] = "$Key=$quoted"; $done = $true }
  }
  if (-not $done) { $lines.Add("$Key=$quoted") }
  Write-Utf8NoBom $Path (($lines -join "`r`n") + "`r`n")
}

# Anahtarı yorum satırına çevirir (eski iç ağ HTTPS ayarları gibi artık kullanılmayanlar için).
function Disable-EnvKey([string]$Path, [string]$Key, [string]$Reason) {
  if (-not (Test-Path $Path)) { return }
  $text = [IO.File]::ReadAllText($Path)
  $new = [regex]::Replace($text, "(?m)^(\s*$([regex]::Escape($Key))\s*=.*)$", "# $Reason`r`n# `$1")
  if ($new -ne $text) { Write-Utf8NoBom $Path $new }
}

# Yapılandırmayı bu sürecin ortamına yükler (migration/seed için).
function Import-EnvToProcess([string]$Path) {
  $env = Read-EnvFile $Path
  foreach ($k in $env.Keys) { [Environment]::SetEnvironmentVariable($k, $env[$k], 'Process') }
}

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format s)  $Message"
  Write-Host $line
  try { Add-Content -Path (Join-Path $script:LogDir 'kurulum.log') -Value $line -Encoding UTF8 } catch { }
}

function Test-PortalHealth([int]$Port, [int]$TimeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}
