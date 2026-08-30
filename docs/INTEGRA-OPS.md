# NEXARA Integra · operaciones

Checklist para `integra.nexara.com.mx`, sitios multi-tenant, go2rtc y ACS oficinas.
Ver [ADR-0017](ADR-0017-nexara-integra.md), [ADR-0018](ADR-0018-integra-media-tenancy.md), [ADR-0019](ADR-0019-integra-hct-adapter.md).

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
