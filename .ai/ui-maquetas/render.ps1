# Renderiza las maquetas a PNG con Chrome headless (o Edge si no hay Chrome).
# Uso: pwsh -File render.ps1            → todas
#      pwsh -File render.ps1 web-sidebar → solo las que contengan ese texto
param([string]$Solo = "")

$dir = $PSScriptRoot
$out = Join-Path $dir "png"
New-Item -ItemType Directory -Force $out | Out-Null
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }

# salida, archivo, query, ancho, alto, escala
$jobs = @(
  @("web-sidebar", "web-sidebar.html", "", 1440, 900, 1),
  @("web-sidebar-oscuro", "web-sidebar.html", "?tema=oscuro", 1440, 900, 1),
  @("web-sidebar-colapsado", "web-sidebar.html", "?rail=1", 1440, 900, 1),
  @("web-actividades", "web-actividades.html", "", 1440, 1000, 1),
  @("web-actividades-vacio", "web-actividades.html", "?vacio=1", 1440, 900, 1),
  @("web-formulario", "web-formulario.html", "", 1440, 1580, 1),
  @("web-detalle", "web-detalle.html", "", 1440, 1200, 1),
  @("movil-inicio", "movil-inicio.html", "", 390, 844, 2),
  @("movil-inicio-ios", "movil-inicio.html", "?ios=1", 390, 844, 2),
  @("movil-actividad", "movil-actividad.html", "", 390, 844, 2),
  @("movil-actividad-ios", "movil-actividad.html", "?ios=1", 390, 844, 2),
  @("componentes", "componentes.html", "", 1440, 2140, 1)
)

foreach ($j in $jobs) {
  if ($Solo -and ($j[0] -notlike "*$Solo*")) { continue }
  $src = Join-Path $dir $j[1]
  if (-not (Test-Path $src)) { Write-Host "falta $($j[1])"; continue }
  $url = "file:///" + ($src -replace '\\', '/') + $j[2]
  $png = Join-Path $out ($j[0] + ".png")
  $tmp = Join-Path $env:TEMP ("nx-maq-" + [guid]::NewGuid())
  & $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$tmp" `
    --force-device-scale-factor=$($j[5]) --window-size="$($j[3]),$($j[4])" --virtual-time-budget=3000 `
    --screenshot="$png" "$url" 2>$null | Out-Null
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  Write-Host ("{0,-24} {1}" -f $j[0], $(if (Test-Path $png) { "ok" } else { "ERROR" }))
}




