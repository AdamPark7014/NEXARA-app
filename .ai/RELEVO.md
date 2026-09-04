# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Muro: por qué se quedaba en «Conectando»

`video-stream mode=mjpeg` **no entrega frames** con estos RTSP. Medido:
`/api/frame.jpeg?src=cam_…_101` → **200 / 16 KB**; el WS mjpeg del
componente se queda vacío → spinner eterno.

### Arreglo

- **Muro** → `<img>` a `/go2rtc/api/frame.jpeg?src=…` refrescado ~1 fps
  (escalonado). Se ven todas sin decodificar H.264 × N.
- **Foco** → MSE (`video-stream`), `src` se asigna **después** de
  `appendChild` (si no, `onconnect` sale con `isConnected=false`).

## Muro visible en modo Foco («En cola» en todos los mosaicos)

Muro y foco viven montados a la vez y se alternan con el atributo `hidden`.
Un `display` de clase **le gana** a `[hidden]`, así que `.wallWorkbench`
(`display: grid`) seguía a la vista en Foco: sus mosaicos se quedaban «En
cola» —en Foco el muro pierde el cupo— y el panel de foco quedaba debajo,
ese sí oculto. Por eso «no dejaba ver ninguna en grande».
Arreglo: `.wallWorkbench[hidden] { display: none }`.

## Audio — medido, no supuesto

| Equipo | Canal | Video | Audio |
|---|---|---|---|
| Cámaras (NVR y directas) | 102 / x02 | H.264 | **ninguno** — `<Audio><enabled>false</enabled>` de fábrica |
| Terminales DS-K1T (.160–.163) | 101 | H.264 720p | **PCM mu-law 8 kHz, activo** |

El hardware de las cámaras sí lleva micro (`audioInputType: MicIn`,
`TwoWayAudio` presente pero `enabled:false`). **No se ha encendido**:
prender micrófonos en toda la oficina es decisión de Adam, no del código
(LFPDPPP + laboral). Se guarda `hasAudio` por cámara en el espejo.

**Transporte:** MSE no reproduce G.711 — con el RTSP crudo el MP4 llega
**sin pista de audio** (ffprobe sobre `/api/stream.mp4`). Se transcodifica
solo el audio: `ffmpeg:<rtsp>#video=copy#audio=aac` → `aac 8000 Hz`. go2rtc
1.9.7 trae ffmpeg 6.1.1 en la imagen. Va a un stream aparte (`…_a`) para no
cargar el mudo que comparte el muro.

## Fotos de rostro — no se pueden bajar, y está probado

`FDLib/capabilities` → `isSupportModelData: true`, sin capacidad de imagen.
El terminal guarda un **modelo biométrico** (`modelData`, cabecera `FR700006`),
no un JPEG. La `faceURL` del UserInfo da **404 con todo**: digest, sin auth
(401, o sea que la auth sí entra), token `@WEB` recién emitido por FDSearch,
y `sessionLogin` v2 (login 200 OK). Rutas alternativas probadas: 404.

Los eventos tampoco traen `pictureURL` ni con `picEnable:true` — sí traen
`FaceRect`, `mask`, `currentVerifyMode`, `cardType`.

**Salidas reales:** (a) que NEXARA sea la fuente y empuje la foto al
terminal con `FDLib/pictureUpload`; (b) mirar la cámara de la puerta en vivo.
La ficha ya lo dice en vez de fallar en silencio.

## Terminales de acceso como cámaras

Los cuatro DS-K1T publican `/ISAPI/Streaming/channels/101` (H.264 720p +
audio). El sync los da de alta en `integra_cameras` con
`streamId: '101'` — **no** se les deriva sub-stream: solo tienen ese.
Aparecen en el muro como «<nombre> (puerta)».

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

## Puesto de puerta

En Control de acceso, al elegir una puerta sale su cámara en vivo (con audio,
que las terminales llevan micro) junto a las cuatro acciones. El clic en la
rejilla **ya no dispara el modal**: selecciona. Accionar sigue pidiendo motivo
y pasando por auditoría.

## Ojo con `deploy/update.sh`

Compara `OLD_REV`/`NEW_REV` para decidir qué reconstruir. Si antes de correrlo
se hace `git reset --hard` al commit nuevo, no ve cambios y **no construye
nada** (pasa directo al prune y sale con 0). O se le deja hacer el pull a él,
o se le pasa `--force-all`.

## Micrófono de una cámara

`POST integra/cameras/:id/audio` `{enabled}` lee el `StreamingChannel`
entero, cambia **solo** el `<enabled>` de dentro de `<Audio>` y lo reenvía —
el firmware rechaza un PUT parcial, y el `<enabled>` de `<Video>` es otro.
Escribe en el equipo del cliente, así que va con el permiso de puertas y se
audita (`integra.camera.audio`). Botón en Foco. No se ha encendido ninguno.

## Qué saben hacer los equipos — sondeado 2026-09-04

### Cámaras DS-2CD2123G2-LIS2U (AcuSense)

`/ISAPI/Smart/capabilities`: `isSupportFaceDetect`, `isSupportLineDetection`,
`isSupportFieldDetection` = **true**; `detectionTarget` = `human,vehicle`
(clasifica persona de vehículo); `enableDualVca: true`. `isSupportPeopleDetection`
(conteo) = false.

Las reglas existen pero **con las zonas apagadas** (`FieldDetectionRegion
enabled: false`, `LineItem enabled: false`). Encenderlas es un PUT.

**Ojo antes de encenderlas:** `/ISAPI/Event/triggers/{fielddetection-1,
linedetection-1,VMD-1}` enlazan a `record-1` **y `center`** → grabación y aviso
a quien tenga Hik-Connect. No se ha tocado ninguna.

`httpHosts/capabilities` de la cámara trae `uploadImagesDataType opt="URL,binary"`
→ la cámara **sí** puede empujar el evento con el JPEG dentro.

No hay ruta de «pintar VCA sobre el video» en este firmware (probadas
VcaDisplayCfg y variantes: 404). El recuadro habría que dibujarlo en el
navegador sobre el `<video>`, a partir de los eventos.

### Terminales DS-K1T — la foto del acceso NO la dan

Escuchado `Event/notification/alertStream` de `.163` durante 4 min:
**596 eventos, 0 imágenes** (`Content-Type: application/json` × 596, `JFIF` × 0).
`SNAPConfig` responde 200 (`snapTimes: 1`) pero el `httpHosts/capabilities` del
terminal **no** declara `uploadImagesDataType` — al revés que la cámara.
`AttendanceMode` → `notSupport` en estos modelos.

Lo que **sí** trae cada evento de acceso concedido (major 5 / minor 75):
`name`, `employeeNoString`, `dateTime`, `deviceName`, `currentVerifyMode`,
`mask`, `userType`, `serialNo`, `attendanceStatus` y **`FaceRect`** (el
terminal localiza la cara, solo no manda los píxeles).

**Salida para la foto:** el terminal es una cámara y
`/ISAPI/Streaming/channels/101/picture` devuelve JPEG en ~300 ms. Con evento
empujado (<1 s) la persona sigue delante: la foto la toma NEXARA y se guarda
en NEXARA. Eso además resuelve el rostro del directorio con el tiempo.

## Eventos empujados (Adam dijo que sí a todo, 2026-09-04)

`POST|PUT /api/integra/hik/:siteId/:token` — sin `RbacGuard`: quien llama es
un aparato. El token va en la URL porque el firmware no sabe otra cosa
(`urlLen max=128`, de ahí que sean 96 bits en hex); en la base solo el sha256.
**Siempre responde 200**: un Hikvision que recibe un error deshabilita el host
de notificación y se queda mudo hasta que alguien lo note.

El cuerpo llega en tres formas y ninguna con la cabecera correcta, así que
`main.ts` monta `express.raw` **solo** en `/api/integra/hik` y se decide por la
forma del cuerpo. Multipart se trocea a mano: no es un formulario, son partes
sin nombre de campo, y multer las tiraría.

Dos cosas hicieron falta para que la ruta acepte XML (probado contra
producción, daba **415**):

1. `bodyParser: false` en `NestFactory.create`, o el parser de Nest se registra
   antes que cualquier `app.use`. El `rawBody` de Stripe se conserva con el
   `verify` de `express.json`, que además guarda los bytes exactos sobre los
   que se firma.
2. **El filtro de `Content-Type` de `main.ts` es de casa, no de Nest** — un
   allowlist de seguridad que además mete strike a la IP. Se exime solo el
   buzón de los equipos, y solo para xml/text: lo que protege esa ruta es el
   token, no la cabecera. No tocar el allowlist global.

La foto: si el equipo la manda (solo las cámaras), esa. Si no, NEXARA se la
pide al propio equipo por `Streaming/channels/101/picture` — ~300 ms, la
persona sigue delante. Se guardan en `uploads/integra/<siteId>/<día>/`.

Se guardan con `resolveUploadsDir`, **no** contra `process.cwd()`: en Docker
el proceso corre desde `/app/apps/api` y el volumen está en `/app/uploads`, así
que resolver por cwd escribe en la capa efímera y las fotos se pierden en el
siguiente despliegue. `common/uploads-path.ts` ya avisaba de esto.

**Solo se fotografía lo reciente (20 s).** Al darle host de notificación a un
equipo, este **vuelca todo su historial**: entraron de golpe eventos de mayo, y
a cada uno se le pegaba una foto tomada en ese momento — el pasillo de hoy con
el nombre de quien entró hace tres meses. Parecía correcto y era falso. Las
fotos de ese primer volcado se borraron a mano.

`POST integra/sites/:id/push/wire {detection}` apunta los 17 equipos y
enciende la detección; `/unwire` lo deshace. Cada `wire` emite token nuevo.

**La detección de intrusión no basta con `enabled: true`**: la región 1 viene
sin `RegionCoordinatesList`, hay que darle el polígono (cuadro entero sobre la
rejilla 1000×1000 que declara el equipo). `detectionTarget` se fuerza a
`human`: con `vehicle` una oficina dispara con cualquier cosa.

## Estado real tras cablear (2026-09-04 15:25)

Empujando a NEXARA: **4 terminales + 9 cámaras**. Detección de personas
encendida en **8 cámaras** (la PTZ `.179` no tiene `FieldDetection`, usa otro
esquema). Llegan `AccessControllerEvent`, `VMD`, `fielddetection`, `heartBeat`
y `duration` con 0-4 s de retraso.

**El grabador `.34` no acepta el `httpHost`.** `httpHosts/capabilities` →
`Device Busy`; el PUT devuelve `Invalid XML Content` en todas las variantes
probadas (por id, lista completa, su propio documento devuelto tal cual, con y
sin `Extensions`, XML y JSON). Consecuencia: los 4 canales plug & play
(`192.168.254.x` — Escalera 01, Escaleras 02, Azotea, Office Entrance) **no
empujan eventos**. Su video va bien. Pendiente.

### Los relojes estaban mal — corregido

Las 9 cámaras venían en **zona horaria de China** (`CST-8:00`, 14 h de
desfase) y el grabador 14 min atrasado; los terminales estaban bien. Con eso
los eventos de cámara aterrizaban con hora falsa. Se pusieron los 10 en
`manual` + `CST+6:00:00`, **igual que los terminales**, en vez de meter NTP.

### Las dos cajas del aviso de detección

`TargetRect` es **la persona** (ya en 0..1). `RegionCoordinatesList` es **la
zona vigilada**, en la rejilla del equipo. Se leía la segunda y, como la zona
es el encuadre entero, todos los recuadros salían `0,0,1,1`. Se usa
`TargetRect`; la zona queda de recurso, descartando la caja que ocupa todo.

## A medias

1. Asistencia y portal del empleado (Adam: asistencia + credencial).
2. Dibujar los recuadros sobre el video en el muro con `targets`.
3. El `httpHost` del grabador (ver arriba).
4. Purgar eventos viejos: la tabla crece rápido con VMD y heartBeat.
5. Decidir si se encienden los micros de las cámaras (el botón ya está).
6. TCPMSS / biblioteca `init: true` / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
