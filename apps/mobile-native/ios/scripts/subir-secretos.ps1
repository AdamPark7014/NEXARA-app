<#
.SINOPSIS
    Carga en GitHub los seis secretos que necesita el flujo iOS · TestFlight.

.DESCRIPCION
    Lee el material que dejo `crear-certificado.ps1` en C:\dev\secrets\nexara-ios
    y lo publica como secretos del repositorio. Los valores no se imprimen nunca
    en pantalla ni quedan en el historial de PowerShell.

    Los seis secretos:

      IOS_DIST_CERT_P12        el .p12 en base64            <- del guion anterior
      IOS_DIST_CERT_PASSWORD   la contrasena de ese .p12    <- la que elegiste tu
      IOS_TEAM_ID              10 caracteres                <- developer.apple.com, arriba a la derecha
      ASC_KEY_ID               10 caracteres                <- del nombre del fichero AuthKey_XXXXXXXXXX.p8
      ASC_ISSUER_ID            un UUID                      <- App Store Connect > Integraciones
      ASC_PRIVATE_KEY          el .p8 en base64             <- el fichero AuthKey_*.p8

.EJEMPLO
    .\subir-secretos.ps1 -TeamId ABCDE12345 -IssuerId 69a6de70-...-1f2b3c4d5e6f
#>
[CmdletBinding()]
param(
    [string]$Repo = 'AdamPark7014/NEXARA-app',
    [string]$Carpeta = 'C:\dev\secrets\nexara-ios',
    [string]$TeamId = '',
    [string]$IssuerId = '',
    [string]$ClaveP12 = ''
)

$ErrorActionPreference = 'Stop'

function Fallo($m) { Write-Host "  ERROR: $m" -ForegroundColor Red; exit 1 }

# --- Comprobaciones previas -------------------------------------------------

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Fallo "No hay 'gh' en el PATH. Instala GitHub CLI: https://cli.github.com"
}

& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  GitHub CLI no tiene sesion. Ejecuta primero:" -ForegroundColor Yellow
    Write-Host "      gh auth login" -ForegroundColor White
    Write-Host ""
    exit 1
}

$rutaB64 = Join-Path $Carpeta 'ios_distribution.p12.base64.txt'
if (-not (Test-Path $rutaB64)) {
    Fallo "No encuentro $rutaB64. Ejecuta antes: crear-certificado.ps1 -Paso p12"
}

# El .p8 de App Store Connect trae el identificador de clave en el nombre:
# AuthKey_ABC1234DEF.p8 -> ASC_KEY_ID = ABC1234DEF. Lo aprovechamos.
$p8 = Get-ChildItem -Path $Carpeta -Filter 'AuthKey_*.p8' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p8) {
    Write-Host ""
    Write-Host "  Falta la clave de App Store Connect." -ForegroundColor Yellow
    Write-Host "  1. https://appstoreconnect.apple.com/access/integrations/api"
    Write-Host "  2. Genera una clave con rol 'App Manager'."
    Write-Host "  3. Descarga el AuthKey_XXXXXXXXXX.p8 (SOLO se puede descargar una vez)."
    Write-Host "  4. Deja el fichero, sin renombrar, en: $Carpeta" -ForegroundColor White
    Write-Host ""
    exit 1
}
$keyId = $p8.BaseName -replace '^AuthKey_', ''
Write-Host "Clave de App Store Connect encontrada: $($p8.Name)  ->  ASC_KEY_ID = $keyId" -ForegroundColor DarkGray

# --- Datos que solo sabe Adam ----------------------------------------------

if (-not $TeamId)   { $TeamId   = Read-Host "IOS_TEAM_ID (10 caracteres, esquina superior derecha de developer.apple.com)" }
if (-not $IssuerId) { $IssuerId = Read-Host "ASC_ISSUER_ID (el UUID que aparece encima de la tabla de claves)" }
if (-not $ClaveP12) {
    $sec = Read-Host "IOS_DIST_CERT_PASSWORD (la contrasena que le pusiste al .p12)" -AsSecureString
    $ClaveP12 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

if ($TeamId.Length -ne 10)   { Fallo "IOS_TEAM_ID deberia tener 10 caracteres y tiene $($TeamId.Length)." }
if ($IssuerId -notmatch '^[0-9a-fA-F-]{36}$') { Fallo "ASC_ISSUER_ID no parece un UUID." }
if (-not $ClaveP12)          { Fallo "La contrasena del .p12 no puede ir vacia." }

# --- Aviso: el repositorio es publico ---------------------------------------

$vis = (& gh repo view $Repo --json visibility --jq '.visibility' 2>$null)
if ($vis -eq 'PUBLIC') {
    Write-Host ""
    Write-Host "  AVISO: $Repo es PUBLICO." -ForegroundColor Yellow
    Write-Host "  Los secretos en si estan a salvo (GitHub los cifra y no los expone"
    Write-Host "  a bifurcaciones), pero por eso el flujo ios-testflight.yml se dispara"
    Write-Host "  SOLO a mano. Si alguien le anade un disparador 'pull_request',"
    Write-Host "  cualquiera podria extraer el certificado desde un PR." -ForegroundColor Yellow
    Write-Host ""
}

# --- Carga ------------------------------------------------------------------

$b64p12 = (Get-Content $rutaB64 -Raw).Trim()
$b64p8  = [System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes($p8.FullName))

$secretos = [ordered]@{
    'IOS_DIST_CERT_P12'      = $b64p12
    'IOS_DIST_CERT_PASSWORD' = $ClaveP12
    'IOS_TEAM_ID'            = $TeamId
    'ASC_KEY_ID'             = $keyId
    'ASC_ISSUER_ID'          = $IssuerId
    'ASC_PRIVATE_KEY'        = $b64p8
}

Write-Host "Cargando seis secretos en $Repo ..." -ForegroundColor Cyan
foreach ($n in $secretos.Keys) {
    & gh secret set $n --repo $Repo --body $secretos[$n]
    if ($LASTEXITCODE -ne 0) { Fallo "No se pudo crear el secreto $n" }
    Write-Host ("  OK  {0,-24} ({1} caracteres)" -f $n, $secretos[$n].Length) -ForegroundColor Green
}

Write-Host ""
Write-Host "Hecho. Lanza la construccion con:" -ForegroundColor Green
Write-Host "  gh workflow run ios-testflight.yml --repo $Repo -f version=1.0.0 -f subir=true" -ForegroundColor White
Write-Host "o desde la pestana Actions del repositorio."
Write-Host ""
