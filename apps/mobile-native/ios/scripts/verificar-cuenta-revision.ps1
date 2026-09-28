<#
.SINOPSIS
    Comprueba que la cuenta demo de revisión de Apple/Google entra a NEXARA igual que lo hace la app iOS.

.DESCRIPCION
    Reproduce, contra el API público, la misma secuencia que `AuthRepository.swift`:

        1. POST auth/login          (correo + contraseña)
        2. GET  company/mine        (tenant al que pertenece)
        3. GET  me/navigation       (paneles y módulos visibles)
        4. GET  auth/profile        (rol y permisos)
        5. POST auth/login otra vez (que un segundo intento tampoco falle)

    La contraseña se pide con `Read-Host -AsSecureString` (o se toma de la variable
    de entorno NEXARA_REVIEW_PASSWORD). No se imprime, no se escribe en disco y el
    token de sesión tampoco se muestra.

    Sale con código 0 si todo pasa y 1 si algo falla, así que sirve en un guion.

.EJEMPLO
    .\verificar-cuenta-revision.ps1

.EJEMPLO
    .\verificar-cuenta-revision.ps1 -Api https://api.nexara.com.mx/api -Email play.review@nexara.com.mx
#>
[CmdletBinding()]
param(
    [string]$Api = 'https://api.nexara.com.mx/api',
    [string]$Email = 'play.review@nexara.com.mx'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$plain = $env:NEXARA_REVIEW_PASSWORD
if ([string]::IsNullOrEmpty($plain)) {
    $secure = Read-Host "Contraseña de $Email" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if ([string]::IsNullOrEmpty($plain)) { Write-Host 'Sin contraseña, nada que probar.' -ForegroundColor Red; exit 1 }

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(30)

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body = $null, [string]$Token = '')
    $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), "$($Api.TrimEnd('/'))/$Path")
    $req.Headers.TryAddWithoutValidation('Accept', 'application/json') | Out-Null
    $req.Headers.TryAddWithoutValidation('User-Agent', 'NexaraStoreReviewCheck/1.0') | Out-Null
    if ($Token) { $req.Headers.TryAddWithoutValidation('Authorization', "Bearer $Token") | Out-Null }
    if ($null -ne $Body) {
        $req.Content = [System.Net.Http.StringContent]::new(($Body | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
    }
    try {
        $res = $client.SendAsync($req).GetAwaiter().GetResult()
        $txt = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $json = $null
        try { $json = $txt | ConvertFrom-Json -ErrorAction Stop } catch { }
        return [pscustomobject]@{ Status = [int]$res.StatusCode; Raw = $txt; Json = $json }
    } catch {
        return [pscustomobject]@{ Status = 0; Raw = $_.Exception.Message; Json = $null }
    }
}

$fallos = 0
function Paso {
    param([string]$Nombre, [bool]$Ok, [string]$Detalle = '')
    if ($Ok) { Write-Host ("  [ OK ] {0}  {1}" -f $Nombre, $Detalle) -ForegroundColor Green }
    else { Write-Host ("  [FALLA] {0}  {1}" -f $Nombre, $Detalle) -ForegroundColor Red; $script:fallos++ }
}

function Pista {
    param([int]$Status, [string]$Raw)
    $msg = if ($Raw.Length -gt 200) { $Raw.Substring(0, 200) } else { $Raw }
    switch ($Status) {
        0   { "No hubo respuesta (red, DNS, TLS o el API está caído): $msg" }
        400 { "El API rechazó el formato de la petición: $msg" }
        401 { "Credenciales rechazadas: contraseña distinta a la guardada, usuario inexistente o inactivo: $msg" }
        403 { "Prohibido: MFA obligatorio, cuenta bloqueada o regla de acceso (IP/horario): $msg" }
        423 { "Cuenta bloqueada por intentos fallidos: $msg" }
        429 { "Demasiados intentos desde esta IP (rate limit): $msg" }
        default { "HTTP ${Status}: $msg" }
    }
}

Write-Host ""
Write-Host "Verificando $Email contra $Api" -ForegroundColor Cyan
Write-Host ""

# 1. Login
$login = Invoke-Api -Method POST -Path 'auth/login' -Body @{ email = $Email; password = $plain }
$plain = $null
$token = ''
if ($login.Json) {
    if ($login.Json.access_token) { $token = [string]$login.Json.access_token }
    elseif ($login.Json.token) { $token = [string]$login.Json.token }
}
$loginOk = ($login.Status -ge 200 -and $login.Status -lt 300 -and $token.Length -gt 0)
if ($loginOk) {
    $rol = if ($login.Json.user.roleKey) { $login.Json.user.roleKey } elseif ($login.Json.user.role) { $login.Json.user.role } else { '?' }
    $mfa = ''
    foreach ($k in 'mfaRequired', 'requiresMfa', 'mfa_required', 'twoFactorRequired') {
        if ($login.Json.PSObject.Properties.Name -contains $k -and $login.Json.$k) { $mfa = " (¡el API pide MFA: $k!)" }
    }
    Paso 'auth/login' $true "HTTP $($login.Status), rol=$rol$mfa"
} else {
    Paso 'auth/login' $false (Pista $login.Status $login.Raw)
    Write-Host ""
    Write-Host "Sin sesión no hay más pasos. Si es 401: vuelve a sembrar la cuenta con resembrar-cuenta-revision.ps1." -ForegroundColor Yellow
    exit 1
}

# 2. company/mine
$c = Invoke-Api -Method GET -Path 'company/mine' -Token $token
$lista = @()
if ($c.Json) { $lista = @($c.Json) }
$slug = ''
$id = ''
if ($lista.Count -gt 0) {
    $p = $lista | Where-Object { $_.isPrimary } | Select-Object -First 1
    if (-not $p) { $p = $lista[0] }
    if ($p.slug) { $slug = [string]$p.slug }
    if ($p.id) { $id = [string]$p.id }
}
Paso 'company/mine' ($c.Status -eq 200 -and $lista.Count -gt 0) $(if ($c.Status -eq 200) { "empresas=$($lista.Count) id=$id slug=$slug" } else { Pista $c.Status $c.Raw })
if ($slug -and $slug -ne 'nexara-demo') {
    Paso 'tenant aislado' $false "el revisor cae en '$slug', debería ser 'nexara-demo' (la primaria no se le debe mostrar a Apple)"
}

# 3. me/navigation
$n = Invoke-Api -Method GET -Path 'me/navigation' -Token $token
$paneles = 0; $modulos = 0
if ($n.Json) {
    if ($n.Json.panels) { $paneles = @($n.Json.panels).Count }
    $modulos = @($n.Json.moduleKeys).Count + @($n.Json.webModuleIds).Count
}
Paso 'me/navigation' ($n.Status -eq 200 -and ($paneles + $modulos) -gt 0) $(if ($n.Status -eq 200) { "paneles=$paneles módulos=$modulos" } else { Pista $n.Status $n.Raw })

# 4. auth/profile
$pf = Invoke-Api -Method GET -Path 'auth/profile' -Token $token
$permisos = 0
if ($pf.Json -and $pf.Json.permissions) { $permisos = @($pf.Json.permissions).Count }
Paso 'auth/profile' ($pf.Status -eq 200) $(if ($pf.Status -eq 200) { "permisos=$permisos" } else { Pista $pf.Status $pf.Raw })

# 5. Segundo login
Write-Host ""
Write-Host "  (el segundo login necesita la contraseña otra vez; si la pasaste por variable de entorno se repite solo)" -ForegroundColor DarkGray
if ($env:NEXARA_REVIEW_PASSWORD) {
    $l2 = Invoke-Api -Method POST -Path 'auth/login' -Body @{ email = $Email; password = $env:NEXARA_REVIEW_PASSWORD }
    Paso 'segundo login' ($l2.Status -ge 200 -and $l2.Status -lt 300) "HTTP $($l2.Status)"
}

Write-Host ""
if ($fallos -eq 0) {
    Write-Host "TODO EN ORDEN: la cuenta entra y tiene navegación. Apple debería poder iniciar sesión." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$fallos comprobación(es) fallaron. Copia las líneas [FALLA] y se corrige." -ForegroundColor Red
    exit 1
}
