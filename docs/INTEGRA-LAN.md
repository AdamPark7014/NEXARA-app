# NEXARA Integra · provider ISAPI (LAN pura)

Tercer provider del contrato Integra, junto a `ARTEMIS` y `HCT`.
Ver [ADR-0017](ADR-0017-nexara-integra.md), [ADR-0019](ADR-0019-integra-hct-adapter.md)
y [INTEGRA-OPS](INTEGRA-OPS.md).

## Cuándo usarlo

Cuando el sitio **no tiene HikCentral Professional ni Hik-Connect for Teams**:
solo un grabador y unas cámaras en la red del cliente. Se habla ISAPI directo a
cada equipo, con HTTP Digest MD5, sin plataforma de por medio.

| | ARTEMIS | HCT | **ISAPI** |
|---|---|---|---|
| Dónde vive | HikCentral on-prem | nube Hikvision | los propios equipos |
| Credenciales | appKey / appSecret | appKey / secretKey | **usuario / contraseña** de la consola web |
| Video | RTSP → go2rtc | EZUIKit cloud | RTSP → go2rtc |
| Personas, vehículos, ANPR | sí | parcial | **no** |

`IntegraSite.appKeyEnc` / `appSecretEnc` guardan el **usuario y la contraseña**
del equipo. ISAPI no tiene appKey; se reusan las columnas cifradas en vez de
migrar el esquema.

## Cómo está montado el sitio (verificado 31-08-2026)

```
                      LAN del cliente 192.168.9.0/24
   ┌──────────────┐
   │ DS-3WR15X    │ .1     router
   ├──────────────┤
   │ DS-7616NXI   │ .34    NVR 16 canales  ← EQUIPO CABECERA
   │  ├─ PoE interno 192.168.254.0/24 ──── 4 cámaras plug & play
   │  └─ canales 1..16, de los que 13 tienen cámara
   ├──────────────┤
   │ DS-K1T343MWX │ .160 .161   terminales de acceso (rostro)
   │ DS-K1T341CMF │ .162 .163   terminales de acceso (rostro + huella)
   │ DS-2CD2123G2 │ .171 .. .178   8 cámaras fijas 1080p H.265
   │ DS-2DF8C442  │ .179    domo PTZ 4 MP, con audio
   └──────────────┘
```

**Las cámaras en plug & play (`192.168.254.x`) no existen en la LAN.** Cuelgan
del switch PoE interno del NVR. La única forma de verlas es a través del
grabador — por eso el inventario se construye desde él y no barriendo IPs.

## Descubrimiento

```bash
npm run integra:isapi:scan -- --hosts 192.168.9.34,192.168.9.160-163,192.168.9.171-179 --probe-rtsp
```

Usuario y contraseña salen de `ISAPI_USER` / `ISAPI_PASSWORD` (o `--user` /
`--password`, que quedan en el historial del shell).

El barrido identifica cada equipo (`/ISAPI/System/deviceInfo`), enumera su video
(`/ISAPI/Streaming/channels`), detecta control de acceso
(`/ISAPI/AccessControl/capabilities`) y, con `--probe-rtsp`, hace un `DESCRIBE`
RTSP real para confirmar que el canal entrega imagen.

> **Bloqueo de cuenta.** Los equipos Hikvision bloquean al usuario tras varios
> intentos fallidos. El barrido prueba **una** IP y aborta entero si la rechaza,
> en lugar de repetir el fallo contra las veinte. El cliente ISAPI hace lo mismo:
> tras un rechazo se auto-inhabilita.

Con `--json inventario.json` escribe el inventario **sin contraseñas** (las URL
RTSP salen redactadas).

## Alta del sitio

```bash
npm run integra:isapi:seed -- --json inventario.json --company 1 \
  --name "Oficinas Guadalajara" --head 192.168.9.34
```

Crea el `IntegraSite` con `provider=ISAPI` y registra las **terminales de
acceso**, que es lo único que el grabador no conoce. Idempotente.

Debe correr con el mismo `INTEGRA_SECRETS_KEY` (o `JWT_SECRET`) que la API, o
esta no podrá descifrar la contraseña.

## Sync

> **El cron del droplet no puede sincronizar un sitio ISAPI.** Corre en el
> droplet, que no tiene ruta a la LAN del cliente: para `provider=ISAPI` falla
> siempre. El sync tiene que dispararlo algo que vea los equipos.
>
> ```bash
> npm run integra:isapi:sync -- --company 1 --site 1
> ```
>
> Desde una máquina del sitio, con `DATABASE_URL` apuntando a la base que toque.
> Mientras no haya agente on-site ni VPN, es a mano.

`POST /api/integra/sync` sirve igual si quien atiende la petición está en la LAN.

- El **equipo cabecera** manda: sus canales son el inventario de cámaras.
- `cameraIndexCode` = `<ip-cabecera>|<canal>` → `192.168.9.34|301`.
- El nombre sale del NVR («Escalera 01», «Coffee Area»), no del número de canal.
- Las ranuras sin cámara se ignoran.
- Los equipos ya registrados que el cabecera no cubre se refrescan uno a uno;
  lo que sí cubre, no se vuelve a sondear.
- Cada terminal de acceso da de alta una puerta `<ip>|1`.

## Verificado end-to-end (31-08-2026)

Con la laptop dentro de la LAN, base Postgres local y el sitio dado de alta:

```
seed  → sitio #1 "Oficinas NEXARA" + 4 terminales
sync  → 13 cámaras · 4 puertas · 18 equipos · 6.4 s
```

Espejo resultante: 9 cámaras con IP propia (RTSP directo) y 4 en plug & play
(vía grabador). Las puertas salieron con el nombre que tienen en el equipo:
Sala de Juntas, Acceso Privados, Gerencia, Acceso General.

## Video

`POST /api/integra/cameras/:cameraIndexCode/stream` devuelve HLS por go2rtc.

La fuente RTSP se elige sola:

- Cámara con **IP propia** en la LAN → RTSP directo a la cámara. El firmware del
  NVR corta a partir de unas pocas sesiones RTSP simultáneas, y con 13 canales
  se agota enseguida.
- Cámara en **plug & play** → por el grabador. No hay alternativa.

La respuesta trae el RTSP **con la contraseña tachada**: la URL real es una
credencial en texto plano y solo viaja de la API a go2rtc.

### go2rtc tiene que estar dentro de la LAN

Esta es la restricción que manda sobre el despliegue.

`deploy/docker-compose.nexara.yml` levanta `nexara-go2rtc` **en el droplet**, y
el droplet no tiene ruta a `192.168.9.0/24`. Con esa topología el HLS no puede
funcionar: el contenedor no alcanza el RTSP.

El diseño del enlace —WireGuard desde el sitio + go2rtc on-site, y la trampa de
los rangos de LAN repetidos— está en **[INTEGRA-LAN-ENLACE](INTEGRA-LAN-ENLACE.md)**.

Mientras no exista, la API responde con el RTSP y la nota «GO2RTC_URL no
configurado». Desde dentro de la LAN sí hay video:

```bash
npm run integra:isapi:publish -- --company 1 --site 1 --go2rtc http://127.0.0.1:1984
```

Publica las 13 cámaras llamando al mismo `liveStream` que atiende el endpoint, así
que elige la misma fuente y **no escribe credenciales en disco**. go2rtc sirve el
muro en `:1984` para cualquier navegador de la red.

## Apertura de puertas

`POST /api/integra/doors/:doorIndexCode/open` con motivo obligatorio.
En ISAPI se traduce a `PUT /ISAPI/AccessControl/RemoteControl/door/{doorNo}`
sobre la IP de la terminal. Los cuatro `controlType` de Artemis mapean a
`open` / `close` / `alwaysOpen` / `alwaysClose`.

## Lo que ISAPI no da

Vehículos/ANPR (sin ITC), visitas y **playback Artemis** responden 400 en un
sitio ISAPI. El playback **local del NVR** sí está soportado vía
`POST /ISAPI/ContentMgmt/search` (**cuerpo XML** — el DS-7616 rechaza JSON con
`badXmlFormat`) → RTSP `playbackURI` (`/Streaming/tracks/{trackID}/?starttime…`)
→ go2rtc (`PUT /api/streams?name=&src=`, aunque el YAML del disco a veces
responda 400 el stream queda en memoria) → MSE en el
foco (`POST /integra/cameras/:id/playback`).

Límites verificados en Oficinas NEXARA (`192.168.9.34`):

- `trackID` = canal principal del espejo (`101`, `501`…). El vivo usa sub (`102`).
- Retención = disco/política del NVR (hay segmentos de días; la última 1 h a
  veces sale vacía — conviene «Últimas 24h»).
- El muro sigue en vivo; solo el foco cambia a playback.
- Sin segmentos: la API devuelve `url: null` y nota clara (no inventa video).

Personas ISAPI: CRUD UserInfo + FaceDataRecord. El delete es idempotente
(face → `UserInfoDetail/Delete` → `DeleteProcess` → reintento → listado
UserInfo autoritativo). El espejo solo se limpia si **todos** los ACS OK.
Alta puede omitir código (`autoCode`): asigna el siguiente numérico libre
del espejo (o marca de tiempo).

**Foto en NEXARA:** al subir JPEG (`POST /integra/people/:id/face`) se guarda
copia en `uploads/integra-faces/{companyId}/{personId}.jpg`. El proxy
`GET /integra/people/:id/face` sirve primero esa copia; si no hay, intenta
`faceURL` del terminal. Muchos DS-K1T solo guardan modelo biométrico (sin JPEG
descargable) — por eso la ficha queda en blanco hasta que alguien sube foto.

**Huella (verificado HikGateway §5.11 / Postman):** `CaptureFingerPrint` →
`FingerPrintDownload` (aplicar) → `FingerPrintUpload` (obtener plantilla) →
`FingerPrint/Delete`. Plantilla Base64 en `uploads/integra-fp/` cuando el ACS
la exporta; si no, solo se muestra `numOfFP` del UserInfo.

## Rutas ISAPI empleadas

Todas documentadas en `HIKVISION-apps/docs/API-DOCS/HIKVISION/` (salvo InputProxy):

| Ruta | Uso |
|---|---|
| `GET /ISAPI/System/deviceInfo` | identidad y prueba de vida |
| `GET /ISAPI/Streaming/channels` | canales de video |
| `GET /ISAPI/AccessControl/capabilities` | ¿es control de acceso? |
| `GET /ISAPI/PTZCtrl/channels/{id}/presets` | ¿el canal es motorizado? |
| `PUT /ISAPI/AccessControl/RemoteControl/door/{id}` | apertura remota |
| `POST /ISAPI/AccessControl/UserInfo/Search?format=json` | personas del terminal → espejo `IntegraPerson` |
| `POST /ISAPI/AccessControl/UserInfo/Record?format=json` | alta persona |
| `PUT /ISAPI/AccessControl/UserInfo/Modify?format=json` | editar ficha |
| `POST /ISAPI/Intelligent/FDLib/FaceDataRecord?format=json` | empujar JPEG Face ID |
| `POST /ISAPI/AccessControl/CaptureFingerPrint?format=json` | capturar huella en sensor |
| `POST /ISAPI/AccessControl/FingerPrintDownload?format=json` | aplicar plantilla a persona |
| `POST /ISAPI/AccessControl/FingerPrintUpload?format=json` | obtener plantilla del ACS |
| `PUT /ISAPI/AccessControl/FingerPrint/Delete?format=json` | borrar huellas |
| `POST /ISAPI/AccessControl/AcsEvent?format=json` | eventos de acceso (live, tope 30/página) |
| `PUT /ISAPI/AccessControl/UserInfoDetail/Delete` + `DeleteProcess` | baja de persona en ACS |
| `POST /ISAPI/ContentMgmt/search` (XML) | segmentos de grabación NVR → playbackURI |
| `PUT /ISAPI/Event/notification/httpHosts/{id}` | empuje de eventos a NEXARA |
| `GET/PUT /ISAPI/Smart/FieldDetection/{ch}` | intrusión AcuSense/NVR (no PTZ) |
| `GET/PUT .../motionDetection` | VMD clásico (sí en PTZ) |

Más `/ISAPI/ContentMgmt/InputProxy/channels[/status]`, que **no** está en el doc
set de SYSCOM. Da el nombre real de cada cámara, su IP de origen y si está en
plug & play. Se usa solo como enriquecimiento: verificado en vivo contra
DS-7616NXI-I2/16P/VPro V5.05.370, y si falla se ignora. Nada estructural depende
de él.

**Personas / eventos sin HikCentral:** el sync ISAPI lee `UserInfo/Search` en cada
equipo ACS del sitio y escribe el espejo. `GET /integra/events` consulta
`AcsEvent` en vivo en esos mismos terminales (no hay tabla de eventos).

## Hallazgos del sitio que no son de software

- **El NVR marca `PasswordStatus: invalid` en los canales 1, 2, 9 y 10** — las
  cuatro cámaras en plug & play. Contraseña débil o caducada en la cámara.
  Se corrige desde el NVR; no lo arregla ninguna integración.
- La hoja de instalación pone el NVR en `192.168.1.198`; en la red responde en
  `192.168.9.34`. La columna `mask` de esa hoja (`255.255.255.1`, `.2`, `.3`…)
  no es una máscara de red — la real es `255.255.255.0`.
- El domo PTZ (`.179`) es el único con audio (`PCMU`).
- **PTZ DarkFighter (medido 2026-09-04):** `Smart/FieldDetection|LineDetection`
  → HTTP 403 `notSupport`; `vehicleDetection`/ITC/Traffic → 403/404;
  `SmartCap.isSupportFieldDetection=false`. Sí: `motionDetection` (200) y
  `httpHosts`. **No clasifica vehículos ni lee placas.**
- **NVR FieldDetection:** OK en canales PoE 1/2/9/10 con
  `detectionTarget=human,vehicle` (Escalera, Office Entrance, Escaleras 02,
  Azotea). Canal 13 (PTZ) → 403. El NVR debe tener `httpHosts` a NEXARA o
  esos eventos no llegan.
- **AcuSense LAN** admiten `human,vehicle` en FieldDetection; en oficinas se
  deja `human` para no ensuciar con falsos vehicle.
