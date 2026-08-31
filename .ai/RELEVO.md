# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-31
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra: tercer provider `ISAPI` (LAN pura)

ADR-0019 §5 lo dejaba como «tercer provider futuro». Ya está implementado y
**verificado en vivo** contra el sitio real (la laptop está en `192.168.9.0/24`).

Documentación: **`docs/INTEGRA-LAN.md`** — topología, alta, sync, video y los
hallazgos del sitio. ADR-0019 e INTEGRA-OPS actualizados.

**Módulo nuevo `apps/api/src/hikvision-isapi/`**

- `digest.ts` — HTTP Digest MD5, portado de
  `HIKVISION-apps/templates/isapi-node`.
- `xml.ts` — parser XML mínimo. Sin dependencia nueva: de estas respuestas solo
  se leen escalares y listas. **Algunos firmwares rotulan `application/json` y
  mandan XML**, así que se decide por el contenido, no por el header.
- `isapi.client.ts` — cliente con throttle, TLS laxo y, sobre todo, **freno
  anti-bloqueo**: si el equipo rechaza las credenciales el cliente se
  auto-inhabilita. Los Hikvision bloquean la cuenta a los pocos intentos.
- `isapi.discovery.ts` — identidad, canales, ACS, PTZ, cámaras enroladas.
- `rtsp-probe.ts` — `DESCRIBE` RTSP real, sin ffmpeg.
- `isapi-scan.ts` / `isapi-seed.ts` — CLI de barrido y alta.

**Cableado en Integra** (`provider` es `VarChar(16)`: **sin migración Prisma**)

- `IntegraProviderKind` += `ISAPI`; `resolveClient` devuelve `isapi` y
  `isapiForHost(ip)` — en LAN un sitio son varios equipos con la misma clave.
- `integra-sync.service.ts` → `syncIsapiSite`.
- `integra-media.service.ts` → RTSP → go2rtc, eligiendo la fuente.
- `integra-artemis.service.ts` → health y apertura de puerta por ISAPI.
- `apps/web/.../integra/settings` → opción «Equipos en red local», con las
  etiquetas correctas (usuario/contraseña, no clave/secreto).

### Tres cosas que costaron y no son evidentes

1. **El nonce de RTSP va atado a la conexión.** El servidor RTSP de Hikvision
   emite un nonce nuevo por socket: reto y respuesta firmada tienen que viajar
   por el mismo. Reconectar da 401 eterno con una firma perfectamente correcta.
   Costó las primeras 13 pruebas RTSP, todas rojas.
2. **Un NVR contesta 200 a `PTZCtrl` en todos sus canales**, sea o no motorizada
   la cámara. Clasificaba el grabador como PTZ. El dato no distingue nada en un
   grabador y se descarta.
3. **Una terminal DS-K1T publica un canal de video** (la cámara de rostro), así
   que se clasificaba como cámara. Manda ACS.

### Verificado contra el sitio real

- **14/14 equipos identificados**, **26/26 canales entregan video** (`DESCRIBE`
  RTSP real, no supuesto).
- 1 NVR DS-7616NXI (13 canales vivos), 8 cámaras fijas, 1 domo PTZ, 4 terminales.
- Las 4 cámaras que la hoja marca «P&P» cuelgan del PoE interno del NVR
  (`192.168.254.x`): **no existen en la LAN**, solo se ven vía grabador. Por eso
  el inventario se construye desde el NVR y no barriendo IPs.
- Nombres reales recuperados del NVR: «Escalera 01», «Coffee Area», «Azotea»…
- `572 tests API` + `106 web`, verde. `tsc --noEmit` limpio en ambos workspaces.

### Arreglo de paso

`apps/web/.../integra/alarms/page.tsx` desestructuraba `userJson` de `useUser()`,
que no lo expone → `tsc` del workspace web fallaba y con él `npm run build:web`
(`ignoreBuildErrors` solo se activa con `NEXT_IGNORE_TYPE_ERRORS=1`). Se serializa
como en el resto de páginas con handoff. Era del turno anterior; una línea.

## A medias

- **go2rtc no está en la LAN, y ahí se queda parado el puente.**
  `deploy/docker-compose.nexara.yml` lo levanta en el droplet, y el droplet no
  tiene ruta a `192.168.9.0/24`. Hasta que exista go2rtc on-site o una VPN
  sitio↔droplet, `/stream` devuelve el RTSP con la nota «GO2RTC_URL no
  configurado»: se ve con VLC desde la LAN, **no en el panel**. Las dos salidas
  están escritas en `docs/INTEGRA-LAN.md`.
- **El sitio no está dado de alta en la base.** No hay Postgres levantado en la
  laptop (Docker Desktop apagado). `integra:isapi:seed` está escrito y
  typechequeado, pero **no ejecutado**. Debe correr con el mismo
  `INTEGRA_SECRETS_KEY`/`JWT_SECRET` que la API.
- Inventario del barrido (sin contraseñas) en el scratchpad de la sesión, no
  versionado.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX
- `key.properties` y el keystore — credenciales
- `ModuleEntry.webPath` — alimenta RBAC
- `scripts/generate-mobile-icons.js` — código muerto; usar `gen-native-app-icons.py`
- **No inventar rutas ISAPI.** Las que se usan están tabuladas en
  `docs/INTEGRA-LAN.md`. La única fuera del doc set de SYSCOM es
  `InputProxy/channels`, marcada como tal y **opcional**: si falla se ignora y
  nada estructural depende de ella.
- **No meter las credenciales de los equipos en el repo.** Van por
  `ISAPI_USER`/`ISAPI_PASSWORD` o cifradas en `IntegraSite`.

## Siguiente paso

1. Decidir go2rtc on-site vs VPN sitio↔droplet. Sin eso no hay video en el panel.
2. Correr `integra:isapi:seed` contra la base real y luego `POST /api/integra/sync`.
   Deben salir 13 cámaras y 4 puertas.
3. Probar apertura remota en una terminal (`.160`) antes de ofrecerlo al cliente.
4. Avisar al instalador: el NVR marca `PasswordStatus: invalid` en los canales
   1, 2, 9 y 10 — las cuatro cámaras en plug & play.

## Estado del turno anterior (mobile/Play), sin cambios

El AAB **5 (1.0.0)** sigue sin subir a Producción, y el icono 512 sin subir a la
ficha (`apps/mobile-native/play-assets/icon-512.png`; el diálogo de Windows lo
tiene que manejar Adam). Detalle completo en el commit `1a8f805`.
