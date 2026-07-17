param(
  [string]$AvdName = "nexara_phone",
  [string]$SystemImage = "system-images;android-34;google_apis;x86_64",
  [string]$DeviceProfile = "pixel_6",
  [switch]$SkipBuild,
  [switch]$NoLaunch
)

# ============================================================================
# Preview Android nativo NEXARA (emulador + installDebug)
# Uso:
#   pwsh -File scripts/preview-android-emulator.ps1
#   npm run mobile:android:preview
# ============================================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "apps\mobile-native\android"
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }

if (-not (Test-Path $sdkRoot)) {
  throw "Android SDK no encontrado en $sdkRoot. Instala Android Studio / SDK y vuelve a intentar."
}

$emulatorDir = Join-Path $sdkRoot "emulator"
$platformTools = Join-Path $sdkRoot "platform-tools"
$cmdlineBin = Join-Path $sdkRoot "cmdline-tools\latest\bin"
$emulatorExe = Join-Path $emulatorDir "emulator.exe"
$adbExe = Join-Path $platformTools "adb.exe"
$sdkmanager = Join-Path $cmdlineBin "sdkmanager.bat"
$avdmanager = Join-Path $cmdlineBin "avdmanager.bat"

foreach ($required in @($emulatorExe, $adbExe, $sdkmanager, $avdmanager)) {
  if (-not (Test-Path $required)) {
    throw "Falta herramienta requerida: $required"
  }
}

# Prefer SDK tools over anything else on PATH for this session.
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$emulatorDir;$platformTools;$cmdlineBin;$env:Path"

$applicationId = "mx.nexara.mobile.nativeapp"
$mainActivity = "mx.nexara.mobile.nativeapp.MainActivity"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Package([string]$Package) {
  $list = & $sdkmanager --list_installed 2>$null | Out-String
  if ($list -match [regex]::Escape($Package)) {
    Write-Host "Ya instalado: $Package"
    return
  }

  Write-Host "Instalando paquete SDK: $Package"
  # sdkmanager interactive license prompts — accept all via yes pipe
  $yes = "y`n" * 80
  $yes | & $sdkmanager --install $Package --channel=0
  if ($LASTEXITCODE -ne 0) {
    throw "Falló sdkmanager --install $Package (exit $LASTEXITCODE)"
  }
}

function Ensure-Avd {
  $existing = & $emulatorExe -list-avds 2>$null
  if ($existing -contains $AvdName) {
    Write-Host "AVD existente: $AvdName"
    return
  }

  Write-Step "Creando AVD '$AvdName' ($SystemImage)"
  Ensure-Package "platforms;android-34"
  Ensure-Package $SystemImage

  # Non-interactive AVD create
  $createArgs = @(
    "create", "avd",
    "--force",
    "--name", $AvdName,
    "--package", $SystemImage,
    "--device", $DeviceProfile
  )

  $input = "no`n"  # do not create custom hardware profile interactively
  $input | & $avdmanager @createArgs
  if ($LASTEXITCODE -ne 0) {
    # Some avdmanager builds ignore --device; retry without it
    Write-Host "Reintento sin --device..." -ForegroundColor Yellow
    $input | & $avdmanager create avd --force --name $AvdName --package $SystemImage
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo crear el AVD $AvdName"
    }
  }

  # Prefer GPU host for performance on Windows
  $avdConfig = Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd\config.ini"
  if (Test-Path $avdConfig) {
    $cfg = Get-Content $avdConfig -Raw
    if ($cfg -notmatch "(?m)^hw\.gpu\.enabled=") {
      Add-Content -Path $avdConfig -Value "hw.gpu.enabled=yes"
    } else {
      $cfg = $cfg -replace "(?m)^hw\.gpu\.enabled=.*$", "hw.gpu.enabled=yes"
      Set-Content -Path $avdConfig -Value $cfg -NoNewline
    }
    if ($cfg -notmatch "(?m)^hw\.gpu\.mode=") {
      Add-Content -Path $avdConfig -Value "hw.gpu.mode=auto"
    }
  }

  Write-Host "AVD creado: $AvdName"
}

function Wait-ForDevice([int]$TimeoutSec = 180) {
  Write-Host "Esperando dispositivo/emulador online (máx ${TimeoutSec}s)..."
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    & $adbExe wait-for-device 2>$null | Out-Null
    $boot = (& $adbExe shell getprop sys.boot_completed 2>$null | Out-String).Trim()
    if ($boot -eq "1") {
      Write-Host "Emulador listo."
      return
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  throw "Timeout esperando boot_completed del emulador."
}

function Ensure-EmulatorRunning {
  $devices = & $adbExe devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
  $emulatorOnline = $devices | Where-Object { $_ -match "^emulator-" }

  if ($emulatorOnline) {
    Write-Host "Ya hay emulador online: $($emulatorOnline -join ', ')"
    return
  }

  Write-Step "Arrancando emulador $AvdName"
  Start-Process -FilePath $emulatorExe -ArgumentList @(
    "-avd", $AvdName,
    "-netdelay", "none",
    "-netspeed", "full"
  ) | Out-Null

  Wait-ForDevice
}

# ── Main ──────────────────────────────────────────────────────────────
Write-Host "NEXARA Android preview"
Write-Host "SDK: $sdkRoot"
Write-Host "Repo: $repoRoot"

Ensure-Avd
Ensure-EmulatorRunning

if (-not $SkipBuild) {
  Write-Step "Compilando e instalando debug APK"
  Push-Location $androidDir
  try {
    & .\gradlew.bat installDebug --no-daemon
    if ($LASTEXITCODE -ne 0) {
      throw "gradlew installDebug falló (exit $LASTEXITCODE)"
    }
  }
  finally {
    Pop-Location
  }
}

if (-not $NoLaunch) {
  Write-Step "Lanzando $applicationId/$mainActivity"
  & $adbExe shell am start -n "$applicationId/$mainActivity" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    # Fallback: monkey launcher
    & $adbExe shell monkey -p $applicationId -c android.intent.category.LAUNCHER 1 | Out-Null
  }
}

Write-Host ""
Write-Host "Preview Android listo en el emulador." -ForegroundColor Green
Write-Host "Para cambios en vivo de UI Compose: abre Android Studio → Open"
Write-Host "  $androidDir"
Write-Host "→ Run en el mismo emulador → Live Edit / Apply Changes."
Write-Host ""
Write-Host "iOS no corre en Windows. Usa Mac + Xcode (ver apps/mobile-native/ios/MAC_BUILD_PLAYBOOK.md)."
