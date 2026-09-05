<#
.SYNOPSIS
  Radiografía de INTEGRA en produccion. SOLO LECTURA.

.DESCRIPTION
  Existe por una razon concreta. En la sesion del 2026-09-04 se quemaron TRES
  despliegues persiguiendo teorias equivocadas sobre el muro de video -MTU,
  limite de conexiones HTTP/1.1, saturacion de decodificadores- y la causa real
  aparecio en quince minutos de sondeo de solo lectura. El mismo dia, una sola
  consulta SQL destapo que el 94% de los "accesos denegados" de tres meses eran
  la puerta abriendose.

  Teorizar parece barato y sale caro. Medir parece caro y sale gratis. Este
  script convierte quince minutos de sondeo manual en un comando.

  TODO lo que hace es lectura: docker ps/logs/stats, curl GET, SELECT. No
  reinicia, no escribe, no despliega, no toca configuracion. Se puede correr en
  medio de un incidente sin miedo.

.EXAMPLE
  pwsh -File scripts/integra-doctor.ps1
  pwsh -File scripts/integra-doctor.ps1 -Seccion video
#>
[CmdletBinding()]
param(
  [string]$ServidorHost = '5.78.215.109',
  [int]$Puerto = 2222,
  [string]$Usuario = 'root',
  [ValidateSet('todo', 'video', 'acs', 'despliegue')]
  [string]$Seccion = 'todo',
  [string]$Clave = "$HOME/.ssh/id_ed25519_nexara_hetzner"
)

$ErrorActionPreference = 'Stop'

# BatchMode y ConnectTimeout no son adorno: sin ellos, si la clave no sirve,
# ssh se queda esperando una contrasena que nadie va a teclear y el script se
# cuelga para siempre. Un diagnostico que se cuelga es peor que ninguno.
$sshBase = @(
  '-i', $Clave,
  '-p', "$Puerto",
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
  '-o', 'StrictHostKeyChecking=accept-new',
  "$Usuario@$ServidorHost"
)

function Escribir-Titulo([string]$t) {
  Write-Host ''
  Write-Host "== $t " -NoNewline -ForegroundColor Cyan
  Write-Host ('=' * [Math]::Max(0, 62 - $t.Length)) -ForegroundColor DarkCyan
}

function Escribir-Hallazgo([string]$estado, [string]$texto) {
  $color = switch ($estado) {
    'OK'    { 'Green' }
    'AVISO' { 'Yellow' }
    'MAL'   { 'Red' }
    default { 'Gray' }
  }
  Write-Host ("  [{0,-5}] " -f $estado) -NoNewline -ForegroundColor $color
  Write-Host $texto
}

function Invoke-Remoto([string]$comando) {
  # Todo lo que pasa por aqui es de lectura. Si alguna vez alguien anade una
  # escritura, este guardia lo para antes de que llegue al servidor.
  $prohibidos = @(
    'rm ', 'mv ', 'docker restart', 'docker stop', 'docker rm', 'docker up',
    'systemctl', 'INSERT', 'UPDATE ', 'DELETE ', 'ALTER ', 'DROP ', 'CREATE ',
    'git push', 'git reset', 'git checkout', 'git clean'
  )
  foreach ($p in $prohibidos) {
    if ($comando -match [regex]::Escape($p)) {
      throw "integra-doctor es de solo lectura y este comando contiene '$p'. Abortado."
    }
  }
  # Redirigir a fichero SI escribe; mandar stderr a la nada o a stdout, no.
  # Un guardia que bloquea `2>/dev/null` no protege de nada y solo estorba, y
  # un guardia que estorba acaba desactivado.
  $sinStderr = $comando -replace '2>&1', '' -replace '2>\s*/dev/null', ''
  if ($sinStderr -match '>') {
    throw 'integra-doctor es de solo lectura y este comando redirige a un fichero. Abortado.'
  }
  $salida = & ssh @sshBase $comando 2>&1
  return ($salida | Out-String)
}

function Invoke-Sql([string]$sql) {
  $escapado = $sql -replace '"', '\"'
  return Invoke-Remoto "docker exec -i nexara-db psql -U nexara_user -d nexara_db -At -F '|' -c `"$escapado`""
}

Write-Host ''
Write-Host 'INTEGRA · radiografia de produccion (solo lectura)' -ForegroundColor White
Write-Host "  $Usuario@$ServidorHost`:$Puerto · $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor DarkGray

if (-not (Test-Path $Clave)) {
  Escribir-Hallazgo 'MAL' "No existe la clave SSH: $Clave"
  Escribir-Hallazgo 'INFO' '  Pasala con -Clave <ruta> si la tienes en otro sitio.'
  exit 1
}
try {
  $prueba = Invoke-Remoto 'echo ok'
  if ($prueba -notmatch 'ok') { throw $prueba.Trim() }
}
catch {
  Escribir-Hallazgo 'MAL' "No hay SSH al servidor: $($_.Exception.Message)"
  Write-Host ''
  Write-Host 'Sin acceso no hay diagnostico. No pruebes hosts alternativos.' -ForegroundColor Yellow
  exit 1
}

# ---------------------------------------------------------------- despliegue
if ($Seccion -in @('todo', 'despliegue')) {
  Escribir-Titulo 'Despliegue'

  $remoto = (Invoke-Remoto "cd /var/www/nexara-app && git rev-parse HEAD").Trim()
  $local = (& git rev-parse HEAD).Trim()
  if ($remoto -eq $local) {
    Escribir-Hallazgo 'OK' "Servidor y local en el mismo commit ($($local.Substring(0,8)))"
  } else {
    $pendientes = (& git rev-list --count "$remoto..HEAD" 2>$null)
    if (-not $pendientes) { $pendientes = '?' }
    Escribir-Hallazgo 'AVISO' "El servidor va $pendientes commits por detras de tu local."
    Escribir-Hallazgo 'INFO' "  servidor $($remoto.Substring(0,8)) · local $($local.Substring(0,8))"
    Escribir-Hallazgo 'INFO' '  Nada de lo que arreglaste se ve hasta que se despliegue.'
  }

  $ps = Invoke-Remoto 'docker ps --format "{{.Names}}|{{.Status}}"'
  foreach ($linea in ($ps -split "`n" | Where-Object { $_ -match 'nexara|traefik' })) {
    $n, $s = $linea.Trim() -split '\|', 2
    if ($s -match 'Restarting|unhealthy') { Escribir-Hallazgo 'MAL' "$n · $s" }
    else { Escribir-Hallazgo 'OK' "$n · $s" }
  }

  # Un contenedor que se reinicia solo esta diciendo algo, y nadie lo escucha.
  $reinicios = Invoke-Remoto 'docker inspect -f "{{.Name}}|{{.RestartCount}}" $(docker ps -q) 2>/dev/null'
  foreach ($linea in ($reinicios -split "`n" | Where-Object { $_ -match '\|' })) {
    $n, $c = $linea.Trim() -split '\|', 2
    if ([int]($c -as [int]) -gt 0) {
      Escribir-Hallazgo 'AVISO' "$($n.TrimStart('/')) se ha reiniciado $c veces"
    }
  }
}

# --------------------------------------------------------------------- video
if ($Seccion -in @('todo', 'video')) {
  Escribir-Titulo 'Video · go2rtc'

  # El YAML corrupto es el fallo silencioso mas caro que hemos tenido: go2rtc
  # arranca sin una sola camara de disco y nadie se entera hasta que el muro
  # aparece vacio tras un reinicio.
  $yamlErr = Invoke-Remoto 'docker logs nexara-go2rtc 2>&1 | grep -c "did not find expected key" || true'
  if ([int]($yamlErr.Trim() -as [int]) -gt 0) {
    Escribir-Hallazgo 'MAL' "go2rtc.yaml NO se parsea ($($yamlErr.Trim()) errores al arrancar)."
    Escribir-Hallazgo 'INFO' '  Tras cada reinicio go2rtc queda con CERO camaras de disco.'
    Escribir-Hallazgo 'INFO' '  Arreglo: limpiar /var/lib/nexara/go2rtc/go2rtc.yaml a mano.'
  } else {
    Escribir-Hallazgo 'OK' 'go2rtc.yaml se parsea correctamente'
  }

  $streamsJson = Invoke-Remoto 'docker exec nexara-go2rtc wget -qO- http://127.0.0.1:1984/api/streams 2>/dev/null || curl -s http://172.18.0.3:1984/api/streams'
  $nombres = @()
  try {
    $obj = $streamsJson | ConvertFrom-Json
    $nombres = $obj.PSObject.Properties.Name
  } catch {
    Escribir-Hallazgo 'AVISO' 'No se pudo leer /api/streams de go2rtc'
  }

  $camaras = @($nombres | Where-Object { $_ -like 'cam_*' -and $_ -notlike '*_a' })
  $basura = @($nombres | Where-Object { $_ -like 'pb_*' -or $_ -like 'smoke_*' })
  Escribir-Hallazgo 'INFO' "$($nombres.Count) streams registrados · $($camaras.Count) camaras · $($basura.Count) restos de playback/prueba"
  if ($basura.Count -gt 5) {
    Escribir-Hallazgo 'AVISO' "Hay $($basura.Count) streams de playback sin borrar. Sus URLs con ?starttime= son lo que corrompe el YAML."
  }

  # La prueba que de verdad importa: no que este registrado, sino que de imagen.
  $sinImagen = @()
  foreach ($c in $camaras) {
    $r = Invoke-Remoto "docker exec nexara-go2rtc wget -qO- --timeout=8 'http://127.0.0.1:1984/api/frame.jpeg?src=$c' 2>/dev/null | wc -c"
    $bytes = [int]($r.Trim() -as [int])
    if ($bytes -lt 3000) { $sinImagen += "$c ($bytes bytes)" }
  }
  if ($sinImagen.Count -eq 0) {
    Escribir-Hallazgo 'OK' "Las $($camaras.Count) camaras entregan imagen"
  } else {
    Escribir-Hallazgo 'MAL' "$($sinImagen.Count) camaras registradas NO dan imagen:"
    $sinImagen | ForEach-Object { Escribir-Hallazgo 'INFO' "  $_" }
  }

  # Deriva entre lo que la app cree tener y lo que go2rtc puede servir. Esta
  # diferencia es invisible en la interfaz y es «no se ven todas».
  try {
    $enBase = [int]((Invoke-Sql 'SELECT count(*) FROM integra_cameras').Trim())
    if ($enBase -ne $camaras.Count) {
      Escribir-Hallazgo 'MAL' "Deriva: $enBase camaras en la base, $($camaras.Count) con stream en go2rtc."
      Escribir-Hallazgo 'INFO' '  Las que faltan salen como hueco en el muro, sin explicacion.'
    } else {
      Escribir-Hallazgo 'OK' "Base y go2rtc coinciden en $enBase camaras"
    }
  } catch { Escribir-Hallazgo 'AVISO' 'No se pudo contar camaras en la base' }

  # Pedir mas rapido de lo que el servidor sirve deja un broken pipe por intento.
  $pipes = Invoke-Remoto 'docker logs --since 1h nexara-go2rtc 2>&1 | grep -c "broken pipe" || true'
  $np = [int]($pipes.Trim() -as [int])
  if ($np -gt 100) {
    Escribir-Hallazgo 'MAL' "$np 'broken pipe' en la ultima hora: se piden fotogramas mas rapido de lo que go2rtc los sirve."
  } elseif ($np -gt 0) {
    Escribir-Hallazgo 'AVISO' "$np 'broken pipe' en la ultima hora"
  } else {
    Escribir-Hallazgo 'OK' 'Sin broken pipe en la ultima hora'
  }

  $timeouts = Invoke-Remoto 'docker logs --since 1h nexara-go2rtc 2>&1 | grep -oE "i/o timeout" | wc -l'
  if ([int]($timeouts.Trim() -as [int]) -gt 20) {
    Escribir-Hallazgo 'AVISO' "$($timeouts.Trim()) timeouts RTSP en la ultima hora. Mira si se concentran en un equipo."
  }

  # ffmpeg transcodificando video seria un error de configuracion caro. El
  # diseno solo lo usa para audio (#video=copy#audio=aac).
  $ff = Invoke-Remoto 'docker exec nexara-go2rtc ps aux 2>/dev/null | grep -c "[l]ibx264" || true'
  if ([int]($ff.Trim() -as [int]) -gt 0) {
    Escribir-Hallazgo 'MAL' 'Hay ffmpeg transcodificando video (libx264). El video deberia ir en copy.'
  } else {
    Escribir-Hallazgo 'OK' 'Sin transcodificacion de video'
  }
}

# ----------------------------------------------------------------------- acs
if ($Seccion -in @('todo', 'acs')) {
  Escribir-Titulo 'Control de acceso · calidad del dato'

  # Reparto de minors. Aqui se vio que el 94% de los «denegados» eran la puerta
  # abriendose. Se deja a la vista siempre: es barato y destapa mucho.
  try {
    $filas = Invoke-Sql 'SELECT minor, count(*) FROM integra_push_events WHERE major = 5 GROUP BY minor ORDER BY 2 DESC LIMIT 12'
    $total = 0
    $reparto = @{}
    foreach ($l in ($filas -split "`n" | Where-Object { $_ -match '\|' })) {
      $m, $n = $l.Trim() -split '\|', 2
      $reparto[[int]$m] = [int]$n
      $total += [int]$n
    }
    if ($total -gt 0) {
      # Ruido de funcionamiento: puerta abriendose/cerrandose, boton de salida,
      # reles. No es actividad de personas.
      $ruido = 0
      foreach ($m in @(21, 22, 23, 24, 29, 31, 32)) { if ($reparto.ContainsKey($m)) { $ruido += $reparto[$m] } }
      $pct = [Math]::Round(100.0 * $ruido / $total, 1)
      if ($pct -gt 50) {
        Escribir-Hallazgo 'AVISO' "$pct% del trafico ACS es estado de puerta y boton de salida, no personas."
        Escribir-Hallazgo 'INFO' '  Si esto se cuenta como «denegado», el KPI no significa nada. Ver integra-acs-codes.ts'
      } else {
        Escribir-Hallazgo 'OK' "Ruido operativo en $pct% del trafico ACS"
      }

      $sinClasificar = @()
      foreach ($m in $reparto.Keys) {
        if ($m -notin @(1, 6, 7, 8, 9, 10, 21, 22, 23, 24, 27, 28, 29, 31, 32, 75, 76, 80, 104, 113, 148, 152, 155)) {
          $sinClasificar += "minor $m ($($reparto[$m]))"
        }
      }
      if ($sinClasificar.Count -gt 0) {
        Escribir-Hallazgo 'AVISO' "Codigos sin clasificar: $($sinClasificar -join ', ')"
        Escribir-Hallazgo 'INFO' '  Buscalos en el Apendice C antes de asignarles significado.'
      }
    }
  } catch { Escribir-Hallazgo 'AVISO' 'No se pudo leer integra_push_events' }

  # Un espejo viejo hace que todas las cifras del panel mientan con aplomo.
  try {
    $sync = (Invoke-Sql 'SELECT EXTRACT(EPOCH FROM (now() - max("syncedAt")))/60 FROM integra_people').Trim()
    $min = [Math]::Round([double]$sync, 0)
    if ($min -gt 120) { Escribir-Hallazgo 'AVISO' "El espejo de personas lleva $min minutos sin reconciliar" }
    else { Escribir-Hallazgo 'OK' "Espejo de personas reconciliado hace $min min" }
  } catch { Escribir-Hallazgo 'INFO' 'Sin dato de reconciliacion del espejo' }
}

Write-Host ''
Write-Host 'Fin. Nada de lo anterior modifico el servidor.' -ForegroundColor DarkGray
Write-Host ''
