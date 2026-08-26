param(
  [switch]$CreateKeystore,
  [switch]$Clean,
  [string]$KeyAlias = "nexara",
  [string]$StoreFileName = "nexara-upload.jks"
)

# ============================================================================
# Build Android App Bundle (.aab) firmado para Google Play.
#
# Uso:
#   pwsh -File scripts/build-play-aab.ps1 -CreateKeystore   # primera vez
#   pwsh -File scripts/build-play-aab.ps1                   # builds siguientes
#   npm run mobile:android:play-aab
#
# Output:
#   apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab
# ============================================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "apps\mobile-native\android"
$keystorePath = Join-Path $androidDir $StoreFileName
$keyPropsPath = Join-Path $androidDir "key.properties"
$aabPath = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"

function New-StrongPassword([int]$Length = 24) {
  $chars = (48..57 + 65..90 + 97..122) | ForEach-Object { [char]$_ }
  -join (1..$Length | ForEach-Object { $chars | Get-Random })
}

if (-not (Test-Path $androidDir)) {
  throw "No existe $androidDir"
}

Push-Location $androidDir
try {
  if ($CreateKeystore -or (-not (Test-Path $keystorePath))) {
    if ((Test-Path $keystorePath) -and -not $CreateKeystore) {
      Write-Host "Keystore ya existe: $keystorePath"
    } else {
      if (Test-Path $keystorePath) {
        throw "Ya existe $keystorePath. Borra a mano solo si estás seguro (perderías firma Play)."
      }

      $storePassword = New-StrongPassword 28
      $keyPassword = $storePassword

      Write-Host "Generando upload keystore (guárdalo en un lugar seguro)..." -ForegroundColor Cyan
      & keytool -genkeypair `
        -v `
        -keystore $StoreFileName `
        -alias $KeyAlias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass $storePassword `
        -keypass $keyPassword `
        -dname "CN=NEXARA, OU=Mobile, O=NEXARA, L=Puebla, ST=Puebla, C=MX"

      if ($LASTEXITCODE -ne 0) {
        throw "keytool falló (exit $LASTEXITCODE). ¿Java en PATH?"
      }

      @"
storePassword=$storePassword
keyPassword=$keyPassword
keyAlias=$KeyAlias
storeFile=$StoreFileName
"@ | Set-Content -Path $keyPropsPath -Encoding ASCII

      Write-Host ""
      Write-Host "IMPORTANTE: respalda estos archivos (si los pierdes, no podrás actualizar la app en Play):" -ForegroundColor Yellow
      Write-Host "  - $keystorePath"
      Write-Host "  - $keyPropsPath"
      Write-Host ""
    }
  }

  if (-not (Test-Path $keyPropsPath)) {
    throw "Falta key.properties. Corre con -CreateKeystore o copia key.properties.example."
  }

  Write-Host "Compilando bundleRelease (AAB)..." -ForegroundColor Cyan
  $gradleTask = if ($Clean) { "clean bundleRelease" } else { "bundleRelease" }
  & .\gradlew.bat --no-daemon $gradleTask
  if ($LASTEXITCODE -ne 0) {
    throw "bundleRelease falló (exit $LASTEXITCODE)"
  }

  if (-not (Test-Path $aabPath)) {
    throw "No se generó el AAB en $aabPath"
  }

  $item = Get-Item $aabPath
  Write-Host ""
  Write-Host "AAB listo:" -ForegroundColor Green
  Write-Host "  $($item.FullName)"
  Write-Host "  Tamaño: $([math]::Round($item.Length / 1MB, 2)) MB"
  Write-Host ""
  Write-Host "Siguiente paso en Play Console:"
  Write-Host "  1) https://play.google.com/console"
  Write-Host "  2) Crear app (si no existe) → package mx.nexara.mobile.nativeapp"
  Write-Host "  3) Producción o prueba interna → Crear versión → Subir este .aab"
  Write-Host "  4) Completar ficha, clasificación de contenido, privacidad y países"
}
finally {
  Pop-Location
}
