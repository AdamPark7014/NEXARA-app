# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-03
- **Rama:** `claude/integra-edge-enrollment` — **ya empujada a `mejora/calidad-y-web`** y desplegada.

## Arranque obligatorio: comparar contra origin

Este turno empezó duplicando entero el provider ISAPI que Cursor ya había hecho,
por no mirar `origin`. Ese trabajo se descartó. Antes de escribir código:

```
git fetch origin && git log --oneline HEAD..origin/mejora/calidad-y-web | head
```

## El sitio de oficinas ya está en producción y funciona sin la laptop

**El puente es el NAS Synology (`192.168.9.32`)**, no la laptop de Adam. Tiene el
paquete Tailscale, se enroló como `nas-nexara` (100.71.203.3) y anuncia
`192.168.9.0/24` con la ruta aprobada. **Verificado quitándole el anuncio a la
laptop**: el servidor siguió alcanzando NVR, terminales, cámaras y domo.

Sitio `#1 "Oficinas NEXARA"`, **empresa 2 (NEXARA Demo)**, provider ISAPI,
`host http://192.168.9.34`. Espejo: **13 cámaras · 4 puertas · 18 equipos**.

## Tres fallos de raíz, encontrados con medición y arreglados

### 1. El cliente ISAPI se ahogaba a través del túnel (`7270143`)

Iba **sin pooling**: una conexión TCP nueva por petición. En LAN era la decisión
correcta y está bien razonada en el código. **Por túnel se invierte.** Con
tcpdump sobre `tailscale0`: los cierres quedan a medias, el `FIN` se retransmite
sin que el equipo lo confirme, y las pocas ranuras del firmware se agotan.
Síntoma exacto: `deviceInfo` responde en 350 ms y **la siguiente llamada expira
a los 15 s**, mientras la misma petición hecha a mano funciona en 200 ms.

Ahora **una conexión reutilizada por equipo** (`maxSockets: 1`, que mantiene la
promesa de no acaparar ranuras) y `close()` para que un CLI pueda terminar.

Sync del sitio real: **de 133 s devolviendo 0 cámaras, a 7.3 s con todo**.

### 2. go2rtc no podía escribir su configuración (`7270143`, `ef22944`)

El YAML iba montado `:ro`. Al registrar un stream, go2rtc lo añadía en memoria
pero fallaba al persistirlo y devolvía **400** — la API lo leía como fallo y la
consola no mostraba video.

Al ponerlo `:rw` apareció un problema peor: **go2rtc escribe las URLs RTSP con
la contraseña dentro**, y el archivo estaba **versionado en git**. Quedaron
cuatro líneas con la clave en un fichero rastreado. Ahora la configuración viva
está en `/var/lib/nexara/go2rtc` (fuera del repo, permisos 600) y
`deploy/go2rtc/go2rtc.yaml` es solo semilla que `update.sh` copia la primera vez.

### 3. El reproductor giraba para siempre: todo estaba en H.265 (`0a53899`)

Los equipos publican el principal en **H.265 y el navegador no lo decodifica**.
Los JPEG sí se veían porque los decodifica go2rtc en el servidor — por eso
parecía problema de red y no de códec.

- **Equipos reconfigurados**: los 13 sub-streams del grabador y los 9 de las
  cámaras con IP propia pasaron de H.265 a **H.264**. El principal, que es el
  que graba, **no se tocó**: misma calidad y mismo espacio.
- **Código**: `IntegraMediaService` sirve ahora el **secundario** (`302`, `102`…),
  H.264 a 640×360 — justo lo que necesita un muro de 13 cámaras, y sin
  transcodificar, que en un servidor de 4 núcleos con 28 contenedores de otros
  seis negocios no es opción.

## Alta automática de la caja on-site — ADR-0021 (`3cba6e9`)

Emitir token del sitio, correr una línea en la caja, y se registra sola: genera
sus claves (la privada nunca sale), recibe su `10.77.0.x`, levanta WireGuard y
queda latiendo. La API **no toca WireGuard**: declara el peer y un reconciliador
de systemd lo aplica con `wg set`, que no reinicia la interfaz. `AllowedIPs` es
siempre la red del túnel, nunca la LAN del cliente, y hay un test que lo fija.

`deploy/edge/server-setup.sh` **no se ha ejecutado**: el sitio de oficinas va por
Tailscale sobre el NAS, no por este WireGuard. Está listo para el primer cliente.

## Además, de paso

**NEXARA estaba lentísimo por culpa de otro proyecto.** `biblioteca-web` llevaba
4 días acumulando zombis: **10,541 procesos** contra los 23 de nexara-web. Con
10,800 tareas el kernel se atasca en cada `fork()`, de ahí los SSH que expiraban
y respuestas de 27 s con el ping perfecto a 110 ms. Reiniciado con permiso de
Adam: de 10,541 zombis a 4, de 10,807 tareas a 302. **Vuelve a pasar** si no se
le pone `init: true` al compose de biblioteca y se arregla su healthcheck.

## Sesión 03-09 (tarde): video, y por qué media rejilla no arrancaba

**El backend nunca fue el problema.** Medido: los 9 canales entregan imagen
**simultánea** (16-24 KB por fotograma, 9 de 9). La cadena HLS pública completa
—maestra, hija y primer segmento con 12,596 bytes de MPEG-TS— responde bien, y
HTTP/2 está activo, así que tampoco era el límite de conexiones del navegador.

### hls.js venía de un CDN que la CSP bloquea (`a057c26`)

El player inyectaba `<script src="cdn.jsdelivr.net/...hls.min.js">` en runtime.
La CSP del sitio permite Google Maps, Brevo y Stripe; **jsdelivr no está**. El
navegador lo bloqueaba en silencio, el player caía al modo nativo —que sólo
tiene Safari— y Chrome mostraba «No se pudo reproducir el stream».

Ahora es dependencia (`hls.js@1.5.17`) y entra por `import()`, en su propio
chunk. **Verificado en el bundle desplegado: 0 referencias a jsdelivr.** De paso
quita una dependencia de internet en una consola de seguridad.

### Chrome rechaza parte de los play() en un muro (`f807115`)

Con 9 vídeos arrancando a la vez, parte de los `play()` se rechazan. No es la
política de autoplay —van muteados, que ella permite— sino que el navegador no
da abasto montando nueve decodificadores en el mismo instante. El player se
rendía al primer rechazo y dejaba el mosaico con el play manual. Ahora reintenta
escalonado (250 ms, 750, 1.5 s, 3 s).

### La laptop competía con el NAS por la misma ruta

Al intentar recuperar el inventario le devolví el `--advertise-routes` a la
laptop y **no se lo quité**. Con los dos anunciando `192.168.9.0/24`, Tailscale
elige uno; si elige la laptop y está fuera de la oficina, todo cae en un agujero
negro. Explica el sync fallido de 03:30 y los eventos que expiraban. Ya
corregido: **el NAS es el único que anuncia**. Si alguien vuelve a poner la ruta
en un equipo móvil, esto se repite.

## Lo que los terminales exponen y la consola todavía no muestra

Comprobado contra `192.168.9.163` (`UserInfo/Search` y `FDLib/FDSearch`):

- **Foto** por persona (`faceURL`) — las 21 tienen rostro dado de alta
- Nº de empleado, nombre, género
- **Vigencia**: `2026-05-23` → `2036-05-23`
- **Puertas que puede abrir**: `RightPlan` con `doorNo` y plan horario
- Contadores de rostros / huellas / tarjetas (`numOfFace`, `numOfFP`, `numOfCard`)
- **Audio bidireccional**: `TwoWayAudio/channels` responde 200

**Cuidado legal:** rostro y huella son datos personales **sensibles** bajo la
LFPDPPP y las multas se duplican. Mostrar la foto haciendo de proxy contra el
terminal sí; **copiar la plantilla biométrica (`modelData`) a nuestra base, no**.
Se guarda el identificador, no el biométrico.

## A medias

- **Personas y eventos siguen en 0 para sitios ISAPI.** No es el túnel: es código
  que falta. Comprobado que el terminal `192.168.9.163` tiene **21 usuarios**
  dados de alta y `/ISAPI/AccessControl/UserInfo/Search` responde bien. Lo mismo
  con `AcsEvent` (tope de 30 por página). Es lo siguiente y ahora es directo.
- **Las reglas TCPMSS que añadí en el servidor no hacen falta** (el problema era
  el pooling, no el MTU) y **no son persistentes**. Se pueden quitar:
  `iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -o tailscale0 -j TCPMSS --set-mss 1240`
  y la misma en POSTROUTING.
- **Tailscale en el NAS es la versión 1.58.2**, de hace dos años. Conviene
  actualizarla.
- El sitio quedó en la **empresa 2**. Adam quiere que la Demo sea «Oficinas
  NEXARA» y la 1 la infraestructura de clientes; **renombrar empresas en
  producción no se ha hecho** y necesita su confirmación.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX
- `key.properties` y el keystore — credenciales
- `ModuleEntry.webPath` — alimenta RBAC
- **No inventar rutas ISAPI**: las verificadas están en `docs/INTEGRA-LAN.md`.
- **No meter credenciales de equipos en el repo.** Van por `ISAPI_USER` /
  `ISAPI_PASSWORD` o cifradas en `IntegraSite`. Ojo con lo que escriben los
  servicios: go2rtc lo hacía sin que nadie lo notara.
- **No mover Traefik de puerto** (ADR-0020): sirve 40 dominios de siete negocios.
- El servidor hospeda **28 contenedores de otros proyectos**. Un build que llene
  el disco tumba producción ajena.

## Siguiente paso

1. **Fotos y ficha completa de personas** en la consola (ver arriba de dónde
   salen). Es lo que Adam pide y ya está todo localizado.
2. **Rediseño de la UI de Integra.** Adam insiste en que sigue poco intuitiva;
   lo tocado hasta ahora han sido fallos concretos, no diseño.
2. Quitar las reglas TCPMSS sobrantes del servidor.
3. `init: true` en el compose de biblioteca, o los zombis vuelven.
4. Decidir el tema de las empresas 1 y 2 con Adam.

## Mobile / Play — ENVIADO A REVISIÓN (31-08-2026)

Sin cambios. Sigue en revisión con **Producción 5 (1.0.0)** del commit `c8bccea`.

**Pendiente y sin comprobar:** que `play.review@nexara.com.mx` entre en
producción. Sin `PLAY_REVIEWER_PASSWORD` el seed **rota la contraseña** y deja
inservible la que está en Play Console:

```
docker compose --env-file .env.nexara -f docker-compose.nexara.yml   exec -T api sh -c "cd /app/apps/api && PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer"
```
