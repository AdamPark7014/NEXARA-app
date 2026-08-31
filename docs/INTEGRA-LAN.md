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

`POST /api/integra/sync`, o el cron de 15 minutos.

- El **equipo cabecera** manda: sus canales son el inventario de cámaras.
- `cameraIndexCode` = `<ip-cabecera>|<canal>` → `192.168.9.34|301`.
- El nombre sale del NVR («Escalera 01», «Coffee Area»), no del número de canal.
- Las ranuras sin cámara se ignoran.
- Los equipos ya registrados que el cabecera no cubre se refrescan uno a uno;
  lo que sí cubre, no se vuelve a sondear.
- Cada terminal de acceso da de alta una puerta `<ip>|1`.

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

Las dos salidas, en orden de preferencia:

1. **go2rtc on-site.** Un equipo en la LAN del cliente (mini PC, el propio
   servidor del sitio) corriendo `alexxit/go2rtc`, publicado hacia el droplet
   por VPN o túnel. `GO2RTC_URL` apunta a él.
2. **VPN sitio ↔ droplet.** WireGuard entre el droplet y la LAN, y go2rtc se
   queda donde está. Más simple de operar, pero mete todo el video en el túnel.

Mientras no exista ninguna de las dos, la API responde con el RTSP y la nota
«GO2RTC_URL no configurado»: el video se ve con VLC desde la LAN, no en el panel.

## Apertura de puertas

`POST /api/integra/doors/:doorIndexCode/open` con motivo obligatorio.
En ISAPI se traduce a `PUT /ISAPI/AccessControl/RemoteControl/door/{doorNo}`
sobre la IP de la terminal. Los cuatro `controlType` de Artemis mapean a
`open` / `close` / `alwaysOpen` / `alwaysClose`.

## Lo que ISAPI no da

Personas, vehículos, ANPR, visitas y playback de Artemis responden **400** en un
sitio ISAPI, igual que en uno HCT. No es un hueco por rellenar: son capacidades
de plataforma que un equipo suelto no tiene.

## Rutas ISAPI empleadas

Todas documentadas en `HIKVISION-apps/docs/API-DOCS/HIKVISION/`:

| Ruta | Uso |
|---|---|
| `GET /ISAPI/System/deviceInfo` | identidad y prueba de vida |
| `GET /ISAPI/Streaming/channels` | canales de video |
| `GET /ISAPI/AccessControl/capabilities` | ¿es control de acceso? |
| `GET /ISAPI/PTZCtrl/channels/{id}/presets` | ¿el canal es motorizado? |
| `PUT /ISAPI/AccessControl/RemoteControl/door/{id}` | apertura remota |

Más `/ISAPI/ContentMgmt/InputProxy/channels[/status]`, que **no** está en el doc
set de SYSCOM. Da el nombre real de cada cámara, su IP de origen y si está en
plug & play. Se usa solo como enriquecimiento: verificado en vivo contra
DS-7616NXI-I2/16P/VPro V5.05.370, y si falla se ignora. Nada estructural depende
de él.

## Hallazgos del sitio que no son de software

- **El NVR marca `PasswordStatus: invalid` en los canales 1, 2, 9 y 10** — las
  cuatro cámaras en plug & play. Contraseña débil o caducada en la cámara.
  Se corrige desde el NVR; no lo arregla ninguna integración.
- La hoja de instalación pone el NVR en `192.168.1.198`; en la red responde en
  `192.168.9.34`. La columna `mask` de esa hoja (`255.255.255.1`, `.2`, `.3`…)
  no es una máscara de red — la real es `255.255.255.0`.
- El domo PTZ (`.179`) es el único con audio (`PCMU`).
