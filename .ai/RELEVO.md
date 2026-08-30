# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra: matar chrome ineficiente
- AppShell `data-console`: **sin sidebar ERP**, topbar 40px, **main full-bleed** (como chat).
- IntegraChrome HUD fino + Salir; sin rail de módulos duplicado en home.
- Todas las rutas Ig* (alarms/vehicles/anpr/visitors/settings migradas).
- Tablas con `max-height: calc(100dvh - …)` en vez de 62vh.

## A medias
- EZUIKit player HCT.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Hard-refresh Integra — debe ocupar casi todo el viewport (sin menú izquierdo NEXARA).
2. Verificar logout vía HUD «Salir» / ⌘K.

## Estado
- Listo para cerrar / deploy.
