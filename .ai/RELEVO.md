# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra Ops Workbench (plan completo)
- **Chrome único:** AppShell sin topbar ERP en `panel=integra`; solo HUD Integra (~40px) con health, Sync, Ops, módulos, Salir.
- **Kit:** `IgWorkbench` / `IgTree` / `IgCanvas` / `IgFeed` en `_Console.tsx` + CSS; limpia hero/moduleGrid/companyCard muertos.
- **API:** `GET /integra/tree`; `regionId` en doors/cameras (doors vía match regionName).
- **Home `/integra`:** workbench 3 paneles (árbol | puertas/video/foco | feed eventos poll 8s).
- **Settings:** copy humano, Avanzado colapsable, empty state con pasos; módulos con labels de producto.
- **Módulos:** labels humanos en events/access/alarms/anpr/visitors/people/video.

## A medias
- Deploy `--force-all` pendiente tras este cierre.
- Artefacto Windows `apps/web/NUL` (no se pudo borrar fácil); ignorar / no commitear.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS
- SSE/WS eventos, mapas GIS, skin HikCentral

## Siguiente paso
1. Deploy `--force-all` y hard-refresh Integra.
2. Smoke: árbol → puerta/open; cámara → HLS; feed; crear sitio sin jerga.

## Estado
- Código workbench listo para cerrar + deploy.
