<#
.SINOPSIS
    Vuelve a sembrar la cuenta demo de revisión de tiendas en el servidor, con la contraseña que tú indiques.

.DESCRIPCION
    Corre `npm run seed:play-reviewer` dentro del contenedor `nexara-api` del Hetzner. El sembrador es
    idempotente y deja la cuenta `play.review@nexara.com.mx` así:

        - activa, sin MFA, sin candado y con el contador de intentos fallidos en cero
        - con la contraseña que tú escribas aquí (la misma que está en App Store Connect)
        - como única membresía, la del tenant aislado `nexara-demo`
        - con los datos de demostración del tenant refrescados

    La contraseña se pide con `Read-Host -AsSecureString`, viaja al servidor por la entrada estándar de SSH
    (no aparece en la lista de procesos ni en el historial) y la línea «Contraseña» del informe del
    sembrador se enmascara antes de llegar a pantalla.

    Después corre `verificar-cuenta-revision.ps1` para comprobar que entra.

.EJEMPLO
    .\resembrar-cuenta-revision.ps1
#>
[CmdletBinding()]
param(
    [string]$Servidor = '5.78.215.109',
    [int]$Puerto = 2222,
    [string]$Llave = "$HOME\.ssh\id_ed25519_nexara_hetzner",
    [string]$Contenedor = 'nexara-api'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Llave)) { Write-Host "No existe la llave SSH: $Llave" -ForegroundColor Red; exit 1 }

$secure = Read-Host 'Contraseña que debe tener play.review@nexara.com.mx' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ([string]::IsNullOrWhiteSpace($plain)) { Write-Host 'Contraseña vacía, no se hace nada.' -ForegroundColor Red; exit 1 }

# El servidor lee la contraseña de la primera línea de stdin, la exporta y se la pasa al contenedor
# por nombre (`-e VAR` sin valor), y enmascara la línea donde el sembrador la repite.
$remoto = @"
IFS= read -r PLAY_REVIEWER_PASSWORD
export PLAY_REVIEWER_PASSWORD
docker exec -e PLAY_REVIEWER_PASSWORD $Contenedor sh -c 'cd /app/apps/api && npm run seed:play-reviewer' 2>&1 | sed -E 's/(Contrase.a +: ).*/\1[oculta]/'
"@

Write-Host ''
Write-Host "Sembrando en ${Servidor}:${Puerto} ($Contenedor)..." -ForegroundColor Cyan
$plain | ssh -i $Llave -p $Puerto -o ConnectTimeout=20 "root@$Servidor" $remoto
$codigo = $LASTEXITCODE
$plain = $null

Write-Host ''
if ($codigo -eq 0) {
    Write-Host 'Listo. Ahora corre: .\verificar-cuenta-revision.ps1' -ForegroundColor Green
} else {
    Write-Host "El sembrador terminó con código $codigo. Revisa el informe de arriba." -ForegroundColor Red
}
exit $codigo
