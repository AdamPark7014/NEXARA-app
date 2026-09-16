<#
.SYNOPSIS
  Instala la cuenta de servicio de Firebase (push FCM) en el servidor NEXARA y reinicia la API.

.DESCRIPTION
  Lo corre una persona, no un agente: la clave es secreta.
  1. Toma el .json de la cuenta de servicio (por defecto, el más reciente
     `*firebase-adminsdk*.json` de Descargas).
  2. Comprueba que sea de tipo service_account y del proyecto esperado.
  3. Lo manda en base64 dentro del script que SSH lee por la entrada estándar (nunca en la línea
     de comandos, así no aparece en la lista de procesos) y
     reemplaza FIREBASE_SERVICE_ACCOUNT_JSON en deploy/.env.nexara, con respaldo previo.
  4. Recrea solo el contenedor de la API y confirma que Firebase arrancó.

.EXAMPLE
  pwsh -File scripts/firebase/instalar-clave-servidor.ps1
  pwsh -File scripts/firebase/instalar-clave-servidor.ps1 -Archivo "C:\ruta\clave.json" -BorrarDescarga
#>
param(
  [string]$Archivo,
  [string]$Proyecto = 'nexara-app',
  [string]$Servidor = 'root@5.78.215.109',
  [int]$Puerto = 2222,
  [string]$Llave = "$HOME\.ssh\id_ed25519_nexara_hetzner",
  [string]$RutaDeploy = '/var/www/nexara-app/deploy',
  # Borra el .json descargado al terminar (recomendado: la copia buena queda en el servidor).
  [switch]$BorrarDescarga
)

$ErrorActionPreference = 'Stop'

if (-not $Archivo) {
  $descargas = Join-Path $HOME 'Downloads'
  $candidato = Get-ChildItem -Path $descargas -Filter '*firebase-adminsdk*.json' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $candidato) {
    throw "No encontré ningún *firebase-adminsdk*.json en $descargas. Genera la clave en Firebase o pasa -Archivo."
  }
  $Archivo = $candidato.FullName
}
if (-not (Test-Path $Archivo)) { throw "No existe $Archivo" }

$texto = Get-Content -Raw -Path $Archivo -Encoding UTF8
try { $json = $texto | ConvertFrom-Json } catch { throw "El archivo no es JSON válido: $Archivo" }
if ($json.type -ne 'service_account') { throw "El archivo no es una cuenta de servicio (type=$($json.type))." }
if ($json.project_id -ne $Proyecto) { throw "La clave es del proyecto '$($json.project_id)', no de '$Proyecto'." }

Write-Host "Clave: $([IO.Path]::GetFileName($Archivo))"
Write-Host "Proyecto: $($json.project_id) · cuenta: $($json.client_email)"

# El archivo tal cual, en base64: una sola línea sin comillas ni saltos que el .env pueda alterar.
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $Archivo)))

$remoto = @"
set -e
cd '$RutaDeploy'
cp .env.nexara .env.nexara.bak-`$(date +%Y%m%d%H%M%S)
grep -v '^FIREBASE_SERVICE_ACCOUNT_JSON=' .env.nexara > .env.nexara.tmp
printf 'FIREBASE_SERVICE_ACCOUNT_JSON=%s\n' "`$B64" >> .env.nexara.tmp
chmod 600 .env.nexara.tmp
mv .env.nexara.tmp .env.nexara
docker compose --env-file .env.nexara -f docker-compose.nexara.yml up -d --no-build api >/dev/null 2>&1
for i in `$(seq 1 30); do
  estado=`$(docker inspect -f '{{.State.Health.Status}}' nexara-api 2>/dev/null || echo desconocido)
  [ "`$estado" = healthy ] && break
  sleep 2
done
echo "API: `$estado"
docker exec nexara-api node -e 'const r=(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||"").trim();const j=JSON.parse(r.startsWith("{")?r:Buffer.from(r,"base64").toString("utf8"));console.log("Firebase en la API: proyecto", j.project_id)'
# fin
"@ -replace "`r`n", "`n"

Write-Host 'Instalando en el servidor…'
# Todo por stdin: la primera línea define B64 y después va el script (bash -s). Sin salto al
# final: PowerShell agrega su propio CRLF y la última línea es un comentario que lo absorbe.
"B64='$b64'`n$remoto" | & ssh -i $Llave -p $Puerto -o BatchMode=yes $Servidor 'bash -s'
if ($LASTEXITCODE -ne 0) { throw "Falló la instalación en el servidor (código $LASTEXITCODE)." }

if ($BorrarDescarga) {
  Remove-Item -LiteralPath $Archivo -Force
  Write-Host "Borrado del equipo: $Archivo"
} else {
  Write-Host "Listo. Guarda o borra la copia local: $Archivo"
}
