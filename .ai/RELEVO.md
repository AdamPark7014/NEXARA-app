# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Deploy producción Integra (DNS + código)

- Commit/push `main` @ `97a9c64` (mejora absoluta + fix imports `video` → `../_HlsPlayer`).
- Droplet: `./deploy/update.sh --force-all --with-migrate` OK.
- Env añadido: `GO2RTC_*`, `INTEGRA_SECRETS_KEY`, placeholders `INTEGRA_HIK_*` / `OFFICES_HIK_*`.
- Contenedores: `nexara-api`, `nexara-web`, `nexara-go2rtc` Up.
- Tablas Prisma: `integra_sites|cameras|doors|people|devices|vehicles|sync_runs`.
- Smoke: `https://integra.nexara.com.mx/` → **200**; `/api/integra/health` → **401** (auth OK);
  `/go2rtc/api` → **200**.

## A medias — CUIDADO
- **Credenciales Artemis vacías** en droplet (`INTEGRA_HIK_*` / sitios UI). Sin ellas health
  autenticado dirá sin config / down.
- go2rtc necesita reachabilidad LAN/VPN al RTSP de HikCentral.
- Adapter HCT / ISAPI / APM sync alerts: backlog (ADR-0019).
- Playback timeline densa + bookmarks: no hecho (playback por rango sí).

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
- `apps/api/prisma/seed-demo-users.ts`
- `package-lock.json`

## Siguiente paso
1. Rellenar `INTEGRA_HIK_*` o crear sitio en `/integra/settings` y sync.
2. Probar live HLS con cámara real.
3. Oficinas: `OFFICES_HIK_*` si aún no.

## Estado verificado al cerrar
- Deploy exit 0; DNS A → 5.78.215.109; UI/API/go2rtc responden.
