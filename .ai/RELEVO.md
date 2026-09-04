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

## A medias

1. Correr sync para que aparezcan las 4 cámaras de puerta (13 → 17).
2. Decidir si se encienden los micros de las cámaras (el botón ya está).
3. TCPMSS / biblioteca `init: true` / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
