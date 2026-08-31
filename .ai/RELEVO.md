# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-31
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra: tercer provider `ISAPI` (LAN pura)

ADR-0019 §5 lo dejaba como «tercer provider futuro». Ya está implementado y
**verificado en vivo** contra el sitio real. La laptop estuvo dentro de
`192.168.9.0/24` durante la sesión; a media tarde el Wi-Fi cambió de red y desde
entonces los equipos ya no se alcanzan (ver «A medias»).

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
- `579 tests API` + `106 web`, verde. `tsc --noEmit` limpio en ambos workspaces.

### Arreglo de paso

`apps/web/.../integra/alarms/page.tsx` desestructuraba `userJson` de `useUser()`,
que no lo expone → `tsc` del workspace web fallaba y con él `npm run build:web`
(`ignoreBuildErrors` solo se activa con `NEXT_IGNORE_TYPE_ERRORS=1`). Se serializa
como en el resto de páginas con handoff. Era del turno anterior; una línea.

### Segunda mitad del turno: montado y corriendo en la laptop

Postgres 17 ya estaba instalado y vivo en `localhost:5432`, y `apps/api/.env`
apunta ahí (**no** a producción, se verificó antes de tocar nada).

- `prisma migrate deploy` — la base local iba atrasada; 153 migraciones al día.
- `integra:isapi:seed` **ejecutado**: sitio #1 «Oficinas NEXARA» + 4 terminales,
  con sus nombres reales (Sala de Juntas, Acceso Privados, Gerencia, Acceso
  General).
- **Sync real contra el hardware: 13 cámaras · 4 puertas · 18 equipos · 6.4 s.**
  El espejo quedó con 9 cámaras de IP propia y 4 en plug & play.
- `liveStream` verificado con datos reales: elige RTSP directo cuando la cámara
  tiene IP propia, grabador cuando es plug & play, y tacha la contraseña.

**CLI nuevo `integra:isapi:sync`.** No es un atajo del endpoint: el cron corre en
el droplet y **para un sitio ISAPI falla siempre**, porque no tiene ruta a la LAN
del cliente. El sync lo tiene que disparar algo que vea los equipos.

**Bug encontrado y arreglado con el CLI en la mano:** el proceso no terminaba
nunca. Desde Node 19 el `globalAgent` trae `keepAlive`, y sus sockets ociosos
mantienen vivo el bucle de eventos. Además ocupaban conexiones del firmware, que
son pocas. El cliente ISAPI usa ahora agentes propios sin pooling.

Ese cambio **no lo cubría ningún test** — los que había usan un cliente falso y
se saltan el transporte. `isapi.client.spec.ts` levanta un servidor local que
habla Digest de verdad: reto 401, reuso del reto, freno anti-bloqueo, traducción
de errores y el invariante de que no queden sockets ociosos.

`scripts/ts-node-js-ext.js`: los CLI corren TS en CJS y el código importa con
extensión `.js` (por `moduleResolution: node16`). Sin compilar, Node no resuelve.
Es el mismo mapeo que jest hace con `moduleNameMapper`, en un require hook.

### go2rtc montado y las 13 cámaras publicadas

Adam autorizó la descarga. `go2rtc 1.9.7` (`go2rtc_win64.zip`, 6,109,103 bytes,
sha256 `50E61FAB…C90AA`, release oficial de AlexxIT) en `.tools/go2rtc/`.
**`.tools/` añadido al `.gitignore`** — no estaba, y ahí caen tanto el binario
como cualquier config con credenciales.

**CLI nuevo `integra:isapi:publish`.** En vez de generar un YAML con contraseñas,
llama a `IntegraMediaService.liveStream`, el mismo método que atiende
`POST /api/integra/cameras/:id/stream`. Una sola lógica de elegir fuente, y las
credenciales salen cifradas de la base, van a go2rtc por su API y no tocan disco.

Las 13 se registraron y el enrutado quedó verificado en la API de go2rtc:
los canales 101/201/901/1001 (las de plug & play) por el NVR, las otras 9 directo
a su IP. No entregan imagen todavía porque la laptop ya no está en esa red.

### Diseño del enlace servidor ↔ sitio: `docs/INTEGRA-LAN-ENLACE.md`

WireGuard iniciado **desde el sitio** (el router es del cliente y puede haber
CGNAT: nada de puertos entrantes) más go2rtc dentro del sitio, para que el RTSP
crudo no cruce el túnel. Arregla de una vez las **dos** funciones caídas: el
video y el cron de sync.

La decisión que hay que tomar antes del segundo sitio: **enrutar solo el `/32`
del peer, no la LAN del cliente**. `192.168.1.0/24` es el default de medio
México; en cuanto dos sitios compartan rango, `AllowedIPs` ya no puede decidir a
qué peer enrutar. Con go2rtc y el sync en la caja on-site, el servidor no
necesita ver `192.168.9.x` para nada.

Servidor: Hetzner, resuelve a `5.78.215.109`. **No se tocó.** `~/.ssh/config`
tiene `HostName REEMPLAZA_CON_IP_HETZNER`, así que desde esta laptop no hay SSH.

## A medias

- **go2rtc no está en la LAN, y ahí se queda parado el puente.**
  `deploy/docker-compose.nexara.yml` lo levanta en el droplet, y el droplet no
  tiene ruta a `192.168.9.0/24`. Hasta que exista go2rtc on-site o una VPN
  sitio↔droplet, `/stream` devuelve el RTSP con la nota «GO2RTC_URL no
  configurado»: se ve con VLC desde la LAN, **no en el panel**. Las dos salidas
  están escritas en `docs/INTEGRA-LAN.md`.
- **La laptop se salió de la red del sitio** a media sesión: el Wi-Fi pasó de
  `192.168.9.82` a `10.206.65.125`. Todo lo verificado arriba se hizo con la
  laptop dentro. Para repetirlo hay que volver a esa red.
- El sitio #1 está dado de alta **en la base local**, no en producción.
- Inventario del barrido (sin contraseñas) en el scratchpad de la sesión, no
  versionado.
- **Falta la caja on-site.** El enlace necesita algo siempre encendido en la LAN
  del cliente (mini PC o Raspberry Pi) con WireGuard + go2rtc. Durante las
  pruebas el peer fue la laptop, que se va cuando se va Adam.
- **Nada del enlace está aplicado en el servidor.** El documento tiene los
  ficheros de configuración listos, pero no se ha ejecutado nada allá.

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

1. Volver a la red del sitio y correr `integra:isapi:publish` con go2rtc local:
   se ve el muro de las 13 cámaras en `:1984` desde cualquier navegador de la LAN.
   Es la primera confirmación visual de imagen real.
2. Conseguir la caja on-site y decidir `/32` vs. LAN completa
   (`docs/INTEGRA-LAN-ENLACE.md`). Es la única decisión que cuesta cara si se
   toma tarde.
3. Completar `~/.ssh/config` con la IP del Hetzner antes de configurar nada allá.
4. Repetir seed + sync contra la base de producción, desde dentro de la LAN.
5. Probar apertura remota en una terminal (`.160`) antes de ofrecerlo al cliente.
6. Avisar al instalador: el NVR marca `PasswordStatus: invalid` en los canales
   1, 2, 9 y 10 — las cuatro cámaras en plug & play.

## Mobile / Play — ENVIADO A REVISIÓN (31-08-2026)

La app está **en revisión de Google**. El centro de políticas ya no lista ninguna
infracción: pasó de dos rechazos a «Actualización en revisión».

Se enviaron 10 cambios juntos:

- **Producción 5 (1.0.0)** — el AAB del commit `c8bccea`. Códigos de versión: solo
  el 5. El **bundle 3**, que llevaba `READ_MEDIA_IMAGES/VIDEO` y provocó el
  rechazo, quedó en «No incluido».
- Ficha es-419: nombre `Nexara` → **`NEXARA`** e **icono 512 nuevo** (hexágono +
  wordmark sobre blanco, el mismo que el launcher).
- Categoría → **Economía** (en la consola en español no existe «Empresa»; contra
  las 32 categorías estándar de Play, Economía *es* BUSINESS — Finanzas es FINANCE).
- Declaración **«Aplicaciones gubernamentales» → No** (estaba sin empezar y
  bloqueaba publicar actualizaciones).
- Resto de declaraciones de contenido, ya existentes.

Detalle técnico de los dos arreglos en `1a8f805` (icono de launcher) y `c8bccea`
(paridad app↔web).

### Trampas que costaron tiempo, por si se repiten

1. **Subir el AAB no lo mete en la versión.** Acabó en la biblioteca de app
   bundles y la versión de Producción seguía vacía. Se engancha con
   «Añadir de la biblioteca», no volviéndolo a subir.
2. **Una versión en Borrador no entra en la cola de revisión.** Hay que abrirla,
   «Siguiente» → «Revisar y confirmar» → «Guardar». Hasta entonces, el Resumen de
   publicación seguía apuntando a la versión **2 (1.0.0)**, la rechazada. Enviar
   en ese momento habría repetido el rechazo con el icono nuevo puesto.
3. La declaración de permisos de fotos sigue en «Requiere atención» hasta que la
   revisión termine: existe porque el bundle 3 los declara, y ese bundle no deja
   de ser el activo hasta que Google apruebe el 5.

### Pendiente

- **Nadie ha comprobado que `play.review@nexara.com.mx` entre en producción.** Si
  el revisor no puede iniciar sesión, es rechazo seguro. `seed-play-reviewer.ts`
  es idempotente, apaga MFA, limpia `lockedUntil`/`failedLoginCount` y valida el
  hash con `bcrypt.compare`. **Sin `PLAY_REVIEWER_PASSWORD` rota la contraseña** y
  deja inservible la que está en Play Console; pásasela para revalidar sin rotar:

  ```
  docker compose --env-file .env.nexara -f docker-compose.nexara.yml \
    exec -T api sh -c "cd /app/apps/api && PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer"
  ```

- Símbolos de depuración del código nativo sin subir (solo una advertencia de Play,
  no bloquea; mejora el análisis de ANR y fallos).
