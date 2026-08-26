param(
  [switch]$SkipAabCheck,
  [switch]$SkipCompile,
  [switch]$SkipTests
)

# ============================================================================
# Smoke checklist automatizado — Android NEXARA
#
# Verifica:
#   1) AAB de release existe (salida de build-play-aab.ps1)
#   2) Compilación debug pasa (assembleDebug)
#   3) Unit tests JVM pasan (testDebugUnitTest)
#
# Uso:
#   pwsh -ExecutionPolicy Bypass -File scripts/mobile-smoke-checklist.ps1
#   npm run mobile:smoke
#
# Checklist manual en dispositivo: docs/MOBILE-SMOKE-TEST.md
# Cuenta demo Play: play.review@nexara.com.mx (ver PLAY-STORE-CHECKLIST.md §6.1)
# ============================================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "apps\mobile-native\android"
$aabPath = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
$gradlew = Join-Path $androidDir "gradlew.bat"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "FALLO: $Message" -ForegroundColor Red
  exit 1
}

function Pass([string]$Message) {
  Write-Host "OK: $Message" -ForegroundColor Green
}

if (-not (Test-Path $androidDir)) {
  Fail "No existe el proyecto Android en $androidDir"
}

if (-not (Test-Path $gradlew)) {
  Fail "No se encontró gradlew.bat en $androidDir"
}

Write-Host "NEXARA Android smoke (automatizado)" -ForegroundColor White
Write-Host "Manual: docs/MOBILE-SMOKE-TEST.md"
Write-Host "Cuenta demo: play.review@nexara.com.mx (contraseña vía seed:play-reviewer, no en repo)"

# --- 1) AAB exists ---
if (-not $SkipAabCheck) {
  Write-Step "1/3 Verificar AAB de release"
  if (-not (Test-Path $aabPath)) {
    Fail @"
No existe el AAB en:
  $aabPath

Genera el bundle firmado con:
  npm run mobile:android:play-aab

O omite esta comprobación con -SkipAabCheck (solo para desarrollo local).
"@
  }

  $aab = Get-Item $aabPath
  Pass "AAB encontrado ($([math]::Round($aab.Length / 1MB, 2)) MB) — $($aab.FullName)"
}
else {
  Write-Step "1/3 AAB omitido (-SkipAabCheck)"
}

Push-Location $androidDir
try {
  # --- 2) Compile ---
  if (-not $SkipCompile) {
    Write-Step "2/3 Compilar (clean assembleDebug)"
    & $gradlew clean assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) {
      Fail "assembleDebug falló (exit $LASTEXITCODE)"
    }
    Pass "Compilación debug exitosa"
  }
  else {
    Write-Step "2/3 Compilación omitida (-SkipCompile)"
  }

  # --- 3) Unit tests ---
  if (-not $SkipTests) {
    Write-Step "3/3 Unit tests (testDebugUnitTest)"
    & $gradlew testDebugUnitTest --no-daemon
    if ($LASTEXITCODE -ne 0) {
      Fail "testDebugUnitTest falló (exit $LASTEXITCODE)"
    }
    Pass "Unit tests pasaron"
  }
  else {
    Write-Step "3/3 Tests omitidos (-SkipTests)"
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Smoke automatizado completado." -ForegroundColor Green
Write-Host "Siguiente: checklist manual en dispositivo (docs/MOBILE-SMOKE-TEST.md)" -ForegroundColor Yellow
Write-Host "  - Login: play.review@nexara.com.mx"
Write-Host "  - Paneles ERP, CRM, OPS, STUDIO, LAB, Portal"
Write-Host "  - Smart Quote, chat, actividades, lista de tickets"
