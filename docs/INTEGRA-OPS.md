# NEXARA Integra · operaciones

Checklist para poner en marcha `integra.nexara.com.mx` y el ACS de oficinas.
Ver [ADR-0017](ADR-0017-nexara-integra.md).

## Frontera

| Superficie | Env | API | UI |
|------------|-----|-----|-----|
| Oficinas NEXARA | `OFFICES_HIK_*` | `/api/access-control` | `/erp/facilities/access` |
| Integra (sitio) | `INTEGRA_HIK_*` | `/api/integra` | `integra.nexara.com.mx` |

Pueden apuntar al **mismo** HikCentral o a instancias distintas. No mezclar controllers.

## DNS

1. Crear registro **A** (o AAAA) `integra.nexara.com.mx` → IP del droplet NEXARA.
2. Traefik ya tiene router `integra-frontend` + `/api` + socket (`deploy/traefik/nexara.yml`).
3. Esperar ACME Let’s Encrypt tras el primer hit HTTPS.

Aliases no hace falta; el canónico es `integra`.

## Secretos (droplet / `.env`)

```bash
# Oficinas
OFFICES_HIK_HOST=https://hikcentral.oficinas.local
OFFICES_HIK_APP_KEY=...
OFFICES_HIK_APP_SECRET=...
OFFICES_HIK_TIMEOUT=15000

# Integra (producto / sitio)
INTEGRA_HIK_HOST=https://hikcentral.sitio.local
INTEGRA_HIK_APP_KEY=...
INTEGRA_HIK_APP_SECRET=...
INTEGRA_HIK_TIMEOUT=15000
```

Fallback oficinas: `HIKVISION_URL`, `HIK_APP_KEY`, `HIK_APP_SECRET`.

Certificados autofirmados: el cliente Node usa `fetch` sin agent custom; si TLS falla,
terminar en HTTP interno o instalar CA en el contenedor `nexara-api`.

## Smoke

Con sesión JWT (cookie o Bearer):

```bash
curl -sS -H "Authorization: Bearer $TOKEN" https://core.nexara.com.mx/api/access-control/health
curl -sS -H "Authorization: Bearer $TOKEN" https://integra.nexara.com.mx/api/integra/health
curl -sS -H "Authorization: Bearer $TOKEN" https://integra.nexara.com.mx/api/integra/cameras
curl -sS -H "Authorization: Bearer $TOKEN" https://integra.nexara.com.mx/api/integra/doors
```

Esperado con creds OK: `connected: true`. Sin creds: `configured: false`, HTTP 200 en health;
listados responden **503**.

## Video

`POST /api/integra/cameras/:id/preview` devuelve URL **RTSP** (`rtsp_s`). Abrir en VLC
o un media gateway; no hay player HTML5 en P0.

## Deploy

Tras cambiar Traefik o env:

```bash
cd /var/www/nexara-app && ./deploy/update.sh
```

Confirmar contenedores `nexara-api` / `nexara-web` y logs sin crash al importar `IntegraModule`.
