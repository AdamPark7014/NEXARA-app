<#
.SINOPSIS
    Crea la identidad de firma de distribución de iOS desde Windows, sin Mac.

.DESCRIPCION
    Todo el mundo cree que el certificado de distribucion exige Keychain Access.
    No es cierto: el llavero de macOS solo genera una peticion de firma (CSR) con
    OpenSSL por debajo. Aqui se hace lo mismo con el OpenSSL de Windows.

    El proceso tiene dos pasos porque en medio hay que pasar por el portal de
    Apple, que no tiene API para esto:

        1) .\crear-certificado.ps1 -Paso csr
           Genera la clave privada y la peticion. Subes el .csr al portal.

        2) .\crear-certificado.ps1 -Paso p12 -ClaveP12 "loquesea"
           Toma el .cer que descargaste y lo une con la clave privada en un
           .p12, que es lo que entiende el runner de macOS.

    La clave privada NUNCA sale de C:\dev\secrets\nexara-ios y NUNCA entra al
    repositorio, que ademas es publico.

.EJEMPLO
    .\crear-certificado.ps1 -Paso csr -Correo "adam@nexara.com.mx" -Nombre "NEXARA"
    .\crear-certificado.ps1 -Paso p12 -ClaveP12 "una-clave-larga-que-guardes"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('csr', 'p12')]
    [string]$Paso,

    [string]$Correo = '',
    [string]$Nombre = 'NEXARA',
    [string]$ClaveP12 = '',
    [string]$Carpeta = 'C:\dev\secrets\nexara-ios'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw "No hay openssl en el PATH. Viene con Git para Windows en C:\Program Files\Git\usr\bin."
}

if (-not (Test-Path $Carpeta)) {
    New-Item -ItemType Directory -Path $Carpeta -Force | Out-Null
    Write-Host "Carpeta creada: $Carpeta" -ForegroundColor DarkGray
}

$rutaClave = Join-Path $Carpeta 'ios_distribution.key'
$rutaCsr   = Join-Path $Carpeta 'ios_distribution.csr'
$rutaCer   = Join-Path $Carpeta 'distribution.cer'
$rutaPem   = Join-Path $Carpeta 'distribution.pem'
$rutaP12   = Join-Path $Carpeta 'ios_distribution.p12'
$rutaB64   = Join-Path $Carpeta 'ios_distribution.p12.base64.txt'

switch ($Paso) {

    'csr' {
        if (-not $Correo) { throw "Falta -Correo (el Apple ID de la cuenta de desarrollador)." }

        if (Test-Path $rutaClave) {
            Write-Host ""
            Write-Host "  YA EXISTE una clave privada en $rutaClave" -ForegroundColor Yellow
            Write-Host "  Si la sobrescribes, el certificado que ya tengas emitido queda INUTIL:" -ForegroundColor Yellow
            Write-Host "  un certificado sin su clave privada no firma nada." -ForegroundColor Yellow
            $r = Read-Host "  Escribe SOBRESCRIBIR para continuar, cualquier otra cosa para abortar"
            if ($r -ne 'SOBRESCRIBIR') { Write-Host "Abortado."; return }
        }

        Write-Host "`n[1/2] Generando clave privada RSA 2048..." -ForegroundColor Cyan
        & openssl genrsa -out $rutaClave 2048
        if ($LASTEXITCODE -ne 0) { throw "openssl genrsa fallo" }

        Write-Host "[2/2] Generando la peticion de firma (CSR)..." -ForegroundColor Cyan
        & openssl req -new -key $rutaClave -out $rutaCsr -subj "/emailAddress=$Correo/CN=$Nombre/C=MX"
        if ($LASTEXITCODE -ne 0) { throw "openssl req fallo" }

        Write-Host ""
        Write-Host "Listo. Ahora, en el navegador:" -ForegroundColor Green
        Write-Host ""
        Write-Host "  1. https://developer.apple.com/account/resources/certificates/add"
        Write-Host "  2. Elige 'Apple Distribution' (NO 'Apple Development')."
        Write-Host "  3. Sube este fichero:"
        Write-Host "       $rutaCsr" -ForegroundColor White
        Write-Host "  4. Descarga el .cer y guardalo EXACTAMENTE aqui:"
        Write-Host "       $rutaCer" -ForegroundColor White
        Write-Host ""
        Write-Host "  Luego ejecuta:"
        Write-Host "       .\crear-certificado.ps1 -Paso p12 -ClaveP12 'una-clave-que-guardes'" -ForegroundColor White
        Write-Host ""
    }

    'p12' {
        if (-not $ClaveP12) { throw "Falta -ClaveP12. Es la contrasena que protege el .p12; la necesitaras como secreto IOS_DIST_CERT_PASSWORD." }
        if (-not (Test-Path $rutaClave)) { throw "No encuentro la clave privada en $rutaClave. Ejecuta primero el paso 'csr'." }
        if (-not (Test-Path $rutaCer))   { throw "No encuentro el certificado en $rutaCer. Descargalo del portal de Apple y ponlo ahi." }

        Write-Host "`n[1/3] Convirtiendo el .cer (DER) a PEM..." -ForegroundColor Cyan
        & openssl x509 -inform DER -in $rutaCer -out $rutaPem -outform PEM
        if ($LASTEXITCODE -ne 0) { throw "El .cer no parece estar en DER. Prueba a abrirlo y reexportarlo del portal." }

        # Los algoritmos van explicitos, y por dos motivos medidos:
        #
        #   - Por omision OpenSSL 3 cifra con AES-256. `security import` de
        #     macOS ha fallado historicamente con eso ("MAC verification
        #     failed"), asi que no nos la jugamos.
        #   - La alternativa obvia, `-legacy`, produce RC2 de 40 bits: ademas
        #     de debil, para releerlo hace falta cargar otra vez el proveedor
        #     legacy, con lo que las verificaciones de abajo fallarian.
        #
        # PBE-SHA1-3DES es el formato clasico que macOS acepta siempre y que
        # el proveedor por omision de OpenSSL 3 sigue sabiendo leer.
        Write-Host "[2/3] Empaquetando clave + certificado en un .p12 (3DES/SHA1)..." -ForegroundColor Cyan
        & openssl pkcs12 -export `
            -inkey $rutaClave `
            -in $rutaPem `
            -out $rutaP12 `
            -name "NEXARA iOS Distribution" `
            -keypbe PBE-SHA1-3DES `
            -certpbe PBE-SHA1-3DES `
            -macalg sha1 `
            -passout "pass:$ClaveP12"
        if ($LASTEXITCODE -ne 0) { throw "openssl pkcs12 fallo" }

        Write-Host "[3/3] Verificando que el .p12 se puede abrir y lleva la clave privada..." -ForegroundColor Cyan
        $verif = & openssl pkcs12 -in $rutaP12 -passin "pass:$ClaveP12" -nokeys -info -noout 2>&1
        if ($LASTEXITCODE -ne 0) { throw "El .p12 generado no se puede leer: $verif" }
        $tieneClave = & openssl pkcs12 -in $rutaP12 -passin "pass:$ClaveP12" -nocerts -noout 2>&1
        if ($LASTEXITCODE -ne 0) { throw "El .p12 NO contiene la clave privada: $tieneClave" }

        # GitHub espera el secreto en base64 de una sola linea.
        $bytes = [System.IO.File]::ReadAllBytes($rutaP12)
        [System.IO.File]::WriteAllText($rutaB64, [System.Convert]::ToBase64String($bytes))

        $sujeto = (& openssl x509 -in $rutaPem -noout -subject) -replace '^subject=\s*', ''
        $caduca = (& openssl x509 -in $rutaPem -noout -enddate) -replace '^notAfter=', ''

        Write-Host ""
        Write-Host "Certificado listo." -ForegroundColor Green
        Write-Host "  Sujeto : $sujeto"
        Write-Host "  Caduca : $caduca"
        Write-Host "  .p12   : $rutaP12"
        Write-Host "  base64 : $rutaB64"
        Write-Host ""
        Write-Host "Siguiente paso:" -ForegroundColor Green
        Write-Host "  .\subir-secretos.ps1" -ForegroundColor White
        Write-Host ""
    }
}
