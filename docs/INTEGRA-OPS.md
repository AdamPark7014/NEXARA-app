# NEXARA Integra · operaciones

Checklist para `integra.nexara.com.mx`, sitios multi-tenant, go2rtc y ACS oficinas.
Ver [ADR-0017](ADR-0017-nexara-integra.md), [ADR-0018](ADR-0018-integra-media-tenancy.md), [ADR-0019](ADR-0019-integra-hct-adapter.md).
Sitios sin HikCentral ni HCT (LAN pura): [INTEGRA-LAN](INTEGRA-LAN.md).

## Frontera

| Superficie | Creds | API | UI |
|------------|-------|-----|-----|
| Oficinas NEXARA | `OFFICES_HIK_*` | `/api/access-control` | `/erp/facilities/access` |
| Integra (sitio) | `IntegraSite` cifrado **o** `INTEGRA_HIK_*` | `/api/integra` | `integra.nexara.com.mx` |

No mezclar controllers.

## DNS

1. **A/AAAA** `integra.nexara.com.mx` → droplet.
2. Traefik: frontend + `/api` + `/go2rtc` → go2rtc + socket.

## Secretos

```bash
# Oficinas
OFFICES_HIK_HOST=https://hikcentral.oficinas.local
OFFICES_HIK_APP_KEY=...
OFFICES_HIK_APP_SECRET=...

# Fallback Integra (si no hay filas IntegraSite)
INTEGRA_HIK_HOST=https://hikcentral.sitio.local
INTEGRA_HIK_APP_KEY=...
INTEGRA_HIK_APP_SECRET=...

# Cifrado de secrets de sitio (32 bytes vía sha256 del string)
INTEGRA_SECRETS_KEY=...

# Caja on-site (ADR-0021) — los imprime deploy/edge/server-setup.sh
INTEGRA_EDGE_WG_ENDPOINT=5.78.215.109:51820
INTEGRA_EDGE_WG_SERVER_PUBKEY=...
INTEGRA_EDGE_WG_SUBNET=10.77.0.0/24
INTEGRA_EDGE_API_URL=https://integra.nexara.com.mx
INTEGRA_EDGE_RECONCILE_TOKEN=...

# Media
GO2RTC_URL=http://nexara-go2rtc:1984
GO2RTC_PUBLIC_URL=https://integra.nexara.com.mx/go2rtc
```

Sitios se crean en UI `/integra/settings` (roles altos). Rotar keys = editar sitio (re-cifra).

## go2rtc

- Compose: servicio `nexara-go2rtc` (`deploy/go2rtc/go2rtc.yaml`).
- API `POST /api/integra/cameras/:id/stream` registra RTSP Artemis y devuelve HLS público.
- El contenedor debe alcanzar la red donde Artemis publica RTSP (VPN/LAN).
- Puerto interno `1984`; público solo vía Traefik path `/go2rtc`.

## Provider ISAPI (LAN pura)

| Campo sitio | Valor |
|-------------|--------|
| `provider` | `ISAPI` |
| `host` | `http://<ip-del-grabador>` |
| appKey / appSecret | **usuario / contraseña** de la consola web del equipo |

Alta y barrido en [INTEGRA-LAN](INTEGRA-LAN.md). **go2rtc debe correr dentro de
la LAN del sitio**; el del droplet no alcanza el RTSP de los equipos.

**Visitas recurrentes** (acceso ACS limitado al llegar): UI `/integra/visitors`
pestaña Recurrente · guía [INTEGRA-VISITAS-RECURRENTES](INTEGRA-VISITAS-RECURRENTES.md).

## Caja on-site: alta y estado (ADR-0021)

Un sitio ISAPI necesita una caja en la sucursal que cierre el túnel y corra
go2rtc. Se da de alta sola; nadie edita `wg0.conf`.

**Una vez en el servidor:**

```bash
sudo bash deploy/edge/server-setup.sh
sudo bash deploy/edge/wg-reconcile.sh --install <token-que-imprime>
```

Abrir `51820/udp` en el firewall de Hetzner y pegar las variables
`INTEGRA_EDGE_*` en `deploy/.env.nexara`.

**Por cada sitio:**

1. `POST /api/integra/sites/:id/edge/token` — el token **se muestra una sola vez**.
2. En la caja: `curl -fsSL <api>/api/integra/edge/install.sh | sudo bash -s -- <token>`
3. `GET /api/integra/edge-agents` para ver estado; se marca offline sin latido
   en 5 min. Revocar: `DELETE /api/integra/sites/:id/edge`.

Re-emitir el token invalida a la caja anterior — es la vía si se pierde el equipo.

**Pendiente:** el espejo de inventario. Con `AllowedIPs = /32` el cron del
servidor no alcanza los equipos, así que `integra:isapi:sync` sigue corriéndose
a mano desde dentro de la LAN hasta que el agente empuje el espejo.

## Provider HCT (ADR-0019)

| Campo sitio | Valor |
|-------------|--------|
| `provider` | `HCT` (UI settings o API) |
| `host` | `areaDomain` inicial (p.ej. `https://ius.hikcentralconnect.com`) |
| appKey / appSecret | App Key / Secret Key de la consola HCT |

- Sync: cámaras, puertas y devices → mismo espejo Prisma; people/vehicles Artemis quedan en 0.
- Stream: respuesta con `provider: HCT` + token EZUIKit (`stream`); **no** usa go2rtc.
- Open door: endpoint remoto HCT documentado.
- No mezclar credenciales Artemis y HCT en la misma fila `IntegraSite`.

## Sync

- Cron cada 15 min por sitio activo.
- Manual: `POST /api/integra/sync` o botón en home/settings.
- Listados leen espejo Prisma; `?live=1` fuerza Artemis.

## Smoke

```bash
curl -sS -H "Authorization: Bearer $TOKEN" https://integra.nexara.com.mx/api/integra/health
curl -sS -H "Authorization: Bearer $TOKEN" https://integra.nexara.com.mx/api/integra/dashboard
curl -sS -H "Authorization: Bearer $TOKEN" -X POST https://integra.nexara.com.mx/api/integra/sync
curl -sS -H "Authorization: Bearer $TOKEN" -X POST https://integra.nexara.com.mx/api/integra/cameras/CAM01/stream
```

## Deploy

```bash
cd /var/www/nexara-app && ./deploy/update.sh
# prisma migrate deploy incluye integra_sites_mirror
```

Confirmar contenedores `nexara-api`, `nexara-web`, `nexara-go2rtc`.

## URGENTE · Credenciales de las cámaras expuestas a internet

**Detectado y verificado el 2026-09-05.** Sin arreglar en el momento de escribir
esto: el arreglo toca Traefik, que está en la lista de «no tocar» sin permiso.

`https://integra.nexara.com.mx/go2rtc/api/streams` responde **HTTP 200 desde
internet, sin autenticación**, y su cuerpo trae **26 URLs RTSP con el usuario y
la contraseña de las cámaras en claro**. `…/go2rtc/api/config` filtra otras 13.

Comprobado con `curl` desde fuera de la red, sin credencial ninguna:

```
/go2rtc/api/config     -> 200   (13 URLs con credenciales)
/go2rtc/api/streams    -> 200   (26 URLs con credenciales)
/go2rtc/video-stream.js-> 200   (legítimo: lo necesita el navegador)
/go2rtc/api/ws         -> 400   (legítimo: espera upgrade a WebSocket)
```

Con esas credenciales se entra a las cámaras por RTSP, y en un DS-2CD2123G2 la
cuenta que sirve el stream suele ser la de administración: se puede ver el video
en vivo, y según el perfil también reconfigurar el equipo.

**Por qué pasó.** El prefijo `/go2rtc` se publicó entero para que el navegador
pudiera cargar `video-stream.js` y abrir el WebSocket, que es legítimo. Pero eso
publicó también la API de administración de go2rtc, que incluye las fuentes con
su credencial embebida — porque así es como go2rtc guarda un RTSP autenticado.

**Arreglo propuesto** (requiere permiso explícito: es ingress de producción).
Restringir la ruta de Traefik a lo que el navegador de verdad usa, y bloquear el
resto:

- Permitir: `/go2rtc/video-stream.js`, `/go2rtc/video-rtc.js`,
  `/go2rtc/api/ws`, `/go2rtc/api/frame.jpeg`, `/go2rtc/api/stream.m3u8`.
- Bloquear: todo lo demás bajo `/go2rtc`, en particular `/api/streams` y
  `/api/config`.

No basta con poner usuario y contraseña a la API de go2rtc: el navegador entra
por esas mismas rutas y se quedaría sin video. La separación tiene que ser por
camino, no por credencial.

**Después del arreglo hay que rotar las contraseñas de las cámaras.** Estuvieron
expuestas y no hay forma de saber quién las leyó.
