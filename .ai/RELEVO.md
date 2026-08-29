# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Fix login Integra — Invalid origin
- Causa: `integra` no estaba en `DEFAULT_ALLOWED_SUBDOMAINS` (`security.utils.ts`).
- También se amplió `CORS_ORIGIN` en droplet con `https://integra.nexara.com.mx` (+ paneles canónicos).
- Deploy API OK (`8bd126d`).

## A medias — CUIDADO
- Credenciales Artemis (`INTEGRA_HIK_*` / sitios UI) aún vacías.
- go2rtc necesita LAN/VPN al RTSP HikCentral.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
- `apps/api/prisma/seed-demo-users.ts`
- `package-lock.json`

## Siguiente paso
1. Reintentar login en integra.nexara.com.mx
2. Configurar Artemis + sync

## Estado verificado al cerrar
- Código + CORS en prod; redeploy api exit 0.
