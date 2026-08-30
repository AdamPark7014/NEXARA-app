# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Fix crítico: build web roto (por eso prod seguía “ineficiente”)
- `AppShell.module.scss` tenía CSS huérfano tras `.contentInnerFullBleed` → SassError → deploy `--force-all` fallaba; **nexara-web seguía con imagen vieja**.
- SCSS reparado; redeploy pendiente en este cierre.

### Integra full-bleed (código ya en main d274214 + fix)
- Sin sidebar ERP, topbar fino, main full-bleed, rutas Ig*.

## A medias
- Confirmar deploy web OK en droplet tras este fix.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Verificar build web en `/tmp/integra-bleed2.log` sin SassError.
2. Hard-refresh Integra.

## Estado
- Fix listo para cerrar + redeploy.
