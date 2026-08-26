param(
  [int]$NavWaitSec = 5,
  [switch]$SkipLaunch,
  [switch]$SkipBuild,
  [switch]$SkipLogin,
  [switch]$ManualOnly,
  [switch]$StartEmulator,
  [string]$Email = $env:PLAY_REVIEWER_EMAIL,
  [string]$Password = $env:PLAY_REVIEWER_PASSWORD
)

# ============================================================================
# Capturas Play Store — NEXARA Android (100 % automatizado)
#
# Uso rápido (emulador + build + login + 8 capturas):
#   $env:PLAY_REVIEWER_EMAIL = "play.review@nexara.com.mx"
#   $env:PLAY_REVIEWER_PASSWORD = "..."   # de: cd apps/api && npm run seed:play-reviewer
#   npm run mobile:android:screenshots
#
# Solo capturar (ya logueado):
#   npm run mobile:android:screenshots -- -SkipBuild -SkipLogin
#
# Ver guía sin capturar:
#   npm run mobile:android:screenshots -- -ManualOnly
# ============================================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "apps\mobile-native\android"
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$platformTools = Join-Path $sdkRoot "platform-tools"
$adbExe = Join-Path $platformTools "adb.exe"
$gradlew = Join-Path $androidDir "gradlew.bat"

$applicationId = "mx.nexara.mobile.nativeapp"
$mainActivity = "mx.nexara.mobile.nativeapp.MainActivity"
$outDir = Join-Path $repoRoot "apps\mobile-native\play-assets\screenshots\phone"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Note([string]$Message) {
  Write-Host $Message -ForegroundColor Yellow
}

function Ensure-Adb {
  if (-not (Test-Path $adbExe)) {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
      return (Get-Command adb).Source
    }
    throw "adb no encontrado. Instala Android Platform Tools o Android Studio (SDK en $sdkRoot)."
  }
  return $adbExe
}

function Get-OnlineDevice([string]$Adb) {
  & $Adb start-server | Out-Null
  $rows = (& $Adb devices) | Select-Object -Skip 1 | Where-Object { $_.Trim() -ne "" }

  $online = @()
  foreach ($row in $rows) {
    if ($row -match "^([^\s]+)\s+device$") { $online += $matches[1] }
  }

  if ($online.Count -eq 0) {
    throw "No hay dispositivos ADB online. Arranca: npm run mobile:android:preview"
  }
  return $online[0]
}

function Set-EmulatorResolution([string]$Adb, [string]$Serial) {
  Write-Host "  Resolución 1080x1920 @ 420dpi"
  & $Adb -s $Serial shell wm size 1080x1920 | Out-Null
  & $Adb -s $Serial shell wm density 420 | Out-Null
}

function Hide-SystemBars([string]$Adb, [string]$Serial) {
  & $Adb -s $Serial shell settings put global policy_control immersive.status=* | Out-Null
}

function Launch-App([string]$Adb, [string]$Serial) {
  & $Adb -s $Serial shell am start -W -n "$applicationId/$mainActivity" 2>$null | Out-Null
}

function Open-DeepLink([string]$Adb, [string]$Serial, [string]$Uri) {
  $escapedUri = $Uri.Replace("'", "'\\''")
  $cmd = "am start -W -a android.intent.action.VIEW -d '$escapedUri' -n $applicationId/$mainActivity"
  & $Adb -s $Serial shell $cmd 2>$null | Out-Null
}

function Capture-Screenshot([string]$Adb, [string]$Serial, [string]$Path) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $proc = Start-Process -FilePath $Adb -ArgumentList @("-s", $Serial, "exec-out", "screencap", "-p") `
    -RedirectStandardOutput $Path -NoNewWindow -Wait -PassThru
  if ($proc.ExitCode -ne 0 -or -not (Test-Path $Path) -or ((Get-Item $Path).Length -lt 8)) {
    throw "screencap fallo para $Path (exit $($proc.ExitCode))"
  }
  $sizeKb = [math]::Round((Get-Item $Path).Length / 1KB, 1)
  Write-Host "  OK $($Path | Split-Path -Leaf) ($sizeKb KB)" -ForegroundColor Green
}

function Invoke-GradleInstall([string]$Task) {
  Push-Location $androidDir
  try {
    & $gradlew --no-daemon $Task "-PSCREENSHOT_API=true"
    if ($LASTEXITCODE -ne 0) { throw "Gradle falló: $Task (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

function Invoke-ScreenshotPrep([string]$Adb, [string]$Serial) {
  Open-DeepLink $Adb $Serial "nexara://debug/screenshot-prep"
  Start-Sleep -Seconds 2
}

function Invoke-AutoLogin([string]$Adb, [string]$Serial, [string]$UserEmail, [string]$UserPassword) {
  Write-Host "  Auto-login (debug) para $UserEmail"
  $component = "$applicationId/$mainActivity"
  $emailEsc = $UserEmail.Replace("'", "'\\''")
  $passEsc = $UserPassword.Replace("'", "'\\''")
  $shellCmd = "am start -W -a android.intent.action.VIEW -d 'nexara://debug/auto-login' -n $component --es nexara_screenshot_email '$emailEsc' --es nexara_screenshot_password '$passEsc'"
  & $Adb -s $Serial shell $shellCmd 2>$null | Out-Null
  Start-Sleep -Seconds 12
}

# 8 capturas Play Store — todas con deep link automático
$screens = @(
  @{ Order = 1; Name = "Ventas dashboard";     File = "01-ventas-dashboard.png";     DeepLink = "nexara://ventas/dashboard" }
  @{ Order = 2; Name = "Smart Quote";         File = "02-smart-quote.png";         DeepLink = "nexara://ventas/smart-quote" }
  @{ Order = 3; Name = "Chat";                File = "03-chat.png";                DeepLink = "nexara://erp/chat" }
  @{ Order = 4; Name = "Actividades OPS";     File = "04-actividades.png";         DeepLink = "nexara://operacion/activities" }
  @{ Order = 5; Name = "Tickets portal";      File = "05-tickets.png";             DeepLink = "nexara://portal/tickets" }
  @{ Order = 6; Name = "Notificaciones";       File = "06-notificaciones.png";      DeepLink = "nexara://erp/notifications-center" }
  @{ Order = 7; Name = "GPS / mapa";          File = "07-mapa-gps.png";            DeepLink = "nexara://operacion/gps" }
  @{ Order = 8; Name = "Selector paneles";    File = "08-selector-paneles.png";    DeepLink = "nexara://panels" }
)

# ── Main ──────────────────────────────────────────────────────────────────────
Write-Host "NEXARA — capturas Play Store automatizadas" -ForegroundColor White
Write-Host "Salida: $outDir"

if ($ManualOnly) {
  foreach ($s in $screens) {
    Write-Host "[$($s.Order)] $($s.Name) → $($s.File)"
    Write-Host "    $($s.DeepLink)" -ForegroundColor DarkGray
  }
  Write-Note "Modo ManualOnly: sin captura. Quita -ManualOnly para ejecutar."
  exit 0
}

if ($StartEmulator) {
  Write-Step "Arrancando emulador (npm run mobile:android:preview)"
  Push-Location $repoRoot
  try {
    npm run mobile:android:preview
  } finally {
    Pop-Location
  }
}

$adb = Ensure-Adb
$serial = Get-OnlineDevice $adb
Write-Host "Dispositivo: $serial"

if (-not $SkipBuild) {
  Write-Step "Compilando e instalando debug (API producción para screenshots)"
  Invoke-GradleInstall ":app:installDebug"
}

if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Write-Step "Preparando emulador"
Set-EmulatorResolution $adb $serial
Hide-SystemBars $adb $serial

if (-not $SkipLaunch) {
  Write-Step "Lanzando app"
  Launch-App $adb $serial
  Start-Sleep -Seconds 2
}

if (-not $SkipLogin) {
  if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    Write-Note "Faltan credenciales. Define PLAY_REVIEWER_EMAIL y PLAY_REVIEWER_PASSWORD."
    Write-Note "Provisionar: cd apps/api && npm run seed:play-reviewer"
    Write-Note "Continuando sin auto-login (debes estar logueado manualmente)."
  } else {
    Write-Step "Preparación + auto-login (solo debug)"
    Invoke-ScreenshotPrep $adb $serial
    Invoke-AutoLogin $adb $serial $Email $Password
  }
} else {
  Invoke-ScreenshotPrep $adb $serial
}

Write-Step "Capturando $($screens.Count) pantallas"
$captured = 0
foreach ($screen in $screens) {
  Write-Host ""
  Write-Host "[$($screen.Order)/$($screens.Count)] $($screen.Name)" -ForegroundColor Cyan
  Open-DeepLink $adb $serial $screen.DeepLink
  Start-Sleep -Seconds $NavWaitSec
  $dest = Join-Path $outDir $screen.File
  Capture-Screenshot $adb $serial $dest
  $captured++
}

Write-Host ""
Write-Host "Listo: $captured captura(s) en $outDir" -ForegroundColor Green
Write-Host "Sube los PNG en Play Console → Ficha → Gráficos → Capturas de teléfono."
Write-Host "Ver: docs/PLAY-SCREENSHOTS-GUIDE.md"
