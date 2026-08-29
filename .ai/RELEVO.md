# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Fix 404 `/dashboard` en Integra
- Integra/lab no tienen `/dashboard`; home = `/` (`PANEL_META.entryPath`).
- `cross-panel-handoff` respeta entryPath; login en `integra.*` se queda en Integra.
- Redirect `integra/dashboard` → `/integra`. Deploy web en curso/hecho.

## A medias
- Artemis creds vacías en droplet.
- go2rtc ↔ RTSP LAN.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales

## Siguiente paso
1. Recargar https://integra.nexara.com.mx/ (o /login) — debe abrir home Integra.
2. Configurar sitio Artemis.

## Estado
- Commit `552dc69` en main.
