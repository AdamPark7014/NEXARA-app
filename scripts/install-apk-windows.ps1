param(
  [string]$ApkPath = "apps/mobile-native/android/app/build/outputs/apk/debug/app-debug.apk",
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "No se encontro adb en PATH. Instala Android Platform Tools y vuelve a intentar."
  }

  if ($Build) {
    Write-Host "Compilando APK debug..."
    Push-Location "apps/mobile-native/android"
    try {
      & .\gradlew.bat assembleDebug --no-daemon
    }
    finally {
      Pop-Location
    }
  }

  $resolvedApk = Resolve-Path $ApkPath -ErrorAction Stop
  Write-Host "APK detectada en: $resolvedApk"

  & adb start-server | Out-Null
  $rows = (& adb devices) | Select-Object -Skip 1 | Where-Object { $_.Trim() -ne "" }

  $online = @()
  $unauthorized = @()
  $offline = @()

  foreach ($row in $rows) {
    if ($row -match "^([^\s]+)\s+device$") {
      $online += $matches[1]
      continue
    }
    if ($row -match "^([^\s]+)\s+unauthorized$") {
      $unauthorized += $matches[1]
      continue
    }
    if ($row -match "^([^\s]+)\s+offline$") {
      $offline += $matches[1]
      continue
    }
  }

  if ($online.Count -eq 0) {
    if ($unauthorized.Count -gt 0) {
      Write-Host "Dispositivo detectado pero sin autorizacion ADB: $($unauthorized -join ', ')" -ForegroundColor Yellow
      Write-Host "Acepta el popup 'Permitir depuracion USB' en el telefono y vuelve a ejecutar este script." -ForegroundColor Yellow
      exit 1
    }

    if ($offline.Count -gt 0) {
      Write-Host "Dispositivo en estado offline: $($offline -join ', ')" -ForegroundColor Yellow
      Write-Host "Desconecta y reconecta el cable USB, luego ejecuta de nuevo." -ForegroundColor Yellow
      exit 1
    }

    Write-Host "No hay dispositivos conectados. Conecta el telefono por USB y habilita depuracion USB." -ForegroundColor Yellow
    exit 1
  }

  $serial = $online[0]
  Write-Host "Instalando en dispositivo: $serial"
  & adb -s $serial install -r "$resolvedApk"

  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la instalacion de la APK."
  }

  Write-Host "Instalacion completada correctamente."
}
finally {
  Pop-Location
}
