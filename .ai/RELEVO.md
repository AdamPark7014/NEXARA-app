# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Muro: se ven todas, y lo que no, lo dice

Adam: «no se ven todas» y «se traba mucho». Diagnóstico con sonda de solo
lectura en producción, no por deducción.

### Lo que se comprobó en el servidor (2026-09-05 02:34 UTC)

- **Las 16 cámaras registradas SÍ dan imagen.** `frame.jpeg` 200 en las 16, en
  serie y en paralelo. Cero errores de auth en el log. Cero procesos ffmpeg: el
  video va en `copy`, no se transcodifica.
- **17 cámaras en `integra_cameras`, 16 en go2rtc.** Falta `601 / Support &
  Engineering 02` (`192.168.9.174`); su 554 responde. Fallo de registro.
- **`go2rtc.yaml` corrupto**: `yaml: did not find expected key` ×12 al arrancar,
  indentación de 1 espacio y clave duplicada. Tras cada reinicio go2rtc queda
  con CERO streams de disco (`RestartCount=3`).
- **RTT 87 ms por Tailscale** a las cámaras; handshake RTSP de 0,7–2,5 s.
- **2 254 `broken pipe`** en una sesión: el respaldo pedía JPEG cada 1100 ms y
  go2rtc tarda 0,8–2,5 s en servirlo. 16 mosaicos = un core al 103 %.

### Qué se arregló

1. **Cambiar de rejilla ahora RELLENA.** `useEffect([layout])` solo hacía
   `slice(0, layout)`: pasar de 2×2 a 3×3 dejaba 5 huecos deterministas. Era la
   causa directa de «no se ven todas». Guardado con ref para no entrar en bucle
   cuando hay menos cámaras que celdas.
2. **`fillWall` ya no descarta fallos en silencio.** Si una cámara falla tira de
   la siguiente candidata, y las que fallan se anotan con motivo. El toolbar
   cuenta: en vivo / en respaldo / en cola / sin video / no abrieron.
3. **Control de admisión** (`WALL_CONNECT_CONCURRENCY = 3`): solo 3 mosaicos
   negocian a la vez; al asentarse uno entra el siguiente. No es tope de vivas
   —`cc59543` topaba a 4 y por eso nunca se veían las nueve— sino de handshakes
   simultáneos. El muro acaba lleno.
4. **`MSE_GIVE_UP_MS` 4500 → 11 000** y reintento a 3200. Antes se pisaban
   (2600/4500) y cada celda abría 2 WS + snapshots en <5 s. Con RTT de 87 ms,
   4,5 s no daban ni para el handshake.
5. **El respaldo ya no es condena**: reintenta MSE cada 45 s.
6. **El respaldo es autorregulado**: el siguiente JPEG se pide al llegar el
   anterior (suelo 900 ms), no por `setInterval`. Mata los `broken pipe`.
7. **El respaldo ya no dice LIVE.** Dice `RESPALDO · 1 img/s`. Un JPEG por
   segundo con etiqueta LIVE era exactamente «se traba mucho».
8. **Fin de la tormenta de reconexión**: `startDelayMs` fuera de las deps del
   efecto de montaje. Quitar un mosaico reindexaba el turno de todos los
   siguientes y les tiraba el WebSocket a la vez.
9. **`playWatch` 180 ms → 500 ms** y deja de reescribir atributos ya reproduciendo.
   Eran ~50 mutaciones de DOM por segundo con 9 celdas.
10. **El muro no pide audio.** `fetchStream(cam, !multi && …)`: el stream con
    audio es `ffmpeg:…#audio=aac`, o sea proceso ffmpeg + SEGUNDA sesión RTSP
    contra la misma cámara, y el mosaico lo pinta mudo igual.
11. **API: se borran los playback viejos** (`dropStalePlaybackStreams`). Los
    `pb_<cam>_<ts>` no los borraba nadie y sus URLs con `?starttime=` son lo que
    corrompe el YAML de go2rtc.
12. **`espacios/` volvió a existir.** Pasaba *children* a `IgSplit`, que solo lee
    `left`/`right`: 245 líneas no se renderizaban. Rescatado en `dcd46c0`.
13. **Typecheck del web en 0 errores** (eran 20). El build los ignoraba
    (`NEXT_IGNORE_TYPE_ERRORS=1`), y por eso `espacios/` llegó muerta a
    producción.

### Cómo verificar

1. Hard refresh en `/integra/video`. Empieza en 2×2 → pasa a 3×3: debe
   **rellenarse solo**, sin pulsar «Llenar muro».
2. El toolbar debe decir cuántas van en vivo, en respaldo, en cola y sin video.
   Si alguna no abre, lo dice — ya no hay huecos mudos.
3. Ningún cuadro debe decir LIVE yendo a tirones: o dice LIVE y va fluido, o
   dice RESPALDO.
4. Quitar un mosaico con ✕ no debe cortar los demás.

## Turno 2 — nueve agentes en paralelo, cortados por el límite

Se lanzaron nueve agentes con dueño de archivo asignado para que no se pisaran.
**Todos murieron a la vez** por el límite de sesión, a media escritura.
Sobrevivieron **4 860 líneas y 32 archivos nuevos**. Rescatado en `13fefb12`
(WIP crudo) y reparado en `3889fc54`.

Lo que hubo que arreglar del corte:
- `schedules`: un `<TabPanel>` sin cerrar. El error de sintaxis tapaba a otros
  trece. El mismo agente sustituyó el `useMemo` `matrix` por `matrixRows` y
  borró el viejo con dos usos vivos.
- `people`: tres declaraciones locales (`Person`, `genderLabel`, `formatWhen`)
  chocando con los imports de `_peopleView`, que el agente extrajo sin llegar a
  borrar las originales. Comprobadas idénticas antes de quitarlas.
- `settings`: `inputStyle`/`selectStyle` fuera del import pero con los usos
  vivos. Import restaurado.

**Estado verificado:** typecheck limpio en web y api, 114 pruebas de web, 670 de
api, `prisma validate` OK, y **el build de producción de Next compila las 18
rutas de INTEGRA**. Lo que NO está verificado es cómo se ve: nadie lo ha
abierto en un navegador. Hace falta desplegar.

### Catálogo de detección — `docs/INTEGRA-DETECCION.md`

Hallazgo estructural: todo el sistema pasa por cinco cadenas en
`isapi.discovery.ts:635`. Nada fuera de esa lista llega jamás.
`GET /ISAPI/Smart/capabilities` **no se llama desde ningún punto del código**,
así que merodeo, zona, objeto abandonado, desenfoque y sabotaje están en
NO VERIFICADO, no en «no soportado».

`eventState` (active/inactive) llega en cada payload y se ignora: el overlay lo
adivina con TTL y de ahí venían los fantasmas.

**SIN RESOLVER Y URGENTE:** la tabla oficial dice que `minor 76` es fallo de
autenticación facial y el código lo trata como salida concedida
(`GRANTED_MINORS = [1, 75, 76]`). Si se confirma, cada cara no reconocida cierra
una jornada de asistencia. Y `27` (puerta forzada), `28` (mantenida abierta),
`10` (antipassback) y `8` (caducada) ya están llegando mal etiquetados. **El
agente que iba a contrastarlo contra los datos reales murió antes de terminar.**
Es una consulta de cinco minutos: `SELECT minor, count(*) FROM
integra_push_events WHERE major = 5 GROUP BY minor`. Si el dato contradice a la
documentación, gana el dato.

## A medias

1. **`go2rtc.yaml` del servidor sigue corrupto** — el arreglo de la fuga evita
   que vuelva a pasar, pero el fichero actual hay que limpiarlo a mano en
   `/var/lib/nexara/go2rtc/go2rtc.yaml`. Sin eso, cada reinicio pierde streams.
2. **Cámara 601 sin registrar** en go2rtc. Su 554 responde; falta ver por qué el
   sync no la publica.
3. **NVR `192.168.9.34`**: 54 de 70 `i/o timeout` son suyos y sirve 4 canales.
   Sospecha de límite de sesiones RTSP, sin prueba directa.
4. Personas: el modelo guarda 8 columnas y todo lo demás en `raw` JSON opaco —
   no se puede filtrar por vigencia, puertas ni credenciales. `CardInfo/*` no se
   llama nunca: no hay número de tarjeta. Ver plan en el turno.
5. Portal empleado · ANPR ITC · micros · TCPMSS. Redis eviction. Artemis
   `this.client()` pre-branch ISAPI.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Provider ISAPI.
No inventar ANPR/FieldDetection en PTZ .179. No hls.js por CDN — la CSP no lo
lleva y además ya está en `package.json`, se empaqueta.
