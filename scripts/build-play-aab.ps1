param(
  [switch]$CreateKeystore,
  [switch]$Clean,
  [switch]$BumpVersionCode,
  [int]$VersionCode = 0,
  [string]$VersionName = "",
  [string]$KeyAlias = "nexara",
  [string]$StoreFileName = "nexara-upload.jks"
)

# ============================================================================
# Build Android App Bundle (.aab) firmado para Google Play.
#
# Uso:
#   pwsh -File scripts/build-play-aab.ps1 -CreateKeystore     # primera vez
#   pwsh -File scripts/build-play-aab.ps1 -BumpVersionCode    # release normal
#   pwsh -File scripts/build-play-aab.ps1 -VersionCode 9 -VersionName 1.1.0
#   npm run mobile:android:play-aab
#
# Output:
#   apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab
#
# Notas de seguridad de release:
#   - El AAB anterior se BORRA antes de compilar. Si el build falla, no queda un
#     bundle viejo en disco al que subir por equivocación. Ese fallo ya ocurrió:
#     el 31-08 se quedó en disco un AAB anterior a un commit de correcciones.
#   - Play NUNCA reutiliza un versionCode, ni siquiera de un bundle descartado.
#     Este script exige que subas el número en cada intento de subida.
#   - El mapping.txt se archiva junto al AAB con su versionCode. Sin él, los
#     stack traces de Crashlytics de esa versión son ilegibles para siempre.
# ============================================================================

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "apps\mobile-native\android"
$keystorePath = Join-Path $androidDir $StoreFileName
$keyPropsPath = Join-Path $androidDir "key.properties"
$gradlePropsPath = Join-Path $androidDir "gradle.properties"
$aabPath = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
$mappingPath = Join-Path $androidDir "app\build\outputs\mapping\release\mapping.txt"
$releaseArchive = Join-Path $repoRoot "apps\mobile-native\play-releases"

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

  # --- Versionado -----------------------------------------------------------
  if (-not (Test-Path $gradlePropsPath)) {
    throw "No existe $gradlePropsPath"
  }
  $gradleProps = Get-Content $gradlePropsPath
  $currentCode = [int](($gradleProps | Select-String -Pattern '^VERSION_CODE=(\d+)').Matches.Groups[1].Value)
  $currentName = ($gradleProps | Select-String -Pattern '^VERSION_NAME=(.+)').Matches.Groups[1].Value

  $targetCode = $currentCode
  $targetName = $currentName

  if ($VersionCode -gt 0) { $targetCode = $VersionCode }
  elseif ($BumpVersionCode) { $targetCode = $currentCode + 1 }

  if ($VersionName -ne "") { $targetName = $VersionName }

  if ($targetCode -ne $currentCode -or $targetName -ne $currentName) {
    Write-Host "Actualizando versión: $currentCode/$currentName -> $targetCode/$targetName" -ForegroundColor Cyan
    $updated = $gradleProps `
      -replace '^VERSION_CODE=\d+', "VERSION_CODE=$targetCode" `
      -replace '^VERSION_NAME=.+', "VERSION_NAME=$targetName"
    Set-Content -Path $gradlePropsPath -Value $updated -Encoding ASCII
  }

  Write-Host ""
  Write-Host "Compilando versionCode=$targetCode versionName=$targetName" -ForegroundColor White
  Write-Host "RECUERDA: Play rechaza un versionCode ya SUBIDO, aunque el bundle se" -ForegroundColor Yellow
  Write-Host "descartara o nunca se publicara. Verifica el mayor subido en Play" -ForegroundColor Yellow
  Write-Host "Console -> Versiones -> Panel de la app antes de subir este AAB." -ForegroundColor Yellow
  Write-Host ""

  # --- Borrar el bundle anterior -------------------------------------------
  # Para que un build fallido no deje en disco un AAB viejo que alguien suba
  # creyendo que es el nuevo.
  if (Test-Path $aabPath) {
    Write-Host "Borrando AAB anterior ($(( Get-Item $aabPath ).LastWriteTime))..." -ForegroundColor DarkGray
    Remove-Item $aabPath -Force
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

  # --- Archivar mapping.txt -------------------------------------------------
  # Sin el mapping de ESTA versión, los crashes que Crashlytics recoja de ella
  # llegan ofuscados y ya no hay forma de recuperarlos.
  if (Test-Path $mappingPath) {
    if (-not (Test-Path $releaseArchive)) {
      New-Item -ItemType Directory -Path $releaseArchive | Out-Null
    }
    # El mapping pesa >100 MB: que la carpeta se ignore sola, sin depender de
    # que alguien acuerde de tocar el .gitignore de la raíz.
    $archiveIgnore = Join-Path $releaseArchive ".gitignore"
    if (-not (Test-Path $archiveIgnore)) {
      Set-Content -Path $archiveIgnore -Value @("*", "!.gitignore") -Encoding ASCII
    }
    $mappingCopy = Join-Path $releaseArchive "mapping-v$targetCode-$targetName.txt"
    Copy-Item $mappingPath $mappingCopy -Force
    $mappingMb = [math]::Round((Get-Item $mappingCopy).Length / 1MB, 1)
    Write-Host "mapping.txt archivado ($mappingMb MB): $mappingCopy" -ForegroundColor DarkGray
  }
  else {
    Write-Host "AVISO: no se encontró mapping.txt en $mappingPath" -ForegroundColor Yellow
  }

  $item = Get-Item $aabPath
  Write-Host ""
  Write-Host "AAB listo:" -ForegroundColor Green
  Write-Host "  $($item.FullName)"
  Write-Host "  versionCode: $targetCode   versionName: $targetName"
  Write-Host "  Tamaño: $([math]::Round($item.Length / 1MB, 2)) MB"
  Write-Host ""
  Write-Host "Siguiente paso en Play Console:"
  Write-Host "  1) https://play.google.com/console"
  Write-Host "  2) Crear app (si no existe) → package mx.nexara.mobile.nativeapp"
  Write-Host "  3) Producción o prueba interna → Crear versión → Subir este .aab"
  Write-Host "  4) Completar ficha, clasificación de contenido, privacidad y países"
  Write-Host ""
  Write-Host "ANTES de promover a Producción: prueba el AAB MINIFICADO en un teléfono" -ForegroundColor Yellow
  Write-Host "real (bundletool build-apks --local-testing). El debug no prueba R8." -ForegroundColor Yellow
}
finally {
  Pop-Location
}
