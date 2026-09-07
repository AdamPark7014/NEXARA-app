param(
  [switch]$SkipAabCheck,
  [switch]$SkipCompile,
  [switch]$SkipTests,
  # Compila desde cero. AVISO: `clean` borra `build/` entero, así que se lleva
  # por delante el AAB de release que el paso 1 acaba de validar. Úsalo solo
  # cuando sospeches de un árbol sucio, y recompila el bundle después.
  [switch]$CleanBuild
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

  # --- 1b) El AAB tiene que ser MÁS NUEVO que el código -------------------
  # Que el fichero exista no significa nada: el 31-08 el AAB en disco era dos
  # minutos anterior a un commit de correcciones de rutas, y este script lo
  # daba por bueno. Comprobar la fecha es lo único que distingue "hay un
  # bundle" de "hay un bundle de este código".
  $sourceRoots = @(
    (Join-Path $androidDir "app\src\main"),
    (Join-Path $androidDir "app\build.gradle.kts"),
    (Join-Path $androidDir "build.gradle.kts"),
    (Join-Path $androidDir "gradle.properties"),
    (Join-Path $androidDir "app\proguard-rules.pro")
  ) | Where-Object { Test-Path $_ }

  $newestSource = Get-ChildItem -Path $sourceRoots -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($null -ne $newestSource -and $newestSource.LastWriteTime -gt $aab.LastWriteTime) {
    Fail @"
El AAB es MÁS VIEJO que el código fuente.

  AAB      : $($aab.LastWriteTime)  ($($aab.FullName))
  Fuente   : $($newestSource.LastWriteTime)  ($($newestSource.FullName))

Ese bundle NO contiene los cambios más recientes. Si lo subes a Play, publicas
código viejo con un versionCode nuevo. Recompila:

  pwsh -File scripts/build-play-aab.ps1 -BumpVersionCode -Clean
"@
  }
  Pass "El AAB es posterior al último cambio de código ($($newestSource.LastWriteTime))"
}
else {
  Write-Step "1/3 AAB omitido (-SkipAabCheck)"
}

Push-Location $androidDir
try {
  # --- 2) Compile ---
  # OJO: aquí había un `gradlew clean`. El paso 1 comprueba que el AAB de
  # release existe y es más nuevo que el código… y `clean` borra `build/`
  # entero, AAB incluido. Es decir: verificar el bundle lo destruía, y al
  # terminar el smoke te quedabas sin nada que subir. Ocurrió de verdad el
  # 07-09-2026 con el bundle de la v2 recién firmado.
  #
  # `assembleDebug` no necesita partir de cero: Gradle recompila lo que
  # cambió. Si de verdad hace falta un árbol limpio, pásalo a propósito con
  # -CleanBuild, que además avisa de que se lleva el AAB por delante.
  if (-not $SkipCompile) {
    if ($CleanBuild) {
      Write-Step "2/3 Compilar (clean assembleDebug) — BORRA el AAB de release"
      & $gradlew clean assembleDebug --no-daemon
    }
    else {
      Write-Step "2/3 Compilar (assembleDebug, conserva el AAB de release)"
      & $gradlew assembleDebug --no-daemon
    }
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
