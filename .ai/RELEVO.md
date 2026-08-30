# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra densificación UI + params (post Absolute Upgrade)
- API: `door/events` con `doorIndexCodes` + `eventType` + rango/página; `POST doors/:id/control` (0/1/2/3); `GET people/:id` (personInfo).
- UI densa: Video wall 4 cams + filtros región; Access doControl + live doors; Events filtros reales + auto-refresh; People detalle live; Vehicles edit + picker persona; Alarms/ANPR/Visitors con datetime/page/params.
- CSS `filterBar` / `camGrid` en `integra.module.css`.

## A medias
- Player EZUIKit embebido (HCT sigue mostrando note/token).
- Deploy densificación a prod.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales
- Oficinas ACS (`/api/access-control` + `OFFICES_HIK_*`)

## Siguiente paso
1. Deploy `--force-all` + hard-refresh Integra.
2. Smoke: events con door + rango; door control; video wall.
3. (Opcional) EZUIKit player.

## Estado
- Listo para relevo cerrar / deploy.
