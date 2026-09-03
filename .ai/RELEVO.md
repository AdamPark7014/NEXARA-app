# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-02
- **Rama:** `claude/integra-edge-enrollment` (sale de `mejora/calidad-y-web` en `47e406a`)

## Antes que nada: se duplicó trabajo. Que no se repita

Este turno arrancó en un worktree cuya rama salía de `e08c5aa`, **29 commits por
detrás** de `mejora/calidad-y-web`. Sin comparar contra `origin`, se reimplementó
entero el provider ISAPI que ya existía (`0ffb2fc`, `6cc9c3c`, `9d1d1e6`).
Hasta coincidió el número de ADR: había dos ADR-0020 distintos.

Ese trabajo se **descartó** (quedó en la rama muerta `claude/nexara-device-integration-f85726`,
sin fusionar ni desplegar). La implementación buena es la que ya estaba.

**Arranque obligatorio a partir de ahora**, además de `relevo.ps1 estado`:

```
git fetch origin && git log --oneline HEAD..origin/mejora/calidad-y-web | head
```

Si sale cualquier cosa, leerla antes de diseñar nada. En worktrees vale doble:
el aislamiento hace que una rama vieja se sienta actual.

## Hecho en este turno

### 1. Desplegado a producción el ISAPI que ya estaba escrito (y no corría)

El código de Cursor estaba en el disco del servidor pero **los contenedores nunca
se reconstruyeron**: `nexara-api` corría una imagen anterior sin `hikvision-isapi`.
De ahí que la consola dijera «Sin sitios configurados» y no fuera un bug.

- `/var/www/nexara-app` actualizado de `9c08ee20` a `47e406af` (eran dos commits
  de documentación).
- `deploy/update.sh --force-all --with-migrate`: `nexara-api` y `nexara-web`
  reconstruidos. Verificado `dist/hikvision-isapi/` dentro del contenedor y la
  API respondiendo.

### 2. Alta automática de la caja on-site — ADR-0021 (lo nuevo de este turno)

`INTEGRA-LAN-ENLACE` pedía generar claves a mano y editar `wg0.conf` por cada
sitio, con un `systemctl restart` que afecta a todos los sitios ya montados.
Sirve para el primero; no para el décimo. Ahora la caja se da de alta sola, como
el tótem de un estacionamiento.

- **`IntegraEdgeAgent`** + migración `20260902230000_integra_edge_agents`. Una
  fila por sitio: hash del token, clave pública de la caja, `tunnelIp`, latido.
- **`integra-edge.service.ts`** — emisión de token de un solo uso (solo se guarda
  el `sha256`), alta, latido, y la lista de peers para el reconciliador.
- **`integra-edge.controller.ts`** — dos superficies: la de la caja (sin
  `RbacGuard`, se autentica con su token) y la de administración (con sesión y
  permisos).
- **`integra-edge.install.ts`** — instalador que se sirve en
  `GET /api/integra/edge/install.sh`. La caja genera sus claves, se registra,
  levanta WireGuard, arranca go2rtc y queda latiendo cada minuto.
- **`deploy/edge/server-setup.sh`** y **`deploy/edge/wg-reconcile.sh`** — la API
  **no** toca WireGuard (corre en un contenedor, no es root); declara el peer en
  la base y un timer de systemd lo aplica con `wg set`, que no reinicia la
  interfaz: dar de alta el sitio diez no interrumpe a los otros nueve.

**Tres decisiones que conviene no revisitar sin leer el ADR:**

1. `AllowedIPs` es **siempre** la red del túnel, nunca la LAN del cliente. No es
   configurable por sitio y hay un test que lo fija. Es la trampa del sitio
   número tres que ya avisaba INTEGRA-LAN-ENLACE.
2. La clave privada de cada sitio vive solo en su caja. Un volcado de la base no
   compromete ningún túnel.
3. Re-emitir el token invalida a la caja anterior. Es la vía para revocar un
   equipo perdido sin entrar en él.

`14 tests` nuevos; `60` en las suites de integra + hikvision-isapi, verde.
`tsc --noEmit` limpio.

### 3. Hallazgos de red del sitio (contradicen la hoja de datos original)

- **El router de la oficina cuelga de la red del auditorio**: doble NAT. El IP
  público visto desde el sitio (`187.191.42.145`, Uninet) **no es de NEXARA**.
  Reenvío de puertos e IP fija quedan descartados, y no solo aquí: no
  generalizan a sucursales.
- El NVR **no** está en `192.168.1.198` sino en `192.168.9.34`. La columna «mask»
  de la hoja era el **número de canal**. Son **13 cámaras**, no 12: falta en la
  hoja el domo PTZ del canal 13.

### 4. Tailscale, montado y luego relegado

Se instaló en el servidor (`nexara-hetzner`, 100.119.133.69) y en la laptop
(`nexara-oficina`, 100.71.252.10) enrutando `192.168.9.0/24`, y **se verificó de
punta a punta**: el contenedor `nexara-api` alcanzó el NVR y `nexara-go2rtc` el
RTSP 554, con el servidor en Alemania y los equipos en la oficina.

Sirvió para probar que la cadena entera funciona, pero **enruta la LAN completa,
que es justo lo que el diseño de Cursor evita**. Se deja instalado porque hoy es
el único puente que existe; se retira cuando esté la caja permanente. La laptop
es de Adam y se va con él: el puente se cae cuando sale de la oficina.

## A medias

- **No hay caja on-site.** Es lo único que falta para que el sitio deje de
  depender de la laptop. Recomendación de INTEGRA-LAN-ENLACE: **mini PC Intel
  N100** (3,000–4,500 MXN) — x86 corre las mismas imágenes que el servidor, y su
  QuickSync transcodifica; la Pi 5 se ahoga y muere por la SD.
- **Nada del enlace está aplicado en el servidor.** `deploy/edge/server-setup.sh`
  existe pero **no se ha ejecutado**, y las variables `INTEGRA_EDGE_*` no están
  en `deploy/.env.nexara`. WireGuard sigue sin instalarse allá.
- **No hay ningún `IntegraSite` en la base de producción** (`select count(*)`
  = 0). El sitio de las pruebas de Cursor vive en la base local de la laptop.
- **Falta el espejo desde la caja.** Con `AllowedIPs = /32` el cron del servidor
  no alcanza los equipos, así que `integra:isapi:sync` se sigue corriendo a mano
  desde la LAN. El siguiente paso es `POST /api/integra/edge/mirror`; está
  deliberadamente fuera del ADR-0021.
- **HCT sigue siendo la vía por defecto del ADR-0020 y sigue sin App Key.**
  `INTEGRA_HIK_HOST/APP_KEY/APP_SECRET` están **vacías** en producción
  (verificado). Es un trámite con SYSCOM, no un problema técnico, y resolvería
  las sucursales **sin fierro en sitio**.
- Empresas: `1 = NEXARA Tech S.A. de C.V.`, `2 = NEXARA Demo (revisión de
  tiendas)`. Adam quiere que la **Demo** sea «Oficinas NEXARA» y la otra la
  infraestructura multi-locación de clientes. **No se ha cambiado nada**: cambiar
  el nombre de una empresa en producción necesita su confirmación explícita.

## No tocar

- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS, PortalShell rewrite, Meta/ESP, OFX
- `key.properties` y el keystore — credenciales
- `ModuleEntry.webPath` — alimenta RBAC
- `scripts/generate-mobile-icons.js` — código muerto; usar `gen-native-app-icons.py`
- **No inventar rutas ISAPI.** Las que se usan están tabuladas en
  `docs/INTEGRA-LAN.md`.
- **No meter las credenciales de los equipos en el repo.** Van por
  `ISAPI_USER`/`ISAPI_PASSWORD` o cifradas en `IntegraSite`.
- **No mover Traefik de puerto** (ADR-0020): sirve 40 dominios de siete negocios
  en 80/443, y Let's Encrypt valida por el 80.
- El servidor hospeda **28 contenedores de otros proyectos**. Un build que llene
  el disco tumba producción ajena; vigilar antes de construir.

## Siguiente paso

1. Comprar el mini PC N100 y montarlo en la oficina por Ethernet.
2. En el servidor: `deploy/edge/server-setup.sh`, abrir `51820/udp` en el
   firewall de Hetzner, pegar las `INTEGRA_EDGE_*` y redesplegar.
3. Emitir token del sitio y correr el instalador en la caja. Verificar que
   `GET /api/integra/edge-agents` la marca en línea.
4. Seed + sync contra la base de **producción** (falta decidir empresa 1 o 2).
5. Retirar el anuncio de ruta de la laptop (`tailscale set --advertise-routes=`)
   para que no compitan dos puentes.
6. En paralelo y sin depender de nada: pedir el App Key de HCT a SYSCOM.

## Mobile / Play — ENVIADO A REVISIÓN (31-08-2026)

Sin cambios este turno. La app sigue en revisión de Google con **Producción 5
(1.0.0)** del commit `c8bccea`; el bundle 3, que provocó el rechazo por
`READ_MEDIA_IMAGES/VIDEO`, quedó en «No incluido».

**Pendiente y sin comprobar:** que `play.review@nexara.com.mx` entre en
producción. Si el revisor no puede iniciar sesión, es rechazo seguro.
`seed-play-reviewer.ts` es idempotente, pero **sin `PLAY_REVIEWER_PASSWORD` rota
la contraseña** y deja inservible la que está en Play Console:

```
docker compose --env-file .env.nexara -f docker-compose.nexara.yml \
  exec -T api sh -c "cd /app/apps/api && PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer"
```
